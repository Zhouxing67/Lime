import { useEffect } from "react"

import { usePdfViewerContext } from "~/src/pdf/inklayer/context/pdf_viewer_context"

interface GeometryDebugOptions {
  /** Render the normally transparent TextLayer glyphs in red. Default true. */
  showText?: boolean
  /** Reduce canvas opacity so TextLayer baselines are easier to compare. */
  dimCanvas?: boolean
  /** Outline every leaf text span. */
  outlineSpans?: boolean
}

interface RectSnapshot {
  x: number
  y: number
  width: number
  height: number
}

interface GeometryDiagnosticsApi {
  enable(options?: GeometryDebugOptions): void
  disable(): void
  report(pageNumber?: number): unknown
  inspectSelection(): unknown
}

declare global {
  interface Window {
    __limePdfGeometry?: GeometryDiagnosticsApi
  }
}

const round = (value: number) => Math.round(value * 100) / 100

function rectSnapshot(rect: DOMRect | DOMRectReadOnly): RectSnapshot {
  return {
    x: round(rect.x),
    y: round(rect.y),
    width: round(rect.width),
    height: round(rect.height)
  }
}

function rectDelta(actual: DOMRect, expected: DOMRect): RectSnapshot {
  return {
    x: round(actual.x - expected.x),
    y: round(actual.y - expected.y),
    width: round(actual.width - expected.width),
    height: round(actual.height - expected.height)
  }
}

function fontLoaded(style: CSSStyleDeclaration): boolean | null {
  try {
    return document.fonts.check(`${style.fontSize} ${style.fontFamily}`)
  } catch {
    return null
  }
}

/**
 * Opt-in real-browser PDF geometry probe. It never changes persisted data and
 * is inert until `window.__limePdfGeometry.enable()` is called in DevTools.
 */
