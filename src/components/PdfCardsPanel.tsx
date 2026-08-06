import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import DeleteSweepRoundedIcon from "@mui/icons-material/DeleteSweepRounded"
import DoneAllRoundedIcon from "@mui/icons-material/DoneAllRounded"
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded"
import DriveFileMoveRoundedIcon from "@mui/icons-material/DriveFileMoveRounded"
import FolderRoundedIcon from "@mui/icons-material/FolderRounded"
import EditRoundedIcon from "@mui/icons-material/EditRounded"
import LinkOffRoundedIcon from "@mui/icons-material/LinkOffRounded"
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded"
import UnfoldLessRoundedIcon from "@mui/icons-material/UnfoldLessRounded"
import UnfoldMoreRoundedIcon from "@mui/icons-material/UnfoldMoreRounded"
import {
  Box,
  Checkbox,
  Divider,
  IconButton,
  Paper,
  Typography
} from "@mui/material"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type {
  PdfAnnotation,
  PdfCard,
  Project,
  ProjectCard
} from "../types"
import { addPdfCard } from "../database"
import DeleteConfirmDialog from "./DeleteConfirmDialog"
import EmptyState from "./EmptyState"
import BatchToolbar from "./BatchToolbar"
import PdfCardBody from "./PdfCardBody"
import PlaceCardMenu from "./PlaceCardMenu"
import PdfEditDialog from "./PdfEditDialog"
import { MARK_DOT } from "./pdfTheme"

/** The PDF view's right-side cards panel — a peer of the sidebar/workspace:
 *  collapsible, resizable (240–520), a built-in batch bar, and the annotated
 *  cards ordered by their position in the original PDF. */
interface PdfCardsPanelProps {
  open: boolean
  width: number
  onWidthChange: (w: number) => void
  onCollapse: () => void
  cards: PdfCard[]
  annotations: PdfAnnotation[]
  onCardClick: (card: PdfCard) => void
  /** External "scroll to card" trigger (the annotation popover's 跳转卡片). */
  scrollTarget?: { cardId: string; token: number } | null
  projects: Project[]
  /** Placement id (the pdfCard's projectCardId) → the projectCard placement. */
  placements: Map<string, ProjectCard>
  onPlace: (cardIds: string[], projectId: string) => void
  onUnplace: (cardIds: string[]) => void
  /** Delete pdfCards (+ their annotations + placements' reviews). */
  onDelete: (cards: PdfCard[]) => void | Promise<void>
  /** Create a project + place the cards into it (returns success). */
  onCreateProject?: (name: string, cardIds: string[]) => Promise<boolean>
  /** Placed card's project chip click → jump to that project. */
  onJumpToProject?: (card: PdfCard) => void
}

