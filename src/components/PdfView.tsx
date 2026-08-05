import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import AddRoundedIcon from "@mui/icons-material/AddRounded"
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded"
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded"
import EditRoundedIcon from "@mui/icons-material/EditRounded"
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded"
import UndoRoundedIcon from "@mui/icons-material/UndoRounded"
import {
  Box,
  CircularProgress,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Popover,
  TextField,
  Typography
} from "@mui/material"
import { useCallback, useEffect, useRef, useState } from "react"

import * as pdfjsLib from "pdfjs-dist"

import {
  createRegionAnnotationCard,
  createTextAnnotationCard,
  deleteAnnotationWithCard,
  getAnnotationsByPdf,
  updateAnnotationType,
} from "../database"
import type { Item, PdfAnnotation, PdfMark } from "../types"
import { usePdfDocument } from "../hooks/usePdfDocument"
import { MARK_DOT, MARK_LABEL } from "./pdfTheme"
import { getTextLayer } from "./pdfRegistry"
import { searchPdfText, textLayerOffsets } from "./pdfText"
import type { PdfSearchMatch } from "./pdfText"
import PdfRenderer from "./PdfRenderer"
import SearchField from "./SearchField"

export type PdfOutlineItem = {
  title: string
  dest: unknown
  items?: PdfOutlineItem[]
}