export function usePdfGeometryDiagnostics() {
  const { pdfViewer } = usePdfViewerContext()

  useEffect(() => {
    if (!pdfViewer) return
    const viewer = pdfViewer.viewer as HTMLElement
    const style = document.createElement("style")
    style.dataset.limePdfGeometry = "true"
    style.textContent = `
.lime-pdf-geometry-debug.lime-pdf-geometry-show-text .textLayer :is(span,br){
  color:rgba(225,29,72,.72)!important;
  text-shadow:0 0 0 rgba(225,29,72,.72);
}
.lime-pdf-geometry-debug.lime-pdf-geometry-outline .textLayer span:not(.markedContent){
  outline:1px solid rgba(14,165,233,.55);
  background:rgba(14,165,233,.08);
}
.lime-pdf-geometry-debug.lime-pdf-geometry-dim-canvas .canvasWrapper canvas{
  opacity:.28;
}
.lime-pdf-geometry-debug .page{
  outline:1px solid rgba(6,182,212,.7);
  outline-offset:-1px;
}
.lime-pdf-geometry-debug .textLayer{
  box-shadow:inset 0 0 0 1px rgba(244,63,94,.8);
}`
    document.head.appendChild(style)

    const pageReport = (pageNumber?: number) => {
      const current = pageNumber ?? pdfViewer.currentPageNumber
      const pageView = pdfViewer.getPageView(current - 1)
      const page = pageView?.div as HTMLElement | undefined
      if (!pageView || !page) return null
      const pageRect = page.getBoundingClientRect()
      const textLayer = pageView.textLayer?.div as HTMLElement | undefined
      const canvas = page.querySelector(".canvasWrapper canvas") as
        | HTMLCanvasElement
        | null
      const textRect = textLayer?.getBoundingClientRect()
      const canvasRect = canvas?.getBoundingClientRect()
      const leafSpans = textLayer
        ? Array.from(
            textLayer.querySelectorAll<HTMLElement>(
              "span:not(.markedContent):not(:has(span))"
            )
          )
        : []
      const fontMap = new Map<
        string,
        { fontFamily: string; fontSize: string; loaded: boolean | null }
      >()
      for (const span of leafSpans) {
        const computed = getComputedStyle(span)
        const key = `${computed.fontFamily}|${computed.fontSize}`
        if (!fontMap.has(key)) {
          fontMap.set(key, {
            fontFamily: computed.fontFamily,
            fontSize: computed.fontSize,
            loaded: fontLoaded(computed)
          })
        }
      }
      const contentRect = new DOMRect(
        pageRect.x + page.clientLeft,
        pageRect.y + page.clientTop,
        page.clientWidth,
        page.clientHeight
      )
      const result = {
        page: current,
        viewport: {
          scale: round(pageView.viewport.scale),
          rotation: pageView.viewport.rotation,
          width: round(pageView.viewport.width),
          height: round(pageView.viewport.height)
        },
        devicePixelRatio: window.devicePixelRatio,
        pageRect: rectSnapshot(pageRect),
        pageContentRect: rectSnapshot(contentRect),
        textLayerRect: textRect ? rectSnapshot(textRect) : null,
        textLayerDeltaFromPageContent: textRect
          ? rectDelta(textRect, contentRect)
          : null,
        canvasCssRect: canvasRect ? rectSnapshot(canvasRect) : null,
        canvasDeltaFromPageContent: canvasRect
          ? rectDelta(canvasRect, contentRect)
          : null,
        canvasBitmap: canvas
          ? { width: canvas.width, height: canvas.height }
          : null,
        leafSpans: leafSpans.length,
        fonts: Array.from(fontMap.values())
      }
      console.group(`[lime-pdf-geometry] page ${current}`)
      console.table({
        pageContent: result.pageContentRect,
        textLayer: result.textLayerRect,
        textMinusPage: result.textLayerDeltaFromPageContent,
        canvas: result.canvasCssRect,
        canvasMinusPage: result.canvasDeltaFromPageContent
      })
      console.log(result)
      console.table(result.fonts)
      console.groupEnd()
      return result
    }

    const inspectSelection = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        console.warn("[lime-pdf-geometry] no active text selection")
        return null
      }
      const range = selection.getRangeAt(0)
      const startElement =
        range.startContainer instanceof HTMLElement
          ? range.startContainer
          : range.startContainer.parentElement
      const span = startElement?.closest(".textLayer span") as
        | HTMLElement
        | null
      const computed = span ? getComputedStyle(span) : null
      const result = {
        text: range.toString(),
        rangeRects: Array.from(range.getClientRects()).map(rectSnapshot),
        startSpanRect: span
          ? rectSnapshot(span.getBoundingClientRect())
          : null,
        startSpanStyle: computed
          ? {
              fontFamily: computed.fontFamily,
              fontSize: computed.fontSize,
              lineHeight: computed.lineHeight,
              left: computed.left,
              top: computed.top,
              transform: computed.transform,
              transformOrigin: computed.transformOrigin,
              loaded: fontLoaded(computed)
            }
          : null
      }
      console.log("[lime-pdf-geometry] selection", result)
      return result
    }

    const api: GeometryDiagnosticsApi = {
      enable(options = {}) {
        viewer.classList.add("lime-pdf-geometry-debug")
        viewer.classList.toggle(
          "lime-pdf-geometry-show-text",
          options.showText !== false
        )
        viewer.classList.toggle(
          "lime-pdf-geometry-dim-canvas",
          options.dimCanvas === true
        )
        viewer.classList.toggle(
          "lime-pdf-geometry-outline",
          options.outlineSpans === true
        )
        pageReport()
      },
      disable() {
        viewer.classList.remove(
          "lime-pdf-geometry-debug",
          "lime-pdf-geometry-show-text",
          "lime-pdf-geometry-dim-canvas",
          "lime-pdf-geometry-outline"
        )
      },
      report: pageReport,
      inspectSelection
    }
    window.__limePdfGeometry = api

    return () => {
      api.disable()
      style.remove()
      if (window.__limePdfGeometry === api) delete window.__limePdfGeometry
    }
  }, [pdfViewer])
}