export default function PdfCardsPanel({
  open,
  width,
  onWidthChange,
  onCollapse,
  cards,
  annotations,
  onCardClick,
  scrollTarget,
  projects,
  placements,
  onPlace,
  onUnplace,
  onDelete,
  onCreateProject,
  onJumpToProject
}: PdfCardsPanelProps) {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(
    () => new Set()
  )
  const [editCard, setEditCard] = useState<PdfCard | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [copiedCardId, setCopiedCardId] = useState<string | null>(null)
  const [batchMode, setBatchMode] = useState(false)
  const [mainAreaW, setMainAreaW] = useState(0)
  const maxPanelWRef = useRef(0)
  const [placeMenu, setPlaceMenu] = useState<{
    anchor: HTMLElement
    cardIds: string[]
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PdfCard | null>(null)
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
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

  // Sort by the card's pdfOrder (the annotation's position in the PDF).
  const sortedCards = useMemo(
    () =>
      [...cards].sort(
        (a, b) =>
          a.pdfOrder - b.pdfOrder ||
          a.annotationId.localeCompare(b.annotationId)
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

  const handleCardEdit = useCallback((card: PdfCard) => {
    setEditCard(card)
  }, [])

  const handleSaveIdea = useCallback(
    async (idea: string) => {
      if (!editCard) return
      await addPdfCard({ ...editCard, idea })
      setEditCard(null)
      // The write broadcasts _dbpdf → options' reload refreshes the cards.
    },
    [editCard]
  )

  const handleCardDelete = useCallback((card: PdfCard) => {
    setDeleteTarget(card)
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    await onDelete([deleteTarget])
    setSelected((prev) => {
      if (!prev.has(deleteTarget.id)) return prev
      const next = new Set(prev)
      next.delete(deleteTarget.id)
      return next
    })
    setDeleteTarget(null)
  }, [deleteTarget, onDelete])

  const handleBatchDelete = useCallback(async () => {
    const batch = sortedCards.filter((c) => selected.has(c.id))
    await onDelete(batch)
    setSelected(new Set())
    setBatchMode(false)
    setBatchDeleteOpen(false)
  }, [sortedCards, selected, onDelete])

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

  // The panel's max width must leave the PDF workspace at least 400px. The
  // panel is a top-level sibling AFTER the main-area, so measuring the ROOT
  // (parent) width would include the NavRail + sidebar and let the panel squeeze
  // the PDF to ~0. Instead measure the main-area (the previous sibling): the
  // shared space = main-area width + the current panel width is constant, so
  // max = sharedSpace − 400.
  const sharedSpace = mainAreaW + width
  const maxPanelW =
    sharedSpace > 0 ? Math.max(240, Math.min(520, sharedSpace - 400)) : 520
  maxPanelWRef.current = maxPanelW

  useEffect(() => {
    const el = rootRef.current?.previousElementSibling
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      setMainAreaW(Math.floor(entries[0].contentRect.width))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Right-anchored width drag: dragging the left edge left widens the panel.
  // No width transition while dragging — instant reflow so the PDF's re-scale
  // starts immediately (a transitioned width would lag the pointer + the PDF
  // would appear covered).
  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      dragRef.current = { startX: e.clientX, startW: width }
      const mv = (ev: PointerEvent) => {
        const d = dragRef.current
        if (!d) return
        const next = Math.max(
          240,
          Math.min(maxPanelWRef.current, d.startW - (ev.clientX - d.startX))
        )
        onWidthChange(next)
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
    [width, onWidthChange, maxPanelW]
  )

  return (
    <Box
      ref={rootRef}
      sx={{
        width: open ? width : 0,
        flexShrink: 0,
        overflow: "hidden",
        height: "100vh",
        borderLeft: open ? "1px solid" : "none",
        borderColor: "divider",
        bgcolor: "background.default",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        position: "relative"
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
          gap: 0.75,
          px: 2,
          py: 1,
          minHeight: 52
        }}>
        <Box
          sx={{
            width: 3,
            height: 14,
            borderRadius: 1,
            bgcolor: "primary.main",
            flexShrink: 0
          }}
        />
        <Typography
          sx={{
            fontSize: "0.8rem",
            fontWeight: 600,
            color: "text.secondary"
          }}>
          摘录（{sortedCards.length}）
        </Typography>
        <Box sx={{ flex: 1 }} />
        <IconButton
          size="small"
          title={batchMode ? "取消批量选择" : "批量选择"}
          onClick={() => {
            setBatchMode((b) => !b)
            if (batchMode) setSelected(new Set())
          }}
          sx={{
            p: 0.25,
            color: batchMode ? "error.main" : "text.secondary"
          }}>
          <DoneAllRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>
      {batchMode && (
        <Box
          sx={{
            borderBottom: "1px solid",
            borderColor: "divider",
            px: 2,
            py: 0.75
          }}>
          <BatchToolbar
            selectedCount={selected.size}
            allSelected={allSelected}
            countLabel="张"
            onSelectAll={() =>
              setSelected(
                allSelected
                  ? new Set()
                  : new Set(sortedCards.map((c) => c.id))
              )
            }
            actions={[
              {
                label: "置入项目",
                icon: <DriveFileMoveRoundedIcon sx={{ fontSize: 16, mr: 0.5 }} />,
                onClick: (e) =>
                  setPlaceMenu({
                    anchor: e.currentTarget,
                    cardIds: [...selected]
                  }),
                disabled: selected.size === 0
              },
              {
                label: "删除选中",
                icon: <DeleteSweepRoundedIcon sx={{ fontSize: 16, mr: 0.5 }} />,
                onClick: () => setBatchDeleteOpen(true),
                dividerBefore: true,
                disabled: selected.size === 0,
                variant: "contained",
                color: "error"
              }
            ]}
          />
        </Box>
      )}
      <Divider sx={{ mx: 1 }} />
      {/* Card list */}
      <Box ref={listRef} sx={{ flex: 1, overflowY: "auto", p: 2, minHeight: 0 }}>
        {sortedCards.length === 0 ? (
          <EmptyState
            icon={<PictureAsPdfRoundedIcon />}
            iconSize={40}
            title="还没有摘录卡片"
            subtitle="在左侧选中文字后点标记，自动生成卡片"
          />
        ) : (
          sortedCards.map((card) => {
            const ann = annotations.find((x) => x.id === card.annotationId)
            const expanded = expandedCards.has(card.id)
            const isSelected = selected.has(card.id)
            const highlighted = highlightId === card.id
            const placement = card.projectCardId
              ? placements.get(card.projectCardId)
              : undefined
            const placedProject = placement
              ? projects.find((p) => p.id === placement.projectId)
              : undefined
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
                  position: "relative",
                  border: "1px solid",
                  borderColor: highlighted
                    ? "primary.main"
                    : isSelected
                      ? "primary.main"
                      : "divider",
                  cursor: "pointer",
                  boxShadow: highlighted
                    ? theme.custom.focusRing
                    : theme.custom.cardShadow,
                  transition: "all 0.2s",
                  "&:hover": {
                    boxShadow: highlighted
                      ? theme.custom.focusRing
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
                    P{card.page}
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
                    </Box>
                  )}
                  {placedProject && (
                    <Box
                      onClick={(e) => {
                        e.stopPropagation()
                        onJumpToProject?.(card)
                      }}
                      title={`在「${placedProject.name}」中查看`}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.3,
                        px: 0.5,
                        py: 0.1,
                        borderRadius: 1,
                        bgcolor: "action.hover",
                        fontSize: "0.66rem",
                        color: "primary.main",
                        cursor: "pointer",
                        maxWidth: 120,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        "&:hover": { bgcolor: "action.selected" }
                      }}>
                      <FolderRoundedIcon sx={{ fontSize: 11 }} />
                      {placedProject.name}
                    </Box>
                  )}
                  <Box sx={{ flex: 1 }} />
                  {!batchMode && (
                    <Box
                      className="pdf-card-ops"
                      sx={{
                        position: "absolute",
                        top: 10,
                        right: 40,
                        display: "flex",
                        alignItems: "center",
                        bgcolor: "background.paper",
                        opacity: 0,
                        transition: "opacity 0.15s"
                      }}>
                      <IconButton
                        size="small"
                        title={
                          copiedCardId === card.id
                            ? "已复制"
                            : card.kind === "region"
                              ? "复制图片"
                              : "复制内容"
                        }
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (card.kind === "region") {
                            // A frame card copies the IMAGE itself (ClipboardItem).
                            try {
                              const blob = await (
                                await fetch(card.content)
                              ).blob()
                              await navigator.clipboard.write([
                                new ClipboardItem({
                                  [blob.type || "image/png"]: blob
                                })
                              ])
                            } catch (err) {
                              console.warn("[lime] image copy failed:", err)
                              navigator.clipboard.writeText(card.content)
                            }
                          } else {
                            navigator.clipboard.writeText(`> ${card.content}`)
                          }
                          setCopiedCardId(card.id)
                          window.setTimeout(() => {
                            setCopiedCardId((cur) =>
                              cur === card.id ? null : cur
                            )
                          }, 1200)
                        }}
                        sx={{ p: 0.25, color: "text.disabled" }}>
                        <ContentCopyRoundedIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                      <IconButton
                        size="small"
                        title={expanded ? "收起内容" : "展开内容"}
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
                        title="编辑"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCardEdit(card)
                        }}
                        sx={{ p: 0.25, color: "text.disabled" }}>
                        <EditRoundedIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                      {placedProject ? (
                        <IconButton
                          size="small"
                          title="移出项目"
                          onClick={(e) => {
                            e.stopPropagation()
                            onUnplace([card.id])
                          }}
                          sx={{ p: 0.25, color: "text.disabled" }}>
                          <LinkOffRoundedIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      ) : (
                        <IconButton
                          size="small"
                          title="置入项目"
                          onClick={(e) => {
                            e.stopPropagation()
                            setPlaceMenu({
                              anchor: e.currentTarget,
                              cardIds: [card.id]
                            })
                          }}
                          sx={{ p: 0.25, color: "text.disabled" }}>
                          <DriveFileMoveRoundedIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      )}
                    </Box>
                  )}
                  <IconButton
                    size="small"
                    title="删除"
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
      <DeleteConfirmDialog
        open={Boolean(deleteTarget)}
        batch={false}
        count={1}
        itemLabel="这个批注"
        message="将删除该批注及其摘录卡片。"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
      <DeleteConfirmDialog
        open={batchDeleteOpen}
        batch
        count={selected.size}
        itemLabel="批注"
        onCancel={() => setBatchDeleteOpen(false)}
        onConfirm={handleBatchDelete}
      />
      <PlaceCardMenu
        anchor={placeMenu?.anchor ?? null}
        cardIds={placeMenu?.cardIds ?? []}
        projects={projects}
        onPlace={onPlace}
        onCreateProject={onCreateProject}
        onClose={() => setPlaceMenu(null)}
      />
    </Box>
  )
}
