import { useEffect, useRef, useState } from "react"

import * as pdfjsLib from "pdfjs-dist"

const TEXT_LAYER_CSS = `
.pdf-textlayer {
  position: absolute; inset: 0; overflow: hidden; opacity: 1;
  line-height: 1; transform-origin: 0 0;
}
.pdf-textlayer :is(span, br) {
  position: absolute; white-space: pre; cursor: text;
  transform-origin: 0% 0%; color: transparent;
}
.pdf-textlayer ::selection {
  background: rgba(99,102,241,0.26);
  border-radius: 2px;
}
`

/** Render one page lazily (IntersectionObserver) at DPR crispness + text layer. */
function PageView({
  doc,
  pageNumber,
  scale
}: {
  doc: pdfjsLib.PDFDocumentProxy
  pageNumber: number
  scale: number
}) {
  const holderRef = useRef<HTMLDivElement>(null)
  const [wh, setWh] = useState<{ w: number; h: number } | null>(null)

  useEffect(() => {
    const holder = holderRef.current
    if (!holder) return
    let cancelled = false
    let renderTask: pdfjsLib.RenderTask | null = null
    let textLayer: InstanceType<typeof pdfjsLib.TextLayer> | null = null
    const dpr = window.devicePixelRatio || 1

    const render = async () => {
      const page = await doc.getPage(pageNumber)
      if (cancelled) return
      const vp = page.getViewport({ scale })
      const w = Math.floor(vp.width)
      const h = Math.floor(vp.height)
      setWh({ w, h })
      const canvas = holder.querySelector("canvas")
      if (!canvas) return
      // DPR crispness: physical canvas = logical × dpr, CSS = logical.
      canvas.width = Math.floor(vp.width * dpr)
      canvas.height = Math.floor(vp.height * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      renderTask = page.render({
        canvas,
        viewport: page.getViewport({ scale: scale * dpr })
      })
      await renderTask.promise
      if (cancelled) return
      // Text layer (selection) aligned over the canvas at the logical viewport.
      const layerDiv = holder.querySelector<HTMLDivElement>(".pdf-textlayer")
      if (layerDiv) {
        layerDiv.style.width = `${w}px`
        layerDiv.style.height = `${h}px`
        layerDiv.style.setProperty("--scale-factor", String(scale))
        textLayer = new pdfjsLib.TextLayer({
          textContentSource: page.streamTextContent({ disableNormalization: true }),
          container: layerDiv,
          viewport: vp
        })
        await textLayer.render()
      }
    }

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          obs.disconnect()
          render().catch((e) => console.warn("[pdf] page render:", e))
        }
      },
      { rootMargin: "600px 0px" }
    )
    obs.observe(holder)
    return () => {
      cancelled = true
      obs.disconnect()
      renderTask?.cancel()
      textLayer?.cancel()
    }
  }, [doc, pageNumber, scale])

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
        height: wh?.h ?? 800
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
  const [scale, setScale] = useState<number | null>(null)

  // Measure the pane width.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      setPaneW(entries[0].contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Derive a shared fit-width zoom from the first page's base width.
  useEffect(() => {
    if (paneW <= 0 || scale !== null) return
    let cancelled = false
    doc.getPage(1).then((page) => {
      if (cancelled) return
      const baseW = page.getViewport({ scale: 1 }).width
      if (baseW > 0) setScale(Math.max(0.4, paneW / baseW))
    })
    return () => {
      cancelled = true
    }
  }, [paneW, scale, doc])

  // Scroll to a requested page (TOC navigation).
  useEffect(() => {
    if (!scrollTarget) return
    const el = containerRef.current?.querySelector(
      `[data-page="${scrollTarget}"]`
    )
    el?.scrollIntoView({ behavior: "smooth", block: "start" })
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
      {scale !== null &&
        Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
          <PageView key={n} doc={doc} pageNumber={n} scale={scale} />
        ))}
    </div>
  )
}
