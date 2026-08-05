import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import * as pdfjsLib from "pdfjs-dist"

import type { PdfAnnotation, PdfMark } from "../types"
import { MARK_COLOR } from "./pdfTheme"
import { registerTextLayer, unregisterTextLayer } from "./pdfRegistry"
import { mergeRects, textLayerOffsets, textLayerRects } from "./pdfText"
import type { PdfRect } from "./pdfText"

// Low-saturation annotation colors (align with the app's RATING_META family).
const EMPTY_ANNOTATIONS: PdfAnnotation[] = []

function drawAnnotation(
  overlay: HTMLElement,
  type: PdfMark,
  rect: PdfRect,
  annId: string
): void {
  const el = document.createElement("div")
  el.className = "pdf-ann"
  el.dataset.annId = annId
  el.style.cssText = `position:absolute;left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px;`
  if (type === "highlight") {
    el.style.background = MARK_COLOR.highlight
    el.style.borderRadius = "2px"
  } else if (type === "underline") {
    el.style.borderBottom = `1.5px solid ${MARK_COLOR.underline}`
  } else if (type === "wavy") {
    el.innerHTML = `<svg width="${rect.w}" height="${rect.h}" style="position:absolute;left:0;top:${rect.h - 3}px;overflow:visible"><path d="${wavyPath(rect.w)}" stroke="${MARK_COLOR.wavy}" stroke-width="1.5" fill="none"/></svg>`
  } else if (type === "strike") {
    el.innerHTML = `<div style="position:absolute;top:${rect.h / 2 - 1}px;left:0;right:0;height:1.5px;background:${MARK_COLOR.strike}"></div>`
  } else if (type === "frame") {
    el.style.border = `1.5px solid ${MARK_COLOR.frame}`
    el.style.borderRadius = "2px"
  }
  overlay.appendChild(el)
}

function wavyPath(w: number): string {
  const amp = 2
  const period = 6
  const half = period / 2
  let d = `M0 0`
  let x = 0
  while (x < w) {
    d += ` Q${x + half / 2} ${-amp} ${x + half} 0`
    d += ` Q${x + (half + half / 2)} ${amp} ${x + period} 0`
    x += period
  }
  return d
}

function drawPageAnnotations(
  overlay: HTMLElement,
  annotations: PdfAnnotation[],
  textLayer: InstanceType<typeof pdfjsLib.TextLayer>,
  holder: HTMLElement,
  flashAnnId: string | null
): void {
  overlay.replaceChildren()
  const holderRect = holder.getBoundingClientRect()
  const hw = holderRect.width || 1
  const hh = holderRect.height || 1
  for (const ann of annotations) {
    if (ann.kind === "text") {
      if (ann.startOffset == null || ann.endOffset == null) continue
      const rects = textLayerRects(textLayer, holder, ann.startOffset, ann.endOffset)
      for (const r of rects) {
        if (ann.id === flashAnnId) appendFlash(overlay, r)
        drawAnnotation(overlay, ann.type, r, ann.id)
      }
    } else if (ann.kind === "region") {
      // Frame rects are stored normalized (0-1 fractions of the page box).
      for (const r of ann.rects ?? []) {
        const rect = { x: r.x * hw, y: r.y * hh, w: r.w * hw, h: r.h * hh }
        if (ann.id === flashAnnId) appendFlash(overlay, rect)
        drawAnnotation(overlay, ann.type, rect, ann.id)
      }
    }
  }
}

function appendFlash(overlay: HTMLElement, r: PdfRect): void {
  const flash = document.createElement("div")
  flash.className = "pdf-ann-flash"
  flash.style.cssText = `position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;pointer-events:none;`
  overlay.appendChild(flash)
}

/** The reading column never exceeds this share of the pane width — the pages
 *  are centered with side white space instead of stretching edge-to-edge. */
