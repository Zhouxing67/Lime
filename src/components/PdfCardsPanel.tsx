import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded"
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import EditRoundedIcon from "@mui/icons-material/EditRounded"
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded"
import UnfoldLessRoundedIcon from "@mui/icons-material/UnfoldLessRounded"
import UnfoldMoreRoundedIcon from "@mui/icons-material/UnfoldMoreRounded"
import {
  Box,
  Checkbox,
  IconButton,
  Paper,
  Typography
} from "@mui/material"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { Item, PdfAnnotation } from "../types"
import { deletePdfCard, updateItem } from "../database"
import PdfCardBody from "./PdfCardBody"
import PdfEditDialog from "./PdfEditDialog"
import { MARK_DOT, MARK_LABEL } from "./pdfTheme"

/** The PDF view's right-side cards panel — a peer of the sidebar/workspace:
 *  collapsible, resizable (240–520), a built-in batch bar, and the annotated
 *  cards ordered by their position in the original PDF. */
interface PdfCardsPanelProps {
  open: boolean
  width: number
  onWidthChange: (w: number) => void
  onCollapse: () => void
  cards: Item[]
  annotations: PdfAnnotation[]
  onCardClick: (card: Item) => void
  /** External "scroll to card" trigger (the annotation popover's 跳转卡片). */
  scrollTarget?: { cardId: string; token: number } | null
}

