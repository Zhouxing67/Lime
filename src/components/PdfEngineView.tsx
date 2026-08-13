import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Box, IconButton, Stack, Tooltip, Typography, Popper, Paper, Divider, TextField } from "@mui/material"
import { useTheme } from "@mui/material/styles"
import {
  CropFreeRounded,
  GestureRounded,
  HighlightRounded,
  NotesRounded,
  SearchRounded,
  MenuOpenRounded,
  SwipeRightRounded,
  UndoRounded,
  FitScreenRounded,
  AspectRatioRounded,
  AddRounded,
  RemoveRounded,
  BorderColorRounded,
  FormatUnderlinedRounded,
  StrikethroughSRounded,
  ContentCopyRounded
} from "@mui/icons-material"
import { Theme } from "@radix-ui/themes"
import { TooltipProvider } from "@radix-ui/react-tooltip"
import "@radix-ui/themes/styles.css"

import "~/src/pdf/inklayer/i18n"
import { PdfViewerProvider } from "~/src/pdf/inklayer/context/pdf_viewer_provider"
import { AnnotatorExtension } from "~/src/pdf/inklayer/extensions/annotator"
import { PainterProvider } from "~/src/pdf/inklayer/extensions/annotator/context/painter_context"
import { OptionsContext } from "~/src/pdf/inklayer/extensions/annotator/context/options_context"
import { defaultOptions as defaultAnnotatorOptions } from "~/src/pdf/inklayer/extensions/annotator/const/default_options"
import { deepMerge } from "~/src/pdf/inklayer/utils"
import { usePainter } from "~/src/pdf/inklayer/extensions/annotator/context/use_painter"
import { useAnnotationStore } from "~/src/pdf/inklayer/extensions/annotator/store"
import { usePdfViewerContext } from "~/src/pdf/inklayer/context/pdf_viewer_context"
import { mergeRects } from "./pdfText"
import type { PdfRect } from "./pdfText"
import {
  annotationDefinitions,
  type IAnnotationStore,
  type IAnnotationType
} from "~/src/pdf/inklayer/extensions/annotator/const/definitions"

export const LIME_TOOL_NAMES = [
  "highlight",
  "underline",
  "strikeout",
  "rectangle",
  "freehand",
  "freeHighlight",
  "freeText"
] as const

const LIME_REGION_TOOL_NAMES = ["rectangle", "freehand", "freeHighlight", "freeText"] as const

const REGION_ICONS: Record<(typeof LIME_REGION_TOOL_NAMES)[number], typeof CropFreeRounded> = {
  rectangle: CropFreeRounded,
  freehand: GestureRounded,
  freeHighlight: HighlightRounded,
  freeText: NotesRounded
}

const TOOL_LABELS: Record<(typeof LIME_TOOL_NAMES)[number], string> = {
  highlight: "高亮",
  underline: "下划线",
  strikeout: "删除线",
  rectangle: "框选",
  freehand: "画笔",
  freeHighlight: "自由高亮",
  freeText: "文本框"
}

function toolDef(name: (typeof LIME_TOOL_NAMES)[number]): IAnnotationType {
  return annotationDefinitions.find((a) => a.name === name)!
}

