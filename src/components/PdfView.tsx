import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import EditRoundedIcon from "@mui/icons-material/EditRounded"
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded"
import SearchRoundedIcon from "@mui/icons-material/SearchRounded"
import UndoRoundedIcon from "@mui/icons-material/UndoRounded"
import UnfoldLessRoundedIcon from "@mui/icons-material/UnfoldLessRounded"
import UnfoldMoreRoundedIcon from "@mui/icons-material/UnfoldMoreRounded"
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
  deletePdfCard,
  getAnnotationsByPdf,
  getItemsByPdf,
  updateAnnotationType,
  updateItem
} from "../database"
import type { Item, PdfAnnotation, PdfMark } from "../types"
import { usePdfDocument } from "../hooks/usePdfDocument"
import { MARK_DOT, MARK_LABEL } from "./pdfTheme"
import { getTextLayer } from "./pdfRegistry"
import { searchPdfText, textLayerOffsets } from "./pdfText"
import type { PdfSearchMatch } from "./pdfText"
import PdfCardBody from "./PdfCardBody"
import PdfEditDialog from "./PdfEditDialog"
import PdfRenderer from "./PdfRenderer"

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
  outlineDest
}: {
  pdfId: string | null
  onOutlineLoaded?: (outline: PdfOutlineItem[] | null) => void
  outlineDest?: PdfOutlineItem | null
}) {
  const { loaded, error } = usePdfDocument(pdfId)
  const [pdfPct, setPdfPct] = useState(0.78)
  const [scrollPage, setScrollPage] = useState<number | null>(null)
  const [flashAnnId, setFlashAnnId] = useState<string | null>(null)
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([])
  const [pdfCards, setPdfCards] = useState<Item[]>([])
  const [editCard, setEditCard] = useState<Item | null>(null)
  const [expandedCards, setExpandedCards] = useState<Set<string>>(
    () => new Set()
  )
  const [clickedAnn, setClickedAnn] = useState<{
    ann: PdfAnnotation
    pos: { x: number; y: number }
  } | null>(null)
  const [cardHighlightId, setCardHighlightId] = useState<string | null>(null)
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
  const dragRef = useRef<{ startX: number; startPct: number } | null>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => dragCleanupRef.current?.(), [])
  const searchAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => searchAbortRef.current?.abort()
  }, [])

  // Load this PDF's annotations + cards.
  const reloadPdfData = useCallback(async () => {
    if (!pdfId) return
    const [ann, cards] = await Promise.all([
      getAnnotationsByPdf(pdfId),
      getItemsByPdf(pdfId)
    ])
    setAnnotations(ann)
    setPdfCards(cards)
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

  const handleCardClick = useCallback(
    (card: Item) => {
      if (!card.pdfRef) return
      navigateTo(card.pdfRef.page)
      setFlashAnnId(card.pdfRef.annotationId)
    },
    [navigateTo]
  )

  const handleCardDelete = useCallback(async (card: Item) => {
    await deletePdfCard(card)
    // The write broadcasts _dbpdf → the storage listener reloads.
  }, [])

  const handleCardEdit = useCallback((card: Item) => {
    setEditCard(card)
  }, [])

  const toggleExpand = useCallback((id: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // ---- annotation click → jump to card + actions popover ----
  const jumpToCard = useCallback((cardId: string) => {
    setCardHighlightId(cardId)
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-card-id="${cardId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
    window.setTimeout(() => {
      setCardHighlightId((cur) => (cur === cardId ? null : cur))
    }, 1500)
  }, [])

  const handleAnnotationClick = useCallback(
    (annId: string, pos: { x: number; y: number }) => {
      const ann = annotations.find((a) => a.id === annId)
      if (!ann) return
      setClickedAnn({ ann, pos })
      if (ann.itemId) jumpToCard(ann.itemId)
    },
    [annotations, jumpToCard]
  )

  const handleAnnotationTypeChange = useCallback(
    async (type: Exclude<PdfMark, "frame">) => {
      if (!clickedAnn) return
      await updateAnnotationType(clickedAnn.ann.id, type)
      setClickedAnn((cur) =>
        cur ? { ...cur, ann: { ...cur.ann, type } } : cur
      )
    },
    [clickedAnn]
  )

  const handleAnnotationDelete = useCallback(async () => {
    if (!clickedAnn) return
    await deleteAnnotationWithCard(clickedAnn.ann.id)
    setClickedAnn(null)
    setCardHighlightId(null)
  }, [clickedAnn])

  const handleSaveIdea = useCallback(
    async (idea: string) => {
      if (!editCard) return
      await updateItem({ ...editCard, idea })
      setEditCard(null)
      // The write broadcasts _dbi → the PdfView's reload path picks it up.
      await reloadPdfData()
    },
    [editCard, reloadPdfData]
  )

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

  // Cards sorted by original position (page + annotation startOffset).
  const sortedCards = [...pdfCards].sort((a, b) => {
    const pa = a.pdfRef?.page ?? 0
    const pb = b.pdfRef?.page ?? 0
    if (pa !== pb) return pa - pb
    const annA = annotations.find(
      (x) => x.id === a.pdfRef?.annotationId
    )
    const annB = annotations.find((x) => x.id === b.pdfRef?.annotationId)
    return (annA?.startOffset ?? 0) - (annB?.startOffset ?? 0)
  })

  const startDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const rect = e.currentTarget.parentElement!.getBoundingClientRect()
    dragRef.current = {
      startX: e.clientX,
      startPct: pdfPct
    }
    const mv = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d || rect.width === 0) return
      // PDF pane is left-anchored: dragging the handle left narrows it.
      const pct = d.startPct + (ev.clientX - d.startX) / rect.width
      setPdfPct(Math.max(0.55, Math.min(0.92, pct)))
    }
    const up = () => {
      cleanup()
      dragCleanupRef.current = null
    }
    const cleanup = () => {
      dragRef.current = null
      document.removeEventListener("pointermove", mv)
      document.removeEventListener("pointerup", up)
    }
    document.addEventListener("pointermove", mv)
    document.addEventListener("pointerup", up)
    dragCleanupRef.current = cleanup
  }, [pdfPct])

  return (
    <Box sx={{ display: "flex", height: "100%", minHeight: 0 }}>
      {/* Left: the PDF (fixed share) */}
      <Box
        sx={{
          flex: `0 0 ${pdfPct * 100}%`,
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
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              fontSize: "0.82rem",
              color: "text.secondary",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 120
            }}>
            {loaded?.file.name ?? "PDF"}
          </Typography>
          {/* search — inline, flexes (near-left, matches project view's left search) */}
          <TextField
            size="small"
            variant="outlined"
            placeholder="搜索 PDF 全文…"
            defaultValue={searchState.query}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearch((e.target as HTMLInputElement).value)
              }
            }}
            sx={{
              flex: 1,
              minWidth: 120,
              ml: 1,
              "& .MuiOutlinedInput-root": {
                borderRadius: 1,
                fontSize: "0.8rem"
              }
            }}
            InputProps={{
              startAdornment: (
                <SearchRoundedIcon
                  sx={{ fontSize: 16, mr: 0.5, color: "text.disabled" }}
                />
              ),
              endAdornment: (
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
                          fontSize: "0.75rem",
                          color: "text.secondary",
                          cursor: "pointer",
                          px: 0.5,
                          "&:hover": { color: "primary.main" }
                        }}>
                        ◀
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
                          fontSize: "0.75rem",
                          color: "text.secondary",
                          cursor: "pointer",
                          px: 0.5,
                          "&:hover": { color: "primary.main" }
                        }}>
                        ▶
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
              )
            }}
          />
          {/* jump to page */}
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
            批注
          </Box>
          <Menu
            anchorEl={annotMenuAnchor}
            open={!!annotMenuAnchor}
            onClose={() => setAnnotMenuAnchor(null)}
            slotProps={{ paper: { sx: { minWidth: 148 } } }}>
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

      {/* Split handle */}
      <Box
        onPointerDown={startDrag}
        sx={{
          width: 4,
          cursor: "col-resize",
          bgcolor: "divider",
          "&:hover": { bgcolor: "primary.light" },
          flexShrink: 0
        }}
      />

      {/* Right: this PDF's cards, ordered by original position */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          overflowY: "auto",
          borderLeft: "1px solid",
          borderColor: "divider",
          bgcolor: "background.default"
        }}>
        <Box
          sx={{
            px: 1.5,
            py: 1,
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "text.secondary",
            borderBottom: "1px solid",
            borderColor: "divider"
          }}>
          摘录卡片（{sortedCards.length}）
        </Box>
        {sortedCards.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              py: 6,
              color: "text.disabled"
            }}>
            <PictureAsPdfRoundedIcon sx={{ fontSize: 40, opacity: 0.4 }} />
            <Typography variant="body2" sx={{ fontSize: "0.82rem" }}>
              在左侧选中文字后点标记，自动生成卡片
            </Typography>
          </Box>
        ) : (
          <Box sx={{ p: 1 }}>
            {sortedCards.map((card) => {
              const ann = annotations.find(
                (x) => x.id === card.pdfRef?.annotationId
              )
              const expanded = expandedCards.has(card.id)
              return (
                <Paper
                  key={card.id}
                  data-card-id={card.id}
                  elevation={0}
                  onClick={() => handleCardClick(card)}
                  sx={(theme) => {
                    const highlighted = cardHighlightId === card.id
                    return {
                    p: 1.5,
                    mb: 1,
                    borderRadius: 1,
                    border: "1px solid",
                    borderColor: highlighted ? "primary.main" : "divider",
                    cursor: "pointer",
                    boxShadow: highlighted
                      ? `0 0 0 2px ${theme.palette.primary.main}`
                      : theme.custom.cardShadow,
                    transition: "all 0.2s",
                    "&:hover": {
                      boxShadow: highlighted
                        ? `0 0 0 2px ${theme.palette.primary.main}`
                        : theme.custom.cardShadowHover,
                      transform: "translateY(-1px)",
                      borderColor: highlighted
                        ? "primary.main"
                        : theme.custom.borderStrong,
                      ".pdf-card-ops": { opacity: 1 }
                    }
                  }
                  }}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mb: 0.5
                    }}>
                    <Box
                      sx={{
                        px: 0.5,
                        py: 0.1,
                        borderRadius: 1,
                        bgcolor: "action.hover",
                        fontSize: "0.66rem",
                        color: "text.secondary",
                        flexShrink: 0
                      }}>
                      P{card.pdfRef?.page}
                    </Box>
                    {ann && (
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 0.4,
                          fontSize: "0.68rem",
                          color: "text.secondary"
                        }}>
                        <Box
                          sx={{
                            width: 7,
                            height: 7,
                            borderRadius: 1,
                            background: MARK_DOT[ann.type]
                          }}
                        />
                        {MARK_LABEL[ann.type]}
                      </Box>
                    )}
                    <Box sx={{ flex: 1 }} />
                    <Box
                      className="pdf-card-ops"
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        opacity: 0,
                        transition: "opacity 0.15s"
                      }}>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleExpand(card.id)
                        }}
                        sx={{ p: 0.25, color: "text.disabled" }}>
                        {expanded ? (
                          <UnfoldLessRoundedIcon sx={{ fontSize: 14 }} />
                        ) : (
                          <UnfoldMoreRoundedIcon sx={{ fontSize: 14 }} />
                        )}
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCardEdit(card)
                        }}
                        sx={{ p: 0.25, color: "text.disabled" }}>
                        <EditRoundedIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Box>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCardDelete(card)
                      }}
                      sx={{ p: 0.25, color: "text.disabled" }}>
                      <DeleteOutlineRoundedIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                  <PdfCardBody
                    item={card}
                    maxLines={expanded ? undefined : 4}
                  />
                </Paper>
              )
            })}
          </Box>
        )}
      </Box>
      <PdfEditDialog
        item={editCard}
        open={Boolean(editCard)}
        onClose={() => setEditCard(null)}
        onSave={handleSaveIdea}
      />
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
