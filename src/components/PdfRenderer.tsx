import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import * as pdfjsLib from "pdfjs-dist"
import Konva from "konva"

import type { PdfAnnotation } from "../types"
import { registerTextLayer, unregisterTextLayer } from "./pdfRegistry"
import { mergeRects, textLayerOffsets, textLayerRects } from "./pdfText"
import type { PdfRect } from "./pdfText"
import { drawMarks, markSignature, marksAt, removeMark, upsertMark } from "./pdfMarksKonva"
import { createKonvaStage } from "../pdf/konvaStage"

// Low-saturation annotation colors (align with the app's RATING_META family).
const EMPTY_ANNOTATIONS: PdfAnnotation[] = []

/** The annotation-jump flash lives on its own layer (a direct holder child) so
 *  the annotation overlay's replaceChildren can't re-create it — re-creating
 *  restarts the CSS animation ("flashes twice"). Created once per flash, then
 *  re-positioned. */
function drawFlash(
  flashLayer: HTMLElement,
  annotations: PdfAnnotation[],
  textLayer: InstanceType<typeof pdfjsLib.TextLayer>,
  holder: HTMLElement,
  flashAnnId: string
): PdfRect[] {
  const target = annotations.find((a) => a.id === flashAnnId)
  const rects: PdfRect[] = []
  if (target) {
    if (target.kind === "text") {
      if (target.startOffset != null && target.endOffset != null) {
        rects.push(...textLayerRects(textLayer, holder, target.startOffset, target.endOffset))
      }
    } else if (target.kind === "region") {
      const hw = holder.getBoundingClientRect().width || 1
      const hh = holder.getBoundingClientRect().height || 1
      for (const r of target.rects ?? []) {
        rects.push({ x: r.x * hw, y: r.y * hh, w: r.w * hw, h: r.h * hh })
      }
    }
  }
  // ONE flash element per rect — a multi-line highlight has N rects and the
  // flash must cover ALL of them (rects[0] only flashed the first line). Keep
  // the existing elements (create-once, so their animation doesn't restart on
  // re-renders) and sync positions to the rects.
  const els = Array.from(
    flashLayer.querySelectorAll<HTMLElement>(".pdf-ann-flash")
  )
  while (els.length > rects.length) {
    els.pop()?.remove()
  }
  rects.forEach((r, i) => {
    let el = els[i]
    if (!el) {
      el = document.createElement("div")
      el.className = "pdf-ann-flash"
      el.style.cssText = "position:absolute;pointer-events:none;"
      flashLayer.appendChild(el)
    }
    el.style.left = `${r.x}px`
    el.style.top = `${r.y}px`
    el.style.width = `${r.w}px`
    el.style.height = `${r.h}px`
  })
  return rects
}

function appendFlash(overlay: HTMLElement, r: PdfRect): void {
  const flash = document.createElement("div")
  flash.className = "pdf-ann-flash"
  flash.style.cssText = `position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;pointer-events:none;`
  overlay.appendChild(flash)
}

/** The reading column never exceeds this share of the pane width — the pages
 *  are centered with side white space instead of stretching edge-to-edge. */
// The DEFAULT view is the reading column (0.75 = the side margins / 留白).
// The fit-width / fit-page modes fill the whole pane (1.0).
const PAGE_RATIO = 0.75
const FIT_RATIO = 1

