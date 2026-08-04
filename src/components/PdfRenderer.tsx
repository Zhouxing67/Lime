import { useEffect, useMemo, useRef, useState } from "react"

import * as pdfjsLib from "pdfjs-dist"

import type { PdfAnnotation, PdfMark } from "../types"
import { registerTextLayer, unregisterTextLayer } from "./pdfRegistry"
import { textLayerRects } from "./pdfText"
import type { PdfRect } from "./pdfText"

// Low-saturation annotation colors (align with the app's RATING_META family).
const EMPTY_ANNOTATIONS: PdfAnnotation[] = []
const MARK_COLOR: Record<PdfMark, string> = {
  highlight: "rgba(183,149,91,0.26)",
  underline: "#6f9476",
  wavy: "#b2705a",
  strike: "rgba(45,52,54,0.45)",
  frame: "rgba(99,102,241,0.35)"
}

function drawAnnotation(
  overlay: HTMLElement,
  type: PdfMark,
  rect: PdfRect
): void {
  const el = document.createElement("div")
  el.style.cssText = `position:absolute;left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px;pointer-events:none;`
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
  for (const ann of annotations) {
    if (ann.kind !== "text" || ann.startOffset == null || ann.endOffset == null)
      continue
    const rects = textLayerRects(textLayer, holder, ann.startOffset, ann.endOffset)
    for (const r of rects) {
      if (ann.id === flashAnnId) {
        const flash = document.createElement("div")
        flash.className = "pdf-ann-flash"
        flash.style.cssText = `position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;pointer-events:none;`
        overlay.appendChild(flash)
      }
      drawAnnotation(overlay, ann.type, r)
    }
  }
}

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
.pdf-ann-flash {
  background: rgba(99,102,241,0.4);
  border-radius: 2px;
  animation: pdfAnnFlash 1.4s ease-out forwards;
}
@keyframes pdfAnnFlash {
  0% { opacity: 1; }
  100% { opacity: 0; }
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
  annotations,
  flashAnnId,
  onFlashDone
}: {
  doc: pdfjsLib.PDFDocumentProxy
  pageNumber: number
  paneW: number
  annotations: PdfAnnotation[]
  flashAnnId?: string | null
  onFlashDone?: () => void
}) {
  const holderRef = useRef<HTMLDivElement>(null)
  const [wh, setWh] = useState<{ w: number; h: number } | null>(null)
  const [scale, setScale] = useState(1)
  const flashDoneRef = useRef(onFlashDone)
  flashDoneRef.current = onFlashDone
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
      const s = Math.max(0.4, paneW / baseW)
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
        }
        // Expose for the toolbar's selection→offset mapping.
        registerTextLayer(pageNumber, { holder, textLayer })
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
              // Cancelled renders are expected on scroll/re-render, not errors.
              if (e instanceof pdfjsLib.RenderingCancelledException) return
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
  }, [doc, pageNumber, paneW, wh, scale, annotations, flashAnnId])

  return (
    <div
      ref={holderRef}
      data-page={pageNumber}
      style={{
        position: "relative",
        margin: "0 auto 12px",
        background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        width: wh?.w ?? (paneW > 0 ? Math.floor(paneW) : undefined),
        height: wh?.h ?? (paneW > 0 ? placeholderH : undefined)
      }}>
      <canvas style={{ display: "block" }} />
      <div className="pdf-annotations" />
      <div className="pdf-textlayer" />
      <style>{TEXT_LAYER_CSS}</style>
    </div>
  )
}

/** Scrollable, lazy-rendered pages at fit-width with a shared zoom. */
export default function PdfRenderer({
  doc,
  pageCount,
  scrollTarget,
  annotations,
  flashAnnId,
  onFlashDone
}: {
  doc: pdfjsLib.PDFDocumentProxy
  pageCount: number
  scrollTarget?: number | null
  annotations?: PdfAnnotation[]
  flashAnnId?: string | null
  onFlashDone?: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [paneW, setPaneW] = useState(0)

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

  // Only the page holding the flash target re-renders (avoids re-rendering
  // every page's canvas when a card is clicked).
  const flashPage = flashAnnId
    ? annotations?.find((a) => a.id === flashAnnId)?.page ?? null
    : null

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
          <PageView
            key={n}
            doc={doc}
            pageNumber={n}
            paneW={paneW}
            annotations={pageAnnMap.get(n) ?? EMPTY_ANNOTATIONS}
            flashAnnId={flashPage === n ? flashAnnId : null}
            onFlashDone={onFlashDone}
          />
        ))}
    </div>
  )
}
