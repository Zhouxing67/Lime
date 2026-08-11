import { Box } from "@mui/material"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTheme } from "@mui/material/styles"

import * as pdfjsLib from "pdfjs-dist"
import { EventBus, LinkTarget, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs"
import Konva from "konva"

import type { PdfAnnotation } from "../types"
import { registerTextLayer, unregisterTextLayer } from "./pdfRegistry"
import { textLayerOffsets, textLayerRects } from "./pdfText"
import type { PdfRect } from "./pdfText"
import {
  clearSelection,
  drawMarks,
  markSignature,
  marksAt,
  removeMark,
  selectMark,
  upsertMark
} from "./pdfMarksKonva"

import { createKonvaStage } from "../pdf/konvaStage"

// Low-saturation annotation colors (align with the app's RATING_META family).
const EMPTY_ANNOTATIONS: PdfAnnotation[] = []

// ---- minimal l10n stub (the real GenericL10n tries to fetch Fluent locale
// bundles we don't ship; the viewer only uses these few methods) ----
class StubL10n {
  getLanguage() {
    return "en-us"
  }
  getDirection() {
    return "ltr"
  }
  async get(_ids: unknown, _args = null, fallback?: string) {
    return fallback ?? ""
  }
  async translate(_element: Element) {}
  async translateOnce(_element: Element) {}
  async destroy() {}
  pause() {}
  resume() {}
}

/** The jump target's rects (for centering) — resolved from the rendered text
 *  layer / annotation geometry. */
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
      // Region rects render as `rect * holder.clientWidth/Height` from the
      // padding-box origin — scale the jump rects the same way (clientWidth
      // excludes the 9px --page-border, keeping this consistent with the marks).
      const hw = holder.clientWidth || 1
      const hh = holder.clientHeight || 1
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
  flash.style.cssText = `position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;pointer-events:none;background:${
    current ? hitStrongBg : hitBg
  };${current ? "box-shadow:inset 0 0 0 2px " + hitStrongBg + ";" : ""}`
  overlay.appendChild(flash)
}

// Lime overlay styles layered on top of the OFFICIAL pdf_viewer.css (which we
// now load for the PDFViewer host — the .textLayer/.annotationLayer/.page rules
// live there). This block only adds OUR custom layers.
const LIME_PDF_CSS = `
/* The annotation-jump flash lives on its own layer (a direct holder child) so
   the annotation overlay's replaceChildren can't re-create it. */
.pdf-ann-flash-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;
}
.pdf-ann-flash { border-radius: 2px; }
.pdf-ann-flash.current {
  animation: pdfAnnFlash 1.4s ease-out forwards;
}
@keyframes pdfAnnFlash {
   0% { opacity: 1; }
   100% { opacity: 0; }
 }
/* pdf.js v6 renders each text span at --total-scale-factor * --min-font-size *
   font-height and shrinks it back with transform: scale(1/min-font-size).
   The LAYOUT box (font-size) is therefore --min-font-size x the visual text,
   and Chromium's native selection + Range.getClientRects() use the LAYOUT box —
   on browsers where that assumption doesn't hold (Edge) the selection shows the
   inflated box: text sits at the top edge, the block bleeds a full line into
   the next line, per-run comb teeth. Forcing min-font-size to 1 restores
   v4-style tight boxes (inklayer-react uses pdf.js v4, which has no scaling).
   --min-font-size-inv re-computes to 1, so the transform becomes a no-op. */
.textLayer {
  --min-font-size: 1 !important;
}
/* The Konva annotation mark layer — above the text layer, pointer-transparent
   (text selection passes through; mark clicks/hover are hit-tested via the
   Konva hit graph instead of DOM events). */
.pdf-annotations {
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
/* Internal-link anchors get a subtle hover affordance. */
.annotationLayer .linkAnnotation > a:hover {
  background: rgba(255, 255, 0, 0.18);
  box-shadow: 0 2px 10px rgba(255, 255, 0, 0.35);
}
/* pointer-draw previews */
.pdf-drag-rect {
  position: fixed;
  border: 1.5px dashed rgba(99,102,241,0.6);
  background: rgba(99,102,241,0.08);
  pointer-events: none;
  z-index: 20;
}
.pdf-drag-path {
  position: fixed;
  left: 0;
  top: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 20;
}
`