const TEXT_LAYER_CSS = `
.pdf-textlayer {
  color-scheme: only light;
  position: absolute;
  text-align: initial;
  inset: 0;
  overflow: clip;
  opacity: 1;
  line-height: 1;
  letter-spacing: normal;
  word-spacing: normal;
  text-size-adjust: none;
  forced-color-adjust: none;
  transform-origin: 0 0;
  caret-color: CanvasText;
  z-index: 0;
  --min-font-size: 1;
  --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
  --min-font-size-inv: calc(1 / var(--min-font-size));
}
.pdf-textlayer :is(span, br) {
  color: transparent;
  position: absolute;
  white-space: pre;
  cursor: text;
  transform-origin: 0% 0%;
  user-select: text;
  -webkit-user-drag: none;
}
.pdf-textlayer > :not(.markedContent),
.pdf-textlayer .markedContent span:not(.markedContent) {
  z-index: 1;
  --font-height: 0;
  font-size: calc(var(--text-scale-factor) * var(--font-height));
  --scale-x: 1;
  --rotate: 0deg;
  transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
}
.pdf-textlayer ::selection {
  background: transparent;
  border-radius: 0;
}
/* Custom unified selection highlight (merged rects — no per-span overlap at
   CJK/Latin boundaries, no per-span stepping). */
.pdf-selection {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}
.pdf-selection > div {
  position: absolute;
  background: rgba(99,102,241,0.26);
  border-radius: 2px;
}
.pdf-ann-flash-layer {
  /* Above the annotation overlay (z-index 2) so the jump flash is ALWAYS the
     topmost page layer — rendered last, nothing covers it. */
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;
}
.pdf-ann-flash {
  /* The original annotation marks show through a too-transparent fill and read
     as "covered" — a stronger fill + a ring makes the jump hint unmistakable. */
  background: rgba(99,102,241,0.55);
  box-shadow: inset 0 0 0 2px rgba(99,102,241,0.9);
  border-radius: 2px;
  animation: pdfAnnFlash 1.4s ease-out forwards;
}
@keyframes pdfAnnFlash {
  0% { opacity: 1; }
  100% { opacity: 0; }
}
.pdf-annotations {
  /* Above the text layer (z-index 0 + spans pointer-events auto). The Konva
     mark canvas is pointer-transparent too — text selection must pass through
     to the text layer; mark clicks/hover are hit-tested via the Konva hit
     graph instead of DOM events. */
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}
.pdf-annotations .konvajs-content,
.pdf-annotations .konvajs-content canvas {
  pointer-events: none !important;
}
`

/** Render one page lazily (IntersectionObserver) at DPR crispness + text layer.
 *  Each page fits the pane width INDEPENDENTLY (per-page zoom) so mixed-size
 *  PDFs never overflow the pane. Size + render both happen ONLY when the page
 *  scrolls near the viewport — a 492-page PDF mounts 492 placeholder holders
 *  but computes/render just the visible ones. */