const TEXT_TOOLS: Exclude<PdfMark, "frame">[] = [
  "highlight",
  "underline",
  "wavy",
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
  onJumpInPanel
}: {
  pdfId: string | null
  onOutlineLoaded?: (outline: PdfOutlineItem[] | null) => void
  outlineDest?: PdfOutlineItem | null
  /** External card-click → navigate + flash (the cards panel). */
  flashTarget?: { page: number; annId: string; token: number } | null
  /** Annotation popover "跳转卡片" → scroll the cards panel. */
  onJumpInPanel?: (cardId: string) => void
}) {
  const { loaded, error } = usePdfDocument(pdfId)
  const [scrollPage, setScrollPage] = useState<number | null>(null)
  const [flashAnnId, setFlashAnnId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([])
  const [clickedAnn, setClickedAnn] = useState<{
    ann: PdfAnnotation
    pos: { x: number; y: number }
  } | null>(null)
  const [frameMode, setFrameMode] = useState(false)
  const [canGoBack, setCanGoBack] = useState(false)
  const currentPageRef = useRef(1)
  const navHistoryRef = useRef<number[]>([])
  const [annotMenuAnchor, setAnnotMenuAnchor] = useState<HTMLElement | null>(
    null
  )
  const capturedRangeRef = useRef<Range | null>(null)
  const [searchFlash, setSearchFlash] = useState<{
    page: number
    start: number
    end: number
  } | null>(null)
  const [searchState, setSearchState] = useState<{
    query: string
    matches: PdfSearchMatch[]
    index: number
    loading: boolean
  }>({ query: "", matches: [], index: 0, loading: false })
  const searchAbortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    return () => searchAbortRef.current?.abort()
  }, [])

  // Load this PDF's annotations (the overlay). The cards live in the panel.
  const reloadPdfData = useCallback(async () => {
    if (!pdfId) return
    const ann = await getAnnotationsByPdf(pdfId)
    setAnnotations(ann)
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
  const handleVisiblePageChange = useCallback((page: number) => {
    currentPageRef.current = page
  }, [])

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

  // External card-click (the cards panel) → navigate + flash the annotation.
  useEffect(() => {
    if (!flashTarget) return
    navigateTo(flashTarget.page)
    setFlashAnnId(flashTarget.annId)
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
        await createTextAnnotationCard({
          pdfId,
          page,
          type,
          text,
          startOffset: offsets.start,
          endOffset: offsets.end
        })
        sel.removeAllRanges()
        // The write broadcasts _dbpdf → the storage listener reloads.
      } catch (e) {
        console.warn("[pdf] create annotation failed:", e)
      }
    },
    [pdfId, reloadPdfData]
  )

  // ---- annotation click → jump to card (panel) + actions popover ----
  const onJumpInPanelRef = useRef(onJumpInPanel)
  onJumpInPanelRef.current = onJumpInPanel

  const handleAnnotationClick = useCallback(
    (annId: string, pos: { x: number; y: number }) => {
      const ann = annotations.find((a) => a.id === annId)
      if (!ann) return
      setClickedAnn({ ann, pos })
      if (ann.itemId) onJumpInPanelRef.current?.(ann.itemId)
    },
    [annotations]
  )

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

  const handleAnnotationDelete = useCallback(async () => {
    if (!clickedAnn) return
    try {
      await deleteAnnotationWithCard(clickedAnn.ann.id)
      setClickedAnn(null)
    } catch (e) {
      console.warn("[lime] delete annotation failed:", e)
    }
  }, [clickedAnn])

  // ---- PDF text search ----
  const jumpToSearchMatch = useCallback(
    (matches: PdfSearchMatch[], index: number) => {
      const m = matches[index]
      if (!m) return
      navigateTo(m.page)
      setSearchFlash({ page: m.page, start: m.start, end: m.end })
    },
    [navigateTo]
  )

  const handleSearch = useCallback(
    async (query: string) => {
      if (!loaded) return
      const q = query.trim()
      if (!q) return
      searchAbortRef.current?.abort()
      const ac = new AbortController()
      searchAbortRef.current = ac
      setSearchState((s) => ({ ...s, query: q, loading: true }))
      const matches = await searchPdfText(loaded.doc, q, 500, ac.signal)
      if (ac.signal.aborted) return
      setSearchState({ query: q, matches, index: 0, loading: false })
      jumpToSearchMatch(matches, 0)
    },
    [loaded, jumpToSearchMatch]
  )

  const handleSearchNav = useCallback(
    (dir: 1 | -1) => {
      setSearchState((s) => {
        if (s.matches.length === 0) return s
        const next = (s.index + dir + s.matches.length) % s.matches.length
        jumpToSearchMatch(s.matches, next)
        return { ...s, index: next }
      })
    },
    [jumpToSearchMatch]
  )

  // ---- annotation menu (批注 → 5 tools) ----
  const openAnnotMenu = (e: React.MouseEvent<HTMLElement>) => {
    // Capture the selection BEFORE the mousedown clears it.
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      capturedRangeRef.current = sel.getRangeAt(0).cloneRange()
    } else {
      capturedRangeRef.current = null
    }
    setAnnotMenuAnchor(e.currentTarget)
  }

  const handleAnnotTool = useCallback(
    (type: Exclude<PdfMark, "frame">) => {
      if (capturedRangeRef.current) {
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(capturedRangeRef.current)
      }
      setAnnotMenuAnchor(null)
      handleTool(type)
    },
    [handleTool]
  )

  const handleAnnotFrame = useCallback(() => {
    setAnnotMenuAnchor(null)
    setFrameMode((f) => !f)
  }, [])

  // 框选 release → crop image → frame annotation + image card.
  const handleFrameRegion = useCallback(
    async (result: {
      page: number
      rects: { x: number; y: number; w: number; h: number }[]
      imageDataUrl: string
    }) => {
      if (!pdfId) return
      try {
        await createRegionAnnotationCard({
          pdfId,
          page: result.page,
          rects: result.rects,
          imageDataUrl: result.imageDataUrl
        })
        setFrameMode(false)
        navigateTo(result.page)
        // The write broadcasts _dbpdf → the storage listener reloads.
      } catch (e) {
        console.warn("[pdf] create region annotation failed:", e)
      }
    },
    [pdfId]
  )

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
          {/* search — far left, fixed comfortable width (PDF name moved to the AppHeader) */}
          <SearchField
            placeholder="搜索 PDF 全文…"
            defaultValue={searchState.query}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearch((e.target as HTMLInputElement).value)
              }
            }}
            sx={{ width: 260 }}
            endAdornment={(
              <>
                {searchState.loading ? (
                  <Box
                    sx={{
                      fontSize: "0.7rem",
                      color: "text.disabled",
                      whiteSpace: "nowrap",
                      mr: 0.5
                    }}>
                    搜索中…
                  </Box>
                ) : searchState.matches.length > 0 ? (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.25,
                        ml: 0.5
                      }}>
                      <Box
                        onClick={() => handleSearchNav(-1)}
                        title="上一个匹配"
                        sx={{
                          display: "flex",
                          color: "text.secondary",
                          cursor: "pointer",
                          px: 0.25,
                          "&:hover": { color: "primary.main" }
                        }}>
                        <ChevronLeftRoundedIcon sx={{ fontSize: 18 }} />
                      </Box>
                      <Box
                        sx={{
                          fontSize: "0.7rem",
                          color: "text.disabled",
                          whiteSpace: "nowrap"
                        }}>
                        {searchState.index + 1}/{searchState.matches.length}
                      </Box>
                      <Box
                        onClick={() => handleSearchNav(1)}
                        title="下一个匹配"
                        sx={{
                          display: "flex",
                          color: "text.secondary",
                          cursor: "pointer",
                          px: 0.25,
                          "&:hover": { color: "primary.main" }
                        }}>
                        <ChevronRightRoundedIcon sx={{ fontSize: 18 }} />
                      </Box>
                    </Box>
                  ) : searchState.query ? (
                    <Box
                      sx={{
                        fontSize: "0.7rem",
                        color: "text.disabled",
                        whiteSpace: "nowrap",
                        mr: 0.5
                      }}>
                       无结果
                    </Box>
                  ) : null}
                </>
              )}
            />
          {/* jump to page */}
          <Box sx={{ flex: 1 }} />
          <TextField
            size="small"
            variant="outlined"
            type="number"
            placeholder="跳转页码"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const n = Number((e.target as HTMLInputElement).value)
                if (
                  Number.isInteger(n) &&
                  n >= 1 &&
                  n <= (loaded?.pageCount ?? Infinity)
                ) {
                  navigateTo(n)
                }
                ;(e.target as HTMLInputElement).value = ""
              }
            }}
            sx={{
              width: 100,
              "& .MuiOutlinedInput-root": {
                borderRadius: 1,
                fontSize: "0.8rem"
              }
            }}
          />
          {/* 回跳 */}
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
            <UndoRoundedIcon sx={{ fontSize: 17 }} />
          </IconButton>
          {/* 批注 menu (二级) */}
          <Box
            onClick={openAnnotMenu}
            title="批注"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              px: 0.75,
              py: 0.25,
              borderRadius: 1,
              cursor: "pointer",
              fontSize: "0.72rem",
              bgcolor: frameMode ? "action.selected" : "transparent",
              color: frameMode ? "text.primary" : "text.secondary",
              "&:hover": { bgcolor: "action.hover" }
            }}>
            <EditRoundedIcon sx={{ fontSize: 14 }} />
          </Box>
          {/* zoom */}
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
              sx={{ p: 0.25 }}>
              <RemoveRoundedIcon sx={{ fontSize: 14 }} />
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
              sx={{ p: 0.25 }}>
              <AddRoundedIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Box>
          <Menu
            anchorEl={annotMenuAnchor}
            open={!!annotMenuAnchor}
            onClose={() => setAnnotMenuAnchor(null)}
            slotProps={{ paper: { sx: { py: 0.5, borderRadius: 1, minWidth: 148 } } }}>
            {TEXT_TOOLS.map((t) => (
              <MenuItem
                key={t}
                onClick={() => handleAnnotTool(t)}
                sx={{ gap: 1, fontSize: "0.82rem" }}>
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
            <MenuItem
              onClick={handleAnnotFrame}
              sx={{ gap: 1, fontSize: "0.82rem" }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: 1,
                  background: MARK_DOT.frame
                }}
              />
              {MARK_LABEL.frame}
              {frameMode && <Box sx={{ flex: 1 }} />}
              {frameMode && (
                <Box
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    bgcolor: "primary.main"
                  }}
                />
              )}
            </MenuItem>
          </Menu>
        </Box>
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
            annotations={annotations}
            flashAnnId={flashAnnId}
            onFlashDone={() => setFlashAnnId(null)}
            frameMode={frameMode}
            onFrameRegion={handleFrameRegion}
            searchFlash={searchFlash}
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

      <Popover
        open={Boolean(clickedAnn)}
        anchorReference="anchorPosition"
        anchorPosition={{
          top: clickedAnn?.pos.y ?? 0,
          left: clickedAnn?.pos.x ?? 0
        }}
        onClose={() => setClickedAnn(null)}
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
        <MenuItem
          onClick={handleAnnotationDelete}
          sx={{ gap: 1, fontSize: "0.8rem", color: "error.main" }}>
          <DeleteOutlineRoundedIcon sx={{ fontSize: 15 }} />
          删除批注
        </MenuItem>
      </Popover>
    </Box>
  )
}
