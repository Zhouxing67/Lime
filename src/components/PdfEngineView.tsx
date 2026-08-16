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
import type { IAnnotationStore } from "~/src/pdf/inklayer/extensions/annotator/const/definitions"
import type { PdfAnnotation } from "../types"
import { TooltipProvider } from "@radix-ui/react-tooltip"
import { Theme } from "@radix-ui/themes"
import "@radix-ui/themes/styles.css"

import EngineToolbar from "./pdfEngine/EngineToolbar"
import EngineSelectionBar from "./pdfEngine/EngineSelectionBar"
import { usePdfHighlights } from "./pdfEngine/usePdfHighlights"

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
  onTextSelected
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
}) {
  const { pdfViewer, eventBus } = usePdfViewerContext()
  const { painter } = usePainter()

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

  const computeGeometry = useCallback(
    (store: IAnnotationStore) => {
      let pos: { x: number; y: number } | undefined
      let rects: { x: number; y: number; w: number; h: number }[] | undefined
      let path: { x: number; y: number }[] | undefined
      let allPaths: { x: number; y: number }[][] | undefined
      try {
        const pv = pdfViewer?.getPageView(store.pageNumber - 1)
        const vp = pv?.viewport
        const r = store.konvaClientRect
        // The Konva stage is { width: vp.width, scale: vp.scale } — a shape's
        // clientRect is in STAGE-LOCAL coords, so its rendered CSS position is
        // (local × vp.scale). Normalize to 0-1 via the page's CSS size.
        if (vp && r && vp.width > 0 && vp.height > 0) {
          const sx = vp.scale / vp.width
          const sy = vp.scale / vp.height
          pos = {
            x: (r.x + r.width / 2) * sx,
            y: (r.y + r.height / 2) * sy
          }
          rects = [
            { x: r.x * sx, y: r.y * sy, w: r.width * sx, h: r.height * sy }
          ]
          // Extract ALL stroke points (freehand / free-highlight) from the
          // Konva serialization — a multi-stroke annotation has several Lines,
          // each a separate pen-up/pen-down; every stroke must render in the
          // crop overlay.
          try {
            const json = JSON.parse(store.konvaString)
            const allLines: number[][] = []
            const collectLines = (n: any) => {
              if (n?.className === "Line" && Array.isArray(n?.attrs?.points)) {
                allLines.push(n.attrs.points as number[])
              }
              for (const c of n?.children ?? []) collectLines(c)
            }
            collectLines(json)
            const strokes = allLines
              .filter((pts) => pts.length >= 4)
              .map((pts) => {
                const stroke: { x: number; y: number }[] = []
                for (let i = 0; i < pts.length; i += 2) {
                  stroke.push({ x: pts[i] * sx, y: pts[i + 1] * sy })
                }
                return stroke
              })
            if (strokes.length > 0) {
              path = strokes.length === 1 ? strokes[0] : undefined
              allPaths = strokes
            }
          } catch {
            // no path extracted — overlay falls back to the bbox stroke
          }
        }
      } catch {
        // fall back to no pos/rects/path
      }
      return { pos, rects, path, allPaths }
    },
    [pdfViewer]
  )

  const handleAdd = useCallback(
    (store: IAnnotationStore) => {
      const { pos, rects, path, allPaths } = computeGeometry(store)
      onAnnotationAdd?.(store, pos, rects, path, allPaths)
    },
    [computeGeometry, onAnnotationAdd]
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
      const { pos, rects, path, allPaths } = computeGeometry(store)
      // A style-only edit (color/opacity/type) keeps the same normalized
      // geometry — pass NO geometry so saveAnnotationFromStore keeps the crop
      // image instead of treating it as a shape edit and clearing the placed
      // card's crop (A6).
      const geometryChanged = !geometrySame(annotationById?.get(store.id), rects, path, allPaths)
      onAnnotationChanged?.(
        store,
        pos,
        geometryChanged ? rects : undefined,
        geometryChanged ? path : undefined,
        geometryChanged ? allPaths : undefined
      )
    },
    [computeGeometry, onAnnotationChanged, annotationById, geometrySame]
  )

  const pageJumpSeqRef = useRef(pageJump?.seq ?? 0)
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


  // Start at 0, NOT the mount-time flashTarget token: the flash often fires
  // while the engine is still loading (the PdfEngineView mounts AFTER the
  // flashTarget was set) — initializing from it would make the effect's
  // token-guard skip the flash entirely.
  const flashTokenRef = useRef(0)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const token = flashTarget?.token
    if (token == null || token === flashTokenRef.current) return
    const { page, annId } = flashTarget
    // Debounce rapid card→annotation jumps so the engine's flash animation
    // isn't interrupted mid-fade (a cancelled flash used to leave the mark at
    // opacity 0).
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    const tryFlash = () => {
      flashTimerRef.current = null
      // The engine (pdfViewer/painter) or the annotations may not be ready yet
      // (the PDF just opened) — retry until the mark exists, then flash.
      if (!pdfViewer || !painter) {
        flashTimerRef.current = setTimeout(tryFlash, 200)
        return
      }
      const mark = annotationsRef.current?.find((a) => a.id === annId)
      if (annId && !mark) {
        flashTimerRef.current = setTimeout(tryFlash, 200)
        return
      }
      flashTokenRef.current = token
      if (annId && mark) {
        // The engine's highlight scrolls + draws the selection ring; its
        // internal editor-retry (3s) may exhaust before the freshly-opened
        // page's marks render — retry externally until it returns true.
        let attempts = 0
        const tryHighlight = () => {
          attempts++
          void painter.highlight(mark).then((ok) => {
            if (ok || attempts >= 10) return
            if (flashTimerRef.current) return
            flashTimerRef.current = setTimeout(() => {
              flashTimerRef.current = null
              tryHighlight()
            }, 300)
          })
        }
        tryHighlight()
      } else {
        pdfViewer.scrollPageIntoView({ pageNumber: page })
      }
    }
    flashTimerRef.current = setTimeout(tryFlash, 150)
    return () => {
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current)
        flashTimerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flashTarget?.token, pdfViewer, painter])

  return (
    <>
      <EngineToolbar
        onSearchClick={onSearchClick}
        onToggleReader={onToggleReader}
        onSwapLeft={onSwapLeft}
        readerOpen={readerOpen}
      />
      <EngineSelectionBar range={textRange} />
      <AnnotatorExtension
        enableNativeAnnotations={false}
        annotations={annotations}
        onLoad={() => {}}
        onAnnotationAdd={handleAdd}
        onAnnotationDelete={onAnnotationDelete ?? (() => {})}
        onAnnotationSelected={onAnnotationSelected ?? (() => {})}
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
  annotationById
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
    // boxes never stack with it.
    const styleEl = document.createElement("style")
    styleEl.textContent = `
.textLayer::selection,.textLayer ::selection,.textLayer :is(span,br)::selection{background:transparent !important;color:transparent !important}`
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

  return (
    <div ref={rootRef} style={{ width: "100%", height: "100%" }}>
      <Theme accentColor="blue" appearance="light" style={{ height: "100%" }}>
      <TooltipProvider>
        <PainterProvider>
          <OptionsContext.Provider value={optionsValue}>
            <PdfViewerProvider
              data={data}
              url={undefined}
              user={{ id: "local", name: "我" }}
              title={title}
              toolbar={null}
              sidebar={[]}
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
              />
            </PdfViewerProvider>
          </OptionsContext.Provider>
        </PainterProvider>
      </TooltipProvider>
      </Theme>
    </div>
  )
}
