import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import "~/src/pdf/inklayer/i18n"
import { PdfViewerProvider } from "~/src/pdf/inklayer/context/pdf_viewer_provider"
import { AnnotatorExtension } from "~/src/pdf/inklayer/extensions/annotator"
import { PainterProvider } from "~/src/pdf/inklayer/extensions/annotator/context/painter_context"
import { OptionsContext } from "~/src/pdf/inklayer/extensions/annotator/context/options_context"
import { defaultOptions as defaultAnnotatorOptions } from "~/src/pdf/inklayer/extensions/annotator/const/default_options"
import { deepMerge } from "~/src/pdf/inklayer/utils"
import { usePainter } from "~/src/pdf/inklayer/extensions/annotator/context/use_painter"
import { usePdfViewerContext } from "~/src/pdf/inklayer/context/pdf_viewer_context"
import { AnnotationMode } from "pdfjs-dist/legacy/build/pdf.mjs"
import type { IAnnotationStore } from "~/src/pdf/inklayer/extensions/annotator/const/definitions"
import type { PdfAnnotation } from "../types"
import { annotationGeometry } from "../utils/geometry"
import { TooltipProvider } from "@radix-ui/react-tooltip"
import { Theme } from "@radix-ui/themes"
import "@radix-ui/themes/styles.css"

import EngineToolbar from "./pdfEngine/EngineToolbar"
import EngineSelectionBar from "./pdfEngine/EngineSelectionBar"
import { usePdfHighlights } from "./pdfEngine/usePdfHighlights"
import { usePdfGeometryDiagnostics } from "./pdfEngine/usePdfGeometryDiagnostics"

export interface PdfEngineViewProps {
  data: ArrayBuffer
  title?: string
  annotations?: IAnnotationStore[]
  onAnnotationAdd?: (
    annotation: IAnnotationStore,
    pos?: { x: number; y: number },
    rects?: { x: number; y: number; w: number; h: number }[],
    path?: { x: number; y: number }[],
    paths?: { x: number; y: number }[][]
  ) => void
  onAnnotationDelete?: (id: string) => void
  onAnnotationSelected?: (annotation: IAnnotationStore | null, isClick: boolean) => void
  onAnnotationChanged?: (
    annotation: IAnnotationStore,
    pos?: { x: number; y: number },
    rects?: { x: number; y: number; w: number; h: number }[],
    path?: { x: number; y: number }[],
    paths?: { x: number; y: number }[][]
  ) => void
  onVisiblePageChange?: (page: number) => void
  onSearchClick?: () => void
  onToggleReader?: () => void
  onSwapLeft?: () => void
  readerOpen?: boolean
  /** External card click → navigate + flash this annotation. */
  flashTarget?: { page: number; annId: string; token: number } | null
  /** External page jump (search entry / outline click) → scroll to the page. */
  pageJump?: { page: number; seq: number } | null
  /** Search-match flash (char-offset matches on one page) → drive the official
   *  pdf.js find controller (its text-layer highlight is char-exact). */
  searchFlash?: {
    page: number
    matches: { start: number; end: number }[]
    current: number
  } | null
  /** The active search query — the find controller needs it to (re)run. */
  /** External text-annotation type switch (highlight/underline/strikeout). */
  typeChangeRequest?: { id: string; type: number; seq: number } | null
  /** Bump → auto-clear the shared selection ring (the 2s card↔mark cue). */
  clearRingToken?: number
  /** Current annotations for this PDF — distinguishes geometry edits from
   *  style-only edits so the placed-card crop survives a recolor (A6). */
  annotationById?: Map<string, PdfAnnotation>
  onAddVocabulary?: (data: {
    page: number
    term: string
    translation: string
    rects: { x: number; y: number; w: number; h: number }[]
  }) => Promise<void>
  vocabularyFlashTarget?: {
    page: number
    rects: { x: number; y: number; w: number; h: number }[]
    token: number
  } | null
}