export default function PdfCardsPanel({
  open,
  width,
  onWidthChange,
  onCollapse,
  cards,
  annotations,
  onCardClick,
  scrollTarget
}: PdfCardsPanelProps) {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(
    () => new Set()
  )
  const [editCard, setEditCard] = useState<Item | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [batchMode, setBatchMode] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const jumpTimerRef = useRef<number | null>(null)
  const dragRef = useRef<{ startX: number; startW: number } | null>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => () => dragCleanupRef.current?.(), [])
  useEffect(
    () => () => {
      if (jumpTimerRef.current) window.clearTimeout(jumpTimerRef.current)
    },
    []
  )

  const sortedCards = useMemo(
    () =>
      [...cards].sort(
        (a, b) =>
          (a.pdfRef?.page ?? 0) - (b.pdfRef?.page ?? 0) ||
          (a.pdfRef?.annotationId ?? "").localeCompare(
            b.pdfRef?.annotationId ?? ""
          )
      ),
    [cards]
  )

  const toggleExpand = useCallback((id: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleCardEdit = useCallback((card: Item) => {
    setEditCard(card)
  }, [])

  const handleSaveIdea = useCallback(
    async (idea: string) => {
      if (!editCard) return
      await updateItem({ ...editCard, idea })
      setEditCard(null)
      // The write broadcasts _dbi → options' reload refreshes the cards.
    },
    [editCard]
  )

  const handleCardDelete = useCallback(
    async (card: Item) => {
      await deletePdfCard(card)
      setSelected((prev) => {
        if (!prev.has(card.id)) return prev
        const next = new Set(prev)
        next.delete(card.id)
        return next
      })
    },
    []
  )

  const handleBatchDelete = useCallback(async () => {
    const batch = sortedCards.filter((c) => selected.has(c.id))
    for (const c of batch) await deletePdfCard(c)
    setSelected(new Set())
    setBatchMode(false)
  }, [sortedCards, selected])

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const allSelected =
    sortedCards.length > 0 && selected.size === sortedCards.length

  // External "jump to card" trigger → scroll + highlight.
  useEffect(() => {
    if (!scrollTarget) return
    setHighlightId(scrollTarget.cardId)
    if (jumpTimerRef.current) window.clearTimeout(jumpTimerRef.current)
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector(`[data-card-id="${scrollTarget.cardId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
    jumpTimerRef.current = window.setTimeout(() => {
      setHighlightId((cur) =>
        cur === scrollTarget.cardId ? null : cur
      )
      jumpTimerRef.current = null
    }, 1500)
  }, [scrollTarget])

  // Right-anchored width drag: dragging the left edge left widens the panel.
  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      dragRef.current = { startX: e.clientX, startW: width }
      const mv = (ev: PointerEvent) => {
        const d = dragRef.current
        if (!d) return
        onWidthChange(Math.max(240, Math.min(520, d.startW - (ev.clientX - d.startX))))
      }
      const up = () => {
        dragRef.current = null
        document.removeEventListener("pointermove", mv)
        document.removeEventListener("pointerup", up)
      }
      document.addEventListener("pointermove", mv)
      document.addEventListener("pointerup", up)
      dragCleanupRef.current = up
    },
    [width, onWidthChange]
  )

  return (
    <Box
      sx={{
        width: open ? width : 0,
        flexShrink: 0,
        overflow: "hidden",
        borderLeft: open ? "1px solid" : "none",
        borderColor: "divider",
        bgcolor: "background.default",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        position: "relative",
        transition: "width 0.25s ease-out"
      }}>
      {/* Drag handle (the panel's left edge — right-anchored: drag left widens) */}
      <Box
        onPointerDown={startDrag}
        sx={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          cursor: "col-resize",
          bgcolor: "transparent",
          "&:hover": { bgcolor: "primary.light" },
          zIndex: 2
        }}
      />
      {/* Panel header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 1.5,
          py: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
          minHeight: 40
        }}>
        <IconButton
          size="small"
          onClick={onCollapse}
          title="折叠面板"
          sx={{ p: 0.25, color: "text.disabled" }}>
          <ChevronRightRoundedIcon sx={{ fontSize: 16 }} />
        </IconButton>
        <Typography
          sx={{
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "text.secondary"
          }}>
          摘录（{sortedCards.length}）
        </Typography>
        <Box sx={{ flex: 1 }} />
        {!batchMode ? (
          <Box
            onClick={() => setBatchMode(true)}
            sx={{
              fontSize: "0.72rem",
              color: "text.disabled",
              cursor: "pointer",
              px: 0.5,
              "&:hover": { color: "primary.main" }
            }}>
            批量
          </Box>
        ) : (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              fontSize: "0.72rem",
              color: "text.disabled"
            }}>
            <Checkbox
              size="small"
              checked={allSelected}
              onChange={() =>
                setSelected(
                  allSelected
                    ? new Set()
                    : new Set(sortedCards.map((c) => c.id))
                )
              }
              sx={{ p: 0.25, "& .MuiSvgIcon-root": { fontSize: 16 } }}
            />
            <Box>{selected.size} 已选</Box>
            <IconButton
              size="small"
              title="删除选中"
              disabled={selected.size === 0}
              onClick={handleBatchDelete}
              sx={{ p: 0.25, color: "text.disabled" }}>
              <DeleteOutlineRoundedIcon sx={{ fontSize: 15 }} />
            </IconButton>
            <Box
              onClick={() => {
                setBatchMode(false)
                setSelected(new Set())
              }}
              sx={{ cursor: "pointer", px: 0.5, "&:hover": { color: "primary.main" } }}>
              完成
            </Box>
          </Box>
        )}
      </Box>
      {/* Card list */}
      <Box ref={listRef} sx={{ flex: 1, overflowY: "auto", p: 1, minHeight: 0 }}>
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
          sortedCards.map((card) => {
            const ann = annotations.find(
              (x) => x.id === card.pdfRef?.annotationId
            )
            const expanded = expandedCards.has(card.id)
            const isSelected = selected.has(card.id)
            const highlighted = highlightId === card.id
            return (
              <Paper
                key={card.id}
                data-card-id={card.id}
                elevation={0}
                onClick={() => {
                  if (batchMode) toggleSelect(card.id)
                  else onCardClick(card)
                }}
                sx={(theme) => ({
                  p: 1.5,
                  mb: 1,
                  borderRadius: 1,
                  border: "1px solid",
                  borderColor: highlighted
                    ? "primary.main"
                    : isSelected
                      ? "primary.main"
                      : "divider",
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
                })}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mb: 0.5
                  }}>
                  {batchMode && (
                    <Checkbox
                      size="small"
                      checked={isSelected}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleSelect(card.id)}
                      sx={{
                        p: 0.25,
                        "& .MuiSvgIcon-root": { fontSize: 16 }
                      }}
                    />
                  )}
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
                  {!batchMode && (
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
                  )}
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
          })
        )}
      </Box>
      <PdfEditDialog
        item={editCard}
        open={Boolean(editCard)}
        onClose={() => setEditCard(null)}
        onSave={handleSaveIdea}
      />
    </Box>
  )
}
