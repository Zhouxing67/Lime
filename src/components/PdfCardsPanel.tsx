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
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded"
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded"
import AddRoundedIcon from "@mui/icons-material/AddRounded"
import {
  Box,
  Checkbox,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Tooltip,
  TextField,
  Typography
} from "@mui/material"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTheme } from "@mui/material/styles"
import { usePanelDragResize } from "../hooks/usePanelDragResize"
import { usePdfPanelMaxWidth } from "../hooks/usePdfPanelMaxWidth"
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
  PdfVocabularyCard,
  Project,
  ProjectCard,
  VocabularyOccurrence
} from "../types"
import {
  addVocabularyEntry,
  addPdfCard,
  deleteVocabularyEntry,
  getVocabularyCardByPdf
} from "../database"
import DeleteConfirmDialog from "./DeleteConfirmDialog"
import EmptyState from "./EmptyState"
import BatchToolbar from "./BatchToolbar"
import PdfCardBody from "./PdfCardBody"
import PlaceCardMenu from "./PlaceCardMenu"
import PdfEditDialog from "./PdfEditDialog"
import { markBlockFor } from "./pdfTheme"
import DialogShell from "./DialogShell"

/** The PDF view's right-side cards panel — a peer of the sidebar/workspace:
 *  collapsible, resizable (240–520), a built-in batch bar, and the annotated
 *  cards ordered by their position in the original PDF. */
interface PdfCardsPanelProps {
  open: boolean
  width: number
  onWidthChange: (w: number) => void
  /** While a drag is in flight, the panel floats fixed over the PDF area
   *  (viewport rect measured at drag start) instead of squeezing it. */
  /** While a drag is in flight, the panel floats FIXED at its normal spot
   *  (right edge, full height) so the PDF container size — and its re-render —
   *  stays frozen until the drag ends (deferred dock). */
  dragging?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
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
  /** Persistent shared selection (annotation id) — the matching card stays
   *  highlighted alongside the PDF mark until both are deselected. */
  selectedAnnId?: string | null
  pdfId?: string | null
  currentPage?: number
  onVocabularyJump?: (occurrence: VocabularyOccurrence) => void
}

