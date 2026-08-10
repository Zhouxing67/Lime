import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import AddRoundedIcon from "@mui/icons-material/AddRounded"
import MenuOpenRoundedIcon from "@mui/icons-material/MenuOpenRounded"
import SwipeRightRoundedIcon from "@mui/icons-material/SwipeRightRounded"
import SearchRoundedIcon from "@mui/icons-material/SearchRounded"
import PdfReaderPanel from "./PdfReaderPanel"
import { usePdfSearch } from "../hooks/usePdfSearch"
import CropFreeRoundedIcon from "@mui/icons-material/CropFreeRounded"
import GestureRoundedIcon from "@mui/icons-material/GestureRounded"
import HighlightRoundedIcon from "@mui/icons-material/HighlightRounded"
import NotesRoundedIcon from "@mui/icons-material/NotesRounded"
import EditRoundedIcon from "@mui/icons-material/EditRounded"
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded"
import AspectRatioRoundedIcon from "@mui/icons-material/AspectRatioRounded"
import FitScreenRoundedIcon from "@mui/icons-material/FitScreenRounded"
import UndoRoundedIcon from "@mui/icons-material/UndoRounded"
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  Divider,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Popover,
  TextField,
  Tooltip,
  Typography
} from "@mui/material"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTheme } from "@mui/material/styles"

import * as pdfjsLib from "pdfjs-dist"

import {
  createRegionAnnotationCard,
  createTextAnnotationCard,
  deleteAnnotationWithCard,
  getAnnotationsByPdf,
  updateAnnotationText,
  updateAnnotationType,
} from "../database"
import { rectsUnionCenter } from "../utils/geometry"
import type { PdfAnnotation, PdfMark, PdfOutlineItem } from "../types"
import { usePdfDocument } from "../hooks/usePdfDocument"
import { markBlockFor, MARK_DOT, MARK_LABEL } from "./pdfTheme"
import { getTextLayer } from "./pdfRegistry"
import { textLayerOffsets, textLayerRects } from "./pdfText"
import type { PdfSearchEntry, PdfSearchMatch } from "./pdfText"
import PdfRenderer from "./PdfRenderer"

const TEXT_TOOLS: Exclude<PdfMark, "frame">[] = [
  "highlight",
  "underline",
  "strike"
]

/** Resolve an outline item's `.dest` to a 1-based page number. Only named
 *  (string) dests need `getDestination`; array dests carry the page ref already. */
export async function outlinePageNumber(
  doc: pdfjsLib.PDFDocumentProxy,
  item: PdfOutlineItem
): Promise<number | null> {
  try {
    let dest = item.dest
    if (typeof dest === "string") {
      dest = (await doc.getDestination(dest)) ?? undefined
    }
    if (Array.isArray(dest) && dest.length > 0) {
      const pageRef = dest[0]
      if (pageRef) {
        return (await doc.getPageIndex(pageRef)) + 1
      }
    }
  } catch {}
  return null
}

