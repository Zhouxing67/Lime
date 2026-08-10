import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTheme } from "@mui/material/styles"

import * as pdfjsLib from "pdfjs-dist"
import { PDFPageView } from "pdfjs-dist/web/pdf_viewer.mjs"
import { createPdfViewerShared } from "../pdf/pdfViewerShared"
import Konva from "konva"

import type { PdfAnnotation } from "../types"
import { registerTextLayer, unregisterTextLayer } from "./pdfRegistry"
import { mergeRects, textLayerOffsets, textLayerRects } from "./pdfText"
import type { PdfRect } from "./pdfText"
import { clearSelection, drawMarks, markSignature, marksAt, removeMark, selectMark, upsertMark } from "./pdfMarksKonva"

import { createKonvaStage } from "../pdf/konvaStage"

// Low-saturation annotation colors (align with the app's RATING_META family).
const EMPTY_ANNOTATIONS: PdfAnnotation[] = []

/** The annotation-jump flash lives on its own layer (a direct holder child) so
 *  the annotation overlay's replaceChildren can't re-create it — re-creating
 *  restarts the CSS animation ("flashes twice"). Created once per flash, then
 *  re-positioned. */
/** The jump target's rects (for centering) — the persistent selection ring is
 *  the visual feedback now; no DOM flash. */
function jumpRects(
  annotations: PdfAnnotation[],
  textLayer: InstanceType<typeof pdfjsLib.TextLayer>,
  holder: HTMLElement,
  annId: string
): PdfRect[] {
  const target = annotations.find((a) => a.id === annId)
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
  return rects
}

function appendFlash(
  overlay: HTMLElement,
  r: PdfRect,
  current: boolean,
  hitBg: string,
  hitStrongBg: string
): void {
  const flash = document.createElement("div")
  flash.className = current ? "pdf-ann-flash current" : "pdf-ann-flash"
  // Theme-aware backgrounds (hardcoded indigo was invisible in dark mode).
  flash.style.cssText = `position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;pointer-events:none;background:${
    current ? hitStrongBg : hitBg
  };${current ? "box-shadow:inset 0 0 0 2px " + hitStrongBg + ";" : ""}`
  overlay.appendChild(flash)
}

/** The reading column never exceeds this share of the pane width — the pages
 *  are centered with side white space instead of stretching edge-to-edge. */
// The DEFAULT view is the reading column (0.75 = the side margins / 留白).
// The fit-width / fit-page modes fill the whole pane (1.0).
const PAGE_RATIO = 0.75
const FIT_RATIO = 1