/** Bridge rendered INSIDE PdfViewerProvider — needs the pdfViewer/eventBus. */
function EngineBridge({
  annotations,
  onAnnotationAdd,
  onAnnotationDelete,
  onAnnotationSelected,
  onAnnotationChanged,
  onVisiblePageChange,
  onSearchClick,
  onToggleReader,
  onSwapLeft,
  readerOpen,
  flashTarget,
  pageJump,
  searchFlash,
  typeChangeRequest,
  clearRingToken,
  annotationById,
  textRange,
  onTextSelected,
  onAddVocabulary,
  vocabularyFlashTarget
}: {
  annotations?: IAnnotationStore[]
  onAnnotationAdd?: (
    annotation: IAnnotationStore,
    pos?: { x: number; y: number },
    rects?: { x: number; y: number; w: number; h: number }[],
    path?: { x: number; y: number }[],
    paths?: { x: number; y: number }[][]
  ) => void
  onAnnotationDelete?: (id: string) => void
  onAnnotationSelected?: (annotation: IAnnotationStore | null, isClick: boolean) => void
  onAnnotationChanged?: (
    annotation: IAnnotationStore,
    pos?: { x: number; y: number },
    rects?: { x: number; y: number; w: number; h: number }[],
    path?: { x: number; y: number }[],
    paths?: { x: number; y: number }[][]
  ) => void
  onVisiblePageChange?: (page: number) => void
  onSearchClick?: () => void
  onToggleReader?: () => void
  onSwapLeft?: () => void
  readerOpen?: boolean
  flashTarget?: { page: number; annId: string; token: number } | null
  pageJump?: { page: number; seq: number } | null
  searchFlash?: {
    page: number
    matches: { start: number; end: number }[]
    current: number
  } | null
  typeChangeRequest?: { id: string; type: number; seq: number } | null
  clearRingToken?: number
  /** Current annotations for this PDF — used to distinguish geometry edits
   *  from style-only edits so the placed-card crop survives a recolor (A6). */
  annotationById?: Map<string, PdfAnnotation>
  textRange: Range | null
  onTextSelected: (range: Range | null) => void
  onAddVocabulary?: PdfEngineViewProps["onAddVocabulary"]
  vocabularyFlashTarget?: PdfEngineViewProps["vocabularyFlashTarget"]
}) {
  const { pdfViewer, eventBus } = usePdfViewerContext()
  const { painter } = usePainter()

  useEffect(() => {
    if (!pdfViewer || !vocabularyFlashTarget) return
    const { page, rects, token } = vocabularyFlashTarget
    pdfViewer.scrollPageIntoView({ pageNumber: page })
    let attempts = 0
    let retry: ReturnType<typeof setTimeout> | null = null
    let clear: ReturnType<typeof setTimeout> | null = null
    let overlay: HTMLDivElement | null = null
    const draw = () => {
      attempts++
      const pageEl = pdfViewer.getPageView(page - 1)?.div as HTMLElement | undefined
      if (!pageEl || pageEl.clientWidth <= 0 || pageEl.clientHeight <= 0) {
        if (attempts < 30) retry = setTimeout(draw, 100)
        return
      }
      overlay = document.createElement("div")
      overlay.dataset.vocabularyFlashToken = String(token)
      overlay.style.cssText =
        "position:absolute;inset:0;pointer-events:none;z-index:8;overflow:hidden"
      for (const rect of rects) {
        const el = document.createElement("div")
        el.style.cssText = `position:absolute;left:${rect.x * pageEl.clientWidth}px;top:${rect.y * pageEl.clientHeight}px;width:${rect.w * pageEl.clientWidth}px;height:${rect.h * pageEl.clientHeight}px;background:rgba(245,158,11,.34);box-shadow:0 0 0 1.5px rgba(217,119,6,.85);border-radius:1px`
        overlay.appendChild(el)
      }
      pageEl.appendChild(overlay)
      clear = setTimeout(() => overlay?.remove(), 2000)
    }
    retry = setTimeout(draw, 100)
    return () => {
      if (retry) clearTimeout(retry)
      if (clear) clearTimeout(clear)
      overlay?.remove()
    }
  }, [pdfViewer, vocabularyFlashTarget])

  const onVisiblePageRef = useRef(onVisiblePageChange)
  onVisiblePageRef.current = onVisiblePageChange
  useEffect(() => {
    if (!eventBus) return
    const onPageChanging = (evt: { pageNumber: number }) => {
      onVisiblePageRef.current?.(evt.pageNumber)
    }
    eventBus.on("pagechanging", onPageChanging)
    return () => {
      eventBus.off("pagechanging", onPageChanging)
    }
  }, [eventBus])

  // Full-page overlay link annotations (CC-license strips, "click to read"
  // covers) must not capture the whole page — disable them so text selection +
  // mark clicks keep working. BOTH the section (pdf.js gives every
  // `.annotationLayer section` pointer-events:auto) AND the anchor (its own
  // pointer-events:auto) are hit targets — disabling only one leaves the other
  // capturing the page (the hand-cursor-no-selection regression). Runs per
  // annotation-layer render (pdf.js replaces the layer's DOM on zoom/rotation,
  // so re-apply there).
  useEffect(() => {
    if (!eventBus || !pdfViewer) return
    const onAnnLayerRendered = (evt: { pageNumber: number }) => {
      const pageEl = pdfViewer.getPageView(evt.pageNumber - 1)?.div as
        | HTMLElement
        | undefined
      const layer = pageEl?.querySelector<HTMLElement>(".annotationLayer")
      if (!layer || !pageEl) return
      const pageW = pageEl.clientWidth
      const pageH = pageEl.clientHeight
      if (pageW <= 0 || pageH <= 0) return
      for (const a of Array.from(
        layer.querySelectorAll<HTMLAnchorElement>(".linkAnnotation > a")
      )) {
        const r = a.getBoundingClientRect()
        if (r.width > pageW * 0.9 && r.height > pageH * 0.9) {
          a.style.pointerEvents = "none"
          const section = a.closest<HTMLElement>(".linkAnnotation")
          if (section) section.style.pointerEvents = "none"
        }
      }
    }
    eventBus.on("annotationlayerrendered", onAnnLayerRendered)
    return () => eventBus.off("annotationlayerrendered", onAnnLayerRendered)
  }, [eventBus, pdfViewer])

  const computeGeometry = useCallback(
    (store: IAnnotationStore) => {
      const pv = pdfViewer?.getPageView(store.pageNumber - 1)
      return annotationGeometry(store, pv?.viewport)
    },
    [pdfViewer]
  )

  const handleAdd = useCallback(
    (store: IAnnotationStore) => {
      const { pos, rects, path, paths } = computeGeometry(store)
      // Persistence is async in the host — if it rejects, drop the mark from
      // the canvas. The engine has no "update from external" channel (its sync
      // effect only removes), and `stores` only ever holds PERSISTED marks, so
      // a failed id is never in it and a filter there is a no-op — the painter
      // removal is the only channel that actually clears the lingering mark.
      Promise.resolve(onAnnotationAdd?.(store, pos, rects, path, paths)).catch(
        () => painter?.removeAnnotationFromPanel(store.id)
      )
    },
    [computeGeometry, onAnnotationAdd, painter]
  )

  // Same normalized point arrays (a style-only edit leaves them identical).
  const geometrySame = useCallback(
    (
      prev: PdfAnnotation | undefined,
      rects?: { x: number; y: number; w: number; h: number }[],
      path?: { x: number; y: number }[],
      paths?: { x: number; y: number }[][]
    ) => {
      const ptsSame = (a: { x: number; y: number }[] | undefined, b: { x: number; y: number }[] | undefined) => {
        if ((a?.length ?? 0) !== (b?.length ?? 0)) return false
        if (!a || !b) return true
        for (let i = 0; i < a.length; i++) {
          if (a[i].x !== b[i].x || a[i].y !== b[i].y) return false
        }
        return true
      }
      return (
        ptsSame(prev?.rects, rects) &&
        ptsSame(prev?.path, path) &&
        ptsSame(prev?.paths?.flat() as { x: number; y: number }[] | undefined, paths?.flat())
      )
    },
    []
  )

  const handleChange = useCallback(
    (store: IAnnotationStore) => {
      const { pos, rects, path, paths } = computeGeometry(store)
      // A style-only edit (color/opacity/type) keeps the same normalized
      // geometry — pass NO geometry so saveAnnotationFromStore keeps the crop
      // image instead of treating it as a shape edit and clearing the placed
      // card's crop (A6).
      const geometryChanged = !geometrySame(annotationById?.get(store.id), rects, path, paths)
      onAnnotationChanged?.(
        store,
        pos,
        geometryChanged ? rects : undefined,
        geometryChanged ? path : undefined,
        geometryChanged ? paths : undefined
      )
    },
    [computeGeometry, onAnnotationChanged, annotationById, geometrySame]
  )

  // A restore jump can already exist when the engine mounts; start at zero so
  // it is consumed instead of mistaken for an already-handled request.
  const pageJumpSeqRef = useRef(0)
  useEffect(() => {
    const seq = pageJump?.seq
    if (seq == null || seq === pageJumpSeqRef.current) return
    pageJumpSeqRef.current = seq
    if (!pdfViewer) return
    pdfViewer.scrollPageIntoView({ pageNumber: pageJump.page })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageJump?.seq, pdfViewer])

  // Search highlight = the OFFICIAL pdf.js find controller (char-exact on the
  // text layer). On a jump we dispatch the `find` event; pdf.js re-searches +
  // highlights every match + navigates to the current one. No custom geometry.
  const annotationsRef = useRef(annotations)
  annotationsRef.current = annotations

  const typeChangeSeqRef = useRef(typeChangeRequest?.seq ?? 0)
  useEffect(() => {
    const seq = typeChangeRequest?.seq
    if (seq == null || seq === typeChangeSeqRef.current) return
    typeChangeSeqRef.current = seq
    if (!painter) return
    painter.changeAnnotationType(typeChangeRequest.id, typeChangeRequest.type)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeChangeRequest?.seq, painter])

  const clearRingTokenRef = useRef(clearRingToken ?? 0)
  useEffect(() => {
    const token = clearRingToken ?? 0
    if (token === 0 || token === clearRingTokenRef.current) return
    clearRingTokenRef.current = token
    if (painter) painter.clearSelection()
  }, [clearRingToken, painter])


  // The line-bridging selection/search highlight overlay (own module).
  usePdfHighlights(searchFlash)
  usePdfGeometryDiagnostics()


  // Start at 0, NOT the mount-time flashTarget token: the flash often fires
  // while the engine is still loading (the PdfEngineView mounts AFTER the
  // flashTarget was set) — initializing from it would make the effect's
  // token-guard skip the flash entirely.
  const flashTokenRef = useRef(0)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashSelectedIdRef = useRef<string | null>(null)
  const pdfViewerRef = useRef(pdfViewer)
  const painterRef = useRef(painter)
  pdfViewerRef.current = pdfViewer
  painterRef.current = painter
  const handleEngineSelected = useCallback(
    (annotation: IAnnotationStore | null, isClick: boolean) => {
      if (!annotation || isClick) {
        flashSelectedIdRef.current = null
        if (flashClearTimerRef.current) {
          clearTimeout(flashClearTimerRef.current)
          flashClearTimerRef.current = null
        }
      }
      onAnnotationSelected?.(annotation, isClick)
    },
    [onAnnotationSelected]
  )
  useEffect(() => {
    const token = flashTarget?.token
    if (token == null || token === flashTokenRef.current) return
    // Accept the new flash IMMEDIATELY: every older retry loop (the debounce +
    // the external tryHighlight) checks flashTokenRef against its own token and
    // aborts, so a superseded jump can never redraw the ring on the wrong
    // annotation/page (the double-jump highlight flake).
    flashTokenRef.current = token
    const { page, annId } = flashTarget
    // Debounce rapid card→annotation jumps so the engine's flash animation
    // isn't interrupted mid-fade (a cancelled flash used to leave the mark at
    // opacity 0).
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    if (flashRetryRef.current) {
      clearTimeout(flashRetryRef.current)
      flashRetryRef.current = null
    }
    const tryFlash = () => {
      flashTimerRef.current = null
      if (flashTokenRef.current !== token) return
      // The engine (pdfViewer/painter) or the annotations may not be ready yet
      // (the PDF just opened) — retry until the mark exists, then flash.
      const livePdfViewer = pdfViewerRef.current
      const livePainter = painterRef.current
      if (!livePdfViewer || !livePainter) {
        flashTimerRef.current = setTimeout(tryFlash, 200)
        return
      }
      const mark = annotationsRef.current?.find((a) => a.id === annId)
      if (annId && !mark) {
        flashTimerRef.current = setTimeout(tryFlash, 200)
        return
      }
      if (annId && mark) {
        // The engine's highlight scrolls + draws the selection ring; its
        // internal editor-retry (3s) may exhaust before the freshly-opened
        // page's marks render — retry externally until it returns true.
        let attempts = 0
        const tryHighlight = () => {
          if (flashTokenRef.current !== token) return
          attempts++
          void livePainter.highlight(mark).then((ok) => {
            // A newer jump superseded this one — stop (its own flash draws the
            // ring); retrying here would cancel it and redraw on the old page.
            if (flashTokenRef.current !== token) return
            if (ok) {
              // Programmatic card→PDF flash is a selection cue, not a real
              // canvas click. Reporting it as isClick=true re-enters the
              // PDF→card jump path and can create stale bidirectional loops.
              flashSelectedIdRef.current = mark.id
              onAnnotationSelected?.(mark, false)
              if (flashClearTimerRef.current) clearTimeout(flashClearTimerRef.current)
              flashClearTimerRef.current = setTimeout(() => {
                flashClearTimerRef.current = null
                if (flashTokenRef.current !== token) return
                if (flashSelectedIdRef.current !== mark.id) return
                flashSelectedIdRef.current = null
                livePainter.clearSelection()
              }, 2000)
              return
            }
            if (attempts >= 10) return
            flashRetryRef.current = setTimeout(() => {
              flashRetryRef.current = null
              tryHighlight()
            }, 300)
          })
        }
        tryHighlight()
      } else {
        livePdfViewer.scrollPageIntoView({ pageNumber: page })
      }
    }
    flashTimerRef.current = setTimeout(tryFlash, 150)
    return () => {
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current)
        flashTimerRef.current = null
      }
      if (flashRetryRef.current) {
        clearTimeout(flashRetryRef.current)
        flashRetryRef.current = null
      }
      if (flashClearTimerRef.current) {
        clearTimeout(flashClearTimerRef.current)
        flashClearTimerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flashTarget?.token])

  return (
    <>
      <EngineToolbar
        onSearchClick={onSearchClick}
        onToggleReader={onToggleReader}
        onSwapLeft={onSwapLeft}
        readerOpen={readerOpen}
      />
      <EngineSelectionBar
        range={textRange}
        onAddVocabulary={
          onAddVocabulary
            ? async (range, translation) => {
                const pageEl = (range.startContainer.parentElement?.closest(
                  "[data-page-number]"
                ) ?? null) as HTMLElement | null
                if (!pageEl) throw new Error("无法定位生词所在页面")
                const bounds = pageEl.getBoundingClientRect()
                const originX = bounds.left + pageEl.clientLeft
                const originY = bounds.top + pageEl.clientTop
                const width = pageEl.clientWidth
                const height = pageEl.clientHeight
                const rects = Array.from(range.getClientRects())
                  .map((rect) => ({
                    x: (rect.left - originX) / width,
                    y: (rect.top - originY) / height,
                    w: rect.width / width,
                    h: rect.height / height
                  }))
                  .filter((rect) => rect.w > 0 && rect.h > 0)
                if (rects.length === 0) throw new Error("无法读取生词选区")
                await onAddVocabulary({
                  page: Number(pageEl.dataset.pageNumber),
                  term: range.toString().trim(),
                  translation,
                  rects
                })
                window.getSelection()?.removeAllRanges()
                onTextSelected(null)
              }
            : undefined
        }
      />
      <AnnotatorExtension
        annotations={annotations}
        onLoad={() => {}}
        onAnnotationAdd={handleAdd}
        onAnnotationDelete={onAnnotationDelete ?? (() => {})}
        onAnnotationSelected={handleEngineSelected}
        onAnnotationChanged={handleChange}
        onTextSelected={onTextSelected}
      />
    </>
  )
}