/** Main-area PDF view: left = the PDF + annotation toolbar, right = its cards. */
export default function PdfView({
  pdfId,
  onOutlineLoaded,
  outlineDest,
  flashTarget,
  onJumpInPanel,
  onVisiblePageChange,
  onPageCountChange,
  onSearchClick,
  searchRequest,
  onSearchResults,
  jumpRequest,
  readerOpen,
  onToggleReader,
  onSwapLeft,
  onOutlineClick
}: {
  pdfId: string | null
  onOutlineLoaded?: (outline: PdfOutlineItem[] | null) => void
  outlineDest?: PdfOutlineItem | null
  /** External card-click → navigate + flash (the cards panel). */
  flashTarget?: { page: number; annId: string; token: number } | null
  /** Annotation popover "跳转卡片" → scroll the cards panel. */
  onJumpInPanel?: (cardId: string) => void
  /** Report the current visible page (the bottom-bar status). */
  onVisiblePageChange?: (page: number) => void
  /** Report the loaded document's page count (the bottom-bar total). */
  onPageCountChange?: (n: number) => void
  /** Toolbar search icon → open the right-sidebar search view. */
  onSearchClick?: () => void
  /** A new search to run. `seq` is the bump counter — CALLERS MUST INCREMENT it
   *  on every explicit search action (Enter / checkbox change) or the effect
   *  below won't re-run (the same query won't retrigger on equal values). */
  searchRequest?: { query: string; caseSensitive: boolean; wholeWord: boolean; seq: number } | null
  /** Report the search results back to the options root. */
  onSearchResults?: (res: { entries: PdfSearchEntry[]; matches: PdfSearchMatch[] }) => void
  /** Navigate to a search entry. `seq` is the bump counter (same rule as
   *  searchRequest — increment per entry click / prev-next). */
  jumpRequest?: { index: number; seq: number } | null
  /** Reader navigation panel (TOC | thumbnails) open state. */
  readerOpen?: boolean
  onToggleReader?: () => void
  /** Swap the left slot: reader panel ↔ left sidebar (mutually exclusive). */
  onSwapLeft?: () => void
  /** TOC click → resolve + navigate (options sets the outline dest). */
  onOutlineClick?: (item: PdfOutlineItem) => void
}) {
  const { loaded, error } = usePdfDocument(pdfId)
  const theme = useTheme()
  const [scrollPage, setScrollPage] = useState<number | null>(null)

  useEffect(() => {
    if (loaded) onPageCountChange?.(loaded.pageCount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded?.pageCount])
  const [flashAnnId, setFlashAnnId] = useState<string | null>(null)
  const annSigRef = useRef("")
  /** Shared selection state (P4): the jump target annotation stays lit on the
   *  Konva layer until the user clicks elsewhere (InkLayer's model). */
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  // Fit base: "width" (page fits the column width) / "page" (whole page
  // visible). The toolbar toggle switches it; the zoom resets to 1.
  const [fitMode, setFitMode] = useState<"width" | "page">("width")
  const toggleFitMode = useCallback(() => {
    setFitMode((m) => (m === "width" ? "page" : "width"))
    setZoom(1)
  }, [])
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([])
  const [clickedAnn, setClickedAnn] = useState<{
    ann: PdfAnnotation
    pos: { x: number; y: number }
  } | null>(null)
  const [annotDrawMode, setAnnotDrawMode] = useState<
    "frame" | "freehand" | "free-highlight" | "freetext" | null
  >(null)
  const [freetextDraft, setFreetextDraft] = useState<{
    page: number
    rects: { x: number; y: number; w: number; h: number }[]
  } | null>(null)
  const [freetextEdit, setFreetextEdit] = useState<PdfAnnotation | null>(null)
  const [freetextText, setFreetextText] = useState("")
  const [canGoBack, setCanGoBack] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  // The jump input: NOT focused → shows the live current page; focused →
  // purely the user's draft (they can delete/retype freely, no auto-clamp),
  // blur/Enter validates + snaps back to the live page.
  const [editingJump, setEditingJump] = useState(false)
  const [jumpDraft, setJumpDraft] = useState("")
  const currentPageRef = useRef(1)
  const navHistoryRef = useRef<number[]>([])
  const capturedRangeRef = useRef<Range | null>(null)
  /** The text-selection bar (高亮/下划线/删除线) anchor — appears at the
   *  selected text so the text tools live WHERE the selection is. */
  const [selBar, setSelBar] = useState<{ x: number; y: number } | null>(null)
  const selBarOpenedAtRef = useRef(0)
  // Load this PDF's annotations (the overlay). The cards live in the panel.
  const reloadPdfData = useCallback(async () => {
    if (!pdfId) return
    const ann = await getAnnotationsByPdf(pdfId)
    // Cheap dedup: broadcasts (_dbpdf) fire on ANY pdfs-store write (touchPdf,
    // annotation CRUD) — a reload that yields the same annotations must not
    // churn the array (which re-runs the incremental/search/selection effects).
    const sig = ann
      .map(
        (a) =>
          `${a.id}|${a.type}|${a.color ?? ""}|${a.startOffset ?? ""}|${
            a.endOffset ?? ""
          }|${a.rects?.map((r) => `${r.x},${r.y},${r.w},${r.h}`).join(";") ?? ""}|${
            a.pos ? `${a.pos.x},${a.pos.y}` : ""
          }|${a.updatedAt ?? ""}|${a.path?.length ?? 0}|${a.text ?? ""}`
      )
      .join("~")
    if (sig !== annSigRef.current) {
      annSigRef.current = sig
      setAnnotations(ann)
    }
  }, [pdfId])

  useEffect(() => {
    reloadPdfData()
  }, [reloadPdfData])

  // Reflect annotation changes from other contexts (broadcast _dbpdf).
  useEffect(() => {
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>
    ) => {
      if (changes._dbpdf) reloadPdfData()
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [reloadPdfData])

  // ---- 回跳 (back) history ----
  const handleVisiblePageChange = useCallback(
    (page: number) => {
      currentPageRef.current = page
      setCurrentPage(page)
      onVisiblePageChange?.(page)
    },
    [onVisiblePageChange]
  )

  const navigateTo = useCallback((page: number) => {
    const prev = currentPageRef.current
    if (prev && prev !== page) {
      navHistoryRef.current.push(prev)
      setCanGoBack(true)
    }
    // Eagerly set the destination so rapid consecutive navigations (faster than
    // a rAF scroll report) don't push the stale same page twice.
    currentPageRef.current = page
    setScrollPage(page)
  }, [])

  // PDF full-text search (state + execution coordinated with the options root).
  const searchFlash = usePdfSearch(
    loaded?.doc ?? null,
    searchRequest,
    onSearchResults,
    jumpRequest,
    navigateTo
  )

  // External card-click (the cards panel) → navigate + flash the annotation.
  useEffect(() => {
    if (!flashTarget) return
    navigateTo(flashTarget.page)
    setFlashAnnId(flashTarget.annId)
    setSelectedAnnId(flashTarget.annId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flashTarget?.token])

  const handleGoBack = useCallback(() => {
    const prev = navHistoryRef.current.pop()
    if (prev) {
      setScrollPage(prev)
      setCanGoBack(navHistoryRef.current.length > 0)
    }
  }, [])

  // Report the outline up so the sidebar can render the TOC. On unmount/close
  // (or a pdf switch) the cleanup clears it, so the sidebar never keeps a
  // stale/incomplete TOC after the PDF is gone.
  useEffect(() => {
    onOutlineLoaded?.(loaded ? (loaded.outline as PdfOutlineItem[]) : null)
    return () => onOutlineLoaded?.(null)
  }, [loaded, onOutlineLoaded])

  // Resolve a sidebar TOC click into a scroll target.
  useEffect(() => {
    if (!outlineDest || !loaded) return
    let cancelled = false
    outlinePageNumber(loaded.doc, outlineDest).then((page) => {
      if (!cancelled && page) navigateTo(page)
    })
    return () => {
      cancelled = true
    }
  }, [outlineDest, loaded, navigateTo])


  // Apply an annotation tool to the current text selection → auto-card.
  const handleTool = useCallback(
    async (type: Exclude<PdfMark, "frame">) => {
      if (!pdfId) return
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return
      const holder = sel.anchorNode?.parentElement?.closest?.(
        "[data-page]"
      ) as HTMLElement | null
      if (!holder) return
      const page = Number(holder.getAttribute("data-page"))
      const entry = getTextLayer(page)
      if (!entry) return
      const offsets = textLayerOffsets(entry.textLayer, sel)
      if (!offsets || offsets.end <= offsets.start) return
      const text = sel.toString().trim()
      if (!text) return
      try {
        const rects = textLayerRects(entry.textLayer, holder, offsets.start, offsets.end)
        const pos = rectsUnionCenter(rects, {
          w: holder.clientWidth,
          h: holder.clientHeight
        })
        await createTextAnnotationCard({
          pdfId,
          page,
          type,
          text,
          startOffset: offsets.start,
          endOffset: offsets.end,
          pos
        })
        sel.removeAllRanges()
        // The write broadcasts _dbpdf → the storage listener reloads.
      } catch (e) {
        console.warn("[pdf] create annotation failed:", e)
      }
    },
    [pdfId]
  )

  // ---- annotation click → jump to card (panel) + actions popover ----
  const onJumpInPanelRef = useRef(onJumpInPanel)
  onJumpInPanelRef.current = onJumpInPanel

  const handleAnnotationClick = useCallback(
    (annId: string, pos: { x: number; y: number }) => {
      const ann = annotations.find((a) => a.id === annId)
      if (!ann) return
      setClickedAnn({ ann, pos })
      setSelectedAnnId(annId)
      if (ann.cardId) onJumpInPanelRef.current?.(ann.cardId)
    },
    [annotations]
  )

  const handleAnnotationDeselect = useCallback(() => {
    setSelectedAnnId(null)
  }, [])

  const handleAnnotationTypeChange = useCallback(
    async (type: Exclude<PdfMark, "frame">) => {
      if (!clickedAnn) return
      try {
        await updateAnnotationType(clickedAnn.ann.id, type)
        setClickedAnn((cur) =>
          cur ? { ...cur, ann: { ...cur.ann, type } } : cur
        )
      } catch (e) {
        console.warn("[lime] update annotation type failed:", e)
      }
    },
    [clickedAnn]
  )

  // Close the annotation menu with the focused MenuItem blurred — leaving the
  // focus on a MuiModal descendant while aria-hidden blocks it triggers the
  // "Blocked aria-hidden" a11y warning.
  const closeAnnMenu = useCallback(() => {
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    setClickedAnn(null)
  }, [])

  const handleAnnotationDelete = useCallback(async () => {
    if (!clickedAnn) return
    try {
      await deleteAnnotationWithCard(clickedAnn.ann.id)
      closeAnnMenu()
    } catch (e) {
      console.warn("[lime] delete annotation failed:", e)
    }
  }, [clickedAnn, closeAnnMenu])

  // ---- PDF text search (moved to the right-sidebar panel via options) ----

  // Text selection → show the selection bar at the selected text.
  const handleTextSelected = useCallback((range: Range) => {
    // Capture the range AT SELECTION TIME — the bar's button mousedown collapses
    // the live browser selection, so reading it at the bar-click is too late
    // (the 高亮/下划线/删除线 tools silently no-oped).
    capturedRangeRef.current = range.cloneRange()
    const rect = range.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return
    selBarOpenedAtRef.current = Date.now()
    setSelBar({ x: rect.left + rect.width / 2, y: rect.top })
  }, [])

  const handleAnnotTool = useCallback(
    (type: Exclude<PdfMark, "frame">) => {
      // Move focus off the closing menu item before hiding the popover — MUI
      // warns (aria-hidden on a focused element) otherwise.
      ;(document.activeElement as HTMLElement | null)?.blur?.()
      if (capturedRangeRef.current) {
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(capturedRangeRef.current)
      }
      setSelBar(null)
      handleTool(type)
    },
    [handleTool]
  )

  const handleSelBarTool = useCallback(
    (type: Exclude<PdfMark, "frame">) => {
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        capturedRangeRef.current = sel.getRangeAt(0).cloneRange()
      }
      setSelBar(null)
      handleAnnotTool(type)
    },
    [handleAnnotTool]
  )

  const handleAnnotDraw = useCallback(
    (mode: "frame" | "freehand" | "free-highlight" | "freetext") => {
      ;(document.activeElement as HTMLElement | null)?.blur?.()
      setSelBar(null)
      setAnnotDrawMode((cur) => (cur === mode ? null : mode))
    },
    []
  )

  // Pointer-draw release → create the annotation + compact card (no image crop).
  const handleAnnotDrawComplete = useCallback(
    async (result: {
      page: number
      kind: "rect" | "path"
      rects: { x: number; y: number; w: number; h: number }[]
      path?: { x: number; y: number }[]
    }) => {
      if (!pdfId || !annotDrawMode) return
      try {
        if (annotDrawMode === "freetext") {
          setFreetextDraft({ page: result.page, rects: result.rects })
          return
        }
        await createRegionAnnotationCard({
          pdfId,
          page: result.page,
          rects: result.rects,
          type: annotDrawMode,
          path: annotDrawMode === "freehand" || annotDrawMode === "free-highlight" ? result.path : undefined,
          pos: rectsUnionCenter(result.rects)
        })
        setAnnotDrawMode(null)
        navigateTo(result.page)
        // The write broadcasts _dbpdf → the storage listener reloads.
      } catch (e) {
        console.warn("[pdf] create region annotation failed:", e)
      }
    },
    [pdfId, annotDrawMode, navigateTo]
  )

  const saveFreetext = useCallback(async () => {
    if (!pdfId || !freetextDraft || !freetextText.trim()) return
    try {
      await createRegionAnnotationCard({
        pdfId,
        page: freetextDraft.page,
        rects: freetextDraft.rects,
        type: "freetext",
        text: freetextText.trim(),
        pos: rectsUnionCenter(freetextDraft.rects)
      })
      const page = freetextDraft.page
      setFreetextDraft(null)
      setFreetextText("")
      setAnnotDrawMode(null)
      navigateTo(page)
    } catch (e) {
      console.warn("[pdf] create freetext failed:", e)
    }
  }, [pdfId, freetextDraft, freetextText, navigateTo])

  const saveFreetextEdit = useCallback(async () => {
    if (!freetextEdit) return
    try {
      await updateAnnotationText(freetextEdit.id, freetextText)
      setFreetextEdit(null)
      setFreetextText("")
    } catch (e) {
      console.warn("[pdf] update freetext failed:", e)
    }
  }, [freetextEdit, freetextText])

  return (
    <Box sx={{ display: "flex", height: "100%", minHeight: 0 }}>
      {/* The PDF fills the workspace (the cards panel is a separate sibling). */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}>
        {/* tool bar */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            px: 1,
            minHeight: 40,
            borderBottom: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper"
          }}>
          {/* left: nav + view controls */}
          <Box sx={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 0.5 }}>
            <Tooltip title={readerOpen ? "收起导航面板" : "目录 / 缩略图"}>
              <IconButton
                size="small"
                onClick={onToggleReader}
                sx={{
                  p: 0.5,
                  color: readerOpen ? "primary.main" : "text.secondary",
                  bgcolor: readerOpen ? "action.selected" : "transparent",
                  "&:hover": { color: "primary.main" }
                }}>
                <MenuOpenRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="切换导航面板（目录 ↔ 侧栏）">
              <IconButton
                size="small"
                onClick={onSwapLeft}
                sx={{ p: 0.5, color: "text.secondary", "&:hover": { color: "primary.main" } }}>
                <SwipeRightRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <IconButton
              size="small"
              onClick={handleGoBack}
              disabled={!canGoBack}
              title="回跳到上一页"
              sx={{
                p: 0.5,
                color: "text.secondary",
                "&:hover": { color: "primary.main" },
                "&.Mui-disabled": { color: "text.disabled", opacity: 0.35 }
              }}>
              <UndoRoundedIcon sx={{ fontSize: 16 }} />
            </IconButton>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 16 }} />
            <Tooltip title={fitMode === "width" ? "适应页面大小" : "适应宽度"}>
              <IconButton
                size="small"
                onClick={toggleFitMode}
                sx={{ p: 0.5, color: "text.secondary", "&:hover": { color: "primary.main" } }}>
                {fitMode === "width" ? (
                  <FitScreenRoundedIcon sx={{ fontSize: 16 }} />
                ) : (
                  <AspectRatioRoundedIcon sx={{ fontSize: 16 }} />
                )}
              </IconButton>
            </Tooltip>
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
              <IconButton
                size="small"
                title="缩小"
                onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
                sx={{ p: 0.5 }}>
                <RemoveRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
              <Typography
                title="适应宽度"
                onClick={() => setZoom(1)}
                sx={{
                  fontSize: "0.68rem",
                  minWidth: 38,
                  textAlign: "center",
                  cursor: "pointer",
                  "&:hover": { color: "primary.main" }
                }}>
                {Math.round(zoom * 100)}%
              </Typography>
              <IconButton
                size="small"
                title="放大"
                onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))}
                sx={{ p: 0.5 }}>
                <AddRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          </Box>
          {/* center: page indicator */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <TextField
              size="small"
              variant="outlined"
              type="number"
              value={editingJump ? jumpDraft : String(currentPage)}
              inputProps={{ min: 1, max: loaded?.pageCount, step: 1 }}
              onFocus={(e) => {
                setJumpDraft(String(currentPage))
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
                  if (
                    Number.isInteger(n) &&
                    loaded &&
                    n >= 1 &&
                    n <= loaded.pageCount
                  ) {
                    navigateTo(n)
                  }
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
              / {loaded?.pageCount ?? "…"}
            </Typography>
          </Box>
          {/* right: annotation tools + search */}
          <Box
            sx={{
              flex: 1,
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 0.5
            }}>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 16 }} />
            <Tooltip title="框选">
              <IconButton
                size="small"
                onClick={() => handleAnnotDraw("frame")}
                sx={{
                  p: 0.5,
                  color: annotDrawMode === "frame" ? "primary.main" : "text.secondary",
                  bgcolor: annotDrawMode === "frame" ? "action.selected" : "transparent",
                  "&:hover": { color: "primary.main" }
                }}>
                <CropFreeRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="自由画笔">
              <IconButton
                size="small"
                onClick={() => handleAnnotDraw("freehand")}
                sx={{
                  p: 0.5,
                  color: annotDrawMode === "freehand" ? "primary.main" : "text.secondary",
                  bgcolor: annotDrawMode === "freehand" ? "action.selected" : "transparent",
                  "&:hover": { color: "primary.main" }
                }}>
                <GestureRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="自由高亮">
              <IconButton
                size="small"
                onClick={() => handleAnnotDraw("free-highlight")}
                sx={{
                  p: 0.5,
                  color: annotDrawMode === "free-highlight" ? "primary.main" : "text.secondary",
                  bgcolor: annotDrawMode === "free-highlight" ? "action.selected" : "transparent",
                  "&:hover": { color: "primary.main" }
                }}>
                <HighlightRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="文本框">
              <IconButton
                size="small"
                onClick={() => handleAnnotDraw("freetext")}
                sx={{
                  p: 0.5,
                  color: annotDrawMode === "freetext" ? "primary.main" : "text.secondary",
                  bgcolor: annotDrawMode === "freetext" ? "action.selected" : "transparent",
                  "&:hover": { color: "primary.main" }
                }}>
                <NotesRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 16 }} />
            <Tooltip title="搜索全文">
              <IconButton
                size="small"
                onClick={onSearchClick}
                sx={{ p: 0.5, color: "text.secondary", "&:hover": { color: "primary.main" } }}>
                <SearchRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Box>
          {/* 文本选区工具条：出现在选中的文字旁 */}
          <Popover
            open={Boolean(selBar)}
            anchorReference="anchorPosition"
            anchorPosition={{ top: (selBar?.y ?? 0) - 8, left: selBar?.x ?? 0 }}
            onClose={() => {
              // Ignore the drag-ending click that fires the same frame the bar
              // opens — a real dismissal is a later click (on the bar/toolbar).
              if (Date.now() - selBarOpenedAtRef.current < 300) return
              setSelBar(null)
            }}
            anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            transformOrigin={{ vertical: "bottom", horizontal: "center" }}
            slotProps={{ paper: { sx: { py: 0.5, borderRadius: 1, minWidth: 170 } } }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 0.5 }}>
              {TEXT_TOOLS.map((t) => (
                <Box
                  key={t}
                  onClick={() => handleSelBarTool(t)}
                  sx={{
                    px: 1,
                    py: 0.4,
                    borderRadius: 1,
                    bgcolor: markBlockFor(t, theme.palette.mode).bg,
                    color: markBlockFor(t, theme.palette.mode).fg,
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "filter 0.15s",
                    "&:hover": { filter: "brightness(1.08)" }
                  }}>
                  {MARK_LABEL[t]}
                </Box>
              ))}
            </Box>
          </Popover>
        </Box>
        <Box sx={{ flex: 1, display: "flex", minHeight: 0 }}>
          {readerOpen && loaded && (
            <PdfReaderPanel
              outline={loaded.outline as PdfOutlineItem[] | null}
              doc={loaded.doc}
              currentPage={currentPage}
              onOutlineClick={onOutlineClick ?? (() => {})}
              onJumpPage={navigateTo}
            />
          )}
          {error ? (
            <Box sx={{ p: 3, color: "error.main", fontSize: "0.85rem" }}>
              {error}
            </Box>
          ) : loaded ? (
            <PdfRenderer
              doc={loaded.doc}
              pageCount={loaded.pageCount}
              scrollTarget={scrollPage}
              zoom={zoom}
              onZoomChange={setZoom}
              fitMode={fitMode}
              annotations={annotations}
              flashAnnId={flashAnnId}
              onFlashDone={() => setFlashAnnId(null)}
              annotDrawMode={annotDrawMode}
              onAnnotDraw={handleAnnotDrawComplete}
              onTextSelected={handleTextSelected}
              searchFlash={searchFlash}
              selectedAnnId={selectedAnnId}
              onAnnotationDeselect={handleAnnotationDeselect}
              onVisiblePageChange={handleVisiblePageChange}
              onAnnotationClick={handleAnnotationClick}
            />
          ) : (
            <Box
              sx={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}>
              <CircularProgress size={28} />
            </Box>
          )}
        </Box>
      </Box>

      <Popover
        open={Boolean(clickedAnn)}
        anchorReference="anchorPosition"
        anchorPosition={{
          top: clickedAnn?.pos.y ?? 0,
          left: clickedAnn?.pos.x ?? 0
        }}
        onClose={closeAnnMenu}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{ paper: { sx: { py: 0.5, borderRadius: 1, minWidth: 168 } } }}>
        {clickedAnn?.ann.kind === "text" && (
          <>
            <Typography
              sx={{
                fontSize: "0.68rem",
                color: "text.disabled",
                px: 1.5,
                pt: 0.5,
                pb: 0.25
              }}>
              标记类型
            </Typography>
            {TEXT_TOOLS.map((t) => (
              <MenuItem
                key={t}
                selected={clickedAnn.ann.type === t}
                onClick={() => handleAnnotationTypeChange(t)}
                sx={{ gap: 1, fontSize: "0.8rem" }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: 1,
                    background: MARK_DOT[t]
                  }}
                />
                {MARK_LABEL[t]}
              </MenuItem>
            ))}
          </>
        )}
        {clickedAnn?.ann.type === "freetext" && (
          <MenuItem
            onClick={() => {
              setFreetextText(clickedAnn.ann.text ?? "")
              setFreetextEdit(clickedAnn.ann)
              closeAnnMenu()
            }}
            sx={{ gap: 1, fontSize: "0.8rem" }}>
            <EditRoundedIcon sx={{ fontSize: 15 }} />
            编辑文本
          </MenuItem>
        )}
        <MenuItem
          onClick={handleAnnotationDelete}
          sx={{ gap: 1, fontSize: "0.8rem", color: "error.main" }}>
          <DeleteOutlineRoundedIcon sx={{ fontSize: 15 }} />
          删除批注
        </MenuItem>
      </Popover>

      <Dialog
        open={Boolean(freetextDraft)}
        onClose={() => setFreetextDraft(null)}
        fullWidth
        maxWidth="sm">
        <DialogTitle sx={{ fontSize: "0.95rem" }}>文本框内容</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            multiline
            minRows={2}
            fullWidth
            size="small"
            placeholder="输入文本内容…"
            value={freetextText}
            onChange={(e) => setFreetextText(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFreetextDraft(null)} size="small">
            取消
          </Button>
          <Button
            onClick={saveFreetext}
            size="small"
            color="primary"
            disabled={!freetextText.trim()}>
            确定
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(freetextEdit)}
        onClose={() => setFreetextEdit(null)}
        fullWidth
        maxWidth="sm">
        <DialogTitle sx={{ fontSize: "0.95rem" }}>编辑文本框</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            multiline
            minRows={2}
            fullWidth
            size="small"
            value={freetextText}
            onChange={(e) => setFreetextText(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFreetextEdit(null)} size="small">
            取消
          </Button>
          <Button onClick={saveFreetextEdit} size="small" color="primary">
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
