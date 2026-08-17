import { useCallback, useEffect, useRef } from "react"

import { usePdfViewerContext } from "~/src/pdf/inklayer/context/pdf_viewer_context"
import { highlightRectsForOffsets, textLayerOffsets, textLayerText } from "../pdfText"
import type { PdfRect } from "../pdfText"

export interface PdfSearchFlashData {
  page: number
  matches: { start: number; end: number }[]
  current: number
  query?: string
}

/** The line-bridging selection/search highlight overlay (see PdfEngineView).
 *  Owns the two overlay divs, the selectionchange listener, the searchFlash
 *  rendering, and the zoom/text-layer-rebuild re-draw. Renders inside the
 *  PdfViewerProvider (takes pdfViewer/eventBus from its context). */
export function usePdfHighlights(searchFlash: PdfSearchFlashData | null) {
  const { pdfViewer, eventBus } = usePdfViewerContext()
  // ── Selection / search highlight — self-drawn line-bridging overlay ──────
  // The browser's native range painting (::selection, CSS Highlight API) draws
  // per text-layer SPAN — and pdf.js puts every text item in its own
  // absolutely-positioned span, so word gaps (justified text) read as broken
  // fragments. Instead we compute rects via highlightRectsForOffsets: char-
  // precise per covered span, then merged into ONE box per visual LINE
  // (bridging gaps), vertically snapped to the line's tight em box. Rendered
  // as a plain overlay div (z:5, below the text layer). No elementFromPoint,
  // no merge-tolerance guessing. Selection and search get SEPARATE overlay divs
  // so a live selection never wipes the search highlights (the old F1).
  const overlayDivsRef = useRef<{ selection?: HTMLDivElement; search?: HTMLDivElement }>({})
  const overlayPagesRef = useRef<{ selection?: number; search?: number }>({})

  const drawOverlay = useCallback(
    (kind: "selection" | "search", page: number, rects: PdfRect[], current: Set<number>) => {
      if (!pdfViewer) return
      const pageEl = pdfViewer.getPageView(page - 1)?.div as
        | HTMLElement
        | undefined
      if (!pageEl) return
      const overlays = overlayDivsRef.current
      const pages = overlayPagesRef.current
      // pdf.js rebuilds the page's DOM on zoom/re-render, REMOVING our overlay
      // div — the ref then points at a detached element. Re-create the div when
      // it's gone from the document (isConnected) so highlights survive zoom.
      if (
        pages[kind] !== page ||
        !overlays[kind] ||
        !overlays[kind].isConnected
      ) {
        overlays[kind]?.remove()
        delete overlays[kind]
        const div = document.createElement("div")
        div.style.cssText =
          "position:absolute;inset:0;pointer-events:none;z-index:5;overflow:hidden"
        pageEl.appendChild(div)
        overlays[kind] = div
        pages[kind] = page
      }
      const div = overlays[kind]!
      div.replaceChildren()
      rects.forEach((r, i) => {
        const isCurrent = current.has(i)
        const el = document.createElement("div")
        el.style.cssText = `position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;background:${
          isCurrent ? "rgba(99,102,241,0.42)" : "rgba(99,102,241,0.26)"
        };border-radius:1px${
          isCurrent ? ";box-shadow:0 0 0 1.5px rgba(99,102,241,0.85)" : ""
        }`
        div.appendChild(el)
      })
    },
    [pdfViewer]
  )

  const clearOverlay = useCallback((kind: "selection" | "search") => {
    overlayDivsRef.current[kind]?.remove()
    delete overlayDivsRef.current[kind]
    delete overlayPagesRef.current[kind]
  }, [])

  useEffect(() => {
    if (!eventBus || !pdfViewer) return
    let raf = 0
    const onSelChange = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        clearOverlay("selection")
        return
      }
      const range = sel.getRangeAt(0)
      const pageEl = (
        range.startContainer instanceof Node
          ? range.startContainer.parentElement?.closest(
              "[data-page-number]"
            )
          : null
      ) as HTMLElement | null
      if (!pageEl) {
        clearOverlay("selection")
        return
      }
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const page = Number(pageEl.dataset.pageNumber)
        const textLayer = pdfViewer.getPageView(page - 1)?.textLayer
        if (!textLayer) {
          clearOverlay("selection")
          return
        }
        const offsets = textLayerOffsets(textLayer, sel)
        if (!offsets) {
          clearOverlay("selection")
          return
        }
        const rects = highlightRectsForOffsets(
          textLayer,
          pageEl,
          offsets.start,
          offsets.end
        )
        drawOverlay("selection", page, rects, new Set())
      })
    }
    document.addEventListener("selectionchange", onSelChange)
    return () => {
      document.removeEventListener("selectionchange", onSelChange)
      if (raf) cancelAnimationFrame(raf)
      clearOverlay("selection")
    }
  }, [eventBus, pdfViewer, drawOverlay, clearOverlay])

  // ── Search highlight ─────────────────────────────────────────────────────
  // The searchFlash's char-offset matches go through the SAME offset pipeline
  // as the selection (highlightRectsForOffsets) — one geometry, one overlay.
  const lastSearchRef = useRef<{
    page: number
    matches: { start: number; end: number }[]
    current: number
    query?: string
  } | null>(null)

  const renderSearchOverlay = useCallback(() => {
    const data = lastSearchRef.current
    if (!data) {
      clearOverlay("search")
      return
    }
    const { page, matches, current } = data
    const pageEl = pdfViewer?.getPageView(page - 1)?.div as
      | HTMLElement
      | undefined
    const textLayer = pdfViewer?.getPageView(page - 1)?.textLayer
    if (!pageEl || !textLayer) {
      clearOverlay("search")
      return
    }
    // Diagnostic: verify the getTextContent char offsets actually land on the
    // query in the RENDERED text layer — this pinpoints the long-standing
    // "highlight lands on the wrong word" drift. Opt-in via
    // `window.__limePdfSearchDebug = true` (F12 console), logs the first few
    // mismatches per page.
    if (data.query && (window as any).__limePdfSearchDebug) {
      const domText = textLayerText(textLayer)
      const fold = (s: string) => s.toLowerCase()
      const q = fold(data.query)
      for (const m of matches) {
        const actual = domText.slice(m.start, m.end)
        if (fold(actual) !== q) {
          console.warn(
            "[lime-pdf] search offset MISALIGNED on page",
            page,
            "match",
            m,
            "query",
            JSON.stringify(data.query),
            "actual@offset",
            JSON.stringify(domText.slice(m.start - 6, m.end + 6))
          )
        }
      }
    }
    const all: { r: PdfRect; isCurrent: boolean }[] = []
    for (let i = 0; i < matches.length; i++) {
      const rects = highlightRectsForOffsets(
        textLayer,
        pageEl,
        matches[i].start,
        matches[i].end
      )
      rects.forEach((r) => all.push({ r, isCurrent: i === current }))
    }
    const flat = all.map((a) => a.r)
    const cur = new Set(
      all.map((a, i) => (a.isCurrent ? i : -1)).filter((i) => i >= 0)
    )
    drawOverlay("search", page, flat, cur)
  }, [pdfViewer, drawOverlay, clearOverlay])

  useEffect(() => {
    if (!searchFlash) {
      lastSearchRef.current = null
      clearOverlay("search")
      return
    }
    lastSearchRef.current = {
      page: searchFlash.page,
      matches: searchFlash.matches,
      current: searchFlash.current
    }
    renderSearchOverlay()
  }, [searchFlash, renderSearchOverlay, clearOverlay])

  // Re-draw after zoom / text-layer rebuilds — the rects must follow the
  // CURRENT layout (a stale viewport used to draw the rects "way off" after
  // zoom), and the selection must be re-derived from the live selection.
  useEffect(() => {
    if (!eventBus) return
    const onRezoom = () => {
      if (lastSearchRef.current) renderSearchOverlay()
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return
      const range = sel.getRangeAt(0)
      const pageEl = (
        range.startContainer instanceof Node
          ? range.startContainer.parentElement?.closest(
              "[data-page-number]"
            )
          : null
      ) as HTMLElement | null
      if (!pageEl) return
      const page = Number(pageEl.dataset.pageNumber)
      const textLayer = pdfViewer?.getPageView(page - 1)?.textLayer
      if (!textLayer) return
      const offsets = textLayerOffsets(textLayer, sel)
      if (!offsets) return
      const rects = highlightRectsForOffsets(
        textLayer,
        pageEl,
        offsets.start,
        offsets.end
      )
      drawOverlay("selection", page, rects, new Set())
    }
    eventBus.on("scalechanging", onRezoom)
    eventBus.on("textlayerrendered", onRezoom)
    return () => {
      eventBus.off("scalechanging", onRezoom)
      eventBus.off("textlayerrendered", onRezoom)
    }
  }, [eventBus, pdfViewer, renderSearchOverlay, drawOverlay])
}
