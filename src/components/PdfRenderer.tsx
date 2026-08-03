import { useEffect, useRef, useState } from "react"

import * as pdfjsLib from "pdfjs-dist"

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
  background: rgba(99,102,241,0.26);
  border-radius: 2px;
}
`

/** Render one page lazily (IntersectionObserver) at DPR crispness + text layer.
 *  Each page fits the pane width INDEPENDENTLY (per-page zoom) so mixed-size
 *  PDFs never overflow the pane ("cards pane covers PDF"). */
function PageView({
  doc,
  pageNumber,
  paneW
}: {
  doc: pdfjsLib.PDFDocumentProxy
  pageNumber: number
  paneW: number
}) {
  const holderRef = useRef<HTMLDivElement>(null)
  const [wh, setWh] = useState<{ w: number; h: number } | null>(null)
  const [scale, setScale] = useState(1)

  // Per-page fit-width scale + holder size (no canvas rendering).
  useEffect(() => {
    if (paneW <= 0) return
    let cancelled = false
    doc.getPage(pageNumber).then((page) => {
      if (cancelled) return
      const baseW = page.getViewport({ scale: 1 }).width
      if (baseW <= 0) return
      const s = Math.max(0.4, paneW / baseW)
      const vp = page.getViewport({ scale: s })
      setScale(s)
      setWh({ w: Math.floor(vp.width), h: Math.floor(vp.height) })
    })
    return () => {
      cancelled = true
    }
  }, [doc, pageNumber, paneW])

  // Render canvas + text layer when the holder scrolls into view.
  useEffect(() => {
    const holder = holderRef.current
    if (!holder || !wh) return
    let cancelled = false
    let renderTask: pdfjsLib.RenderTask | null = null
    let textLayer: InstanceType<typeof pdfjsLib.TextLayer> | null = null
    const dpr = window.devicePixelRatio || 1

    const render = async () => {
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
      }
    }

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          obs.disconnect()
          render().catch((e) => {
            // Cancelled renders are expected on scroll/re-render, not errors.
            if (e instanceof pdfjsLib.RenderingCancelledException) return
            console.warn("[pdf] page render:", e)
          })
        }
      },
      { rootMargin: "400px 0px" }
    )
    obs.observe(holder)
    return () => {
      cancelled = true
      obs.disconnect()
      renderTask?.cancel()
      textLayer?.cancel()
    }
  }, [doc, pageNumber, scale, wh])

  return (
    <div
      ref={holderRef}
      data-page={pageNumber}
      style={{
        position: "relative",
        margin: "0 auto 12px",
        background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        width: wh?.w,
        height: wh?.h
      }}>
      <canvas style={{ display: "block" }} />
      <div className="pdf-textlayer" />
      <style>{TEXT_LAYER_CSS}</style>
    </div>
  )
}

/** Scrollable, lazy-rendered pages at fit-width with a shared zoom. */
export default function PdfRenderer({
  doc,
  pageCount,
  scrollTarget
}: {
  doc: pdfjsLib.PDFDocumentProxy
  pageCount: number
  scrollTarget?: number | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [paneW, setPaneW] = useState(0)

  // Measure the pane width (with a tolerance to avoid a scrollbar-induced
  // resize loop when the pages re-render and the vertical scrollbar toggles).
  const paneWRef = useRef(0)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width
      if (Math.abs(w - paneWRef.current) <= 2) return
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

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        overflowX: "hidden",
        background: "#f0efec",
        padding: "16px 0"
      }}>
      {paneW > 0 &&
        Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
          <PageView key={n} doc={doc} pageNumber={n} paneW={paneW} />
        ))}
    </div>
  )
}