/** The Lime PDF view — vendored inklayer engine + our MUI chrome. */
export default function PdfEngineView({
  data,
  title = "PDF",
  annotations,
  onAnnotationAdd,
  onAnnotationDelete,
  onAnnotationSelected,
  onAnnotationChanged,
  onVisiblePageChange,
  onSearchClick,
  onToggleReader,
  onSwapLeft,
  readerOpen,
  flashTarget,
  pageJump,
  searchFlash,
  typeChangeRequest,
  clearRingToken,
  annotationById,
  onAddVocabulary,
  vocabularyFlashTarget
}: PdfEngineViewProps) {
  const [textRange, setTextRange] = useState<Range | null>(null)
  const optionsValue = useMemo(
    () => ({ defaultOptions: deepMerge(defaultAnnotatorOptions, {}), primaryColor: "#1272e8" }),
    []
  )

  // The official pdf.js viewer CSS (page/textLayer/annotationLayer layout) is
  // required by the vendored engine — load it as a runtime <link> like the old
  // renderer did (kept out of Parcel's CSS pipeline).
  useEffect(() => {
    const cssLink = document.createElement("link")
    cssLink.rel = "stylesheet"
    cssLink.href = chrome.runtime.getURL("assets/pdfjs/pdf_viewer.css")
    document.head.append(cssLink)
    // The selection highlight is drawn by our own overlay (see drawOverlay);
    // the native ::selection must stay invisible so the browser's selection
    // boxes never stack with it. PDF links: the annotation layer (kept above
    // the text layer) renders ONLY link annotations — everything else stays
    // hidden so the PDF's own native marks don't pollute the reading surface.
    const styleEl = document.createElement("style")
    styleEl.textContent = `
.pdfViewer .page{box-sizing:content-box}
.textLayer::selection,.textLayer ::selection,.textLayer :is(span,br)::selection{background:transparent !important;color:transparent !important}
.annotationLayer{z-index:2}
.annotationLayer section:not(.linkAnnotation){display:none}
.annotationLayer .linkAnnotation > a{cursor:pointer;pointer-events:auto}
.annotationLayer :is(.linkAnnotation,.buttonWidgetAnnotation.pushButton):not(.hasBorder)>a:hover{opacity:1;background:none;box-shadow:none}
.annotationLayer .linkAnnotation.hasBorder:hover{background:none}`
    document.head.append(styleEl)
    return () => {
      cssLink.remove()
      styleEl.remove()
    }
  }, [])

  const rootRef = useRef<HTMLDivElement>(null)
  const [rootSize, setRootSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const measure = () =>
      setRootSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const handleTextSelected = useCallback((range: Range | null) => {
    setTextRange(range)
  }, [])

  const userValue = useMemo(() => ({ id: "local", name: "我" }), [])

  return (
    <div ref={rootRef} style={{ width: "100%", height: "100%" }}>
      <Theme accentColor="blue" appearance="light" style={{ height: "100%" }}>
      <TooltipProvider>
        <PainterProvider>
          <OptionsContext.Provider value={optionsValue}>
            <PdfViewerProvider
              data={data}
              url={undefined}
              user={userValue}
              title={title}
              annotationMode={AnnotationMode.ENABLE}
              toolbar={null}
              style={{
                width: rootSize ? rootSize.w : "100%",
                height: rootSize ? rootSize.h : "100%"
              }}
            >
              <EngineBridge
                annotations={annotations}
                onAnnotationAdd={onAnnotationAdd}
                onAnnotationDelete={onAnnotationDelete}
                onAnnotationSelected={onAnnotationSelected}
                onAnnotationChanged={onAnnotationChanged}
                onVisiblePageChange={onVisiblePageChange}
                onSearchClick={onSearchClick}
                onToggleReader={onToggleReader}
                onSwapLeft={onSwapLeft}
                readerOpen={readerOpen}
                flashTarget={flashTarget}
                pageJump={pageJump}
                searchFlash={searchFlash}
                typeChangeRequest={typeChangeRequest}
                annotationById={annotationById}
                textRange={textRange}
                onTextSelected={handleTextSelected}
                onAddVocabulary={onAddVocabulary}
                vocabularyFlashTarget={vocabularyFlashTarget}
              />
            </PdfViewerProvider>
          </OptionsContext.Provider>
        </PainterProvider>
      </TooltipProvider>
      </Theme>
    </div>
  )
}