/** Our MUI top bar — mirrors the legacy toolbar: nav/zoom/fit + region tools + search. */
function EngineToolbar({
  onSearchClick,
  onToggleReader,
  onSwapLeft,
  readerOpen
}: {
  onSearchClick?: () => void
  onToggleReader?: () => void
  onSwapLeft?: () => void
  readerOpen?: boolean
}) {
  const { painter } = usePainter()
  const { pdfViewer, eventBus } = usePdfViewerContext()
  const setCurrentAnnotationType = useAnnotationStore((s) => s.setCurrentAnnotationType)
  const [activeTool, setActiveTool] = useState<
    (typeof LIME_REGION_TOOL_NAMES)[number] | null
  >(null)
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [zoomPct, setZoomPct] = useState(100)
  const [editingJump, setEditingJump] = useState(false)
  const [jumpDraft, setJumpDraft] = useState("")
  const navHistoryRef = useRef<number[]>([])
  const [canGoBack, setCanGoBack] = useState(false)

  useEffect(() => {
    if (!eventBus) return
    const onPage = (evt: { pageNumber: number; previous?: number }) => {
      setPage(evt.pageNumber)
      const prev = evt.previous as number | undefined
      if (prev && prev !== evt.pageNumber) {
        // Cap the back-history so long reading sessions don't grow unbounded.
        navHistoryRef.current.push(prev)
        if (navHistoryRef.current.length > 50)
          navHistoryRef.current.shift()
        setCanGoBack(navHistoryRef.current.length > 0)
      }
    }
    const onLoaded = () => setPageCount(pdfViewer?.pagesCount ?? 1)
    eventBus.on("pagechanging", onPage)
    eventBus.on("pagesloaded", onLoaded)
    if (pdfViewer?.pagesCount) setPageCount(pdfViewer.pagesCount)
    return () => {
      eventBus.off("pagechanging", onPage)
      eventBus.off("pagesloaded", onLoaded)
    }
  }, [eventBus, pdfViewer])

  const handleTool = useCallback(
    (name: (typeof LIME_REGION_TOOL_NAMES)[number]) => {
      const isActive = activeTool === name
      // Deactivating a tool returns to SELECT mode so clicking a mark still
      // routes to the selector (painter.activate(null) would return early and
      // leave the selector dormant).
      if (isActive) {
        setActiveTool(null)
        setCurrentAnnotationType(annotationDefinitions[0])
        painter?.activate(annotationDefinitions[0], null)
      } else {
        setActiveTool(name)
        const def = toolDef(name)
        setCurrentAnnotationType(def)
        painter?.activate(def, null)
      }
    },
    [activeTool, painter, setCurrentAnnotationType]
  )

  const goTo = useCallback(
    (n: number) => {
      if (!pdfViewer) return
      const clamped = Math.max(1, Math.min(n, pdfViewer.pagesCount))
      pdfViewer.currentPageNumber = clamped
    },
    [pdfViewer]
  )

  const goBack = useCallback(() => {
    const prev = navHistoryRef.current.pop()
    setCanGoBack(navHistoryRef.current.length > 0)
    if (prev != null) goTo(prev)
  }, [goTo])

  const applyZoom = useCallback(
    (factor: number) => {
      if (!pdfViewer) return
      const next = Math.max(0.5, Math.min(3, pdfViewer.currentScale * factor))
      pdfViewer.currentScale = next
    },
    [pdfViewer]
  )

  const toggleFit = useCallback(() => {
    if (!pdfViewer) return
    pdfViewer.currentScaleValue =
      pdfViewer.currentScaleValue === "page-width" ? "page-fit" : "page-width"
  }, [pdfViewer])

  useEffect(() => {
    if (!eventBus) return
    const onScale = (evt: { scale: number }) => setZoomPct(Math.round(evt.scale * 100))
    eventBus.on("scalechanging", onScale)
    return () => eventBus.off("scalechanging", onScale)
  }, [eventBus])

  const navBtn = (title: string, onClick: () => void, disabled = false, children: React.ReactNode) => (
    <Tooltip title={title}>
      <span>
        <IconButton
          size="small"
          onClick={onClick}
          disabled={disabled}
          sx={{
            p: 0.5,
            color: "text.secondary",
            "&:hover": { color: "primary.main" },
            "&.Mui-disabled": { color: "text.disabled", opacity: 0.35 }
          }}>
          {children}
        </IconButton>
      </span>
    </Tooltip>
  )

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        px: 1,
        minHeight: 40,
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1200
      }}>
      {/* left: nav + view controls */}
      <Box sx={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 0.5 }}>
        {navBtn(
          readerOpen ? "收起导航面板" : "目录 / 缩略图",
          () => onToggleReader?.(),
          false,
          <MenuOpenRounded sx={{ fontSize: 16 }} />
        )}
        {onSwapLeft &&
          navBtn(
            "切换导航面板（目录 ↔ 侧栏）",
            () => onSwapLeft?.(),
            false,
            <SwipeRightRounded sx={{ fontSize: 16 }} />
          )}
        {navBtn("回跳到上一页", goBack, !canGoBack, <UndoRounded sx={{ fontSize: 16 }} />)}
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 16 }} />
        {navBtn(
          "适应宽度 / 适应页面大小",
          toggleFit,
          false,
          pdfViewer?.currentScaleValue === "page-width" ? (
            <FitScreenRounded sx={{ fontSize: 16 }} />
          ) : (
            <AspectRatioRounded sx={{ fontSize: 16 }} />
          )
        )}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.25,
            ml: 0.5,
            px: 0.5,
            py: 0.25,
            borderRadius: 1,
            bgcolor: "action.hover",
            color: "text.secondary"
          }}>
          {navBtn("缩小", () => applyZoom(1 / 1.1), false, <RemoveRounded sx={{ fontSize: 16 }} />)}
          <Typography
            title="适应宽度"
            onClick={() => {
              if (pdfViewer) pdfViewer.currentScaleValue = "page-width"
            }}
            sx={{
              fontSize: "0.75rem",
              minWidth: 38,
              textAlign: "center",
              cursor: "pointer",
              "&:hover": { color: "primary.main" }
            }}>
            {zoomPct}%
          </Typography>
          {navBtn("放大", () => applyZoom(1.1), false, <AddRounded sx={{ fontSize: 16 }} />)}
        </Box>
      </Box>
      {/* center: page indicator */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <TextField
          size="small"
          variant="outlined"
          type="number"
          value={editingJump ? jumpDraft : String(page)}
          inputProps={{ min: 1, max: pageCount, step: 1 }}
          onFocus={(e) => {
            setJumpDraft(String(page))
            setEditingJump(true)
            e.target.select()
          }}
          onChange={(e) => setJumpDraft(e.target.value)}
          onBlur={() => {
            setEditingJump(false)
            setJumpDraft("")
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && jumpDraft !== "") {
              const n = Number(jumpDraft)
              if (Number.isInteger(n) && n >= 1 && n <= pageCount) goTo(n)
              setEditingJump(false)
              setJumpDraft("")
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          sx={{
            width: 52,
            "& .MuiOutlinedInput-root": {
              borderRadius: 1,
              fontSize: "0.8rem",
              px: 0.5
            },
            "& input": { textAlign: "center", p: "6px 4px" }
          }}
        />
        <Typography
          variant="caption"
          sx={{ fontSize: "0.75rem", color: "text.disabled", whiteSpace: "nowrap" }}>
          / {pageCount}
        </Typography>
      </Box>
      {/* right: region annotation tools + search */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 0.5
        }}>
        {LIME_REGION_TOOL_NAMES.map((name) => {
          const selected = activeTool === name
          const Icon = REGION_ICONS[name]
          return (
            <Tooltip key={name} title={TOOL_LABELS[name]}>
              <IconButton
                size="small"
                onClick={() => handleTool(name)}
                sx={{
                  p: 0.5,
                  color: selected ? "primary.main" : "text.secondary",
                  bgcolor: selected ? "action.selected" : "transparent",
                  "&:hover": { color: "primary.main" }
                }}>
                <Icon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )
        })}
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 16 }} />
        {onSearchClick &&
          navBtn("搜索全文", () => onSearchClick?.(), false, <SearchRounded sx={{ fontSize: 16 }} />)}
      </Box>
    </Box>
  )
}