function PageView({
  doc,
  pageNumber,
  paneW,
  paneH,
  zoom,
  fitMode,
  pageAspect,
  annotations,
  flashAnnId,
  onFlashDone,
  searchFlash,
  onAnnotationClick
}: {
  doc: pdfjsLib.PDFDocumentProxy
  pageNumber: number
  paneW: number
  paneH: number
  zoom: number
  fitMode?: "reading" | "width" | "page"
  pageAspect: number
  annotations: PdfAnnotation[]
  flashAnnId?: string | null
  onFlashDone?: () => void
  searchFlash?: { page: number; start: number; end: number } | null
  onAnnotationClick?: (annId: string, pos: { x: number; y: number }) => void
}) {
  const holderRef = useRef<HTMLDivElement>(null)
  const [wh, setWh] = useState<{ w: number; h: number } | null>(null)
  const [scale, setScale] = useState(1)
  // Set once the text layer is built — the flash/search effects wait on it so
  // a flash/search change never re-renders the canvas.
  const [ready, setReady] = useState(false)
  const flashDoneRef = useRef(onFlashDone)
  flashDoneRef.current = onFlashDone
  const onAnnotationClickRef = useRef(onAnnotationClick)
  onAnnotationClickRef.current = onAnnotationClick
  const textLayerRef = useRef<InstanceType<typeof pdfjsLib.TextLayer> | null>(
    null
  )

  // Click an annotation → jump to its card + open the annotation actions
  // popover. The Konva mark layer is pointer-transparent (so text selection
  // still reaches the text layer); clicks/hover hit-test the Konva hit graph.
  const marksStageRef = useRef<Konva.Stage | null>(null)
  // Hover: dim the hovered annotation's shapes (brightness(0.92) equivalent).
  const hoverRef = useRef<(annId: string | null) => void>(() => {})
  // Last draw context so annotation-list changes can re-draw without re-rendering.
  const drawCtxRef = useRef<{
    tl: InstanceType<typeof pdfjsLib.TextLayer>
    holder: HTMLElement
    w: number
    h: number
  } | null>(null)

  const redrawMarks = useCallback(() => {
    const stage = marksStageRef.current
    const ctx = drawCtxRef.current
    if (!stage || !ctx) return
    drawMarks(
      stage,
      annotations,
      (ann) =>
        ann.kind === "text"
          ? textLayerRects(ctx.tl, ctx.holder, ann.startOffset ?? 0, ann.endOffset ?? 0)
          : (ann.rects ?? []).map((r) => ({
              x: r.x * ctx.w,
              y: r.y * ctx.h,
              w: r.w * ctx.w,
              h: r.h * ctx.h
            })),
      ctx.w,
      ctx.h
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations])

  useEffect(() => {
    const holder = holderRef.current
    if (!holder) return
    const marksDiv = holder.querySelector<HTMLElement>(".pdf-annotations")
    const rect = () => marksDiv?.getBoundingClientRect()
    const onClick = (e: MouseEvent) => {
      const r = rect()
      const stage = marksStageRef.current
      if (!r || !stage) return
      const id = marksAt(stage, r, e.clientX, e.clientY)
      if (!id) return
      onAnnotationClickRef.current?.(id, { x: e.clientX, y: e.clientY })
    }
    const onMove = (e: MouseEvent) => {
      const r = rect()
      const stage = marksStageRef.current
      if (!r || !stage) return
      hoverRef.current(marksAt(stage, r, e.clientX, e.clientY))
    }
    holder.addEventListener("click", onClick)
    holder.addEventListener("mousemove", onMove)
    return () => {
      holder.removeEventListener("click", onClick)
      holder.removeEventListener("mousemove", onMove)
    }
  }, [])

  // Custom unified selection highlight: draw the merged selection rects on the
  // .pdf-selection overlay instead of the native per-span ::selection (which
  // doubles at CJK/Latin boundaries + steps span-by-span). Uses the SAME tight
  // item boxes as the annotation marks (textLayerRects), rAF-throttled so the
  // transient drag ranges don't flicker.
  useEffect(() => {
    const holder = holderRef.current
    if (!holder) return
    let raf = 0
    const draw = () => {
      raf = 0
      const selOverlay = holder.querySelector<HTMLElement>(".pdf-selection")
      const layerDiv = holder.querySelector<HTMLElement>(".pdf-textlayer")
      const tl = textLayerRef.current
      if (!selOverlay || !layerDiv || !tl) return
      selOverlay.replaceChildren()
      const sel = document.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return
      const range = sel.getRangeAt(0)
      const inLayer =
        layerDiv.contains(range.startContainer) &&
        layerDiv.contains(range.endContainer)
      if (!inLayer) return
      const offsets = textLayerOffsets(tl, sel)
      if (!offsets) return
      const rects = mergeRects(
        textLayerRects(tl, holder, offsets.start, offsets.end)
      )
      for (const r of rects) {
        const el = document.createElement("div")
        el.style.left = `${r.x}px`
        el.style.top = `${r.y}px`
        el.style.width = `${r.w}px`
        el.style.height = `${r.h}px`
        selOverlay.appendChild(el)
      }
    }
    const schedule = () => {
      if (raf) return
      raf = window.requestAnimationFrame(draw)
    }
    draw()
    document.addEventListener("selectionchange", schedule)
    return () => {
      document.removeEventListener("selectionchange", schedule)
      if (raf) window.cancelAnimationFrame(raf)
      holder.querySelector(".pdf-selection")?.replaceChildren()
    }
  }, [])
  const ratio = fitMode === "reading" ? PAGE_RATIO : FIT_RATIO
  const placeholderH =
    paneW > 0
      ? Math.floor(
          Math.min(paneW * ratio * zoom * pageAspect, paneH > 0 ? paneH * zoom : Infinity)
        )
      : 0
  // Tracks the size inputs a page was LAST sized/render for. A loaded page
  // (wh set) would otherwise render with stale scale/wh when zoom or paneW
  // changes — the "zoom only affects unloaded pages" bug.
  const sizeKeyRef = useRef("")

  useEffect(() => {
    const holder = holderRef.current
    if (!holder) return
    // P1: an inactive keep-alive PdfView (display:none) measures 0 width —
    // release its canvases so memory stays bounded to the ACTIVE PDF; the
    // scroll/state/doc survive and the pages re-render on re-activation.
    if (paneW <= 0) {
      const c = holder.querySelector("canvas")
      if (c && c.width > 0) {
        c.width = 0
        c.height = 0
      }
      return
    }
    let cancelled = false
    let renderTask: pdfjsLib.RenderTask | null = null
    let textLayer: InstanceType<typeof pdfjsLib.TextLayer> | null = null
    const dpr = window.devicePixelRatio || 1
    setReady(false)

    const computeSize = async () => {
      const page = await doc.getPage(pageNumber)
      if (cancelled) return
      const baseW = page.getViewport({ scale: 1 }).width
      if (baseW <= 0) return
      const ratio = fitMode === "reading" ? PAGE_RATIO : FIT_RATIO
      const fitW = (paneW * ratio * zoom) / baseW
      const baseH = page.getViewport({ scale: 1 }).height
      const fit = fitMode === "page" && paneH > 0
        ? Math.min(fitW, (paneH * zoom) / baseH)
        : fitW
      const s = Math.max(0.4, fit)
      const vp = page.getViewport({ scale: s })
      setScale(s)
      setWh({ w: Math.floor(vp.width), h: Math.floor(vp.height) })
    }

    const render = async () => {
      if (!wh) return
      const page = await doc.getPage(pageNumber)
      if (cancelled) return
      const canvas = holder.querySelector("canvas")
      if (!canvas) return
      // DPR crispness: physical canvas = logical × dpr, CSS = logical.
      // Render at the EXACT display scale (no supersample — its CSS downscale
      // washed the text strokes out to a "灰蒙蒙" cast vs Edge's vector render).
      // A contrast/brightness filter compensates the mild dpr→1 downscale so
      // the text reads black like the paper is white.
      canvas.width = Math.floor(wh.w * dpr)
      canvas.height = Math.floor(wh.h * dpr)
      canvas.style.width = `${wh.w}px`
      canvas.style.height = `${wh.h}px`
      canvas.style.filter = "contrast(1.18)"
      renderTask = page.render({
        canvas,
        viewport: page.getViewport({ scale: scale * dpr })
      })
      await renderTask.promise
      if (cancelled) return
      // Text layer (selection) aligned over the canvas at the logical viewport.
      const layerDiv = holder.querySelector<HTMLDivElement>(".pdf-textlayer")
      if (layerDiv) {
        // pdf.js v6's TextLayer relies on these CSS vars + setLayerDimensions
        // to size the container; without --total-scale-factor the width formula
        // is invalid and the percentage-positioned spans collapse → selection
        // is misaligned ("漏选" + over-selection).
        layerDiv.style.setProperty("--total-scale-factor", String(scale))
        layerDiv.style.setProperty("--scale-round-x", "1px")
        layerDiv.style.setProperty("--scale-round-y", "1px")
        textLayer = new pdfjsLib.TextLayer({
          textContentSource: page.streamTextContent({ disableNormalization: true }),
          container: layerDiv,
          viewport: page.getViewport({ scale })
        })
        await textLayer.render()
        // Enforce the exact page box (setLayerDimensions may round the width).
        layerDiv.style.width = `${wh.w}px`
        layerDiv.style.height = `${wh.h}px`
        // Draw the page's annotations on the Konva mark layer (the flash + the
        // search highlight live in their OWN effects — a flash/search change
        // must NOT re-render the canvas + text layer, which caused the laggy
        // "page first, then center" two-step jump). Canvas marks have zero DOM
        // nodes, so hundreds of annotations don't churn layout.
        const annDiv = holder.querySelector<HTMLDivElement>(".pdf-annotations")
        if (annDiv) {
          if (!marksStageRef.current) {
            const stage = createKonvaStage(annDiv, {
              width: wh.w,
              height: wh.h,
              scale: 1
            })
            marksStageRef.current = stage
            // Hover: dim the hovered group (brightness(0.92) equivalent) —
            // a translucent overlay rect over the group's bounding box.
            hoverRef.current = (annId: string | null) => {
              const layer = stage.getLayers()[0]
              if (!layer) return
              const prev = layer.findOne(".pdf-mark-hover")
              if (prev) prev.destroy()
              if (annId) {
                const g = layer.findOne(`#${annId}`)
                if (g) {
                  const r = g.getClientRect()
                  layer.add(
                    new Konva.Rect({
                      x: r.x,
                      y: r.y,
                      width: r.width,
                      height: r.height,
                      fill: "rgba(0,0,0,0.08)",
                      name: "pdf-mark-hover",
                      listening: false,
                      cornerRadius: 2
                    })
                  )
                }
              }
              layer.draw()
            }
          }
          drawCtxRef.current = { tl: textLayer, holder, w: wh.w, h: wh.h }
          redrawMarks()
        }
        setReady(true)
        // Expose for the toolbar's selection→offset mapping.
        registerTextLayer(pageNumber, { holder, textLayer })
        textLayerRef.current = textLayer
      }
    }

    const scrollRoot = holder.closest("[data-pdf-scroll]")
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry.isIntersecting) {
          const key = `${paneW}x${paneH}x${zoom}x${fitMode}`
          if (!wh || sizeKeyRef.current !== key) {
            sizeKeyRef.current = key
            computeSize().catch((e) => console.warn("[pdf] page size:", e))
          } else {
            render().catch((e) => {
              // Cancelled renders are expected on scroll/re-render, not errors
              // (canvas → RenderingCancelledException, TextLayer → AbortException).
              if (e instanceof pdfjsLib.RenderingCancelledException) return
              if (e instanceof pdfjsLib.AbortException) return
              console.warn("[pdf] page render:", e)
            })
          }
        } else {
          // P2: the page scrolled out of the pre-render margin — release its
          // canvas (memory stays bounded to the pages near the viewport); it
          // re-renders on re-entry.
          const c = holder.querySelector("canvas")
          if (c && c.width > 0) {
            c.width = 0
            c.height = 0
          }
        }
      },
      { root: (scrollRoot as Element) ?? undefined, rootMargin: "3000px 0px" }
    )
    obs.observe(holder)
    return () => {
      cancelled = true
      obs.disconnect()
      renderTask?.cancel()
      textLayer?.cancel()
      marksStageRef.current?.destroy()
      marksStageRef.current = null
      drawCtxRef.current = null
      unregisterTextLayer(pageNumber)
    }
  }, [doc, pageNumber, paneW, paneH, zoom, fitMode, wh, scale, annotations])

  // Annotation-jump flash: draw on its own layer + center the annotation the
  // MOMENT the text layer exists — NO canvas re-render, so a jump to an
  // already-rendered page is one direct centered scroll instead of the laggy
  // "page first, then center" two-step.
  useEffect(() => {
    const holder = holderRef.current
    const tl = textLayerRef.current
    const flashLayer = holder?.querySelector<HTMLElement>(".pdf-ann-flash-layer")
    if (!holder || !tl || !flashLayer || !ready || !flashAnnId) {
      flashLayer?.replaceChildren()
      return
    }
    const rects = drawFlash(flashLayer, annotations, tl, holder, flashAnnId)
    const timer = window.setTimeout(() => flashDoneRef.current?.(), 1500)
    if (rects.length > 0) {
      const minX = Math.min(...rects.map((r) => r.x))
      const minY = Math.min(...rects.map((r) => r.y))
      const maxX = Math.max(...rects.map((r) => r.x + r.w))
      const maxY = Math.max(...rects.map((r) => r.y + r.h))
      const c = holder.closest<HTMLElement>("[data-pdf-scroll]")
      if (c) {
        const hr = holder.getBoundingClientRect()
        const cr = c.getBoundingClientRect()
        const absX = c.scrollLeft + (hr.left - cr.left) + (minX + maxX) / 2
        const absY = c.scrollTop + (hr.top - cr.top) + (minY + maxY) / 2
        c.scrollTo({
          top: Math.max(0, absY - c.clientHeight / 2),
          left: Math.max(0, absX - c.clientWidth / 2),
          behavior: "auto"
        })
      }
    }
    return () => window.clearTimeout(timer)
  }, [flashAnnId, ready, annotations])

  // Search-match highlight — also decoupled so navigating matches doesn't
  // re-render the canvas. Redraws the Konva marks (annotation list may have
  // changed) + adds the DOM flash on its own layer.
  useEffect(() => {
    if (!searchFlash || !ready) return
    const holder = holderRef.current
    const tl = textLayerRef.current
    const flashLayer = holder?.querySelector<HTMLElement>(".pdf-ann-flash-layer")
    if (!holder || !tl || !flashLayer) return
    redrawMarks()
    const rects = textLayerRects(tl, holder, searchFlash.start, searchFlash.end)
    for (const r of rects) appendFlash(flashLayer, r)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchFlash, ready, annotations])

  // Annotation-list changes (create/edit/delete broadcasts) update ONLY the
  // changed groups on the Konva layer — the page canvas + text layer never
  // re-render, and unchanged annotations don't rebuild.
  const prevMarksSigRef = useRef<Map<string, string> | null>(null)
  useEffect(() => {
    if (!ready) return
    const stage = marksStageRef.current
    const ctx = drawCtxRef.current
    if (!stage || !ctx) return
    const prev = prevMarksSigRef.current ?? new Map<string, string>()
    const cur = new Map<string, string>()
    for (const ann of annotations) {
      const sig = markSignature(ann)
      cur.set(ann.id, sig)
      if (prev.get(ann.id) !== sig) {
        upsertMark(
          stage,
          ann,
          (a) =>
            a.kind === "text"
              ? textLayerRects(ctx.tl, ctx.holder, a.startOffset ?? 0, a.endOffset ?? 0)
              : (a.rects ?? []).map((r) => ({
                  x: r.x * ctx.w,
                  y: r.y * ctx.h,
                  w: r.w * ctx.w,
                  h: r.h * ctx.h
                })),
          ctx.w,
          ctx.h
        )
      }
    }
    for (const id of Array.from(prev.keys())) {
      if (!cur.has(id)) removeMark(stage, id)
    }
    prevMarksSigRef.current = cur
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations, ready])

  return (
    <div
      ref={holderRef}
      data-page={pageNumber}
      style={{
        position: "relative",
        margin: "0 auto 12px",
        background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        // Clamp to the pane width: during the re-scale lag (async pdf.js render)
        // the old wh can exceed the shrunk container — the holder never extends
        // under the cards panel.
        width: wh ? Math.min(wh.w, paneW) : paneW > 0 ? Math.floor(paneW) : undefined,
        height: wh?.h ?? (paneW > 0 ? placeholderH : undefined),
        overflow: "hidden"
      }}>
      <canvas style={{ display: "block" }} />
      <div className="pdf-annotations" />
      <div className="pdf-ann-flash-layer" />
      <div className="pdf-textlayer" />
      <div className="pdf-selection" />
      <style>{TEXT_LAYER_CSS}</style>
    </div>
  )
}