export default function PdfCardsPanel({
  open,
  width,
  onWidthChange,
  dragging,
  onDragStart,
  onDragEnd,
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
  onTypeChange,
  selectedAnnId,
  pdfId,
  currentPage = 1,
  onVocabularyJump
}: PdfCardsPanelProps) {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(
    () => new Set()
  )
  const [editCard, setEditCard] = useState<PdfCard | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [copiedAnnotationId, setCopiedAnnotationId] = useState<string | null>(null)
  const [vocabularyCard, setVocabularyCard] =
    useState<PdfVocabularyCard | null>(null)
  const [manualVocabularyOpen, setManualVocabularyOpen] = useState(false)
  const [manualTerm, setManualTerm] = useState("")
  const [manualTranslation, setManualTranslation] = useState("")
  const [manualVocabularyError, setManualVocabularyError] = useState("")
  const [manualVocabularySaving, setManualVocabularySaving] = useState(false)
  const [sortMode, setSortMode] = useState<"single" | "two" | "time">("single")
  const [sortMenuAnchor, setSortMenuAnchor] = useState<HTMLElement | null>(null)
  useEffect(() => {
    void chrome.storage.local.get("_uiPdfSort").then((r) => {
      if (r._uiPdfSort === "two" || r._uiPdfSort === "single" || r._uiPdfSort === "time") {
        setSortMode(r._uiPdfSort)
      }
    })
  }, [])
  useEffect(() => {
    let cancelled = false
    const reload = async () => {
      if (!pdfId) {
        setVocabularyCard(null)
        return
      }
      const card = await getVocabularyCardByPdf(pdfId)
      if (!cancelled) setVocabularyCard(card ?? null)
    }
    void reload()
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      if (area === "local" && changes._dbpdf) void reload()
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => {
      cancelled = true
      chrome.storage.onChanged.removeListener(onChange)
    }
  }, [pdfId])
  const [batchMode, setBatchMode] = useState(false)
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
  const jumpTimerRef = useRef<number | null>(null)
  const copyTimerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (jumpTimerRef.current) window.clearTimeout(jumpTimerRef.current)
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
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

  const saveManualVocabulary = useCallback(async () => {
    if (!pdfId || !manualTerm.trim() || !manualTranslation.trim()) return
    setManualVocabularySaving(true)
    setManualVocabularyError("")
    try {
      await addVocabularyEntry({
        pdfId,
        page: currentPage,
        term: manualTerm,
        translation: manualTranslation,
        rects: []
      })
      setManualTerm("")
      setManualTranslation("")
      setManualVocabularyOpen(false)
    } catch (error) {
      setManualVocabularyError((error as Error)?.message ?? "添加生词失败")
    } finally {
      setManualVocabularySaving(false)
    }
  }, [pdfId, currentPage, manualTerm, manualTranslation])

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

  // The panel's max width must leave the PDF workspace at least 400px (shared
  // space = main-area width + panel width is constant).
  const { rootRef, getMax } = usePdfPanelMaxWidth(width)

  // Right-anchored width drag (shared with the search panel): dragging the
  // left edge widens/narrows the panel; no width transition while dragging.
  const startDrag = usePanelDragResize(
    width,
    onWidthChange,
    getMax,
    240,
    { onDragStart, onDragEnd }
  )

  return (
    <Box
      ref={rootRef}
      sx={{
        width: open ? width : 0,
        flexShrink: 0,
        overflow: "hidden",
        height: "100vh",
        position: dragging ? "fixed" : "relative",
        top: dragging ? 0 : undefined,
        right: dragging ? 0 : undefined,
        zIndex: dragging ? 30 : undefined,
        borderLeft: open ? "1px solid" : "none",
        borderColor: "divider",
        bgcolor: "background.default",
        display: "flex",
        flexDirection: "column",
        minHeight: 0
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
        <Tooltip title="手动添加生词">
          <IconButton
            size="small"
            onClick={() => {
              setManualVocabularyError("")
              setManualVocabularyOpen(true)
            }}>
            <AddRoundedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
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
      <DialogShell
        open={manualVocabularyOpen}
        onClose={() => setManualVocabularyOpen(false)}
        title="手动添加生词"
        maxWidth="xs"
        confirmLabel={manualVocabularySaving ? "添加中…" : "添加"}
        confirmDisabled={
          manualVocabularySaving ||
          !manualTerm.trim() ||
          !manualTranslation.trim()
        }
        onConfirm={() => void saveManualVocabulary()}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Typography variant="caption" color="text.secondary">
            用于 PDF 文本无法选中时。该词会记录在当前第 {currentPage} 页，但没有精确高亮范围。
          </Typography>
          <TextField
            autoFocus
            label="单词或词组"
            value={manualTerm}
            onChange={(event) => setManualTerm(event.target.value)}
            fullWidth
          />
          <TextField
            label="翻译"
            value={manualTranslation}
            onChange={(event) => setManualTranslation(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                void saveManualVocabulary()
              }
            }}
            error={Boolean(manualVocabularyError)}
            helperText={manualVocabularyError}
            multiline
            minRows={2}
            fullWidth
          />
        </Box>
      </DialogShell>
      {/* Card list */}
      <Box ref={listRef} sx={{ flex: 1, overflowY: "auto", p: 2, minHeight: 0 }}>
        {vocabularyCard && vocabularyCard.entries.length > 0 && (
          <Paper
            elevation={0}
            sx={{
              p: 1.5,
              mb: 1.5,
              borderRadius: 1,
              border: "1px solid",
              borderColor: "warning.light",
              boxShadow: theme.custom.cardShadow
            }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
              <MenuBookRoundedIcon sx={{ fontSize: 17, color: "warning.main" }} />
              <Typography sx={{ fontSize: "0.8rem", fontWeight: 600 }}>
                生词卡（{vocabularyCard.entries.length}）
              </Typography>
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
              {vocabularyCard.entries.map((entry) => (
                <Box
                  key={entry.id}
                  onClick={(event) => {
                    event.stopPropagation()
                    const occurrence = entry.occurrences[entry.occurrences.length - 1]
                    if (occurrence) onVocabularyJump?.(occurrence)
                  }}
                  sx={{
                    px: 1,
                    py: 0.75,
                    borderRadius: 1,
                    bgcolor: "action.hover",
                    cursor: "pointer",
                    "&:hover": { bgcolor: "action.selected" }
                  }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography sx={{ fontSize: "0.78rem", fontWeight: 600 }}>
                      {entry.term}
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    <Typography sx={{ fontSize: "0.65rem", color: "text.disabled" }}>
                      P{entry.occurrences[entry.occurrences.length - 1]?.page ?? "-"}
                    </Typography>
                    <Tooltip title="删除生词">
                      <IconButton
                        size="small"
                        onClick={(event) => {
                          event.stopPropagation()
                          void deleteVocabularyEntry(vocabularyCard.id, entry.id)
                        }}
                        sx={{ p: 0.25, color: "text.disabled" }}>
                        <DeleteOutlineRoundedIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Typography sx={{ mt: 0.25, fontSize: "0.72rem", color: "text.secondary" }}>
                    {entry.translations.map((item) => item.text).join("；")}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        )}
        {sortedCards.length === 0 && !vocabularyCard ? (
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
            const highlighted =
              highlightId === card.id ||
              Boolean(selectedAnnId && card.annotationId === selectedAnnId)
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
                      {ann?.text &&
                        ["highlight", "underline", "strike"].includes(
                          ann.type
                        ) && (
                        <Tooltip
                          title={
                            copiedAnnotationId === ann?.id ? "已复制" : "复制原文"
                          }>
                          <span>
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation()
                                void navigator.clipboard.writeText(ann.text)
                                setCopiedAnnotationId(ann.id)
                                if (copyTimerRef.current)
                                  window.clearTimeout(copyTimerRef.current)
                                copyTimerRef.current = window.setTimeout(() => {
                                  setCopiedAnnotationId((id) =>
                                    id === ann.id ? null : id
                                  )
                                  copyTimerRef.current = null
                                }, 1200)
                              }}
                              sx={{ p: 0.75, color: "text.disabled" }}>
                              <ContentCopyRoundedIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </span>
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