/** Per-page mount state, keyed by page number. */
interface PageMount {
  holder: HTMLElement
  stage: Konva.Stage | null
  drawCtx: { tl: InstanceType<typeof pdfjsLib.TextLayer>; holder: HTMLElement; w: number; h: number } | null
  hoverRef: (annId: string | null) => void
  prevSig: Map<string, string> | null
  teardown: () => void
}

/** The reading column never exceeds this share of the pane width — the pages
 *  are centered with side white space instead of stretching edge-to-edge. */
const PAGE_RATIO = 0.75
// The DEFAULT view is the reading column (0.75 = the side margins / 留白).
// The fit-width / fit-page modes fill the whole pane (1.0).
const FIT_RATIO = 1
// pdf.js: 1 PDF pt = 96/72 CSS px (PDFPageView multiplies its internal
// viewport by this; the official "page-width" preset math uses it too).
const PDF_TO_CSS_UNITS = 96 / 72

/** Scrollable host around the OFFICIAL pdf.js PDFViewer (BaseViewer). The
 *  viewer owns page rendering, the scroll container, the text layer (native
 *  selection), the annotation layer (links) and the zoom — the Lime overlays
 *  (Konva marks, selection highlight, flash, freetext) mount per rendered page.
 */
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
  /** Fit base: "reading" (default), "width" or "page" (whole page visible). */
  fitMode?: "reading" | "width" | "page"
  annotations?: PdfAnnotation[]
  flashAnnId?: string | null
  /** Active pointer-draw tool. null = normal pan/select. */
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
  const theme = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerHostRef = useRef<HTMLDivElement>(null)
  const [viewer, setViewer] = useState<PDFViewer | null>(null)
  const viewerRef = useRef<PDFViewer | null>(null)
  const eventBusRef = useRef<EventBus | null>(null)
  const pagesRef = useRef(new Map<number, PageMount>())
  /** True once the viewer's pages are initialized for the current document
   *  (pagesinit). scrollPageIntoView errors while _pages is empty — defer any
   *  navigation issued before pagesinit and apply it when ready. */
  const pagesReadyRef = useRef(false)
  const pendingScrollRef = useRef<number | null>(null)
  // Stable per-page annotation arrays — rebuilt ONLY when the annotations prop
  // changes, so unrelated re-renders (scrollPage/flashAnnId) don't trigger
  // every page to re-render its canvas.
  const pageAnnMap = useMemo(() => {
    const m = new Map<number, PdfAnnotation[]>()
    for (const a of annotations ?? []) {
      const list = m.get(a.page)
      if (list) list.push(a)
      else m.set(a.page, [a])
    }
    return m
  }, [annotations])
  const annotationsRef = useRef(annotations ?? EMPTY_ANNOTATIONS)
  annotationsRef.current = annotations ?? EMPTY_ANNOTATIONS

  // Callback props ref-stabilized (heavy render boundaries: the marks/selection
  // effects must not re-run when a callback identity changes).
  const onAnnotationClickRef = useRef(onAnnotationClick)
  onAnnotationClickRef.current = onAnnotationClick
  const onAnnotationDeselectRef = useRef(onAnnotationDeselect)
  onAnnotationDeselectRef.current = onAnnotationDeselect
  const onFlashDoneRef = useRef(onFlashDone)
  onFlashDoneRef.current = onFlashDone
  const onTextSelectedRef = useRef(onTextSelected)
  onTextSelectedRef.current = onTextSelected
  const onVisiblePageChangeRef = useRef(onVisiblePageChange)
  onVisiblePageChangeRef.current = onVisiblePageChange

  // ---- create the official PDFViewer once ----
  useEffect(() => {
    const container = containerRef.current
    const host = viewerHostRef.current
    if (!container || !host) return
    // The official viewer stylesheet is REQUIRED for the text layer layout +
    // selection bridge + annotationLayer links. Load it once per viewer mount.
    const cssLink = document.createElement("link")
    cssLink.rel = "stylesheet"
    cssLink.href = chrome.runtime.getURL("assets/pdfjs/pdf_viewer.css")
    document.head.append(cssLink)
    const eventBus = new EventBus()
    eventBusRef.current = eventBus
    const linkService = new PDFLinkService({
      eventBus,
      externalLinkTarget: LinkTarget.BLANK,
      externalLinkRel: "noopener"
    })
    const pdfViewer = new PDFViewer({
      container,
      viewer: host,
      eventBus,
      linkService,
      textLayerMode: 1,
      annotationMode: 1,
      // Do NOT autolink bare URLs in body text (pdf.js v6 default is on) —
      // it fabricates "links" out of plain text.
      enableAutoLinking: false,
      // Disable pdf.js's OWN selection rendering (v6 default is ON). Its
      // .selectionRendering class hides the native ::selection, and on older
      // Chromium its selection machinery manipulates the text layer during
      // drag. Selection visual is the NATIVE browser selection (inklayer
      // style); the toolbar range is captured in the selection effect below.
      enableSelectionRendering: false,
      l10n: new StubL10n() as never
    } as never)
    linkService.setViewer(pdfViewer)
    viewerRef.current = pdfViewer
    setViewer(pdfViewer)
    // Version marker — confirms the reloaded extension is running this build
    // (the previous "no effect" rounds were testing a stale deployed bundle).
    console.log(
      "[lime] PdfRenderer: native-selection visual (enableSelectionRendering off) | UA:",
      navigator.userAgent
    )
    return () => {
      pdfViewer.setDocument(null)
      viewerRef.current = null
      cssLink.remove()
    }
  }, [])

  // ---- set the document ----
  useEffect(() => {
    if (!viewer || !doc) return
    // A new document resets the viewer's pages — mark not-ready until pagesinit.
    pagesReadyRef.current = false
    viewer.setDocument(doc)
  }, [viewer, doc])

  // ---- fit/zoom -> scale (official scale = CSS zoom, internally * PDF_TO_CSS_UNITS) ----
  // The viewer needs pdfDocument + at least the first page loaded before
  // currentScale is applied (its setter no-ops otherwise) — drive the FIRST
  // fit via the pagesinit event, then re-apply on fitMode/zoom/container change.
  const applyScale = useCallback(() => {
    const viewer = viewerRef.current
    const container = containerRef.current
    if (!viewer || !container || !viewer.pdfDocument) return
    const cw = container.clientWidth
    const ch = container.clientHeight
    if (cw <= 0) return
    const ratio = fitMode === "reading" ? PAGE_RATIO : FIT_RATIO
    // Same fit math as the official "page-width" preset: the CSS scale that
    // makes the page's CSS width == clientWidth - 40 (scrollbar padding).
    doc.getPage(1).then((p) => {
      const w = p.getViewport({ scale: 1 }).width * PDF_TO_CSS_UNITS
      const h = p.getViewport({ scale: 1 }).height * PDF_TO_CSS_UNITS
      const widthScale = ((cw - 40) * ratio) / w
      const heightScale = (ch - 5) / h
      const baseScale = fitMode === "page" ? Math.min(widthScale, heightScale) : widthScale
      const scale = Math.max(0.4, baseScale * (zoom ?? 1))
      viewer.currentScale = scale
    })
  }, [doc, fitMode, zoom])

  // First fit once the document is ready.
  useEffect(() => {
    const eb = eventBusRef.current
    if (!eb || !viewer) return
    const onInit = () => {
      pagesReadyRef.current = true
      applyScale()
      if (pendingScrollRef.current != null) {
        viewer.scrollPageIntoView({ pageNumber: pendingScrollRef.current })
        pendingScrollRef.current = null
      }
    }
    eb.on("pagesinit", onInit)
    return () => eb.off("pagesinit", onInit)
  }, [viewer, applyScale])

  // Re-fit when fitMode/zoom change, and when the container resizes (official
  // preset scales auto-refit only via currentScaleValue strings; we use numbers
  // so we re-apply ourselves).
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    applyScale()
    const ro = new ResizeObserver(() => applyScale())
    ro.observe(container)
    return () => ro.disconnect()
  }, [applyScale])

  // ---- pagechanging → visible page ----
  useEffect(() => {
    const eb = eventBusRef.current
    if (!eb) return
    const onPageChanging = (evt: { pageNumber: number }) => {
      onVisiblePageChangeRef.current?.(evt.pageNumber)
    }
    eb.on("pagechanging", onPageChanging)
    return () => eb.off("pagechanging", onPageChanging)
  }, [viewer])

  // ---- mount per-page overlays when the page renders ----
  useEffect(() => {
    const eb = eventBusRef.current
    if (!eb) return
    // Copy the mutable ref so the cleanup doesn't dereference .current later.
    const pages = pagesRef.current

    // The official viewer REBUILDS .page internals on every re-render (scale
    // change / scroll-in), removing our custom overlay divs. Teardown the
    // mount when a page render STARTS so pagerendered remounts it fresh.
    const onPageRenderStart = (evt: { pageNumber: number }) => {
      const mount = pages.get(evt.pageNumber)
      if (mount) {
        mount.teardown()
        pages.delete(evt.pageNumber)
      }
    }

    const mountPage = (pageNumber: number) => {
      const container = containerRef.current
      if (!container) return
      // Scope to THIS viewer's container — multiple keep-alive PDFs mount the
      // same data-page-number values (document-wide queries would collide).
      const holder = container.querySelector<HTMLElement>(
        `[data-page-number="${pageNumber}"]`
      )
      if (!holder) return
      if (pages.has(pageNumber)) return
      holder.setAttribute("data-page", String(pageNumber))
      // Ensure the Lime overlay layers exist inside the official .page div.
      const ensureOverlay = (cls: string) => {
        let el = holder.querySelector<HTMLDivElement>(`.${cls}`)
        if (!el) {
          el = document.createElement("div")
          el.className = cls
          holder.append(el)
        }
        return el
      }
      const annDiv = ensureOverlay("pdf-annotations")
      ensureOverlay("pdf-ann-flash-layer")
      ensureOverlay("pdf-freetext-layer")

      const stage = createKonvaStage(annDiv, { width: 0, height: 0, scale: 1 })

      // Hover dim (same behavior as the hand-rolled renderer).
      let prevHoverId: string | null = null
      const hoverRef = (annId: string | null) => {
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

      // Click/hover hit-testing via the Konva hit graph.
      const onClick = (e: MouseEvent) => {
        const r = annDiv.getBoundingClientRect()
        const id = marksAt(stage, r, e.clientX, e.clientY)
        if (id) onAnnotationClickRef.current?.(id, { x: e.clientX, y: e.clientY })
        else onAnnotationDeselectRef.current?.()
      }
      const onMove = (e: MouseEvent) => {
        const r = annDiv.getBoundingClientRect()
        hoverRef(marksAt(stage, r, e.clientX, e.clientY))
      }
      holder.addEventListener("click", onClick)
      holder.addEventListener("mousemove", onMove)

      const mount: PageMount = {
        holder,
        stage,
        drawCtx: null,
        hoverRef,
        prevSig: null,
        teardown: () => {
          holder.removeEventListener("click", onClick)
          holder.removeEventListener("mousemove", onMove)
          stage.destroy()
          unregisterTextLayer(pageNumber)
        }
      }
      pages.set(pageNumber, mount)
    }

    const onPageRendered = (evt: { pageNumber: number }) => {
      mountPage(evt.pageNumber)
    }
    eb.on("pagerender", onPageRenderStart)
    eb.on("pagerendered", onPageRendered)
    return () => {
      eb.off("pagerender", onPageRenderStart)
      eb.off("pagerendered", onPageRendered)
      for (const m of pages.values()) m.teardown()
      pages.clear()
    }
  }, [])

  // ---- update marks when the page text layer is ready (textlayerrendered) ----
  useEffect(() => {
    const eb = eventBusRef.current
    if (!eb) return
    const onRendered = (evt: { pageNumber: number }) => {
      const mount = pagesRef.current.get(evt.pageNumber)
      if (!mount) return
      const pageView = (viewer as unknown as {
        getPageView: (i: number) => { div: HTMLElement; textLayer?: unknown }
      }).getPageView(evt.pageNumber - 1)
      const tl = pageView?.textLayer as unknown as
        | (InstanceType<typeof pdfjsLib.TextLayer> & { div?: HTMLElement })
        | undefined
      const holder = mount.holder
      if (!tl || !tl.div) return
      const w = holder.clientWidth
      const h = holder.clientHeight
      if (w <= 0 || h <= 0) return
      mount.stage.width(w)
      mount.stage.height(h)
      mount.drawCtx = { tl, holder, w, h }
      registerTextLayer(evt.pageNumber, { holder, textLayer: tl })
      drawMarks(
        mount.stage,
        annotationsRef.current.filter((a) => a.page === evt.pageNumber),
        (ann) =>
          ann.kind === "text"
            ? textLayerRects(tl, holder, ann.startOffset ?? 0, ann.endOffset ?? 0)
            : (ann.rects ?? []).map((r) => ({
                x: r.x * w,
                y: r.y * h,
                w: r.w * w,
                h: r.h * h
              })),
        w,
        h
      )
      mount.prevSig = null
    }
    eb.on("textlayerrendered", onRendered)
    return () => eb.off("textlayerrendered", onRendered)
  }, [viewer])

  // ---- incremental mark updates when the annotation list changes ----
  useEffect(() => {
    for (const mount of pagesRef.current.values()) {
      const ctx = mount.drawCtx
      if (!ctx) continue
      const page = Number(mount.holder.getAttribute("data-page"))
      const pageAnns = annotationsRef.current.filter((a) => a.page === page)
      const prev = mount.prevSig ?? new Map<string, string>()
      const cur = new Map<string, string>()
      for (const ann of pageAnns) {
        const sig = markSignature(ann)
        cur.set(ann.id, sig)
        if (prev.get(ann.id) !== sig) {
          try {
            upsertMark(
              mount.stage,
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
          } catch (e) {
            console.warn("[lime] upsertMark failed:", e)
          }
        }
      }
      for (const id of Array.from(prev.keys())) {
        if (!cur.has(id)) removeMark(mount.stage, id)
      }
      mount.prevSig = cur
    }
  }, [annotations])

  // ---- jump target → flash + center ----
  useEffect(() => {
    if (!flashAnnId) return
    const ann = annotationsRef.current.find((a) => a.id === flashAnnId)
    if (!ann) return
    const mount = pagesRef.current.get(ann.page)
    const ctx = mount?.drawCtx
    if (!mount || !ctx) return
    const rects = jumpRects(annotationsRef.current, ctx.tl, ctx.holder, flashAnnId)
    if (rects.length === 0) return
    const minX = Math.min(...rects.map((r) => r.x))
    const minY = Math.min(...rects.map((r) => r.y))
    const maxX = Math.max(...rects.map((r) => r.x + r.w))
    const maxY = Math.max(...rects.map((r) => r.y + r.h))
    const c = containerRef.current
    if (c) {
      const hr = ctx.holder.getBoundingClientRect()
      const cr = c.getBoundingClientRect()
      // rects are padding-box-relative (see textLayerRects); the holder's
      // padding-box origin is border-box + clientLeft/Top (9px page border).
      const absX =
        c.scrollLeft + (hr.left + ctx.holder.clientLeft - cr.left) + (minX + maxX) / 2
      const absY =
        c.scrollTop + (hr.top + ctx.holder.clientTop - cr.top) + (minY + maxY) / 2
      c.scrollTo({
        top: Math.max(0, absY - c.clientHeight / 2),
        left: Math.max(0, absX - c.clientWidth / 2),
        behavior: "auto"
      })
    }
    onFlashDoneRef.current?.()
  }, [flashAnnId])

  // ---- search-match highlight (also decoupled from the canvas) ----
  useEffect(() => {
    if (!searchFlash) return
    const mount = pagesRef.current.get(searchFlash.page)
    const ctx = mount?.drawCtx
    if (!mount || !ctx) return
    const flashLayer = mount.holder.querySelector<HTMLElement>(".pdf-ann-flash-layer")
    if (!flashLayer) return
    drawMarks(
      mount.stage,
      annotationsRef.current.filter((a) => a.page === searchFlash.page),
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
    flashLayer.replaceChildren()
    searchFlash.matches.forEach((m, i) => {
      const current = i === searchFlash.current
      for (const r of textLayerRects(ctx.tl, ctx.holder, m.start, m.end)) {
        appendFlash(flashLayer, r, current, theme.custom.searchHit, theme.custom.searchHitStrong)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchFlash])

  // ---- persistent selection ring ----
  useEffect(() => {
    for (const mount of pagesRef.current.values()) {
      if (!mount.stage) continue
      if (selectedAnnId) selectMark(mount.stage, selectedAnnId)
      else clearSelection(mount.stage)
    }
  }, [selectedAnnId])

  // ---- jump to a requested page (TOC/search/card navigation) ----
  useEffect(() => {
    if (!viewer || !scrollTarget) return
    if (!pagesReadyRef.current) {
      // openPdf + navigateTo fire together: the document is still loading and
      // pdf.js's _pages is empty — scrollPageIntoView would throw a
      // "not a valid pageNumber" error. Defer; pagesinit applies it.
      pendingScrollRef.current = scrollTarget
      return
    }
    viewer.scrollPageIntoView({ pageNumber: scrollTarget })
  }, [viewer, scrollTarget])

  // ---- selection tracking (inklayer-style: the NATIVE selection is the live
  // visual — no custom highlight overlay. We only detect that a real text
  // selection exists inside this viewer's text layer, and surface the final
  // range on mouseup so the toolbar appears at the completed selection.) ----
  useEffect(() => {
    const c = containerRef.current
    if (!c) return
    let isSelecting = false
    const isInViewer = (node: Node | null): boolean => {
      if (!node) return false
      const el =
        node.nodeType === Node.TEXT_NODE
          ? (node as Text).parentElement
          : (node as HTMLElement)
      return !!el && !!el.closest(".textLayer") && c.contains(el)
    }
    const handleSelectionChange = () => {
      const sel = document.getSelection()
      if (!sel || sel.type === "Caret" || sel.isCollapsed || sel.rangeCount === 0) {
        isSelecting = false
        return
      }
      // anchor/focus (not just commonAncestor) so cross-page drags count too.
      isSelecting = isInViewer(sel.anchorNode) || isInViewer(sel.focusNode)
    }
    const handleSelectionEnd = () => {
      if (!isSelecting) return
      isSelecting = false
      const sel = document.getSelection()
      const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null
      onTextSelectedRef.current?.(
        range && (isInViewer(range.commonAncestorContainer) || isInViewer(sel!.anchorNode) || isInViewer(sel!.focusNode))
          ? range.cloneRange()
          : null
      )
    }
    document.addEventListener("selectionchange", handleSelectionChange)
    document.addEventListener("mouseup", handleSelectionEnd)
    document.addEventListener("touchend", handleSelectionEnd)
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange)
      document.removeEventListener("mouseup", handleSelectionEnd)
      document.removeEventListener("touchend", handleSelectionEnd)
    }
  }, [])

  // ---- pointer-draw mode (frame/freetext = rect drag; freehand = path) ----
  const [dragRect, setDragRect] = useState<PdfRect | null>(null)
  const [dragPath, setDragPath] = useState<{ x: number; y: number }[] | null>(null)
  const dragPathRef = useRef<{ x: number; y: number }[] | null>(null)
  if (dragPath !== dragPathRef.current) dragPathRef.current = dragPath
  const dragState = useRef<{
    startX: number
    startY: number
    holder: HTMLElement
  } | null>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => dragCleanupRef.current?.(), [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!annotDrawMode) return
      const holder = (e.target as HTMLElement).closest("[data-page]") as HTMLElement | null
      if (!holder) return
      e.preventDefault()
      const isPath = annotDrawMode === "freehand" || annotDrawMode === "free-highlight"
      dragState.current = { startX: e.clientX, startY: e.clientY, holder }
      if (isPath) setDragPath([{ x: e.clientX, y: e.clientY }])
      else setDragRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 })
      document.body.style.userSelect = "none"
      const mv = (ev: PointerEvent) => {
        const d = dragState.current
        if (!d) return
        if (isPath) setDragPath((cur) => [...(cur ?? []), { x: ev.clientX, y: ev.clientY }])
        else {
          setDragRect({
            x: Math.min(d.startX, ev.clientX),
            y: Math.min(d.startY, ev.clientY),
            w: Math.abs(ev.clientX - d.startX),
            h: Math.abs(ev.clientY - d.startY)
          })
        }
      }
      const prevUserSelect = document.body.style.userSelect
      const cancel = () => {
        cleanup()
        dragCleanupRef.current = null
        dragState.current = null
        setDragRect(null)
        setDragPath(null)
      }
      const cleanup = () => {
        // Restore the PRIOR value (never force ""): a stuck userSelect:none on
        // <body> silently kills ALL text selection in the app until reload.
        document.body.style.userSelect = prevUserSelect
        document.removeEventListener("pointermove", mv)
        document.removeEventListener("pointerup", up)
        document.removeEventListener("pointercancel", cancel)
      }
      const up = (ev: PointerEvent) => {
        cleanup()
        dragCleanupRef.current = null
        const d = dragState.current
        dragState.current = null
        setDragRect(null)
        setDragPath(null)
        if (!d || Math.abs(ev.clientX - d.startX) < 6 || Math.abs(ev.clientY - d.startY) < 6) return
        const hr = d.holder.getBoundingClientRect()
        const page = Number(d.holder.getAttribute("data-page"))
        // Region rects render as `rect * holder.clientWidth/Height` from the
        // holder's padding-box origin (Konva canvas, inset:0). Normalize by the
        // same box — the border-box (hr.left/hr.width) is 9px larger per side
        // (--page-border) and would misplace 框选 marks like the text marks.
        const originX = hr.left + d.holder.clientLeft
        const originY = hr.top + d.holder.clientTop
        const boxW = d.holder.clientWidth
        const boxH = d.holder.clientHeight
        const norm = (px: number, py: number) => ({
          x: Math.max(0, Math.min((px - originX) / boxW, 1)),
          y: Math.max(0, Math.min((py - originY) / boxH, 1))
        })
        if (isPath) {
          const path = [norm(d.startX, d.startY)]
          for (const p of dragPathRef.current ?? []) path.push(norm(p.x, p.y))
          path.push(norm(ev.clientX, ev.clientY))
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
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
            rects: [{ x: minX, y: minY, w: maxX - minX, h: maxY - minY }]
          })
        } else {
          const rx = Math.max(0, Math.min(Math.min(d.startX, ev.clientX) - originX, boxW))
          const ry = Math.max(0, Math.min(Math.min(d.startY, ev.clientY) - originY, boxH))
          const rw = Math.min(Math.abs(ev.clientX - d.startX), boxW - rx)
          const rh = Math.min(Math.abs(ev.clientY - d.startY), boxH - ry)
          if (rw < 4 || rh < 4) return
          onAnnotDraw?.({
            page,
            kind: "rect",
            rects: [{ x: rx / boxW, y: ry / boxH, w: rw / boxW, h: rh / boxH }]
          })
        }
      }
      document.addEventListener("pointermove", mv)
      document.addEventListener("pointerup", up)
      document.addEventListener("pointercancel", cancel)
      dragCleanupRef.current = cleanup
    },
    [annotDrawMode, onAnnotDraw]
  )

  // Ctrl+wheel zooms the PDF instead of the browser's page zoom.
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
    <Box sx={{ flex: 1, minHeight: 0, position: "relative", display: "flex" }}>
      <div
        ref={containerRef}
        data-pdf-scroll=""
        onPointerDown={handlePointerDown}
        style={{
          position: "absolute",
          inset: 0,
          overflowY: "auto",
          overflowX: "auto",
          background: "#f0efec",
          padding: "16px 0",
          cursor: annotDrawMode ? "crosshair" : "default"
        }}>
        <div ref={viewerHostRef} className="pdfViewer" />
        {dragRect && (
          <div
            className="pdf-drag-rect"
            style={{ left: dragRect.x, top: dragRect.y, width: dragRect.w, height: dragRect.h }}
          />
        )}
        {dragPath && dragPath.length > 1 && (
          <svg className="pdf-drag-path">
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
        <style>{LIME_PDF_CSS}</style>
      </div>
    </Box>
  )
}