/** Scrollable, lazy-rendered pages at fit-width with a shared zoom. */
export default function PdfRenderer({
  doc,
  pageCount,
  scrollTarget,
  zoom,
  onZoomChange,
  fitMode,
  annotations,
  flashAnnId,
  onFlashDone,
  frameMode,
  onFrameRegion,
  searchFlash,
  onVisiblePageChange,
  onAnnotationClick
}: {
  doc: pdfjsLib.PDFDocumentProxy
  pageCount: number
  scrollTarget?: number | null
  zoom?: number
  /** Ctrl+wheel zoom (the toolbar's +/- uses it too). */
  onZoomChange?: (zoom: number) => void
  /** Fit base: "width" (default) or "page" (whole page visible). */
  fitMode?: "reading" | "width" | "page"
  annotations?: PdfAnnotation[]
  flashAnnId?: string | null
  onFlashDone?: () => void
  frameMode?: boolean
  onFrameRegion?: (result: {
    page: number
    rects: PdfRect[]
  }) => void
  searchFlash?: { page: number; start: number; end: number } | null
  onVisiblePageChange?: (page: number) => void
  onAnnotationClick?: (annId: string, pos: { x: number; y: number }) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [paneW, setPaneW] = useState(0)
  const [paneH, setPaneH] = useState(0)
  const [pageAspects, setPageAspects] = useState<Map<number, number> | null>(
    null
  )
  // Precompute the first pages' height/width ratios up front so early
  // placeholders match real pages. The FULL loop was a load bottleneck for
  // large PDFs (500 pages = 500 getPage calls before anything renders) — pages
  // beyond the head use the A4-ish default and fill their real aspect when they
  // render.
  const ASPECT_HEAD = 50
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const aspects = new Map<number, number>()
      for (let p = 1; p <= Math.min(pageCount, ASPECT_HEAD); p++) {
        const page = await doc.getPage(p)
        if (cancelled) return
        const vp = page.getViewport({ scale: 1 })
        aspects.set(p, vp.height / vp.width)
      }
      if (!cancelled) setPageAspects(aspects)
    }
    run().catch(() => {
      // The doc may be destroyed (PDF closed / LRU-evicted) mid-precompute —
      // getPage rejects with "Transport destroyed"; fall back gracefully.
    })
    return () => {
      cancelled = true
    }
  }, [doc, pageCount])
  const [dragRect, setDragRect] = useState<PdfRect | null>(null)
  const dragState = useRef<{
    startX: number
    startY: number
    holder: HTMLElement
  } | null>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => dragCleanupRef.current?.(), [])

  // Stop Chrome's "drag selected text → new-tab search" gesture inside the PDF
  // text layer — it interrupts text selection (the sluggish feel) and opens a
  // search tab. Combined with -webkit-user-drag: none on the spans.
  useEffect(() => {
    const onDragStart = (e: DragEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.(".pdf-textlayer")) {
        e.preventDefault()
      }
    }
    document.addEventListener("dragstart", onDragStart)
    return () => document.removeEventListener("dragstart", onDragStart)
  }, [])

  // Stable per-page annotation arrays — rebuilt ONLY when the annotations prop
  // changes, so unrelated re-renders (scrollPage/flashAnnId) don't trigger every
  // page to re-render its canvas.
  const pageAnnMap = useMemo(() => {
    const m = new Map<number, PdfAnnotation[]>()
    for (const a of annotations ?? []) {
      const list = m.get(a.page)
      if (list) list.push(a)
      else m.set(a.page, [a])
    }
    return m
  }, [annotations])

  // Measure the pane width (with a tolerance to avoid a scrollbar-induced
  // resize loop when the pages re-render and the vertical scrollbar toggles).
  const paneWRef = useRef(0)
  const paneHRef = useRef(0)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    // Use clientWidth/clientHeight — the VISIBLE box. The ResizeObserver's
    // contentRect.height on a scroll container reports the SCROLL content's
    // height (it grows with the rendered pages), which would make the fit-page
    // scale always width-bound (no visible difference).
    // Debounce the pane size: dragging a sidebar/panel changes the width every
    // frame and each change re-fits + re-renders every visible page (the drag
    // lag — InkLayer avoids this by fixing its sidebar size). Defer the fit
    // until the drag truly settles (250ms trailing) so mid-drag pauses never
    // re-render; the holder's width clamp keeps pages inside the pane meanwhile.
    let resizeTimer: number | null = null
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (resizeTimer !== null) window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null
        // Ignore sub-2px drift (fractional layout churn).
        if (Math.abs(w - paneWRef.current) > 2) {
          paneWRef.current = w
          setPaneW(w)
        }
        if (Math.abs(h - paneHRef.current) > 2) {
          paneHRef.current = h
          setPaneH(h)
        }
      }, 250)
    })
    ro.observe(el)
    return () => {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer)
      ro.disconnect()
    }
  }, [])

  // Scroll to a requested page (TOC navigation) — instant, positions are
  // accurate because every holder already carries its real page height. Pages
  // mount lazily, so a far target may not exist yet: retry until it appears.
  useEffect(() => {
    if (!scrollTarget) return
    let tries = 0
    const el = () =>
      containerRef.current?.querySelector(`[data-page="${scrollTarget}"]`)
    const scroll = () => {
      const target = el()
      if (target) {
        target.scrollIntoView({ behavior: "auto", block: "start" })
        return true
      }
      return false
    }
    if (scroll()) return
    const timer = window.setInterval(() => {
      tries++
      if (scroll() || tries > 30) window.clearInterval(timer)
    }, 150)
    return () => window.clearInterval(timer)
  }, [scrollTarget])

  // Track the current visible page (rAF-throttled) for the 回跳 history.
  useEffect(() => {
    const c = containerRef.current
    if (!c) return
    let raf = 0
    let last = -1
    const report = () => {
      raf = 0
      const ref = c.scrollTop + c.clientHeight * 0.15
      let current = 1
      for (const el of c.querySelectorAll<HTMLElement>("[data-page]")) {
        const top = el.offsetTop
        const h = el.offsetHeight || 1
        if (top <= ref && ref < top + h) {
          current = Number(el.getAttribute("data-page")) || 1
          break
        }
      }
      if (current !== last) {
        last = current
        onVisiblePageChange?.(current)
      }
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(report)
    }
    c.addEventListener("scroll", onScroll, { passive: true })
    report()
    return () => {
      c.removeEventListener("scroll", onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [onVisiblePageChange])

  // Only the page holding the flash target re-renders (avoids re-rendering
  // every page's canvas when a card is clicked).
  const flashPage = flashAnnId
    ? annotations?.find((a) => a.id === flashAnnId)?.page ?? null
    : null

  // 框选 mode: pointer-drag a rectangle over a page → crop → frame annotation.
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!frameMode) return
    const holder = (e.target as HTMLElement).closest(
      "[data-page]"
    ) as HTMLElement | null
    if (!holder) return
    e.preventDefault()
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      holder
    }
    setDragRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 })
    document.body.style.userSelect = "none"
    const mv = (ev: PointerEvent) => {
      const d = dragState.current
      if (!d) return
      setDragRect({
        x: Math.min(d.startX, ev.clientX),
        y: Math.min(d.startY, ev.clientY),
        w: Math.abs(ev.clientX - d.startX),
        h: Math.abs(ev.clientY - d.startY)
      })
    }
    const cleanup = () => {
      document.body.style.userSelect = ""
      document.removeEventListener("pointermove", mv)
      document.removeEventListener("pointerup", up)
    }
    const up = (ev: PointerEvent) => {
      cleanup()
      dragCleanupRef.current = null
      const d = dragState.current
      dragState.current = null
      setDragRect(null)
      if (
        !d ||
        Math.abs(ev.clientX - d.startX) < 6 ||
        Math.abs(ev.clientY - d.startY) < 6
      )
        return
      const hr = d.holder.getBoundingClientRect()
      const rx = Math.max(0, Math.min(Math.min(d.startX, ev.clientX) - hr.left, hr.width))
      const ry = Math.max(0, Math.min(Math.min(d.startY, ev.clientY) - hr.top, hr.height))
      const rw = Math.min(Math.abs(ev.clientX - d.startX), hr.width - rx)
      const rh = Math.min(Math.abs(ev.clientY - d.startY), hr.height - ry)
      if (rw < 4 || rh < 4) return
      onFrameRegion?.({
        page: Number(d.holder.getAttribute("data-page")),
        rects: [
          {
            x: rx / hr.width,
            y: ry / hr.height,
            w: rw / hr.width,
            h: rh / hr.height
          }
        ]
      })
    }
    document.addEventListener("pointermove", mv)
    document.addEventListener("pointerup", up)
    dragCleanupRef.current = cleanup
  }, [frameMode, onFrameRegion])

  // Ctrl+wheel zooms the PDF instead of the browser's page zoom — a native
  // passive:false listener so the default (browser zoom) can be prevented.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const step = e.deltaY < 0 ? 0.1 : -0.1
      onZoomChange?.(Math.max(0.5, Math.min(3, +(zoom + step).toFixed(2))))
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [zoom, onZoomChange])

  return (
    <div
      ref={containerRef}
      data-pdf-scroll=""
      onPointerDown={handlePointerDown}
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        overflowX: "auto",
        background: "#f0efec",
        padding: "16px 0",
        cursor: frameMode ? "crosshair" : "default"
      }}>
      {paneW > 0 &&
        Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
          <PageView
            key={n}
            doc={doc}
            pageNumber={n}
            paneW={paneW}
            paneH={paneH}
            zoom={zoom ?? 1}
            fitMode={fitMode}
            pageAspect={pageAspects?.get(n) ?? 1.414}
            annotations={pageAnnMap.get(n) ?? EMPTY_ANNOTATIONS}
            flashAnnId={flashPage === n ? flashAnnId : null}
            onFlashDone={onFlashDone}
            searchFlash={searchFlash?.page === n ? searchFlash : null}
            onAnnotationClick={onAnnotationClick}
          />
        ))}
      {dragRect && (
        <div
          style={{
            position: "fixed",
            left: dragRect.x,
            top: dragRect.y,
            width: dragRect.w,
            height: dragRect.h,
            border: "1.5px dashed rgba(99,102,241,0.6)",
            background: "rgba(99,102,241,0.08)",
            pointerEvents: "none",
            zIndex: 20
          }}
        />
      )}
    </div>
  )
}
