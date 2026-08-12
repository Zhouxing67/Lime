import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import DeleteSweepRoundedIcon from "@mui/icons-material/DeleteSweepRounded"
import DoneAllRoundedIcon from "@mui/icons-material/DoneAllRounded"
import DriveFileMoveRoundedIcon from "@mui/icons-material/DriveFileMoveRounded"
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded"
import UnfoldLessRoundedIcon from "@mui/icons-material/UnfoldLessRounded"
import UnfoldMoreRoundedIcon from "@mui/icons-material/UnfoldMoreRounded"
import ViewAgendaRoundedIcon from "@mui/icons-material/ViewAgendaRounded"
import ViewColumnRoundedIcon from "@mui/icons-material/ViewColumnRounded"
import FolderRoundedIcon from "@mui/icons-material/FolderRounded"
import EditRoundedIcon from "@mui/icons-material/EditRounded"
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded"
import LinkOffRoundedIcon from "@mui/icons-material/LinkOffRounded"
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded"
import {
  Box,
  Checkbox,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Tooltip,
  Typography
} from "@mui/material"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTheme } from "@mui/material/styles"
import { usePanelDragResize } from "../hooks/usePanelDragResize"
import { sortPdfCards } from "../utils/cards"
/** Compact card date: always YYYY-MM-DD HH:MM. */
function formatCardDate(ts?: number): string {
  if (!ts) return ""
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`
}


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
import { markBlockFor } from "./pdfTheme"

/** The PDF view's right-side cards panel — a peer of the sidebar/workspace:
 *  collapsible, resizable (240–520), a built-in batch bar, and the annotated
 *  cards ordered by their position in the original PDF. */
interface PdfCardsPanelProps {
  open: boolean
  width: number
  onWidthChange: (w: number) => void
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
  /** Switch a text annotation's mark type (highlight/underline/strikeout). */
  onTypeChange?: (card: PdfCard, type: "highlight" | "underline" | "strike") => void
}

export default function PdfCardsPanel({
  open,
  width,
  onWidthChange,
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
  onJumpToProject,
  onTypeChange
}: PdfCardsPanelProps) {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(
    () => new Set()
  )
  const [editCard, setEditCard] = useState<PdfCard | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<"single" | "two" | "time">("single")
  const [sortMenuAnchor, setSortMenuAnchor] = useState<HTMLElement | null>(null)
  useEffect(() => {
    void chrome.storage.local.get("_uiPdfSort").then((r) => {
      if (r._uiPdfSort === "two" || r._uiPdfSort === "single" || r._uiPdfSort === "time") {
        setSortMode(r._uiPdfSort)
      }
    })
  }, [])
  const [batchMode, setBatchMode] = useState(false)
  const [mainAreaW, setMainAreaW] = useState(0)
  const maxPanelWRef = useRef(0)
  const [placeMenu, setPlaceMenu] = useState<{
    anchor: HTMLElement
    cardIds: string[]
  } | null>(null)
  const [typeMenu, setTypeMenu] = useState<{
    anchor: HTMLElement
    card: PdfCard
  } | null>(null)
  const theme = useTheme()
  const [deleteTarget, setDeleteTarget] = useState<PdfCard | null>(null)
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const jumpTimerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (jumpTimerRef.current) window.clearTimeout(jumpTimerRef.current)
    },
    []
  )

  const sortedCards = useMemo(
    () => sortPdfCards(cards, annotations, sortMode),
    [cards, annotations, sortMode]
  )

  const handleCardEdit = useCallback((card: PdfCard) => {
    setEditCard(card)
  }, [])

  const handleSaveIdea = useCallback(
    async (comment: string) => {
      if (!editCard) return
      await addPdfCard({ ...editCard, comment })
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

  // Right-anchored width drag (shared with the search panel): dragging the
  // left edge widens/narrows the panel; no width transition while dragging.
  const startDrag = usePanelDragResize(
    width,
    onWidthChange,
    () => maxPanelWRef.current
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
        <Tooltip title="排序方式">
          <IconButton
            size="small"
            onClick={(e) => setSortMenuAnchor(e.currentTarget)}>
            {sortMode === "two" ? (
              <ViewColumnRoundedIcon sx={{ fontSize: 16 }} />
            ) : sortMode === "time" ? (
              <AccessTimeRoundedIcon sx={{ fontSize: 16 }} />
            ) : (
              <ViewAgendaRoundedIcon sx={{ fontSize: 16 }} />
            )}
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={sortMenuAnchor}
          open={Boolean(sortMenuAnchor)}
          onClose={() => setSortMenuAnchor(null)}
          slotProps={{
            paper: { sx: { py: 0.5, borderRadius: 1, minWidth: 132 } }
          }}>
          {(
            [
              ["single", "按位置排序"],
              ["two", "双栏排序"],
              ["time", "按时间排序"]
            ] as const
          ).map(([mode, label]) => (
            <MenuItem
              key={mode}
              selected={sortMode === mode}
              onClick={() => {
                setSortMode(mode)
                setSortMenuAnchor(null)
                void chrome.storage.local.set({ _uiPdfSort: mode })
              }}
              sx={{ fontSize: "0.8rem", gap: 1 }}>
              {label}
            </MenuItem>
          ))}
        </Menu>
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
          sortedCards.map((card, idx) => {
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
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 26,
                      px: 0.6,
                      py: 0.4,
                      mr: 1,
                      flexShrink: 0,
                      borderRadius: 1,
                      lineHeight: 1,
                      bgcolor: ann
                        ? markBlockFor(ann.type, theme.palette.mode).bg
                        : "action.hover",
                      color: ann
                        ? markBlockFor(ann.type, theme.palette.mode).fg
                        : "text.secondary",
                      fontSize: "0.74rem",
                      fontWeight: 600
                    }}>
                    #{idx + 1}
                  </Box>
                  <Typography
                    sx={{
                      mr: 1,
                      flexShrink: 0,
                      fontSize: "0.68rem",
                      color: "text.disabled",
                      fontWeight: 500
                    }}>
                    P{card.page}
                  </Typography>
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
                      {card.comment && (
                        <Tooltip title={expanded ? "收起" : "展开"}>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation()
                              setExpandedCards((prev) => {
                                const next = new Set(prev)
                                if (next.has(card.id)) next.delete(card.id)
                                else next.add(card.id)
                                return next
                              })
                            }}
                            sx={{ p: 0.75, color: "text.disabled" }}>
                            {expanded ? (
                              <UnfoldLessRoundedIcon sx={{ fontSize: 16 }} />
                            ) : (
                              <UnfoldMoreRoundedIcon sx={{ fontSize: 16 }} />
                            )}
                          </IconButton>
                        </Tooltip>
                      )}
                      {card.kind === "text" && (
                        <Tooltip title="切换批注类型">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation()
                              setTypeMenu({ anchor: e.currentTarget, card })
                            }}
                            sx={{ p: 0.75, color: "text.disabled" }}>
                            <SwapHorizRoundedIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="编辑">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCardEdit(card)
                          }}
                          sx={{ p: 0.75, color: "text.disabled" }}>
                          <EditRoundedIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      {placedProject ? (
                        <Tooltip title="移出项目">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation()
                              onUnplace([card.id])
                            }}
                            sx={{ p: 0.75, color: "text.disabled" }}>
                            <LinkOffRoundedIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Tooltip title="置入项目">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation()
                              setPlaceMenu({
                                anchor: e.currentTarget,
                                cardIds: [card.id]
                              })
                            }}
                            sx={{ p: 0.75, color: "text.disabled" }}>
                            <DriveFileMoveRoundedIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  )}
                  <Tooltip title="删除">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCardDelete(card)
                      }}
                      sx={{ p: 0.75, color: "text.disabled" }}>
                      <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
                <PdfCardBody
                  item={card}
                  maxLines={expanded ? undefined : 4}
                />
                <Box
                  sx={{
                    mt: 1.25,
                    pt: 1,
                    borderTop: "1px solid",
                    borderColor: "divider",
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5
                  }}>
                  <Box
                    component="span"
                    sx={{
                      fontSize: "0.66rem",
                      color: "text.disabled",
                      flexShrink: 0
                    }}>
                    {formatCardDate(ann?.updatedAt ?? ann?.createdAt)}
                  </Box>
                  <Box sx={{ flex: 1 }} />
                  {placedProject && (
                    <Tooltip title={`跳转到项目「${placedProject.name}」`}>
                      <Box
                        onClick={(e) => {
                          e.stopPropagation()
                          onJumpToProject?.(card)
                        }}
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 0.5,
                          maxWidth: "60%",
                          px: 1,
                          py: 0.35,
                          borderRadius: 1,
                          border: "1px dashed",
                          borderColor: "divider",
                          color: "text.secondary",
                          fontSize: "0.7rem",
                          cursor: "pointer",
                          overflow: "hidden",
                          transition: "all 0.2s",
                          "&:hover": {
                            color: "primary.main",
                            borderColor: "primary.main",
                            bgcolor: "action.hover"
                          }
                        }}>
                        <FolderRoundedIcon sx={{ fontSize: 12, flexShrink: 0 }} />
                        <Box
                          component="span"
                          sx={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}>
                          {placedProject.name}
                        </Box>
                      </Box>
                    </Tooltip>
                  )}
                </Box>
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
      <Menu
        anchorEl={typeMenu?.anchor ?? null}
        open={Boolean(typeMenu)}
        onClose={() => setTypeMenu(null)}
        slotProps={{ paper: { sx: { py: 0.5, borderRadius: 1, minWidth: 120 } } }}>
        {(
          [
            ["highlight", "高亮"],
            ["underline", "下划线"],
            ["strike", "删除线"]
          ] as const
        ).map(([type, label]) => (
          <MenuItem
            key={type}
            selected={typeMenu?.card.type === type}
            onClick={() => {
              if (typeMenu && onTypeChange) onTypeChange(typeMenu.card, type)
              setTypeMenu(null)
            }}
            sx={{ fontSize: "0.8rem" }}>
            {label}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  )
}