/** Our MUI text-selection bar — highlight/underline/strikeout on the range. */
function EngineSelectionBar({ range }: { range: Range | null }) {
  const { painter } = usePainter()
  const theme = useTheme()
  const anchorRef = useRef<HTMLDivElement>(null)
  const [anchorPos, setAnchorPos] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (range && range.getBoundingClientRect) {
      const r = range.getBoundingClientRect()
      setAnchorPos({ x: r.left + r.width / 2, y: r.top })
    } else {
      setAnchorPos(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.toString()])

  const apply = useCallback(
    (name: "highlight" | "underline" | "strikeout") => {
      if (!painter) return
      painter.highlightRange(range, toolDef(name))
      setAnchorPos(null)
    },
    [painter, range]
  )

  return (
    <>
      <div ref={anchorRef} style={{ position: "absolute", left: anchorPos?.x ?? -9999, top: anchorPos?.y ?? -9999, width: 1, height: 1 }} />
      <Popper open={!!anchorPos && !!range} anchorEl={anchorRef.current} placement="top" modifiers={[{ name: "offset", options: { offset: [0, 8] } }]}>
        <Paper
          sx={{
            px: 0.5,
            py: 0.25,
            display: "flex",
            alignItems: "center",
            borderRadius: 1,
            boxShadow: (t) => t.custom.cardShadow,
            border: 1,
            borderColor: "divider"
          }}
        >
          {(["highlight", "underline", "strikeout"] as const).map((name) => {
            const Icon =
              name === "highlight"
                ? BorderColorRounded
                : name === "underline"
                  ? FormatUnderlinedRounded
                  : StrikethroughSRounded
            return (
              <Tooltip key={name} title={TOOL_LABELS[name]}>
                <IconButton size="small" onClick={() => apply(name)} sx={{ color: "text.secondary" }}>
                  <Icon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )
          })}
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Tooltip title="复制">
            <IconButton
              size="small"
              onClick={() => {
                const text = range?.toString() ?? ""
                if (!text) return
                void navigator.clipboard
                  ?.writeText(text)
                  .catch(() => {
                    const ta = document.createElement("textarea")
                    ta.value = text
                    document.body.append(ta)
                    ta.select()
                    document.execCommand("copy")
                    ta.remove()
                  })
              }}
              sx={{ color: "text.secondary" }}>
              <ContentCopyRounded sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Paper>
      </Popper>
    </>
  )
}

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
  searchQuery?: string
  searchOptions?: { caseSensitive: boolean; wholeWord: boolean }
  /** External text-annotation type switch (highlight/underline/strikeout). */
  typeChangeRequest?: { id: string; type: number; seq: number } | null
  /** Bump → auto-clear the shared selection ring (the 2s card↔mark cue). */
  clearRingToken?: number
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
  searchQuery,
  searchOptions,
  typeChangeRequest,
  clearRingToken,
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
  searchQuery?: string
  searchOptions?: { caseSensitive: boolean; wholeWord: boolean }
  typeChangeRequest?: { id: string; type: number; seq: number } | null
  clearRingToken?: number
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

  const handleChange = useCallback(
    (store: IAnnotationStore) => {
      const { pos, rects, path, allPaths } = computeGeometry(store)
      onAnnotationChanged?.(store, pos, rects, path, allPaths)
    },
    [computeGeometry, onAnnotationChanged]
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
  useEffect(() => {
    if (!eventBus || !pdfViewer) return
    const fc = (pdfViewer as any).findController
    if (!fc) return
    if (!searchFlash || !searchQuery) {
      // Clear any active find highlights.
      eventBus.dispatch("find", {
        type: "",
        query: "",
        highlightAll: false
      })
      return
    }
    const pageIdx = searchFlash.page - 1
    // Best-effort current-match navigation via pdf.js's internal state (the
    // published API doesn't expose a direct "jump to match").
    const nav = fc as {
      _selected?: { pageIdx: number; matchIdx: number }
      _offset?: { pageIdx: number; matchIdx: number; wrapped: boolean }
      _highlightMatches?: boolean
    }
    nav._selected = { pageIdx, matchIdx: searchFlash.current }
    nav._offset = {
      pageIdx,
      matchIdx: Math.max(0, searchFlash.current - 1),
      wrapped: false
    }
    nav._highlightMatches = true
    eventBus.dispatch("find", {
      type: "again",
      query: searchQuery,
      caseSensitive: searchOptions?.caseSensitive ?? false,
      entireWord: searchOptions?.wholeWord ?? false,
      findPrevious: false,
      matchDiacritics: false,
      highlightAll: true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchFlash, searchQuery, eventBus, pdfViewer])

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

  // ── Selection highlight ──────────────────────────────────────────────────
  // The browser's native selection box carries the line's leading (the diag:
  // selection rect h=13 vs the text span's tight em box h=9, 3px high + tall).
  // We suppress the native ::selection + redraw the char-exact getClientRects
  // boxes, SNAPPING each rect's vertical to the covering line span's tight
  // em box — the true rendered glyph position. No overlap, no offset.
  const selOverlayRef = useRef<HTMLDivElement | null>(null)
  const selOverlayPageRef = useRef(-1)

  const drawSelectionOverlay = useCallback(
    (page: number, rects: PdfRect[]) => {
      if (!pdfViewer) return
      const pageEl = pdfViewer.getPageView(page - 1)?.div as
        | HTMLElement
        | undefined
      if (!pageEl) return
      if (selOverlayPageRef.current !== page) {
        selOverlayRef.current?.remove()
        const div = document.createElement("div")
        div.style.cssText =
          "position:absolute;inset:0;pointer-events:none;z-index:5;overflow:hidden"
        pageEl.appendChild(div)
        selOverlayRef.current = div
        selOverlayPageRef.current = page
      }
      const div = selOverlayRef.current!
      div.replaceChildren()
      for (const r of rects) {
        const el = document.createElement("div")
        el.style.cssText = `position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;background:rgba(99,102,241,0.26);border-radius:1px`
        div.appendChild(el)
      }
    },
    [pdfViewer]
  )

  const clearSelectionOverlay = useCallback(() => {
    selOverlayRef.current?.remove()
    selOverlayRef.current = null
    selOverlayPageRef.current = -1
  }, [])

  useEffect(() => {
    if (!eventBus || !pdfViewer) return
    let raf = 0
    const onSelChange = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        clearSelectionOverlay()
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
        clearSelectionOverlay()
        return
      }
      const page = Number(pageEl.dataset.pageNumber)
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const holder = pageEl.getBoundingClientRect()
        const baseX = holder.left + pageEl.clientLeft
        const baseY = holder.top + pageEl.clientTop
        const raw = Array.from(range.getClientRects()).map((r) => ({
          x: r.left - baseX,
          y: r.top - baseY,
          w: r.width,
          h: r.height
        }))
        // Snap each box's vertical to the covering text-layer span's tight
        // em box (the browser's box includes the leading — the offset source).
        const snapped: PdfRect[] = []
        for (const r of raw) {
          const el = document.elementFromPoint(
            baseX + r.x + r.w / 2,
            baseY + r.y + r.h / 2
          ) as HTMLElement | null
          const span = el?.closest(
            ".textLayer span, .textLayer .markedContent span"
          ) as HTMLElement | null
          if (span) {
            const sr = span.getBoundingClientRect()
            snapped.push({
              x: r.x,
              y: sr.top - baseY,
              w: r.w,
              h: sr.height
            })
          } else {
            snapped.push(r)
          }
        }
        drawSelectionOverlay(page, mergeRects(snapped))
      })
    }
    document.addEventListener("selectionchange", onSelChange)
    return () => {
      document.removeEventListener("selectionchange", onSelChange)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [eventBus, pdfViewer, drawSelectionOverlay, clearSelectionOverlay])

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
  searchQuery,
  searchOptions,
  typeChangeRequest,
  clearRingToken
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
    // Match the find highlights to Lime's indigo (the official pdf.js default
    // is a green/purple wash); the selected match gets a border.
    const styleEl = document.createElement("style")
    styleEl.textContent = `
.textLayer .highlight{--highlight-bg-color:rgba(99,102,241,0.22);margin-left:0.5ch}
.textLayer .highlight.selected{--highlight-selected-bg-color:rgba(99,102,241,0.40);box-shadow:0 0 0 1.5px rgba(99,102,241,0.85)}
.textLayer ::selection,.textLayer ::-moz-selection{background:transparent !important;color:transparent !important}`
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
    if (range && !(window as any).__limeAlignDiag) {
      ;(window as any).__limeAlignDiag = true
      try {
        const pageEl = range.startContainer?.parentElement?.closest(
          "[data-page-number]"
        ) as HTMLElement | null
        if (pageEl) {
          const page = pageEl.getBoundingClientRect()
          const canvas = pageEl.querySelector("canvas")?.getBoundingClientRect()
          const tl = pageEl.querySelector(".textLayer")?.getBoundingClientRect()
          const span = (range.startContainer as Node)?.parentElement?.getBoundingClientRect()
          const tlEl = pageEl.querySelector(".textLayer") as HTMLElement | null
          const scaleVar = tlEl
            ? getComputedStyle(tlEl).getPropertyValue("--scale-factor")
            : null
          const rects = Array.from(range.getClientRects()).map((r) => ({
            x: Math.round(r.left),
            y: Math.round(r.top),
            w: Math.round(r.width),
            h: Math.round(r.height)
          }))
          console.log(
            "[pdf] align diag:",
            JSON.stringify({
              pageNo: pageEl.dataset.pageNumber,
              page: {
                x: Math.round(page.left),
                y: Math.round(page.top),
                w: Math.round(page.width),
                h: Math.round(page.height)
              },
              canvas: canvas
                ? {
                    x: Math.round(canvas.left),
                    y: Math.round(canvas.top),
                    w: Math.round(canvas.width),
                    h: Math.round(canvas.height)
                  }
                : null,
              textLayer: tl
                ? {
                    x: Math.round(tl.left),
                    y: Math.round(tl.top),
                    w: Math.round(tl.width),
                    h: Math.round(tl.height)
                  }
                : null,
              span: span
                ? {
                    x: Math.round(span.left),
                    y: Math.round(span.top),
                    w: Math.round(span.width),
                    h: Math.round(span.height)
                  }
                : null,
              scaleVar,
              selText: range.toString().slice(0, 40),
              rects
            })
          )
        }
      } catch (e) {
        console.warn("[pdf] align diag failed:", e)
      }
    }
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
                searchQuery={searchQuery}
                searchOptions={searchOptions}
                typeChangeRequest={typeChangeRequest}
                clearRingToken={clearRingToken}
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