const TEXT_LAYER_CSS = `
/* The official pdf.js PDFPageView's page container: the canvasWrapper +
   textLayer + annotationLayer live inside (the Lime's overlays stack above). */
.pdf-pageview-container {
  position: absolute;
  inset: 0;
  z-index: 0;
}
.pdf-pageview-container .canvasWrapper {
  position: absolute;
  inset: 0;
}
.pdf-pageview-container .canvasWrapper canvas {
  display: block;
}
.pdf-pageview-container .textLayer {
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
.pdf-pageview-container .textLayer :is(span, br) {
  color: transparent;
  position: absolute;
  white-space: pre;
  cursor: text;
  transform-origin: 0% 0%;
  user-select: text;
  -webkit-user-drag: none;
}
.pdf-pageview-container .textLayer > :not(.markedContent),
.pdf-pageview-container .textLayer .markedContent span:not(.markedContent) {
  z-index: 1;
  --font-height: 0;
  font-size: calc(var(--text-scale-factor) * var(--font-height));
  --scale-x: 1;
  --rotate: 0deg;
  transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
}
.pdf-pageview-container .textLayer ::selection {
  background: transparent;
  border-radius: 0;
}
/* PDF link annotations (the official AnnotationLayer) — the anchors are
   clickable to jump / open the URL. */
.pdf-pageview-container .annotationLayer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.pdf-pageview-container .annotationLayer .linkAnnotation > a {
  position: absolute;
  pointer-events: auto;
  font-size: 1em;
  transform-origin: 0 0;
}
.pdf-pageview-container .annotationLayer .linkAnnotation > a:hover {
  background: rgba(255, 255, 0, 0.18);
  box-shadow: 0 2px 10px rgba(255, 255, 0, 0.35);
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
  /* ALL search matches: a subtle persistent highlight. The background comes
     from the theme (inline) so dark mode stays visible. */
  border-radius: 2px;
}
.pdf-ann-flash.current {
  /* The current match: a stronger fill + a ring (inline) + a fade-out. */
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
.pdf-freetext-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}
.pdf-freetext {
  position: absolute;
  font-size: 12px;
  line-height: 1.3;
  color: rgba(0, 0, 0, 0.82);
  white-space: pre-wrap;
  overflow: hidden;
  pointer-events: none;
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
  eventBus,
  linkService,
  annotations,
  flashAnnId,
  onFlashDone,
  annotDrawMode,
  onTextSelected,
  searchFlash,
  selectedAnnId,
  onAnnotationDeselect,
  onAnnotationClick,
  renderRegistry
}: {
  doc: pdfjsLib.PDFDocumentProxy
  pageNumber: number
  paneW: number
  paneH: number
  zoom: number
  fitMode?: "reading" | "width" | "page"
  pageAspect: number
  eventBus: any
  linkService: any
  annotations: PdfAnnotation[]
  renderRegistry?: React.MutableRefObject<Map<number, () => Promise<void> | void>>
  onFlashDone?: () => void
  annotDrawMode?: "frame" | "freetext" | "freehand" | "free-highlight" | null
  onTextSelected?: (range: Range) => void
  flashAnnId?: string | null
  searchFlash?: { page: number; matches: { start: number; end: number }[]; current: number } | null
  selectedAnnId?: string | null
  onAnnotationDeselect?: () => void
  onAnnotationClick?: (annId: string, pos: { x: number; y: number }) => void
}) {
  const holderRef = useRef<HTMLDivElement>(null)
  const [wh, setWh] = useState<{ w: number; h: number } | null>(null)
  const [scale, setScale] = useState(1)
  // Set once the text layer is built — the flash/search effects wait on it so
  // a flash/search change never re-renders the canvas.
  const [ready, setReady] = useState(false)
  const onAnnotationClickRef = useRef(onAnnotationClick)
  onAnnotationClickRef.current = onAnnotationClick
  const onAnnotationDeselectRef = useRef(onAnnotationDeselect)
  onAnnotationDeselectRef.current = onAnnotationDeselect
  const onFlashDoneRef = useRef(onFlashDone)
  onFlashDoneRef.current = onFlashDone
  const textLayerRef = useRef<InstanceType<typeof pdfjsLib.TextLayer> | null>(
    null
  )

  // Click an annotation → jump to its card + open the annotation actions
  // popover. The Konva mark layer is pointer-transparent (so text selection
  // still reaches the text layer); clicks/hover hit-test the Konva hit graph.
  const marksStageRef = useRef<Konva.Stage | null>(null)
  const pageRef = useRef<pdfjsLib.PDFPageProxy | null>(null)
  const pageViewRef = useRef<any>(null)
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
      if (id) {
        onAnnotationClickRef.current?.(id, { x: e.clientX, y: e.clientY })
      } else {
        // Empty area → clear the persistent selection.
        onAnnotationDeselectRef.current?.()
      }
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
  const onTextSelectedRef = useRef(onTextSelected)
  onTextSelectedRef.current = onTextSelected
  useEffect(() => {
    const holder = holderRef.current
    if (!holder) return
    let raf = 0
    const draw = () => {
      raf = 0
      const selOverlay = holder.querySelector<HTMLElement>(".pdf-selection")
      const layerDiv = holder.querySelector<HTMLElement>(
        ".pdf-pageview-container .textLayer"
      )
      const tl = textLayerRef.current
      if (!selOverlay || !layerDiv || !tl) return
      selOverlay.replaceChildren()
      const sel = document.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        // The selection collapsed / moved away — dismiss the selection bar.
        onTextSelectedRef.current?.(null)
        return
      }
      const range = sel.getRangeAt(0)
      const inLayer =
        layerDiv.contains(range.startContainer) &&
        layerDiv.contains(range.endContainer)
      if (!inLayer) {
        onTextSelectedRef.current?.(null)
        return
      }
      // Native selection drives the bar too (Medium-style follow).
      onTextSelectedRef.current?.(range.cloneRange())
      // Character-level rects (range.getClientRects) — NOT the whole textDiv
      // boxes, which snapped the highlight to full lines on per-line PDFs.
      const holderRect = holder.getBoundingClientRect()
      const rects = mergeRects(
        Array.from(range.getClientRects()).map((r) => ({
          x: r.left - holderRect.left,
          y: r.top - holderRect.top,
          w: r.width,
          h: r.height
        }))
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
      pageRef.current = page
      if (cancelled) return
      // Official pdf.js PDFPageView: canvas + text layer + annotation layer +
      // links — one object handles the whole page (no hand-rolled layers).
      pageViewRef.current?.destroy()
      const pageViewContainer = holder.querySelector<HTMLDivElement>(
        ".pdf-pageview-container"
      )
      if (!pageViewContainer) return
      const pageView = new PDFPageView({
        container: pageViewContainer,
        eventBus,
        id: pageNumber,
        defaultViewport: page.getViewport({ scale }),
        linkService,
        textLayerMode: 1,
        annotationMode: 1,
        renderInteractiveForms: false
      } as never)
      pageViewRef.current = pageView
      pageView.setPdfPage(page)
      pageView.update({ scale })
      await pageView.draw()
      if (cancelled) return
      // The PDFPageView's text layer (TextLayerBuilder) drives the selection /
      // offsets — its internals are the pdf.js TextLayer.
      const textLayer = pageView.textLayer as unknown as InstanceType<
        typeof pdfjsLib.TextLayer
      >
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
            // a translucent overlay rect over the group's bounding box. Only
            // rebuild it when the hovered id CHANGES — every mousemove within
            // a thin group's bbox (删除线/自由画笔) otherwise destroys +
            // re-adds + redraws the same rect, which reads as a flicker.
            let prevHoverId: string | null = null
            hoverRef.current = (annId: string | null) => {
              if (annId === prevHoverId) return
              prevHoverId = annId
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

    // Jump pre-render: let the parent force this page's render BEFORE scrolling
    // to it (a far page's released canvas would otherwise re-render AFTER the
    // jump lands, showing a blank/black flash).
    if (renderRegistry) {
      renderRegistry.current.set(pageNumber, () => render())
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
          // The page scrolled out of the pre-render margin — release its
          // canvas AND the pdf.js worker's decoded resources for the page
          // (page.cleanup); without the latter a large PDF's rendered pages
          // accumulate GBs in the worker. It re-renders on re-entry.
          const c = holder.querySelector("canvas")
          if (c && c.width > 0) {
            c.width = 0
            c.height = 0
          }
          const curPage = pageRef.current
          if (curPage) {
            // The pdf.js type overloads cleanup ambiguously (page vs transport);
            // the runtime returns the worker's cleanup promise.
            ;(curPage.cleanup() as unknown as Promise<void>).catch(() => {})
          }
        }
      },
      { root: (scrollRoot as Element) ?? undefined, rootMargin: "3000px 0px" }
    )
    obs.observe(holder)
    const registry = renderRegistry
    return () => {
      cancelled = true
      obs.disconnect()
      registry?.current.delete(pageNumber)
      pageViewRef.current?.destroy()
      pageViewRef.current = null
      marksStageRef.current?.destroy()
      marksStageRef.current = null
      pageRef.current = null
      drawCtxRef.current = null
      unregisterTextLayer(pageNumber)
    }
    // `annotations` is intentionally NOT a dep: an annotation-list reload
    // (a _dbpdf broadcast on any card/annotation write) must NOT re-render
    // the page canvas/text layer + all marks — the incremental effect updates
    // the Konva marks in place. The render() closure captures the fresh list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, pageNumber, paneW, paneH, zoom, fitMode, wh, scale])

  // Jump target → center the page on the annotation (the persistent selection
  // ring is the visual feedback; no DOM flash).

  // One-time backfill of `pos` for annotations created before pos existed —
  // resolved from the rendered text layer so two-column sorting works on

  useEffect(() => {
    const holder = holderRef.current
    const tl = textLayerRef.current
    if (!holder || !tl || !ready || !flashAnnId) return
    const rects = jumpRects(annotations, tl, holder, flashAnnId)
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
      // ONE-SHOT: without this, flashAnnId stays set forever and EVERY later
      // annotations change / page re-render re-centers the view here (the
      // "jumps on its own" bug). Clear it after the first successful scroll.
      onFlashDoneRef.current?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flashAnnId, ready])

  // Search-match highlight — also decoupled so navigating matches doesn't
  // re-render the canvas. Redraws the Konva marks + adds the DOM flash on its
  // own layer. NOT dependent on `annotations`: an annotation edit while a
  // search is active must not rebuild every mark or duplicate the flashes.
  const theme = useTheme()
  useEffect(() => {
    if (!searchFlash || !ready) return
    const holder = holderRef.current
    const tl = textLayerRef.current
    const flashLayer = holder?.querySelector<HTMLElement>(".pdf-ann-flash-layer")
    if (!holder || !tl || !flashLayer) return
    redrawMarks()
    flashLayer.replaceChildren()
    // ALL matches on the page get a subtle persistent highlight; the CURRENT
    // match gets the stronger one (fades after a moment).
    searchFlash.matches.forEach((m, i) => {
      const current = i === searchFlash.current
      for (const r of textLayerRects(tl, holder, m.start, m.end)) {
        appendFlash(flashLayer, r, current, theme.custom.searchHit, theme.custom.searchHitStrong)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchFlash, ready])

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
  }, [annotations, ready])

  // Persistent selection (P4): when the selected annotation changes, light it
  // up on this page's Konva layer (a ring around its group) or clear it. Only
  // the page that actually carries the annotation draws anything.
  useEffect(() => {
    if (!ready) return
    const stage = marksStageRef.current
    if (!stage) return
    if (selectedAnnId) {
      selectMark(stage, selectedAnnId)
    } else {
      clearSelection(stage)
    }
  }, [selectedAnnId, ready])

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
      <div className="pdf-pageview-container" />
      <div className="pdf-annotations" />
      <div className="pdf-ann-flash-layer" />
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
  annotDrawMode,
  onAnnotDraw,
  searchFlash,
  selectedAnnId,
  onAnnotationDeselect,
  onVisiblePageChange,
  onAnnotationClick,
  onFlashDone,
  onTextSelected
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
  /** Active pointer-draw tool: drag a rect (frame/freetext) or a free path
   *  (freehand / free-highlight). null = normal pan/select. */
  annotDrawMode?: "frame" | "freetext" | "freehand" | "free-highlight" | null
  onAnnotDraw?: (result: {
    page: number
    kind: "rect" | "path"
    rects: PdfRect[]
    path?: { x: number; y: number }[]
  }) => void
  searchFlash?: { page: number; matches: { start: number; end: number }[]; current: number } | null
  selectedAnnId?: string | null
  onAnnotationDeselect?: () => void
  onVisiblePageChange?: (page: number) => void
  onAnnotationClick?: (annId: string, pos: { x: number; y: number }) => void
  onFlashDone?: () => void
  onTextSelected?: (range: Range) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const renderRegistryRef = useRef(new Map<number, () => Promise<void> | void>())
  const [paneW, setPaneW] = useState(0)
  const { eventBus, linkService } = useMemo(
    () => createPdfViewerShared(),
    []
  )
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
  const [dragPath, setDragPath] = useState<{ x: number; y: number }[] | null>(
    null
  )
  const dragPathRef = useRef<{ x: number; y: number }[] | null>(null)
  if (dragPath !== dragPathRef.current) dragPathRef.current = dragPath
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
    // Pre-render the target BEFORE scrolling — a far page's released canvas
    // otherwise re-renders after the jump lands, showing a blank/black flash.
    // A never-sized page has no registered render fn yet; the IO path renders
    // it normally (the scroll still happens immediately).
    const renderFn = renderRegistryRef.current.get(scrollTarget)
    const doScroll = () => {
      if (scroll()) return
      const timer = window.setInterval(() => {
        tries++
        if (scroll() || tries > 30) window.clearInterval(timer)
      }, 150)
    }
    if (renderFn) {
      Promise.resolve(renderFn())
        .then(doScroll)
        .catch(doScroll)
      return () => {
        /* no interval to clear yet */
      }
    }
    doScroll()
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

  // Pointer-draw mode (frame/freetext = rect drag; freehand/free-highlight =
  // free path capture).
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!annotDrawMode) return
      const holder = (e.target as HTMLElement).closest(
        "[data-page]"
      ) as HTMLElement | null
      if (!holder) return
      e.preventDefault()
      const isPath = annotDrawMode === "freehand" || annotDrawMode === "free-highlight"
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        holder
      }
      if (isPath) {
        setDragPath([{ x: e.clientX, y: e.clientY }])
      } else {
        setDragRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 })
      }
      document.body.style.userSelect = "none"
      const mv = (ev: PointerEvent) => {
        const d = dragState.current
        if (!d) return
        if (isPath) {
          setDragPath((cur) => [
            ...(cur ?? []),
            { x: ev.clientX, y: ev.clientY }
          ])
        } else {
          setDragRect({
            x: Math.min(d.startX, ev.clientX),
            y: Math.min(d.startY, ev.clientY),
            w: Math.abs(ev.clientX - d.startX),
            h: Math.abs(ev.clientY - d.startY)
          })
        }
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
        setDragPath(null)
        if (
          !d ||
          Math.abs(ev.clientX - d.startX) < 6 ||
          Math.abs(ev.clientY - d.startY) < 6
        )
          return
        const hr = d.holder.getBoundingClientRect()
        const page = Number(d.holder.getAttribute("data-page"))
        const norm = (px: number, py: number) => ({
          x: Math.max(0, Math.min((px - hr.left) / hr.width, 1)),
          y: Math.max(0, Math.min((py - hr.top) / hr.height, 1))
        })
        if (isPath) {
          const path = [norm(d.startX, d.startY)]
          for (const p of dragPathRef.current ?? []) path.push(norm(p.x, p.y))
          path.push(norm(ev.clientX, ev.clientY))
          let minX = Infinity
          let minY = Infinity
          let maxX = -Infinity
          let maxY = -Infinity
          for (const p of path) {
            minX = Math.min(minX, p.x)
            minY = Math.min(minY, p.y)
            maxX = Math.max(maxX, p.x)
            maxY = Math.max(maxY, p.y)
          }
          onAnnotDraw?.({
            page,
            kind: "path",
            path,
            rects: [
              {
                x: minX,
                y: minY,
                w: maxX - minX,
                h: maxY - minY
              }
            ]
          })
        } else {
          const rx = Math.max(
            0,
            Math.min(Math.min(d.startX, ev.clientX) - hr.left, hr.width)
          )
          const ry = Math.max(
            0,
            Math.min(Math.min(d.startY, ev.clientY) - hr.top, hr.height)
          )
          const rw = Math.min(Math.abs(ev.clientX - d.startX), hr.width - rx)
          const rh = Math.min(Math.abs(ev.clientY - d.startY), hr.height - ry)
          if (rw < 4 || rh < 4) return
          onAnnotDraw?.({
            page,
            kind: "rect",
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
      }
      document.addEventListener("pointermove", mv)
      document.addEventListener("pointerup", up)
      dragCleanupRef.current = cleanup
    },
    [annotDrawMode, onAnnotDraw]
  )

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
        cursor: annotDrawMode ? "crosshair" : "default"
      }}>
      {paneW > 0 &&
        Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
          <PageView
            key={n}
            renderRegistry={renderRegistryRef}
            doc={doc}
            pageNumber={n}
            paneW={paneW}
            paneH={paneH}
            zoom={zoom ?? 1}
            fitMode={fitMode}
            pageAspect={pageAspects?.get(n) ?? 1.414}
            eventBus={eventBus}
            linkService={linkService}
            annotations={pageAnnMap.get(n) ?? EMPTY_ANNOTATIONS}
            flashAnnId={flashPage === n ? flashAnnId : null}
            searchFlash={searchFlash?.page === n ? searchFlash : null}
            selectedAnnId={selectedAnnId}
            onAnnotationDeselect={onAnnotationDeselect}
            onAnnotationClick={onAnnotationClick}
            onFlashDone={onFlashDone}
            annotDrawMode={annotDrawMode}
            onTextSelected={onTextSelected}
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
      {dragPath && dragPath.length > 1 && (
        <svg
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            width: "100vw",
            height: "100vh",
            pointerEvents: "none",
            zIndex: 20
          }}>
          <polyline
            points={dragPath.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={annotDrawMode === "free-highlight" ? "rgba(183,149,91,0.6)" : "rgba(99,102,241,0.7)"}
            strokeWidth={annotDrawMode === "free-highlight" ? 14 : 2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  )
}