const PAGE_RATIO = 0.75

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
.pdf-ann-flash {
  background: rgba(99,102,241,0.4);
  border-radius: 2px;
  animation: pdfAnnFlash 1.4s ease-out forwards;
}
@keyframes pdfAnnFlash {
  0% { opacity: 1; }
  100% { opacity: 0; }
}
.pdf-annotations {
  /* Above the text layer (z-index 0 + spans pointer-events auto) so clicks
     reach the annotations instead of being swallowed by the selectable text. */
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}
.pdf-ann {
  pointer-events: auto;
  cursor: pointer;
}
.pdf-ann:hover { filter: brightness(0.92); }
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
  zoom,
  annotations,
  flashAnnId,
  onFlashDone,
  searchFlash,
  onAnnotationClick
}: {
  doc: pdfjsLib.PDFDocumentProxy
  pageNumber: number
  paneW: number
  zoom: number
  annotations: PdfAnnotation[]
  flashAnnId?: string | null
  onFlashDone?: () => void
  searchFlash?: { page: number; start: number; end: number } | null
  onAnnotationClick?: (annId: string, pos: { x: number; y: number }) => void
}) {
  const holderRef = useRef<HTMLDivElement>(null)
  const [wh, setWh] = useState<{ w: number; h: number } | null>(null)
  const [scale, setScale] = useState(1)
  const flashDoneRef = useRef(onFlashDone)
  flashDoneRef.current = onFlashDone
  const onAnnotationClickRef = useRef(onAnnotationClick)
  onAnnotationClickRef.current = onAnnotationClick
  const textLayerRef = useRef<InstanceType<typeof pdfjsLib.TextLayer> | null>(
    null
  )

  // Click an annotation → jump to its card + open the annotation actions popover.
  useEffect(() => {
    const overlay = holderRef.current?.querySelector(".pdf-annotations")
    if (!overlay) return
    const onClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("[data-ann-id]")
      if (!target) return
      onAnnotationClickRef.current?.(
        target.getAttribute("data-ann-id")!,
        { x: e.clientX, y: e.clientY }
      )
    }
    overlay.addEventListener("click", onClick)
    return () => overlay.removeEventListener("click", onClick)
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
  const placeholderH = paneW > 0 ? Math.floor(paneW * 1.414) : 0

  useEffect(() => {
    const holder = holderRef.current
    if (!holder || paneW <= 0) return
    let cancelled = false
    let renderTask: pdfjsLib.RenderTask | null = null
    let textLayer: InstanceType<typeof pdfjsLib.TextLayer> | null = null
    let flashTimer: number | null = null
    const dpr = window.devicePixelRatio || 1

    const computeSize = async () => {
      const page = await doc.getPage(pageNumber)
      if (cancelled) return
      const baseW = page.getViewport({ scale: 1 }).width
      if (baseW <= 0) return
      const s = Math.max(0.4, (paneW * PAGE_RATIO * zoom) / baseW)
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
      canvas.width = Math.floor(wh.w * dpr)
      canvas.height = Math.floor(wh.h * dpr)
      canvas.style.width = `${wh.w}px`
      canvas.style.height = `${wh.h}px`
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
        // Draw the page's annotations from the text spans.
        const annDiv = holder.querySelector<HTMLElement>(".pdf-annotations")
        if (annDiv) {
          drawPageAnnotations(annDiv, annotations, textLayer, holder, flashAnnId)
          if (flashAnnId && flashTimer === null) {
            flashTimer = window.setTimeout(() => flashDoneRef.current?.(), 1500)
          }
          // Search-match highlight (temporary, not a stored annotation).
          if (searchFlash) {
            const rects = textLayerRects(
              textLayer,
              holder,
              searchFlash.start,
              searchFlash.end
            )
            for (const r of rects) appendFlash(annDiv, r)
          }
        }
        // Expose for the toolbar's selection→offset mapping.
        registerTextLayer(pageNumber, { holder, textLayer })
        textLayerRef.current = textLayer
      }
    }

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          obs.disconnect()
          if (!wh) {
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
        }
      },
      { rootMargin: "800px 0px" }
    )
    obs.observe(holder)
    return () => {
      cancelled = true
      obs.disconnect()
      renderTask?.cancel()
      textLayer?.cancel()
      if (flashTimer !== null) window.clearTimeout(flashTimer)
      unregisterTextLayer(pageNumber)
    }
  }, [doc, pageNumber, paneW, zoom, wh, scale, annotations, flashAnnId, searchFlash])

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
  annotations?: PdfAnnotation[]
  flashAnnId?: string | null
  onFlashDone?: () => void
  frameMode?: boolean
  onFrameRegion?: (result: {
    page: number
    rects: PdfRect[]
    imageDataUrl: string
  }) => void
  searchFlash?: { page: number; start: number; end: number } | null
  onVisiblePageChange?: (page: number) => void
  onAnnotationClick?: (annId: string, pos: { x: number; y: number }) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [paneW, setPaneW] = useState(0)
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
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width
      if (w === paneWRef.current) return
      paneWRef.current = w
      setPaneW(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Scroll to a requested page (TOC navigation) — instant, positions are
  // accurate because every holder already carries its real page height.
  useEffect(() => {
    if (!scrollTarget) return
    const el = containerRef.current?.querySelector(
      `[data-page="${scrollTarget}"]`
    )
    el?.scrollIntoView({ behavior: "auto", block: "start" })
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
      const canvas = d.holder.querySelector("canvas")
      // Guard: a lazy page that hasn't rendered yet has a 0-size canvas — the
      // crop would be blank.
      if (!canvas || canvas.width === 0 || canvas.height === 0) return
      const dpr = window.devicePixelRatio || 1
      const crop = document.createElement("canvas")
      crop.width = Math.max(1, Math.floor(rw * dpr))
      crop.height = Math.max(1, Math.floor(rh * dpr))
      const ctx = crop.getContext("2d")
      if (!ctx) return
      ctx.drawImage(
        canvas,
        rx * dpr,
        ry * dpr,
        rw * dpr,
        rh * dpr,
        0,
        0,
        crop.width,
        crop.height
      )
      onFrameRegion?.({
        page: Number(d.holder.getAttribute("data-page")),
        rects: [
          {
            x: rx / hr.width,
            y: ry / hr.height,
            w: rw / hr.width,
            h: rh / hr.height
          }
        ],
        imageDataUrl: crop.toDataURL("image/png")
      })
    }
    document.addEventListener("pointermove", mv)
    document.addEventListener("pointerup", up)
    dragCleanupRef.current = cleanup
  }, [frameMode, onFrameRegion])

  return (
    <div
      ref={containerRef}
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
            zoom={zoom ?? 1}
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
