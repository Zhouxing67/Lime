import BookmarkRoundedIcon from "@mui/icons-material/BookmarkRounded"
import ChecklistRoundedIcon from "@mui/icons-material/ChecklistRounded"
import CloseRoundedIcon from "@mui/icons-material/CloseRounded"
import DeleteSweepRoundedIcon from "@mui/icons-material/DeleteSweepRounded"
import DoneAllRoundedIcon from "@mui/icons-material/DoneAllRounded"
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined"
import FileCopyOutlinedIcon from "@mui/icons-material/FileCopyOutlined"
import FileDownloadRoundedIcon from "@mui/icons-material/FileDownloadRounded"
import FolderRoundedIcon from "@mui/icons-material/FolderRounded"
import MergeTypeRoundedIcon from "@mui/icons-material/MergeTypeRounded"
import ViewColumnRoundedIcon from "@mui/icons-material/ViewColumnRounded"
import {
  alpha,
  Box,
  Button,
  CssBaseline,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery
} from "@mui/material"
import { ThemeProvider } from "@mui/material/styles"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import AppHeader from "./components/AppHeader"
import BatchToolbar from "./components/BatchToolbar"
import type { CardEditorValues } from "./components/CardEditorView"
import CopyCardsMenu from "./components/CopyCardsMenu"
import DateRangeFilter from "./components/DateRangeFilter"
import DeleteConfirmDialog from "./components/DeleteConfirmDialog"
import DialogShell from "./components/DialogShell"
import FilterChips from "./components/FilterChips"
import FooterBar from "./components/FooterBar"
import ItemDialog from "./components/ItemDialog"
import MergeConfirmDialog from "./components/MergeConfirmDialog"
import MoveToSectionMenu from "./components/MoveToSectionMenu"
import NavRail from "./components/NavRail"
import NewProjectDialog from "./components/NewProjectDialog"
import OpenPdfUrlDialog from "./components/OpenPdfUrlDialog"
import PdfCardsPanel from "./components/PdfCardsPanel"
import { PDF_UNCLASSIFIED_TOPIC, type PdfTopicView } from "./components/PdfHub"
import PdfSearchPanel from "./components/PdfSearchPanel"
import ProjectTree from "./components/ProjectTree"
import SettingsDialog from "./components/SettingsDialog"
import SidebarFilters from "./components/SidebarFilters"
import Toast from "./components/Toast"
import ViewRouter from "./components/ViewRouter"
import {
  addPdf,
  addProject,
  addProjectCard,
  addReadLater,
  addReview,
  batchUpdateProjectCards,
  buildProjectCard,
  clearPdfTopic,
  createImageCard,
  createTextCard,
  deletePdf,
  deletePdfCards,
  deleteProject,
  deleteProjectCard,
  deleteProjectCards,
  discardDraft,
  ensureOrder,
  getAnnotationsByPdf,
  getMaxOrderInSection,
  getProjectByName,
  placePdfCards,
  promoteDraft,
  removeReview,
  renamePdfName,
  renamePdfTopic,
  saveDraftCard,
  tx,
  unplacePdfCards,
  updatePdfAiContext,
  updatePdfCard,
  updatePdfTopic,
  updateProjectCard,
  updateReviewSrs,
  type PdfMetaLite
} from "./database"
import { useAppData } from "./hooks/useAppData"
import { useBackupSync } from "./hooks/useBackupSync"
import { useBackupView } from "./hooks/useBackupView"
import { useCardDragReorder } from "./hooks/useCardDragReorder"
import { usePdfSearchPanel } from "./hooks/usePdfSearchPanel"
import { useProjects } from "./hooks/useProjects"
import { useProjectsView } from "./hooks/useProjectsView"
import { useReview } from "./hooks/useReview"
import { useReviewSession } from "./hooks/useReviewSession"
import { useReviewView } from "./hooks/useReviewView"
import { createReviewEntry, dayKey } from "./hooks/useSrs"
import { useTodoView } from "./hooks/useTodoView"
import { useWorkspaceView } from "./hooks/useWorkspaceView"
import { importFromZip } from "./import"
import { createAppTheme, palettes } from "./theme"
import type {
  DisplayCard,
  MergeSeparator,
  PdfCard,
  PdfFile,
  PdfOutlineItem,
  PresetName,
  ProjectCard,
  ProjectCardType
} from "./types"
import { sendMessage } from "./types/messages"
import {
  base64ToBytes,
  buildMergedContent,
  cloneProjectCard,
  compareCards,
  computeItemHash,
  createReadLater,
  dueStatus,
  isTodoComplete,
  RATING_META,
  sortAllCards,
  todayLocalDate
} from "./utils"
import { resolveCardContent, stripPlacementContent } from "./utils/cards"
import { buildProjectMarkdown, buildScopeData } from "./utils/export"

const ITEMS_PER_PAGE = 20

export default function OptionsPage() {
  const [dialogCard, setDialogCard] = useState<DisplayCard | null>(null)
  // ---- the workspace view routing (sidebarTab + drawer/reader mutex +
  // card-editor workspace + single active PDF) ----
  const refreshRef = useRef<() => void>(() => {})
  const {
    sidebarTab,
    sidebarTabRef,
    drawerOpen,
    pdfReaderOpen,
    cardWorkspace,
    activePdfId,
    handleSetSidebarTab,
    navigate,
    toggleDrawer,
    swapLeft,
    toggleReader,
    openCardWorkspace,
    closeCardWorkspace,
    openPdf,
    closePdf
  } = useWorkspaceView(refreshRef)

  // Navigate prev/next within the currently displayed list
  const [drawerWidth, setDrawerWidth] = useState(280)
  const [deleteTargetIsPdf, setDeleteTargetIsPdf] = useState(false)
  const [preset, setPreset] = useState<PresetName>("indigo-crimson")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [extraTopics, setExtraTopics] = useState<string[]>([])
  const [pdfCardsOpen, setPdfCardsOpen] = useState(true)
  const [pdfCardsWidth, setPdfCardsWidth] = useState(320)
  const [pdfHubTopicView, setPdfHubTopicView] = useState<PdfTopicView>("topics")
  const [pdfHubKeyword, setPdfHubKeyword] = useState("")
  const handlePdfHubTopicViewChange = useCallback((view: PdfTopicView) => {
    setPdfHubTopicView(view)
    setPdfHubKeyword("")
  }, [])
  // While a right-panel drag is in flight, the panel floats FIXED at its normal
  // spot (right edge, full height) instead of squeezing the PDF — the PDF
  // container size stays frozen, so no per-frame re-render (deferred dock).
  const [pdfPanelDragging, setPdfPanelDragging] = useState(false)
  const startPanelDrag = useCallback(() => setPdfPanelDragging(true), [])
  const endPanelDrag = useCallback(() => setPdfPanelDragging(false), [])
  const [pdfFlashTarget, setPdfFlashTarget] = useState<{
    page: number
    annId: string
    token: number
  } | null>(null)
  const [pdfScrollTarget, setPdfScrollTarget] = useState<{
    cardId: string
    token: number
  } | null>(null)
  const [projectCardHighlightId, setProjectCardHighlightId] = useState<
    string | null
  >(null)
  const projectCardHighlightTimer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (projectCardHighlightTimer.current)
        window.clearTimeout(projectCardHighlightTimer.current)
    },
    []
  )
  const pdfFlashToken = useRef(0)
  const pdfScrollToken = useRef(0)
  const [pdfSelectedAnnId, setPdfSelectedAnnId] = useState<string | null>(null)
  const [pdfClearRingToken, setPdfClearRingToken] = useState(0)
  const [pdfVocabularyFlashTarget, setPdfVocabularyFlashTarget] = useState<{
    page: number
    rects: { x: number; y: number; w: number; h: number }[]
    token: number
  } | null>(null)
  const pdfVocabularyFlashToken = useRef(0)
  const pdfSelectedTimerRef = useRef<number | null>(null)
  // The shared card↔mark highlight auto-dismisses after 2s (a brief "selected"
  // cue) — no persistent selection to deselect.
  const setPdfSelected = useCallback((annId: string | null) => {
    setPdfSelectedAnnId(annId)
    if (pdfSelectedTimerRef.current)
      window.clearTimeout(pdfSelectedTimerRef.current)
    pdfSelectedTimerRef.current = null
    if (!annId) return
    pdfSelectedTimerRef.current = window.setTimeout(() => {
      pdfSelectedTimerRef.current = null
      setPdfSelectedAnnId(null)
      setPdfClearRingToken((t) => t + 1)
    }, 2000)
  }, [])
  useEffect(
    () => () => {
      if (pdfSelectedTimerRef.current)
        window.clearTimeout(pdfSelectedTimerRef.current)
    },
    []
  )
  const [pdfTypeChangeTarget, setPdfTypeChangeTarget] = useState<{
    id: string
    type: number
    seq: number
  } | null>(null)
  const pdfTypeChangeToken = useRef(0)
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1)
  const [pdfPageCount, setPdfPageCount] = useState(0)
  const [pdfSidebarView, setPdfSidebarView] = useState<"cards" | "search">(
    "cards"
  )

  // PDF library batch operations (batch delete / move-to-topic).
  const [pdfBatchMode, setPdfBatchMode] = useState(false)
  const [pdfBatchSelectedIds, setPdfBatchSelectedIds] = useState<string[]>([])
  const [confirmPdfBatchDelete, setConfirmPdfBatchDelete] = useState(false)
  const [pdfBatchMoveAnchor, setPdfBatchMoveAnchor] =
    useState<HTMLElement | null>(null)

  const activePdfIdRef = useRef<string | null>(null)
  activePdfIdRef.current = activePdfId

  // ---- the shared data hub (cards/todos/reviews/pdfs + broadcast reloads) ----
  const loadProjectsRef = useRef<() => Promise<unknown>>(async () => {})
  const onSearchRef = useRef<() => Promise<void>>(async () => {})
  const {
    pdfs,
    allProjectCardsUnfiltered,
    allPdfCards,
    allVocabularyCards,
    annotationById,
    allTodos,
    allReadLater,
    allReviews,
    setReviewsVersion,
    reviewItemIds,
    setReviewItemIds,
    reviewSrsMap,
    masteredItemIds,
    pdfPanelAnnotations,
    pdfPanelCards,
    liteDueCount,
    liteTodoCount,
    pdfById,
    pdfNameById,
    countByPdf,
    countByProject,
    draftByOriginal,
    loadTodos,
    loadPdfs,
    refreshAllData
  } = useAppData({
    loadProjectsRef,
    onSearchRef,
    sidebarTabRef,
    activePdfId,
    activePdfIdRef
  })
  refreshRef.current = refreshAllData
  const {
    pdfSearch,
    searchRequest,
    jumpRequest,
    handlePdfSearch,
    handlePdfSearchOptions,
    handlePdfSearchResults,
    handlePdfSearchEntry,
    handlePdfSearchNav
  } = usePdfSearchPanel()
  const [pdfDeleteTarget, setPdfDeleteTarget] = useState<PdfMetaLite | null>(
    null
  )
  const [topicDeleteTarget, setTopicDeleteTarget] = useState<string | null>(
    null
  )
  const [pdfOutlineDest, setPdfOutlineDest] = useState<PdfOutlineItem | null>(
    null
  )
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const [copyCardId, setCopyCardId] = useState<string | null>(null)
  const [moveSectionCardId, setMoveSectionCardId] = useState<string | null>(
    null
  )
  const [copyMenu, setCopyMenu] = useState<{
    anchor: HTMLElement
    mode: "single" | "batch"
  } | null>(null)
  const [moveMenu, setMoveMenu] = useState<{
    anchor: HTMLElement
    mode: "single" | "batch"
  } | null>(null)
  const [snackbar, setSnackbar] = useState<{
    message: string
    severity: "success" | "error"
  } | null>(null)
  /** Explicit severity — errors pass "error" (announced via role="alert"),
   *  success is the default. No message-text heuristics. */
  const setSnackbarMsg = useCallback(
    (message: string, severity: "success" | "error" = "success") => {
      setSnackbar({ message, severity })
    },
    []
  )
  const [syncStatus, setSyncStatus] = useState("")
  const [pendingSectionDelete, setPendingSectionDelete] = useState<{
    sectionId: string
    cardCount: number
    subSectionCount: number
  } | null>(null)
  const [mergeState, setMergeState] = useState<DisplayCard[] | null>(null)

  const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)")

  const theme = useMemo(
    () => createAppTheme(prefersDarkMode ? "dark" : "light", preset),
    [prefersDarkMode, preset]
  )

  useEffect(() => {
    chrome.storage.sync.get("preset", (data) => {
      // Only adopt a preset that still exists — a stale stored value (e.g. the
      // removed classic) falls back to the default instead of crashing.
      if (data.preset && data.preset in palettes)
        setPreset(data.preset as PresetName)
    })
  }, [])

  useEffect(() => {
    chrome.storage.sync.set({ preset })
  }, [preset])

  // ---- Display resolution (the three-store data link) ----
  // Project cards are the persisted identity; a placed card (pdfCardId) carries
  // NO content — its effective body/comment come from the linked pdfCard. The grids
  // render DisplayCard (resolved), while every WRITE path operates on the
  // original ProjectCard (via stripPlacementContent).
  const resolveDisplay = useCallback(
    (card: ProjectCard): DisplayCard => {
      if (card.pdfVocabularyCardId) {
        const vocabulary = allVocabularyCards.find(
          (item) => item.id === card.pdfVocabularyCardId
        )
        const firstEntry = vocabulary?.entries[0]
        const firstOccurrence = firstEntry?.occurrences[0]
        return {
          ...card,
          type: "placed",
          title: undefined,
          content: "",
          vocabularyEntries: vocabulary?.entries ?? [],
          ...(vocabulary && firstOccurrence
            ? {
                pdfSource: {
                  pdfId: vocabulary.pdfId,
                  page: firstOccurrence.page,
                  pdfName: pdfNameById.get(vocabulary.pdfId)
                },
                vocabularySource: {
                  entryId: firstEntry.id,
                  occurrenceId: firstOccurrence.id,
                  rects: firstOccurrence.rects
                }
              }
            : {})
        }
      }
      if (!card.pdfCardId) {
        // Legacy image cards (pre card-type-v2 migration): the image (a dataURL
        // or a legacy URL) lives in content. Derive the readonly image field at
        // display so the full/preview render it as an image, not a raw link.
        if (
          card.type === "image" &&
          !card.image &&
          typeof card.content === "string" &&
          card.content.length > 0
        ) {
          return { ...card, image: card.content }
        }
        return card
      }
      const resolved = resolveCardContent(card, pdfById, annotationById)
      const pdfCard = pdfById.get(card.pdfCardId)
      // Placed cards are the `placed` type; their readonly original is the
      // RESOLVED view: a region → the crop image, a text annotation → the
      // PDF quote (annotation.text). Legacy placements (type "text" in the DB)
      // are normalized here — no migration needed.
      const placedType: ProjectCardType = "placed"
      const base = {
        ...card,
        type: placedType,
        content: resolved.content,
        comment: resolved.comment,
        image: resolved.image
      }
      return pdfCard
        ? {
            ...base,
            pdfSource: {
              pdfId: pdfCard.pdfId,
              page: pdfCard.page,
              pdfName: pdfNameById.get(pdfCard.pdfId),
              type: pdfCard.type,
              kind: pdfCard.kind
            }
          }
        : base
    },
    [pdfById, pdfNameById, annotationById, allVocabularyCards]
  )

  /** The current scope's render list (search results / project scope). */
  // An edit draft replaces its original card in the grid (the draft is the
  // intermediate state; the original stays in the DB but is hidden until the
  // draft is promoted or discarded).
  /** EVERY project card across projects, display-resolved (review + backup). */
  const displayCardsUnfiltered = useMemo(
    () => allProjectCardsUnfiltered.map(resolveDisplay),
    [allProjectCardsUnfiltered, resolveDisplay]
  )

  // The review session (queue + flip/anim + tallies + the rating handler).
  const {
    reviewItems,
    setReviewItems,
    reviewFlipped,
    reviewCompleted,
    reviewProgress,
    animating,
    handleReviewFlip,
    handleReviewRate
  } = useReviewSession({
    displayCardsUnfiltered,
    reviewSrsMap,
    sidebarTab
  })

  const [navOpen, setNavOpen] = useState(false)

  // The projects view's own state + search + scope (keyword/date-range, active
  // project/section, batch selection, pagination, the derived display list).
  const {
    allProjectCards,
    setAllProjectCards,
    keyword,
    setKeyword,
    dateRange,
    setDateRange,
    activeProjectId,
    setActiveProjectId,
    activeSectionByProject,
    setActiveSectionByProject,
    expandedNav,
    setExpandedNav,
    selectMode,
    setSelectMode,
    selectedIds,
    setSelectedIds,
    confirmDeleteId,
    setConfirmDeleteId,
    confirmBatchDelete,
    setConfirmBatchDelete,
    createDialogOpen,
    setCreateDialogOpen,
    projectDeleteTarget,
    setProjectDeleteTarget,
    setVisibleCount,
    activeSectionId,
    visibleProjectCards,
    displayCards,
    displayedItems,
    hasMore,
    onSearch
  } = useProjectsView({
    allProjectCardsUnfiltered,
    resolveDisplay,
    draftByOriginal
  })
  onSearchRef.current = onSearch

  // Shared "open a project" action — used by the tree's row click + the
  // project-hub tiles (kept in ONE place so the two paths never diverge).
  const activateProject = useCallback(
    (id: string) => {
      setSelectedIds([])
      setSelectMode(false)
      setActiveProjectId(id)
      setNavOpen(true)
      onSearch(id)
      sendMessage({ kind: "set-recent-project", projectId: id }).catch(() => {})
    },
    [setSelectedIds, setSelectMode, setActiveProjectId, onSearch]
  )

  const {
    projects,
    newProjectName,
    projectError,
    loadProjects,
    setNewProjectName,
    setProjectError,
    handleCreateProject,
    handleRenameProject,
    handleUpdateNote,
    handleDeleteProject,
    handleAddSection,
    handleRenameSection,
    handleDeleteSection,
    handleMoveSection
  } = useProjects({
    onActivate: activateProject,
    onDeactivate: (id?: string) => {
      setSelectedIds([])
      setSelectMode(false)
      setActiveProjectId(null)
      setNavOpen(false)
      setKeyword("")
      setDateRange(null)
      if (id) {
        setActiveSectionByProject((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      }
      // The keyword/date setters above are queued (not committed) — searching
      // now would read the STALE keyword/dateRange. Reset the result directly;
      // the effect below re-runs the search with the cleared scope.
      setAllProjectCards([])
      setVisibleCount(ITEMS_PER_PAGE)
    }
  })
  loadProjectsRef.current = loadProjects

  // A system project has a flat, managed structure. Clear a legacy persisted
  // section selection so it can never reopen through the ordinary
  // "未分类" scope that is intentionally hidden from its navigation.
  useEffect(() => {
    const active = projects.find((project) => project.id === activeProjectId)
    if (active?.systemKind !== "vocabulary" || !activeSectionId) return
    setActiveSectionByProject((previous) => ({
      ...previous,
      [active.id]: null
    }))
  }, [projects, activeProjectId, activeSectionId, setActiveSectionByProject])

  // The review / todo / backup views' own state (filters, selection, edit flow).
  const reviewView = useReviewView()
  const { setReviewTitlePending: reviewSetTitlePending } = reviewView
  // A todo's linked card chip → jump to its project + highlight it (mirrors
  // handleJumpToProject but for a plain project card).
  const handleJumpToCard = useCallback(
    (cardId: string) => {
      const card = allProjectCardsUnfiltered.find((c) => c.id === cardId)
      if (!card) return
      navigate("projects")
      setKeyword("")
      setDateRange(null)
      setActiveProjectId(card.projectId)
      setActiveSectionByProject((prev) => ({
        ...prev,
        [card.projectId]: card.sectionId ?? "__unclassified__"
      }))
      setProjectCardHighlightId(card.id)
      if (projectCardHighlightTimer.current)
        window.clearTimeout(projectCardHighlightTimer.current)
      projectCardHighlightTimer.current = window.setTimeout(() => {
        setProjectCardHighlightId(null)
        projectCardHighlightTimer.current = null
      }, 2000)
    },
    [
      allProjectCardsUnfiltered,
      navigate,
      setActiveProjectId,
      setActiveSectionByProject,
      setDateRange,
      setKeyword
    ]
  )
  const {
    activeTab,
    setActiveTab,
    todoFilter,
    setTodoFilter,
    todoEditingId,
    setTodoEditingId,
    focusNewTaskId,
    setFocusNewTaskId,
    todoDeleteTarget,
    setTodoDeleteTarget,
    filteredTodos,
    handleNewTodo,
    handleStartEditTodo,
    handleQuickAdd,
    handleToggleTodoTask,
    handleSaveTodo,
    handleDeleteTodo,
    readLaterFilter,
    setReadLaterFilter,
    readLaterEditingId,
    setReadLaterEditingId,
    readLaterDeleteTarget,
    setReadLaterDeleteTarget,
    activeReadLater,
    doneReadLater,
    handleNewReadLater,
    handleStartEditReadLater,
    handleSaveReadLater,
    handleDeleteReadLater,
    handleStartRead,
    handleMarkDone,
    handleOpenReadLater,
    handleOpenTodoLink
  } = useTodoView({
    allTodos,
    allReadLater,
    navigate,
    onToast: setSnackbarMsg,
    onOpenPdf: openPdf,
    onJumpToCard: handleJumpToCard
  })
  const {
    backupSelectedIds,
    backupScope,
    setBackupScope,
    backupKeyword,
    setBackupKeyword,
    backupSelectedPdfIds,
    handleBackupToggleSelect,
    handleBackupSelectAll
  } = useBackupView({ projects, pdfs })

  const {
    dueCount,
    reviewStats,
    recentDates,
    reviewDateItems,
    handleExitReview,
    handleReviewDateClick,
    todayRatings,
    streakDays
  } = useReview({
    allItemsUnfiltered: displayCardsUnfiltered,
    onSearch,
    sidebarTab,
    setSidebarTab: navigate,
    setReviewItems,
    reviewDateFilter: reviewView.reviewDateFilter,
    setReviewDateFilter: reviewView.setReviewDateFilter,
    reviews: allReviews
  })

  const cardFirstRating = useMemo(() => {
    const m = new Map<string, 1 | 2 | 3>()
    if (!reviewView.reviewDateFilter) return m
    for (const [itemId, srs] of reviewSrsMap) {
      if (!srs.reviewHistory) continue
      const entry = srs.reviewHistory.find(
        (e) => dayKey(e.date) === reviewView.reviewDateFilter
      )
      if (entry) m.set(itemId, Math.min(entry.rating, 3) as 1 | 2 | 3)
    }
    return m
  }, [reviewView.reviewDateFilter, reviewSrsMap])

  const filteredDateItems = useMemo(() => {
    if (!reviewView.ratingFilter) return reviewDateItems
    return reviewDateItems.filter(
      (item) => cardFirstRating.get(item.id) === reviewView.ratingFilter
    )
  }, [reviewDateItems, reviewView.ratingFilter, cardFirstRating])

  // Mount: initial load
  useEffect(() => {
    onSearch()
    loadTodos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Immediate search for non-keyword filter changes — the keyword change is
  // handled by the debounced effect below; reading onSearch via a ref keeps
  // this effect from firing on every keystroke (double-search).
  const immediateSearchRef = useRef(onSearch)
  immediateSearchRef.current = onSearch
  useEffect(() => {
    immediateSearchRef.current()
  }, [activeProjectId, dateRange])

  // Debounced search for keyword (avoids per-keystroke queries).
  // Projects are strictly isolated: without an active project the search bar
  // filters the project hub by name/note instead of searching cards.
  useEffect(() => {
    if (!activeProjectId) return
    const t = setTimeout(() => {
      onSearch()
    }, 300)
    return () => clearTimeout(t)
  }, [keyword, activeProjectId, onSearch])

  // Clear selection when the search scope changes so batch ops never act on
  // cards hidden by a new keyword/date range.
  useEffect(() => {
    setSelectedIds([])
  }, [keyword, dateRange, activeProjectId, setSelectedIds])

  const handleToggleDrawer = () => {
    toggleDrawer()
  }

  const handleOpenProject = (id: string) => activateProject(id)

  // Active section in the current project (sidebar tree -> main area).

  const onDelete = useCallback(
    (id: string) => {
      const card = allProjectCardsUnfiltered.find((c) => c.id === id)
      if (card?.pdfVocabularyCardId) {
        setSnackbarMsg("请在 PDF 生词卡中管理词条")
        return
      }
      setConfirmDeleteId(id)
      setDeleteTargetIsPdf(Boolean(card?.pdfCardId))
    },
    [
      allProjectCardsUnfiltered,
      setConfirmDeleteId,
      setDeleteTargetIsPdf,
      setSnackbarMsg
    ]
  )

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return
    try {
      // A placed PDF-sourced card is ALSO the PDF annotation card — deleting it
      // from the project must only remove the placement (the annotation stays).
      const card = allProjectCardsUnfiltered.find(
        (c) => c.id === confirmDeleteId
      )
      if (card?.pdfCardId) {
        await unplacePdfCards([card.pdfCardId])
        setSnackbarMsg("已从项目移出（PDF 批注保留）")
      } else {
        await deleteProjectCard(confirmDeleteId)
      }
      setConfirmDeleteId(null)
      onSearch()
    } catch (e) {
      console.warn("[lime] delete failed:", e)
      setSnackbarMsg("删除失败", "error")
    }
  }

  const loadMore = useCallback(() => {
    if (!hasMore) return
    setVisibleCount((c) => Math.min(c + ITEMS_PER_PAGE, allProjectCards.length))
  }, [hasMore, allProjectCards.length, setVisibleCount])

  // Keep a stable ref to the latest loadMore function so the observer
  // effect doesn't need to re-create the IntersectionObserver on every data change.
  const loadMoreRefCallback = useRef(loadMore)
  loadMoreRefCallback.current = loadMore

  useEffect(() => {
    // The load-more sentinel only exists when these all hold; the observer
    // must be (re)created whenever its presence changes — otherwise the
    // spinner renders but nothing triggers loadMore (was: only [hasMore]).
    const sentinelVisible =
      hasMore && !!activeProjectId && Boolean(keyword || dateRange)
    if (!sentinelVisible) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          loadMoreRefCallback.current()
        }
      },
      { threshold: 0.1 }
    )
    const currentRef = loadMoreRef.current
    if (currentRef) {
      observer.observe(currentRef)
    }
    return () => {
      if (currentRef) {
        observer.unobserve(currentRef)
      }
    }
  }, [hasMore, activeProjectId, keyword, dateRange])

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return
    setConfirmBatchDelete(true)
  }

  const handleBatchMerge = () => {
    if (selectedIds.length < 2) return
    const items = displayCards.filter(
      (i) => selectedIds.includes(i.id) && !i.pdfVocabularyCardId
    )
    if (items.length < 2) return
    setMergeState(items)
  }

  const handleConfirmMerge = async (
    mergedTitle: string,
    separator: MergeSeparator
  ) => {
    if (!mergeState || !activeProjectId) return

    const selectedItems = mergeState

    // Merge the RESOLVED content (a placed card's body lives on its pdfCard;
    // the placement itself carries none) — the merged card becomes a plain
    // 自建卡片 with the combined quotes.
    const mergedContent = buildMergedContent(selectedItems, separator)

    // Merge images (dedup by URL)
    const allImages: string[] = []
    for (const item of selectedItems) {
      if (item.images) {
        for (const url of item.images) {
          if (!allImages.includes(url)) allImages.push(url)
        }
      }
    }

    // Inherit sectionId if all same
    const firstSectionId = selectedItems[0].sectionId
    const sameSection = selectedItems.every(
      (i) => i.sectionId === firstSectionId
    )
    const mergedSectionId =
      sameSection && firstSectionId ? firstSectionId : undefined

    const newCard = buildProjectCard({
      type: "text",
      title: mergedTitle.trim(),
      content: mergedContent,
      projectId: activeProjectId,
      images: allImages,
      ...(mergedSectionId ? { sectionId: mergedSectionId } : {})
    })
    try {
      // Place the merged card last in its scope (auto-order) + give it a dedup
      // hash so future captures of the same text collapse (addProjectCard-level).
      const readyCard = await ensureOrder(newCard)
      const readyWithHash = {
        ...readyCard,
        hash: await computeItemHash(readyCard.content, "", allImages)
      }

      // Atomic transaction: insert new + delete originals + cleanup reviews.
      // A placed original ALSO loses its placement — its pdfCard's reverse
      // reference is cleared so the 1:1 placement invariant holds.
      await tx(
        {
          projectCards: "readwrite",
          pdfCards: "readwrite",
          reviews: "readwrite"
        },
        async (stores) => {
          await new Promise<void>((resolve, reject) => {
            const req = stores.projectCards.put(readyWithHash)
            req.onsuccess = () => resolve()
            req.onerror = () => reject(req.error)
          })
          for (const card of selectedItems) {
            if (card.pdfCardId) {
              const gr = stores.pdfCards.get(card.pdfCardId)
              const pdfCard = await new Promise<PdfCard | undefined>(
                (resolve) => {
                  gr.onsuccess = () => resolve(gr.result as PdfCard | undefined)
                  gr.onerror = () => resolve(undefined)
                }
              )
              if (pdfCard && pdfCard.projectCardId === card.id) {
                await new Promise<void>((resolve, reject) => {
                  const pr = stores.pdfCards.put({
                    ...pdfCard,
                    projectCardId: undefined
                  })
                  pr.onsuccess = () => resolve()
                  pr.onerror = () => reject(pr.error)
                })
              }
            }
            const rk = stores.reviews.index("itemId").getKey(card.id)
            const key = await new Promise<string | null>((resolve) => {
              rk.onsuccess = () => resolve((rk.result as string) ?? null)
              rk.onerror = () => resolve(null)
            })
            if (key) stores.reviews.delete(key)
            stores.projectCards.delete(card.id)
          }
        }
      )
    } catch (e) {
      console.warn("[lime] merge failed:", e)
      setSnackbarMsg("合并失败", "error")
      return
    }

    setMergeState(null)
    setSelectedIds([])
    setSelectMode(false)
    // The DB writes broadcast _dbi/_dbp — the broadcast listener refreshes the
    // grid; no explicit full refresh here (R5: single refresh source).
    setSnackbarMsg(`已合并为「${mergedTitle}」`)
  }

  const handleConfirmBatchDelete = async () => {
    try {
      // Route placed cards through unplace (their pdfCard + annotation survive);
      // plain cards are deleted outright. Both delete the placement's review.
      const placedPdfCardIds: string[] = []
      const plainIds: string[] = []
      for (const id of selectedIds) {
        const card = allProjectCardsUnfiltered.find((c) => c.id === id)
        if (card?.pdfVocabularyCardId) continue
        if (card?.pdfCardId) placedPdfCardIds.push(card.pdfCardId)
        else plainIds.push(id)
      }
      if (placedPdfCardIds.length > 0) await unplacePdfCards(placedPdfCardIds)
      if (plainIds.length > 0) await deleteProjectCards(plainIds)
      setSelectMode(false)
      setSelectedIds([])
      setConfirmBatchDelete(false)
      onSearch()
    } catch (e) {
      console.warn("[lime] batch delete failed:", e)
      setSnackbarMsg("批量删除失败", "error")
    }
  }

  const handleToggleReview = useCallback(
    async (itemId: string) => {
      const card = allProjectCardsUnfiltered.find((i) => i.id === itemId)
      if (!card) return
      if (card.pdfVocabularyCardId) return
      // Drafts are intermediate states — never reviewable.
      if (card.isDraft) {
        setSnackbarMsg("草稿不可加入复习", "error")
        return
      }

      // If already in review, remove it
      if (reviewItemIds.has(itemId)) {
        await removeReview(itemId)
        setReviewItemIds((prev) => {
          const next = new Set(prev)
          next.delete(itemId)
          return next
        })
        setSnackbarMsg("已移出复习")
        return
      }

      // If no title, prompt for one
      if (!card.title) {
        reviewSetTitlePending(itemId)
        return
      }

      // Has title → add directly
      await addReview(createReviewEntry(itemId, card.projectId))
      setReviewItemIds((prev) => new Set(prev).add(itemId))
      setSnackbarMsg("已加入复习")
    },
    [
      setSnackbarMsg,
      allProjectCardsUnfiltered,
      reviewItemIds,
      setReviewItemIds,
      reviewSetTitlePending
    ]
  )

  const handleReReview = useCallback(
    async (itemId: string) => {
      const srs = reviewSrsMap.get(itemId)
      if (!srs || !masteredItemIds.has(itemId)) return
      // Demote back to active (keep SRS) and make it due now.
      await updateReviewSrs(itemId, {
        ...srs,
        interval: 1,
        dueDate: Date.now(),
        lastReviewDate: Date.now()
      })
      setSnackbarMsg("已重新加入复习")
    },
    [setSnackbarMsg, reviewSrsMap, masteredItemIds]
  )

  const {
    backupFileInputRef,
    handleExportBackup,
    handleUploadSync,
    handleDownloadSync
  } = useBackupSync({
    projects,
    allItemsUnfiltered: allProjectCardsUnfiltered,
    backupScope,
    backupSelectedIds,
    backupSelectedPdfIds,
    syncStatus,
    setSyncStatus,
    setSnackbarMsg
  })

  const handleImportBackupFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const result = await importFromZip(
        file,
        backupSelectedIds.length > 0 ? backupSelectedIds : undefined
      )
      const msg = `导入完成：成功 ${result.imported} 条`
      const skipMsg = result.skipped > 0 ? `，跳过 ${result.skipped} 条` : ""
      if (result.errors.length > 0) {
        console.warn("[lime] 导入跳过/失败的条目：", result.errors)
      }
      setSnackbarMsg(msg + skipMsg)
      // Import writes broadcast every store stamp — the per-stamp listeners
      // reload each source; no explicit full refresh (R5).
    } catch (err) {
      console.error("[lime] 导入失败：", err)
      setSnackbarMsg(`导入失败：${err}`, "error")
    } finally {
      if (backupFileInputRef.current) {
        backupFileInputRef.current.value = ""
      }
    }
  }

  const headerHeight = 52

  // ---- Card selection ----
  const onToggleSelectMode = useCallback(() => {
    setSelectedIds([])
    setSelectMode((prev) => !prev)
  }, [setSelectedIds, setSelectMode])

  // ---- Section handlers ----
  const toggleExpanded = useCallback(
    (id: string) => {
      setExpandedNav((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    [setExpandedNav]
  )

  const addSectionWithTitle = useCallback(
    async (parentId: string | null, title: string) => {
      if (!activeProjectId) return
      await handleAddSection(activeProjectId, title, parentId)
      setExpandedNav((prev) => {
        const next = new Set(prev)
        next.add(parentId ?? activeProjectId)
        return next
      })
    },
    [activeProjectId, handleAddSection, setExpandedNav]
  )

  const onRenameSection = useCallback(
    (sectionId: string, title: string) => {
      if (!activeProjectId) return
      handleRenameSection(activeProjectId, sectionId, title)
    },
    [activeProjectId, handleRenameSection]
  )

  const onDeleteSectionCb = useCallback(
    (sectionId: string, cardCount: number, subSectionCount: number) => {
      if (!activeProjectId) return
      setPendingSectionDelete({ sectionId, cardCount, subSectionCount })
    },
    [activeProjectId]
  )

  const confirmDeleteSection = useCallback(async () => {
    if (!activeProjectId || !pendingSectionDelete) return
    const { sectionId } = pendingSectionDelete
    await handleDeleteSection(activeProjectId, sectionId)
    setPendingSectionDelete(null)
    setActiveSectionByProject((prev) => {
      const cur = prev[activeProjectId] ?? null
      if (!cur) return prev
      const secs =
        projects.find((p) => p.id === activeProjectId)?.sections ?? []
      const deleted = secs.find((s) => s.id === sectionId)
      const affected =
        sectionId === cur ||
        (deleted?.level === 1 &&
          secs.some(
            (s) => s.level === 2 && s.parentId === sectionId && s.id === cur
          ))
      if (!affected) return prev
      return { ...prev, [activeProjectId]: null }
    })
  }, [
    activeProjectId,
    handleDeleteSection,
    pendingSectionDelete,
    projects,
    setActiveSectionByProject
  ])

  const onMoveSection = useCallback(
    (sectionId: string, newParentId: string | null, newOrder: number) => {
      if (!activeProjectId) return
      handleMoveSection(activeProjectId, sectionId, newParentId, newOrder)
    },
    [activeProjectId, handleMoveSection]
  )

  const onMoveCard = useCallback(
    async (
      itemId: string,
      targetSectionId: string | null,
      targetOrder: number
    ) => {
      if (!activeProjectId) return
      const origSectionId =
        allProjectCards.find((i) => i.id === itemId)?.sectionId ?? null
      const sectionCards = allProjectCards.filter((i) =>
        targetSectionId ? i.sectionId === targetSectionId : !i.sectionId
      )
      const sorted = sectionCards.slice().sort(compareCards)
      const filtered = sorted.filter((i) => i.id !== itemId)
      filtered.splice(targetOrder, 0, {
        ...allProjectCards.find((i) => i.id === itemId)!,
        sectionId: targetSectionId ?? undefined
      })
      const updates = filtered.map((card, idx) => ({
        id: card.id,
        sectionId: targetSectionId ?? undefined,
        order: idx
      }))
      await batchUpdateProjectCards(updates)
      // The tx broadcasts _dbi — the listener refreshes the cards + grid.
      // Only toast when the card actually moved to another section — a
      // same-section reorder is its own visual feedback.
      if ((origSectionId ?? null) !== (targetSectionId ?? null)) {
        const proj = projects.find((p) => p.id === activeProjectId)
        const section = proj?.sections?.find((s) => s.id === targetSectionId)
        setSnackbarMsg(
          section ? `已移动到「${section.title}」` : "已移动到未分类"
        )
      }
    },
    [setSnackbarMsg, activeProjectId, allProjectCards, projects]
  )

  // Load LXGW WenKai font from CDN
  useEffect(() => {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href =
      "https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.1.0/style.css"
    document.head.appendChild(link)
    return () => link.remove()
  }, [])

  useEffect(() => {
    loadPdfs()
    // Empty user-created topics (no PDFs carry them yet) persist in storage.
    chrome.storage.local.get("_pdfTopics").then((data) => {
      const t = (data._pdfTopics as string[]) ?? []
      if (t.length > 0) setExtraTopics(t)
    })
  }, [loadPdfs])

  const topics = useMemo(() => {
    const all = new Set<string>(extraTopics)
    for (const p of pdfs) if (p.topic) all.add(p.topic)
    return [...all]
  }, [extraTopics, pdfs])

  const saveExtraTopics = useCallback((list: string[]) => {
    setExtraTopics(list)
    chrome.storage.local.set({ _pdfTopics: list })
  }, [])

  const handleNewTopic = useCallback(
    (name: string) => {
      if (!name || extraTopics.includes(name)) return
      saveExtraTopics([...extraTopics, name])
    },
    [extraTopics, saveExtraTopics]
  )

  const handleRenameTopic = useCallback(
    async (oldName: string, newName: string) => {
      await renamePdfTopic(oldName, newName)
      saveExtraTopics(extraTopics.map((t) => (t === oldName ? newName : t)))
    },
    [extraTopics, saveExtraTopics]
  )

  const handleDeleteTopic = useCallback((topic: string) => {
    setTopicDeleteTarget(topic)
  }, [])

  const handleMovePdf = useCallback(async (pdfId: string, topic?: string) => {
    await updatePdfTopic(pdfId, topic)
    // The _dbpdf broadcast reloads the PDF library.
  }, [])

  const confirmDeleteTopic = useCallback(async () => {
    if (!topicDeleteTarget) return
    await clearPdfTopic(topicDeleteTarget)
    saveExtraTopics(extraTopics.filter((t) => t !== topicDeleteTarget))
    setTopicDeleteTarget(null)
  }, [topicDeleteTarget, extraTopics, saveExtraTopics])

  const pdfFileInputRef = useRef<HTMLInputElement>(null)
  const handleOpenPdf = openPdf
  const handleClosePdf = useCallback(
    (id: string) => {
      closePdf(id)
      setPdfOutlineDest(null)

      const closedPdf = pdfs.find((p) => p.id === id)
      setPdfHubTopicView(closedPdf?.topic ?? PDF_UNCLASSIFIED_TOPIC)
    },
    [closePdf, pdfs]
  )

  // PdfCardsPanel card click → open the PDF (if needed) + flash the annotation.
  const handlePanelCardClick = useCallback(
    (card: PdfCard) => {
      // The right panel only renders in the PDF view, so no tab switch + no
      // drawer open — forcing openDrawer() here was auto-opening the left
      // sidebar on every card click.
      openPdf(card.pdfId)
      pdfFlashToken.current += 1
      setPdfFlashTarget({
        page: card.page,
        annId: card.annotationId,
        token: pdfFlashToken.current
      })
      // Brief bidirectional selection: the card + its PDF mark stay highlighted
      // together for ~2s then auto-dismiss.
      setPdfSelected(card.annotationId)
      // Highlight the clicked card in the panel too (bidirectional border).
      pdfScrollToken.current += 1
      setPdfScrollTarget({ cardId: card.id, token: pdfScrollToken.current })
    },
    [openPdf, setPdfSelected]
  )

  // Project card's PDF-source footer → jump to the PDF + flash its annotation.
  // The display card carries `pdfSource` (pdfId + page); the annotation id is
  // looked up from the linked pdfCard (the placement↔pdfCard 1:1 reference).
  const handleOpenPdfFromCard = useCallback(
    (card: DisplayCard) => {
      if (!card.pdfSource) return
      navigate("pdf")
      setPdfSidebarView("cards")
      setPdfCardsOpen(true)
      openPdf(card.pdfSource.pdfId)
      if (card.vocabularySource) {
        // Vocabulary flashes are independent of annotation selection. Clear
        // stale ordinary-annotation navigation state before opening the PDF.
        setPdfFlashTarget(null)
        setPdfSelected(null)
        setPdfScrollTarget(null)
        pdfVocabularyFlashToken.current += 1
        setPdfVocabularyFlashTarget({
          page: card.pdfSource.page,
          rects: card.vocabularySource.rects,
          token: pdfVocabularyFlashToken.current
        })
        return
      }
      const pdfCard = card.pdfCardId ? pdfById.get(card.pdfCardId) : undefined
      pdfFlashToken.current += 1
      setPdfFlashTarget({
        page: card.pdfSource.page,
        annId: pdfCard?.annotationId ?? "",
        token: pdfFlashToken.current
      })
      setPdfSelected(pdfCard?.annotationId ?? null)
      // Also scroll + highlight the matching sidebar card.
      pdfScrollToken.current += 1
      setPdfScrollTarget({
        cardId: pdfCard?.id ?? "",
        token: pdfScrollToken.current
      })
    },
    [openPdf, navigate, pdfById, setPdfSelected]
  )

  // PdfView annotation popover "跳转卡片" → scroll the panel to that card.
  const handleJumpInPanel = useCallback((cardId: string) => {
    pdfScrollToken.current += 1
    setPdfScrollTarget({ cardId, token: pdfScrollToken.current })
  }, [])

  // The engine's selector selection (mark click OR empty-click deselect) →
  // mirrors it into the panel's card highlight (auto-dismisses after 2s).
  const handlePdfAnnotationSelected = useCallback(
    (annId: string | null) => {
      setPdfSelected(annId)
      // Clicking an annotation should surface its card in the right panel —
      // open the cards sidebar (the selected card auto-scrolls + highlights).
      // Never close the panel on the 2s auto-clear (null).
      if (annId) {
        setPdfSidebarView("cards")
        setPdfCardsOpen(true)
      }
    },
    [setPdfSelected]
  )

  // PdfCardsPanel "切换批注类型" → the engine rebuilds the mark + emits
  // onAnnotationChanged (saves the new type + konvaString).
  const handlePdfTypeChange = useCallback(
    (card: PdfCard, type: "highlight" | "underline" | "strike") => {
      pdfTypeChangeToken.current += 1
      setPdfTypeChangeTarget({
        id: card.annotationId,
        type: type === "highlight" ? 1 : type === "underline" ? 3 : 2,
        seq: pdfTypeChangeToken.current
      })
    },
    []
  )

  // Place PDF-sourced cards into a project (未分类) / unplace back to PDF-only.
  const handleCardWorkspaceClose = useCallback(
    () => closeCardWorkspace(),
    [closeCardWorkspace]
  )

  const handleCardWorkspaceSave = useCallback(
    async (values: CardEditorValues, type: "text" | "image" | "placed") => {
      const ws = cardWorkspace
      if (!ws) return
      if (
        ws.view === "create" &&
        projects.some(
          (project) =>
            project.id === activeProjectId && Boolean(project.systemKind)
        )
      ) {
        setSnackbarMsg("系统项目只显示自动生成的特殊卡片")
        closeCardWorkspace()
        return
      }
      if (ws.card?.pdfVocabularyCardId) {
        setSnackbarMsg("请在 PDF 生词卡中管理词条")
        closeCardWorkspace()
        return
      }
      const sectionId =
        ws.view === "create"
          ? activeSectionId && activeSectionId !== "__unclassified__"
            ? activeSectionId
            : undefined
          : ws.card?.sectionId
      try {
        if (ws.view === "create") {
          if (type === "image") {
            // An image card is invalid without the uploaded image — stay in
            // the editor instead of silently "succeeding" with no card.
            if (!values.image) {
              setSnackbarMsg("请先上传图片", "error")
              return
            }
            await createImageCard({
              title: values.title?.trim() || undefined,
              image: values.image,
              comment: values.comment?.trim() || undefined,
              projectId: activeProjectId ?? "",
              sectionId
            })
          } else {
            await createTextCard({
              title: values.title?.trim() || undefined,
              content: values.content ?? "",
              comment: values.comment?.trim() || undefined,
              projectId: activeProjectId ?? "",
              sectionId
            })
          }
        } else if (ws.card?.isDraft) {
          // editing a draft → persist the values + promote (write back/create)
          const draftId = await saveDraftCard({
            draftOf: ws.card.draftOf,
            type: type === "image" ? "image" : "text",
            title: values.title?.trim() || undefined,
            content: values.content ?? "",
            image: values.image,
            comment: values.comment?.trim() || undefined,
            projectId: ws.card.projectId,
            sectionId: ws.card.sectionId
          })
          if (draftId) await promoteDraft(draftId)
        } else if (ws.card) {
          // editing a normal card → write directly (placed splits the comment)
          const updated: ProjectCard = {
            ...ws.card,
            title: values.title?.trim() || undefined,
            content: values.content ?? ws.card.content,
            image: values.image,
            comment: values.comment?.trim() || undefined,
            updatedAt: Date.now()
          }
          if (ws.card.pdfCardId) {
            await updateProjectCard(
              stripPlacementContent({ ...ws.card, title: updated.title })
            )
            const pdfCard = pdfById.get(ws.card.pdfCardId)
            const newComment = updated.comment?.trim() || undefined
            if (
              pdfCard &&
              newComment !== (pdfCard.comment?.trim() || undefined)
            ) {
              await updatePdfCard({ ...pdfCard, comment: newComment })
            }
          } else {
            await updateProjectCard(stripPlacementContent(updated))
          }
        }
      } catch (e) {
        console.warn("[lime] card save failed:", e)
      }
      closeCardWorkspace()
      onSearch()
    },
    [
      setSnackbarMsg,
      cardWorkspace,
      projects,
      activeProjectId,
      activeSectionId,
      pdfById,
      onSearch,
      closeCardWorkspace
    ]
  )

  const handleCardWorkspaceSaveDraft = useCallback(
    async (values: CardEditorValues, type: "text" | "image" | "placed") => {
      const ws = cardWorkspace
      if (!ws) return
      if (
        ws.view === "create" &&
        projects.some(
          (project) =>
            project.id === activeProjectId && Boolean(project.systemKind)
        )
      ) {
        setSnackbarMsg("系统项目不能新建草稿")
        closeCardWorkspace()
        return
      }
      if (ws.card?.pdfVocabularyCardId) {
        setSnackbarMsg("生词卡不能保存为草稿")
        closeCardWorkspace()
        return
      }
      const sectionId =
        ws.view === "create"
          ? activeSectionId && activeSectionId !== "__unclassified__"
            ? activeSectionId
            : undefined
          : ws.card?.sectionId
      try {
        if (ws.view === "create") {
          await saveDraftCard({
            type: type === "image" ? "image" : "text",
            title: values.title?.trim() || undefined,
            content: values.content ?? "",
            image: values.image,
            comment: values.comment?.trim() || undefined,
            projectId: activeProjectId ?? "",
            sectionId
          })
        } else if (ws.card) {
          await saveDraftCard({
            draftOf: ws.card.isDraft ? ws.card.draftOf : ws.card.id,
            type: type === "image" ? "image" : "text",
            title: values.title?.trim() || undefined,
            content: values.content ?? "",
            image: values.image,
            comment: values.comment?.trim() || undefined,
            projectId: ws.card.projectId,
            sectionId: ws.card.sectionId
          })
        }
      } catch (e) {
        console.warn("[lime] card draft failed:", e)
      }
      closeCardWorkspace()
      onSearch()
    },
    [
      setSnackbarMsg,
      cardWorkspace,
      projects,
      activeProjectId,
      activeSectionId,
      onSearch,
      closeCardWorkspace
    ]
  )

  const handleCardWorkspaceDiscard = useCallback(() => {
    const ws = cardWorkspace
    if (ws?.card?.isDraft) {
      discardDraft(ws.card.id).catch((e) =>
        console.warn("[lime] discard draft failed:", e)
      )
    }
    closeCardWorkspace()
    onSearch()
  }, [cardWorkspace, onSearch, closeCardWorkspace])

  const handlePlaceCards = useCallback(
    async (cardIds: string[], projectId: string) => {
      const project = projects.find((p) => p.id === projectId)
      try {
        await placePdfCards(cardIds, projectId)
        setSnackbarMsg(
          `已置入 ${cardIds.length} 张卡片到「${project?.name ?? ""}」`
        )
        // The placement happens in the pdf view, where the full reload is
        // gated off — refresh the search scope right away when the target
        // project is the one on screen so the new cards appear immediately.
        if (projectId === activeProjectId) onSearch()
      } catch (e) {
        console.warn("[lime] place failed:", e)
        setSnackbarMsg("置入失败，请重试", "error")
      }
    },
    [setSnackbarMsg, projects, activeProjectId, onSearch]
  )

  const handleCreateProjectAndPlace = useCallback(
    async (name: string, cardIds: string[]) => {
      const existing = await getProjectByName(name)
      if (existing) {
        setSnackbarMsg("项目名已存在")
        return false
      }
      const projectId = crypto.randomUUID()
      try {
        await addProject({ id: projectId, name, createdAt: Date.now() })
        await placePdfCards(cardIds, projectId)
        setSnackbarMsg(`已新建项目「${name}」并置入 ${cardIds.length} 张卡片`)
        loadProjects()
        return true
      } catch (e) {
        console.warn("[lime] create+place failed:", e)
        // Roll back the half-created project so no empty project is left behind.
        try {
          await deleteProject(projectId)
        } catch {}
        setSnackbarMsg("新建项目失败，请重试", "error")
        return false
      }
    },
    [setSnackbarMsg, loadProjects]
  )
  const handleUnplaceCards = useCallback(
    async (cardIds: string[]) => {
      try {
        await unplacePdfCards(cardIds)
        setSnackbarMsg(`已移出 ${cardIds.length} 张卡片（PDF 批注保留）`)
      } catch (e) {
        console.warn("[lime] unplace failed:", e)
        setSnackbarMsg("移出失败，请重试", "error")
      }
    },
    [setSnackbarMsg]
  )

  // A pdfCard's project chip → jump to its placement's project + highlight it.
  // The placement lookup goes through the loaded placements (1:1 reverse ref).
  const handleJumpToProject = useCallback(
    (card: PdfCard) => {
      if (!card.projectCardId) return
      const placement = allProjectCardsUnfiltered.find(
        (c) => c.id === card.projectCardId
      )
      if (!placement) return
      navigate("projects")
      setKeyword("")
      setDateRange(null)
      setActiveProjectId(placement.projectId)
      setActiveSectionByProject((prev) => ({
        ...prev,
        [placement.projectId]: placement.sectionId ?? "__unclassified__"
      }))
      setProjectCardHighlightId(placement.id)
      if (projectCardHighlightTimer.current)
        window.clearTimeout(projectCardHighlightTimer.current)
      projectCardHighlightTimer.current = window.setTimeout(() => {
        setProjectCardHighlightId(null)
        projectCardHighlightTimer.current = null
      }, 2000)
    },
    [
      allProjectCardsUnfiltered,
      navigate,
      setActiveProjectId,
      setActiveSectionByProject,
      setDateRange,
      setKeyword
    ]
  )

  // Placement lookup for the cards panel: pdfCard.projectCardId → the
  // placement ProjectCard (the placed-chip jump + unplace routing).
  const placements = useMemo(() => {
    const m = new Map<string, ProjectCard>()
    for (const c of allProjectCardsUnfiltered) {
      if (c.pdfCardId) m.set(c.id, c)
    }
    return m
  }, [allProjectCardsUnfiltered])

  // The cards panel's delete: pdfCards + their annotations + placements'
  // reviews are removed together (deletePdfCards cascades) — the project side
  // never touches pdfCards (its delete only unplaces).
  const handleDeletePdfCards = useCallback(async (cards: PdfCard[]) => {
    await deletePdfCards(cards)
  }, [])

  const [pdfUrlOpen, setPdfUrlOpen] = useState(false)
  const [pdfUrlLoading, setPdfUrlLoading] = useState(false)

  // Best-effort web-PDF open: the background SW fetches the URL (host
  // permission <all_urls> — no CORS), validates the %PDF magic, returns bytes.
  const handleOpenPdfFromUrl = useCallback(
    async (url: string) => {
      setPdfUrlLoading(true)
      try {
        const res = await sendMessage<{
          ok: boolean
          name?: string
          body?: string
          error?: string
        }>({ kind: "fetch-pdf", url })
        if (!res?.ok) {
          setSnackbarMsg(res?.error ?? "获取 PDF 失败", "error")
          return
        }
        const bytes = new Blob([base64ToBytes(res.body ?? "")], {
          type: "application/pdf"
        })
        const pdf: PdfFile = {
          id: crypto.randomUUID(),
          name: res.name ?? "web.pdf",
          bytes,
          pageCount: 0,
          addedAt: Date.now()
        }
        const id = await addPdf(pdf)
        setPdfUrlOpen(false)
        openPdf(id)
        setSnackbarMsg("已从 URL 打开 PDF")
      } catch (e) {
        setSnackbarMsg(`获取 PDF 失败：${e}`, "error")
      } finally {
        setPdfUrlLoading(false)
      }
    },
    [setSnackbarMsg, openPdf]
  )

  const handleOpenPdfFile = useCallback(
    async (file: File) => {
      try {
        const bytes = new Blob([await file.arrayBuffer()], {
          type: "application/pdf"
        })
        const pdf: PdfFile = {
          id: crypto.randomUUID(),
          name: file.name,
          bytes,
          pageCount: 0,
          addedAt: Date.now()
        }
        const id = await addPdf(pdf)
        openPdf(id)
        // Opening the file that matches a synced placeholder attaches its notes.
        const annotations = await getAnnotationsByPdf(id)
        if (annotations.length > 0) {
          setSnackbarMsg(`已关联 ${annotations.length} 条批注`)
        }
      } catch (e) {
        console.warn("[lime] open pdf failed:", e)
      }
    },
    [setSnackbarMsg, openPdf]
  )

  const handleRenamePdf = useCallback(
    async (id: string, name: string) => {
      await renamePdfName(id, name)
      setSnackbarMsg("已重命名 PDF")
    },
    [setSnackbarMsg]
  )

  const handleSavePdfAiContext = useCallback(
    async (id: string, value: string) => {
      await updatePdfAiContext(id, value || undefined)
      setSnackbarMsg(value ? "已保存 PDF AI 上下文" : "已清空 PDF AI 上下文")
    },
    [setSnackbarMsg]
  )

  const handleDeletePdf = useCallback((pdf: PdfMetaLite) => {
    setPdfDeleteTarget(pdf)
  }, [])

  const confirmDeletePdf = useCallback(async () => {
    if (!pdfDeleteTarget) return
    await deletePdf(pdfDeleteTarget.id)
    closePdf(pdfDeleteTarget.id)
    setPdfDeleteTarget(null)
  }, [pdfDeleteTarget, closePdf])

  // ---- PDF library batch operations ----
  const togglePdfBatch = useCallback(() => {
    setPdfBatchSelectedIds([])
    setPdfBatchMode((prev) => !prev)
  }, [])

  const togglePdfBatchSelect = useCallback((id: string) => {
    setPdfBatchSelectedIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
    )
  }, [])

  const togglePdfBatchSelectAll = useCallback(() => {
    setPdfBatchSelectedIds((ids) =>
      ids.length === pdfs.length ? [] : pdfs.map((p) => p.id)
    )
  }, [pdfs])

  const handlePdfBatchMove = useCallback(
    async (topic?: string) => {
      const ids = pdfBatchSelectedIds
      for (const id of ids) await updatePdfTopic(id, topic).catch(() => {})
      setPdfBatchSelectedIds([])
      setPdfBatchMoveAnchor(null)
      setSnackbarMsg(`已移动 ${ids.length} 个 PDF`)
    },
    [setSnackbarMsg, pdfBatchSelectedIds]
  )

  const handleConfirmPdfBatchDelete = useCallback(async () => {
    const ids = pdfBatchSelectedIds
    for (const id of ids) {
      await deletePdf(id).catch(() => {})
      closePdf(id)
    }
    setConfirmPdfBatchDelete(false)
    setPdfBatchSelectedIds([])
    setPdfBatchMode(false)
    setSnackbarMsg(`已删除 ${ids.length} 个 PDF`)
  }, [setSnackbarMsg, pdfBatchSelectedIds, closePdf])

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null

  const otherProjects = useMemo(
    () => projects.filter((p) => p.id !== activeProjectId),
    [projects, activeProjectId]
  )

  // ---- Section view state (sidebar tree -> main area) ----
  // Count the VISIBLE cards (a draft replaces its original) so the sidebar
  // numbers match the grid — counting allProjectCards would double-count a
  // card whose edit-draft is hiding it.
  const countBySection = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of visibleProjectCards) {
      if (it.sectionId) m.set(it.sectionId, (m.get(it.sectionId) ?? 0) + 1)
    }
    return m
  }, [visibleProjectCards])

  const unclassifiedByProject = useMemo(() => {
    const m: Record<string, number> = {}
    for (const it of visibleProjectCards) {
      if (!it.sectionId) m[it.projectId] = (m[it.projectId] ?? 0) + 1
    }
    return m
  }, [visibleProjectCards])

  // The section scope as the PERSISTED projectCards (drag reorder + writes
  // operate on the originals) — the grid renders the resolved variant.
  const scopeCards = useMemo(() => {
    if (!activeSectionId)
      return sortAllCards(visibleProjectCards, activeProject?.sections ?? [])
    if (activeSectionId === "__unclassified__")
      return visibleProjectCards.filter((i) => !i.sectionId)
    const section = activeProject?.sections?.find(
      (s) => s.id === activeSectionId
    )
    if (section?.level === 1) {
      const childIds = new Set(
        (activeProject?.sections ?? [])
          .filter((s) => s.level === 2 && s.parentId === activeSectionId)
          .map((s) => s.id)
      )
      return visibleProjectCards.filter(
        (i) =>
          i.sectionId === activeSectionId ||
          (i.sectionId !== undefined && childIds.has(i.sectionId))
      )
    }
    return visibleProjectCards.filter((i) => i.sectionId === activeSectionId)
  }, [visibleProjectCards, activeSectionId, activeProject])

  const scopeItems = useMemo(
    () => scopeCards.map(resolveDisplay),
    [scopeCards, resolveDisplay]
  )
  // The card reader navigates the CURRENT view scope: review dates, full
  // search hits, or the visible section/project scope.
  const navList =
    sidebarTab === "review" && reviewView.reviewDateFilter
      ? filteredDateItems
      : keyword || dateRange
        ? displayCards
        : scopeItems

  const handleNavigate = useCallback(
    (direction: "prev" | "next") => {
      if (!dialogCard) return
      const idx = navList.findIndex((i) => i.id === dialogCard.id)
      if (idx === -1) return
      const nextIdx = direction === "prev" ? idx - 1 : idx + 1
      if (nextIdx < 0 || nextIdx >= navList.length) return
      setDialogCard(navList[nextIdx])
    },
    [dialogCard, navList]
  )

  const navIndex = dialogCard
    ? navList.findIndex((i) => i.id === dialogCard.id)
    : -1
  const hasPrev = navIndex > 0
  const hasNext = navIndex >= 0 && navIndex < navList.length - 1

  // Full breadcrumb path: project / L1 / L2
  const sectionPath = useMemo(() => {
    if (!activeSectionId || !activeProject) return []
    const sections = activeProject.sections ?? []
    if (activeSectionId === "__unclassified__")
      return [{ id: "__unclassified__", title: "未分类" }]
    const sec = sections.find((s) => s.id === activeSectionId)
    if (!sec) return []
    if (sec.level === 2) {
      const parent = sections.find((s) => s.id === sec.parentId)
      return parent ? [parent, sec] : [sec]
    }
    return [sec]
  }, [activeSectionId, activeProject])

  const handleSelectSection = useCallback(
    (sectionId: string | null) => {
      if (!activeProjectId) return
      setActiveSectionByProject((prev) => ({
        ...prev,
        [activeProjectId]: sectionId
      }))
      setSelectedIds([])
      setSelectMode(false)
    },
    [activeProjectId, setActiveSectionByProject, setSelectMode, setSelectedIds]
  )

  // Pointer-based card drag-reorder within the current scope (same section only).
  const {
    draggedId: cardDraggedId,
    drop: cardDrop,
    flipRectsRef,
    handleGripPointerDown
  } = useCardDragReorder({
    items: scopeCards,
    onMoveCard
  })

  // Persist tree/nav state across sessions
  useEffect(() => {
    chrome.storage.local.get("_uiNav", (data) => {
      const nav = data._uiNav as
        | {
            expanded?: string[]
            activeSectionByProject?: Record<string, string | null>
            width?: number
          }
        | undefined
      if (!nav) return
      if (nav.expanded) setExpandedNav(new Set(nav.expanded))
      if (nav.activeSectionByProject)
        setActiveSectionByProject(nav.activeSectionByProject)
      if (typeof nav.width === "number") setDrawerWidth(nav.width)
    })
    // Cards-panel UI state (open + width) persists per session.
    chrome.storage.local.get("_uiPdf", (data) => {
      const pdf = data._uiPdf as { open?: boolean; width?: number } | undefined
      if (!pdf) return
      if (typeof pdf.open === "boolean") setPdfCardsOpen(pdf.open)
      if (typeof pdf.width === "number") setPdfCardsWidth(pdf.width)
    })
  }, [setActiveSectionByProject, setExpandedNav])

  useEffect(() => {
    chrome.storage.local.set({
      _uiPdf: { open: pdfCardsOpen, width: pdfCardsWidth }
    })
  }, [pdfCardsOpen, pdfCardsWidth])

  useEffect(() => {
    chrome.storage.local.set({
      _uiNav: {
        expanded: [...expandedNav],
        activeSectionByProject,
        width: drawerWidth
      }
    })
  }, [expandedNav, activeSectionByProject, drawerWidth])

  const handleExportMarkdown = useCallback(
    async (projectId: string, sectionId?: string | null) => {
      const project = projects.find((p) => p.id === projectId)
      if (!project) return
      const data = buildScopeData(
        project,
        allProjectCardsUnfiltered,
        sectionId ?? null,
        allPdfCards
      )
      const { markdown, skippedImages } = buildProjectMarkdown(data)
      const filename =
        data.rootTitle.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) + ".md"
      const blob = new Blob([markdown], { type: "text/markdown" })
      const url = URL.createObjectURL(blob)
      try {
        await chrome.downloads.download({ url, filename })
      } finally {
        URL.revokeObjectURL(url)
      }
      setSnackbarMsg(
        skippedImages > 0
          ? `已导出 Markdown，跳过 ${skippedImages} 张内嵌图片`
          : "已导出 Markdown"
      )
    },
    [setSnackbarMsg, projects, allProjectCardsUnfiltered, allPdfCards]
  )

  /** Clone + insert one card into a project (dedup-aware). A placed card's
   *  copy carries its RESOLVED quote (the placement holds no content);
   *  cloneProjectCard drops the placement ref → a plain 自建卡片.
   *  Returns false when an identical card already exists in the target. */
  const copyCardToProject = useCallback(
    async (original: ProjectCard, targetProjectId: string) => {
      const display = displayCardsUnfiltered.find((c) => c.id === original.id)
      const source: ProjectCard =
        original.pdfCardId && display
          ? { ...original, content: display.content }
          : original
      const newCard = cloneProjectCard(source, targetProjectId)
      return addProjectCard(newCard)
    },
    [displayCardsUnfiltered]
  )

  const handleCopyCard = async (targetProjectId: string) => {
    if (!copyCardId) return
    const original = allProjectCardsUnfiltered.find((c) => c.id === copyCardId)
    if (!original) {
      setSnackbarMsg("卡片不存在，无法复制")
      setCopyCardId(null)
      onSearch()
      return
    }
    const saved = await copyCardToProject(original, targetProjectId)
    if (!saved) {
      setSnackbarMsg("目标项目已存在相同内容，跳过复制")
    } else {
      const proj = projects.find((p) => p.id === targetProjectId)
      setSnackbarMsg(`已复制到「${proj?.name ?? "目标项目"}」`)
    }
    setCopyCardId(null)
    onSearch()
  }

  // Move a card to a section of the active project (未分类 when sectionId is
  // null) — restores organizing captured/placed cards after the fact.
  const handleMoveCardConfirm = async (sectionId: string | null) => {
    if (!moveSectionCardId) return
    const card = allProjectCardsUnfiltered.find(
      (c) => c.id === moveSectionCardId
    )
    if (card) {
      const maxOrder = await getMaxOrderInSection(sectionId ?? undefined)
      await updateProjectCard(
        stripPlacementContent({
          ...card,
          sectionId: sectionId ?? undefined,
          order: maxOrder + 1
        })
      )
    }
    setMoveSectionCardId(null)
    onSearch()
  }

  // Batch move-to-section: the selected cards land in the target section
  // (or 未分类) with sequential orders after the section's current max.
  const handleBatchMoveConfirm = async (sectionId: string | null) => {
    if (selectedIds.length === 0) return
    const cards = allProjectCardsUnfiltered.filter((c) =>
      selectedIds.includes(c.id)
    )
    let runningMax = await getMaxOrderInSection(sectionId ?? undefined)
    const updates = cards.map((c) => {
      runningMax += 1
      return { id: c.id, sectionId: sectionId ?? undefined, order: runningMax }
    })
    await batchUpdateProjectCards(updates)
    setMoveMenu(null)
    setSelectMode(false)
    setSelectedIds([])
    onSearch()
  }

  // Inline 新建项目 for the copy dialog: create + return the new project's id
  // (null on failure). Name must be unique.
  const handleCreateProjectAndCopy = useCallback(
    async (name: string) => {
      const existing = await getProjectByName(name)
      if (existing) {
        setSnackbarMsg("项目名已存在")
        return null
      }
      const id = crypto.randomUUID()
      try {
        await addProject({ id, name, createdAt: Date.now() })
        return id
      } catch (e) {
        console.warn("[lime] create project failed:", e)
        setSnackbarMsg("新建项目失败，请重试", "error")
        return null
      }
    },
    [setSnackbarMsg]
  )

  const handleBatchCopyCards = async (targetProjectId: string) => {
    const proj = projects.find((p) => p.id === targetProjectId)
    let skipped = 0
    for (const id of selectedIds) {
      const original = allProjectCardsUnfiltered.find((c) => c.id === id)
      if (!original) continue
      const saved = await copyCardToProject(original, targetProjectId)
      if (!saved) skipped++
    }
    setCopyMenu(null)
    setSelectMode(false)
    setSelectedIds([])
    setSnackbarMsg(
      skipped > 0
        ? `已复制到「${proj?.name ?? "目标项目"}」，${skipped} 条重复跳过`
        : `已复制到「${proj?.name ?? "目标项目"}」`
    )
    onSearch()
  }

  // ---- Todo state & handlers (global view, newest first, not draggable) ----
  const today = todayLocalDate()

  const todoStats = useMemo(() => {
    let incomplete = 0
    let completed = 0
    let overdue = 0
    let todayCount = 0
    for (const t of allTodos) {
      if (isTodoComplete(t.content)) {
        completed++
      } else {
        incomplete++
      }
      const s = dueStatus(t.dueDate, today)
      if (s === "overdue") overdue++
      if (s === "today") todayCount++
    }
    return {
      total: allTodos.length,
      incomplete,
      completed,
      overdue,
      today: todayCount
    }
  }, [allTodos, today])

  // PDFs that are in an ACTIVE (non-done) read-later — the PDF hub's reminder
  // icon shows for these and reverts once the item is archived (done).
  const activeReadLaterPdfIds = useMemo(
    () =>
      new Set(
        allReadLater
          .filter((r) => r.status !== "done" && r.pdfId)
          .map((r) => r.pdfId as string)
      ),
    [allReadLater]
  )

  // Project-card options for the todo link picker (only titled cards are
  // identifiable in a select), grouped by project name.
  const todoCardOptions = useMemo(() => {
    const projectName = new Map(projects.map((p) => [p.id, p.name]))
    return allProjectCardsUnfiltered
      .filter((c) => c.title)
      .map((c) => ({
        id: c.id,
        title: c.title as string,
        projectName: projectName.get(c.projectId) ?? ""
      }))
      .sort(
        (a, b) =>
          a.projectName.localeCompare(b.projectName) ||
          a.title.localeCompare(b.title)
      )
  }, [allProjectCardsUnfiltered, projects])

  // Full card set the current view renders. 全选 must target this scope, not
  // the paginated displayedItems slice (which only holds the first page) —
  // otherwise select-all in the section/outline view only picks 20 cards.
  const viewItems = keyword || dateRange ? displayCards : scopeItems

  // Stable (memoized) — the CardGrid is memoized, so these must only change
  // when their data actually changes or the grid would skip needed re-renders.
  const sharedCardGridProps = useMemo(
    () => ({
      selectedIds,
      reviewItemIds,
      masteredItemIds,
      onOpenDialog: setDialogCard,
      onEdit: (id: string) => {
        const card = displayCardsUnfiltered.find((c) => c.id === id)
        if (card?.pdfVocabularyCardId) {
          setSnackbarMsg("请在 PDF 生词卡中管理词条")
          return
        }
        if (card) openCardWorkspace("edit", card)
      },
      onToggleReview: handleToggleReview,
      onReReview: handleReReview,
      onCopyToProject: (id: string, anchor: HTMLElement) => {
        setCopyCardId(id)
        setCopyMenu({ anchor, mode: "single" })
      },
      onOpenPdfSource: handleOpenPdfFromCard,
      onMoveToSection: (id: string, anchor: HTMLElement) => {
        setMoveSectionCardId(id)
        setMoveMenu({ anchor, mode: "single" })
      },
      highlightedId: projectCardHighlightId
    }),
    [
      selectedIds,
      reviewItemIds,
      masteredItemIds,
      displayCardsUnfiltered,
      openCardWorkspace,
      setSnackbarMsg,
      handleToggleReview,
      handleReReview,
      handleOpenPdfFromCard,
      projectCardHighlightId
    ]
  )

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <style>{`
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb {
          background: #c0c0c0;
          border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover { background: #a0a0a0; }
      `}</style>
      <Box
        sx={{
          display: "flex",
          height: "100vh",
          overflow: "hidden",
          bgcolor: "background.default"
        }}>
        <NavRail
          sidebarTab={sidebarTab}
          dueCount={liteDueCount}
          todoCount={liteTodoCount}
          onSetSidebarTab={handleSetSidebarTab}
          onSettingsClick={() => setSettingsOpen(true)}
        />
        <SidebarFilters
          open={drawerOpen}
          width={drawerWidth}
          sidebarTab={sidebarTab}
          syncStatus={syncStatus}
          todoStats={todoStats}
          todoFilter={todoFilter}
          todoTab={activeTab}
          readLaterFilter={readLaterFilter}
          activeReadLater={activeReadLater}
          doneReadLater={doneReadLater}
          pdfs={pdfs}
          countByPdf={countByPdf}
          activePdfId={activePdfId}
          onTodoFilterChange={setTodoFilter}
          onReadLaterFilterChange={setReadLaterFilter}
          onOpenPdfClick={() => pdfFileInputRef.current?.click()}
          onOpenPdf={handleOpenPdf}
          onOpenUrl={() => setPdfUrlOpen(true)}
          onRenamePdf={handleRenamePdf}
          onDeletePdf={handleDeletePdf}
          topics={topics}
          onNewTopic={handleNewTopic}
          onRenameTopic={handleRenameTopic}
          onDeleteTopic={handleDeleteTopic}
          onMovePdf={handleMovePdf}
          onWidthChange={(w) => setDrawerWidth(w)}
          onNewProjectClick={() => setCreateDialogOpen(true)}
          backupScope={backupScope}
          onBackupScopeChange={setBackupScope}
          onImportBackup={() => backupFileInputRef.current?.click()}
          onUploadSync={handleUploadSync}
          onDownloadSync={handleDownloadSync}
          recentDates={recentDates}
          reviewDateFilter={reviewView.reviewDateFilter}
          onReviewDateClick={handleReviewDateClick}>
          <ProjectTree
            projects={projects}
            activeProjectId={activeProjectId}
            activeSectionId={activeSectionId}
            isOpen={navOpen}
            expanded={expandedNav}
            countBySection={countBySection}
            unclassifiedByProject={unclassifiedByProject}
            onSelectProject={handleOpenProject}
            onCloseProject={() => {
              setSelectedIds([])
              setSelectMode(false)
              setActiveProjectId(null)
              setNavOpen(false)
              setKeyword("")
              setDateRange(null)
              onSearch(null)
            }}
            onSelectSection={handleSelectSection}
            onToggleExpanded={toggleExpanded}
            onAddSection={addSectionWithTitle}
            onRenameSection={onRenameSection}
            onDeleteSection={onDeleteSectionCb}
            onMoveSection={onMoveSection}
            onRenameProject={handleRenameProject}
            onUpdateNote={handleUpdateNote}
            onDeleteProject={handleDeleteProject}
            onExportMarkdown={handleExportMarkdown}
          />
        </SidebarFilters>

        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            height: "100vh",
            borderLeft: "1px solid",
            borderColor: "divider"
          }}>
          <Box sx={{ flexShrink: 0 }}>
            <style>{`
            @keyframes emptyFloat {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-8px); }
            }
            .empty-icon {
              opacity: 0.12;
              animation: emptyFloat 4s ease-in-out infinite;
            }
          `}</style>
            {!cardWorkspace && (
              <AppHeader
                drawerOpen={drawerOpen}
                headerHeight={headerHeight}
                onToggleDrawer={handleToggleDrawer}
                reviewProgress={
                  sidebarTab === "review" ? reviewProgress : undefined
                }
                activeProjectName={
                  sidebarTab === "pdf" && activePdfId
                    ? pdfs
                        .find((p) => p.id === activePdfId)
                        ?.name.replace(/\.pdf$/i, "") ?? null
                    : sidebarTab === "todo"
                      ? activeTab === "todo"
                        ? "待办项"
                        : "稍后读"
                      : activeProject?.name ?? null
                }>
                {sidebarTab === "review" ? (
                  <Tooltip title="退出复习">
                    <IconButton
                      size="small"
                      onClick={handleExitReview}
                      sx={{
                        color: "text.secondary",
                        "&:hover": { color: "error.main" },
                        "&.Mui-focusVisible": { outline: "none" }
                      }}>
                      <CloseRoundedIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                  </Tooltip>
                ) : sidebarTab === "pdf" && activePdfId ? (
                  <>
                    <Tooltip title="关闭 PDF">
                      <IconButton
                        size="small"
                        onClick={() => handleClosePdf(activePdfId!)}
                        sx={{
                          color: "text.secondary",
                          "&:hover": { color: "error.main" },
                          "&.Mui-focusVisible": { outline: "none" }
                        }}>
                        <CloseRoundedIcon sx={{ fontSize: 20 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip
                      title={pdfCardsOpen ? "折叠摘录面板" : "展开摘录面板"}>
                      <IconButton
                        size="small"
                        onClick={() => setPdfCardsOpen((o) => !o)}
                        sx={{
                          color: pdfCardsOpen
                            ? "primary.main"
                            : "text.secondary",
                          "&:hover": { color: "primary.main" },
                          "&.Mui-focusVisible": { outline: "none" }
                        }}>
                        <ViewColumnRoundedIcon sx={{ fontSize: 20 }} />
                      </IconButton>
                    </Tooltip>
                  </>
                ) : sidebarTab === "pdf" && !activePdfId ? (
                  <Tooltip title={pdfBatchMode ? "取消选择" : "选择 PDF"}>
                    <IconButton
                      size="small"
                      onClick={togglePdfBatch}
                      sx={{
                        color: pdfBatchMode ? "error.main" : "text.secondary",
                        "&:hover": { color: "error.main" },
                        "&.Mui-focusVisible": { outline: "none" }
                      }}>
                      <DoneAllRoundedIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                  </Tooltip>
                ) : sidebarTab === "pdf" ? null : sidebarTab === "todo" ? (
                  <Tooltip
                    title={
                      activeTab === "todo" ? "切换到稍后读" : "切换到待办项"
                    }>
                    <IconButton
                      size="small"
                      onClick={() =>
                        setActiveTab(
                          activeTab === "todo" ? "readLater" : "todo"
                        )
                      }
                      sx={{
                        color: "text.secondary",
                        "&:hover": { color: "primary.main" },
                        "&.Mui-focusVisible": { outline: "none" }
                      }}>
                      {activeTab === "todo" ? (
                        <ChecklistRoundedIcon sx={{ fontSize: 20 }} />
                      ) : (
                        <BookmarkRoundedIcon sx={{ fontSize: 20 }} />
                      )}
                    </IconButton>
                  </Tooltip>
                ) : activeProject ? (
                  <>
                    <Tooltip title={selectMode ? "取消选择" : "选择卡片"}>
                      <IconButton
                        size="small"
                        onClick={onToggleSelectMode}
                        sx={{
                          color: selectMode ? "error.main" : "text.secondary",
                          "&:hover": { color: "error.main" },
                          "&.Mui-focusVisible": { outline: "none" }
                        }}>
                        <DoneAllRoundedIcon sx={{ fontSize: 20 }} />
                      </IconButton>
                    </Tooltip>
                    <DateRangeFilter
                      value={dateRange}
                      onChange={setDateRange}
                    />
                  </>
                ) : null}
              </AppHeader>
            )}

            {!cardWorkspace &&
              sidebarTab !== "review" &&
              sidebarTab !== "todo" &&
              sidebarTab !== "pdf" && (
                <FilterChips
                  keyword={sidebarTab === "backup" ? backupKeyword : keyword}
                  onKeywordChange={
                    sidebarTab === "backup" ? setBackupKeyword : setKeyword
                  }
                  placeholder={
                    sidebarTab === "backup"
                      ? backupScope === "projects"
                        ? "搜索项目…"
                        : "搜索 PDF…"
                      : activeProjectId
                        ? "搜索当前项目中的卡片…"
                        : "搜索项目…"
                  }>
                  {sidebarTab === "backup" ? (
                    <BatchToolbar
                      selectedCount={
                        backupScope === "projects"
                          ? backupSelectedIds.length
                          : backupSelectedPdfIds.length
                      }
                      allSelected={
                        backupScope === "projects"
                          ? backupSelectedIds.length > 0 &&
                            backupSelectedIds.length === projects.length
                          : backupSelectedPdfIds.length > 0 &&
                            backupSelectedPdfIds.length === pdfs.length
                      }
                      countLabel={
                        backupScope === "projects" ? "个项目" : "个 PDF"
                      }
                      onSelectAll={handleBackupSelectAll}
                      actions={[
                        {
                          label: "导出备份",
                          icon: (
                            <FileDownloadRoundedIcon
                              sx={{ fontSize: 16, mr: 0.5 }}
                            />
                          ),
                          onClick: handleExportBackup,
                          disabled:
                            (backupScope === "projects"
                              ? backupSelectedIds.length
                              : backupSelectedPdfIds.length) === 0,
                          variant: "contained"
                        }
                      ]}
                    />
                  ) : selectMode ? (
                    <BatchToolbar
                      selectedCount={selectedIds.length}
                      allSelected={
                        selectedIds.length > 0 &&
                        selectedIds.length === viewItems.length
                      }
                      onSelectAll={() => {
                        if (selectedIds.length === viewItems.length) {
                          setSelectedIds([])
                        } else {
                          setSelectedIds(viewItems.map((i) => i.id))
                        }
                      }}
                      actions={[
                        {
                          label: "复制到项目",
                          icon: (
                            <FileCopyOutlinedIcon
                              sx={{ fontSize: 16, mr: 0.5 }}
                            />
                          ),
                          onClick: (e) =>
                            setCopyMenu({
                              anchor: e.currentTarget,
                              mode: "batch"
                            }),
                          dividerBefore: true,
                          disabled: selectedIds.length === 0
                        },
                        {
                          label: "移动到章节",
                          icon: (
                            <DriveFileMoveOutlinedIcon
                              sx={{ fontSize: 16, mr: 0.5 }}
                            />
                          ),
                          onClick: (e) =>
                            setMoveMenu({
                              anchor: e.currentTarget,
                              mode: "batch"
                            }),
                          disabled: selectedIds.length === 0
                        },
                        {
                          label: "合并",
                          icon: (
                            <MergeTypeRoundedIcon
                              sx={{ fontSize: 16, mr: 0.5 }}
                            />
                          ),
                          onClick: handleBatchMerge,
                          disabled: selectedIds.length < 2
                        },
                        {
                          label: "删除选中",
                          icon: (
                            <DeleteSweepRoundedIcon
                              sx={{ fontSize: 16, mr: 0.5 }}
                            />
                          ),
                          onClick: handleBatchDelete,
                          dividerBefore: true,
                          disabled: selectedIds.length === 0,
                          variant: "contained",
                          color: "error"
                        }
                      ]}
                    />
                  ) : null}
                </FilterChips>
              )}
          </Box>

          {sidebarTab === "pdf" && !activePdfId && (
            <FilterChips
              keyword={pdfHubKeyword}
              onKeywordChange={setPdfHubKeyword}
              placeholder={
                pdfBatchMode
                  ? "搜索 PDF…"
                  : pdfHubTopicView === "topics"
                    ? "搜索主题…"
                    : "搜索当前主题中的 PDF…"
              }>
              {pdfBatchMode ? (
                <BatchToolbar
                  selectedCount={pdfBatchSelectedIds.length}
                  allSelected={
                    pdfBatchSelectedIds.length > 0 &&
                    pdfBatchSelectedIds.length === pdfs.length
                  }
                  onSelectAll={togglePdfBatchSelectAll}
                  countLabel="个 PDF"
                  actions={[
                    {
                      label: "移动到主题",
                      icon: (
                        <DriveFileMoveOutlinedIcon
                          sx={{ fontSize: 16, mr: 0.5 }}
                        />
                      ),
                      onClick: (e) => setPdfBatchMoveAnchor(e.currentTarget),
                      dividerBefore: true,
                      disabled: pdfBatchSelectedIds.length === 0
                    },
                    {
                      label: "删除选中",
                      icon: (
                        <DeleteSweepRoundedIcon
                          sx={{ fontSize: 16, mr: 0.5 }}
                        />
                      ),
                      onClick: () => setConfirmPdfBatchDelete(true),
                      dividerBefore: true,
                      disabled: pdfBatchSelectedIds.length === 0,
                      variant: "contained",
                      color: "error"
                    }
                  ]}
                />
              ) : null}
            </FilterChips>
          )}

          {sidebarTab === "review" && reviewView.reviewDateFilter && (
            <Box
              sx={{
                bgcolor: "background.paper",
                py: 1,
                px: 2,
                borderBottom: "1px solid",
                borderColor: "divider"
              }}>
              <Stack
                direction="row"
                alignItems="center"
                spacing={0.5}
                flexWrap="wrap">
                <Typography
                  variant="body2"
                  sx={{ color: "text.secondary", mr: 1 }}>
                  回顾：
                  {recentDates.find(
                    (d) => d.key === reviewView.reviewDateFilter
                  )?.label ?? reviewView.reviewDateFilter}
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    flexWrap: "wrap"
                  }}>
                  <Box
                    onClick={() => reviewView.setRatingFilter(null)}
                    sx={(t) => ({
                      display: "flex",
                      alignItems: "center",
                      px: 0.75,
                      py: 0.25,
                      borderRadius: 1,
                      cursor: "pointer",
                      fontSize: "0.72rem",
                      lineHeight: 1.5,
                      color:
                        reviewView.ratingFilter === null
                          ? t.palette.primary.main
                          : "text.secondary",
                      bgcolor:
                        reviewView.ratingFilter === null
                          ? alpha(t.palette.primary.main, 0.08)
                          : "transparent",
                      "&:hover": { bgcolor: "action.hover" }
                    })}>
                    全部
                  </Box>
                  {RATING_META.map((meta, i) => {
                    const value = (i + 1) as 1 | 2 | 3
                    const active = reviewView.ratingFilter === value
                    const rc = theme.custom.ratingColors[i]
                    return (
                      <Box
                        key={meta.label}
                        onClick={() =>
                          reviewView.setRatingFilter(active ? null : value)
                        }
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 0.5,
                          px: 0.75,
                          py: 0.25,
                          borderRadius: 1,
                          cursor: "pointer",
                          fontSize: "0.72rem",
                          lineHeight: 1.5,
                          color: active ? rc : "text.secondary",
                          bgcolor: active ? alpha(rc, 0.08) : "transparent",
                          transition: "all 0.15s",
                          "&:hover": { bgcolor: "action.hover" }
                        }}>
                        <Box
                          sx={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            bgcolor: active ? rc : "text.disabled",
                            flexShrink: 0
                          }}
                        />
                        {meta.label}
                      </Box>
                    )
                  })}
                </Box>
                <Box sx={{ flex: 1 }} />
                <Button
                  size="small"
                  onClick={() => {
                    reviewView.setReviewDateFilter(null)
                    reviewView.setRatingFilter(null)
                  }}
                  sx={{ borderRadius: 1 }}>
                  退出
                </Button>
              </Stack>
            </Box>
          )}

          <Box
            sx={{
              flex: 1,
              overflow: sidebarTab === "pdf" ? "hidden" : "auto",
              minHeight: 0,
              bgcolor: (t) => t.custom.surface2
            }}>
            <ViewRouter
              cardWorkspace={cardWorkspace}
              sidebarTab={sidebarTab}
              onCloseCardWorkspace={handleCardWorkspaceClose}
              onSaveCardWorkspace={handleCardWorkspaceSave}
              onSaveDraftCardWorkspace={handleCardWorkspaceSaveDraft}
              onDiscardCardWorkspace={handleCardWorkspaceDiscard}
              pdfProps={{
                activePdfId,
                annotationById,
                pdfOutlineDest,
                setPdfOutlineDest,
                pdfReaderOpen,
                toggleReader,
                swapLeft,
                pdfFlashTarget,
                pdfClearRingToken,
                pdfVocabularyFlashTarget,
                handlePdfAnnotationSelected,
                pdfTypeChangeTarget,
                handleJumpInPanel,
                setPdfCurrentPage,
                setPdfPageCount,
                setPdfSidebarView,
                onToast: setSnackbarMsg,
                searchRequest,
                handlePdfSearchResults,
                jumpRequest,
                topics,
                pdfTopicView: pdfHubTopicView,
                onPdfTopicViewChange: handlePdfHubTopicViewChange,
                pdfKeyword: pdfHubKeyword,
                pdfs,
                countByPdf,
                handleOpenPdf,
                onOpenUrl: () => setPdfUrlOpen(true),
                pdfFileInputRef,
                handleDeletePdf,
                onRenamePdf: handleRenamePdf,
                onSavePdfAiContext: handleSavePdfAiContext,
                handleNewTopic,
                handleRenameTopic,
                handleDeleteTopic,
                handleMovePdf,
                pdfBatchMode,
                pdfBatchSelectedIds,
                onTogglePdfBatchSelect: togglePdfBatchSelect,
                readLaterPdfIds: activeReadLaterPdfIds,
                onAddReadLater: (pdfId, name) => {
                  void (async () => {
                    const created = createReadLater({ title: name, pdfId })
                    const saved = await addReadLater(created)
                    setSnackbarMsg(
                      saved ? "已加入稍后读" : "该 PDF 已在稍后读中",
                      saved ? "success" : "error"
                    )
                  })()
                }
              }}
              backupProps={{
                scope: backupScope,
                projects,
                pdfs,
                countByProject,
                countByPdf,
                keyword: backupKeyword,
                selectedIds:
                  backupScope === "projects"
                    ? backupSelectedIds
                    : backupSelectedPdfIds,
                onToggleSelect: handleBackupToggleSelect
              }}
              todoProps={{
                items: filteredTodos,
                editingId: todoEditingId,
                focusNewTaskId,
                onToggleTask: handleToggleTodoTask,
                onStartEdit: handleStartEditTodo,
                onCancelEdit: () => {
                  setTodoEditingId(null)
                  setFocusNewTaskId(null)
                },
                onSave: handleSaveTodo,
                onDelete: setTodoDeleteTarget,
                onQuickAdd: handleQuickAdd,
                onNewTodo: handleNewTodo,
                activeTab,
                readLaterFilter,
                readLaterEditingId,
                setReadLaterEditingId,
                readLaterDeleteTarget,
                setReadLaterDeleteTarget,
                activeReadLater,
                doneReadLater,
                onNewReadLater: handleNewReadLater,
                onStartEditReadLater: handleStartEditReadLater,
                onCancelEditReadLater: () => setReadLaterEditingId(null),
                onSaveReadLater: handleSaveReadLater,
                onDeleteReadLater: setReadLaterDeleteTarget,
                onStartRead: handleStartRead,
                onMarkDone: handleMarkDone,
                onOpenReadLater: handleOpenReadLater,
                onOpenLink: handleOpenTodoLink,
                projectCards: todoCardOptions,
                pdfs
              }}
              reviewProps={{
                reviewDateFilter: reviewView.reviewDateFilter,
                ratingFilter: reviewView.ratingFilter,
                filteredDateItems,
                cardFirstRating,
                sharedCardGridProps,
                item: reviewItems[0] ?? null,
                ratedCount: reviewProgress.rated,
                passedCount: reviewProgress.passed,
                flipped: reviewFlipped,
                completed: reviewCompleted,
                animating,
                masteredCount: reviewStats.masteredCount,
                activeCount: reviewStats.activeCount,
                todayRatings,
                streakDays,
                onFlip: handleReviewFlip,
                onRate: handleReviewRate,
                onExit: handleExitReview
              }}
              projectsProps={{
                activeProject,
                projects,
                countByProject,
                keyword,
                setKeyword,
                setDateRange,
                handleOpenProject,
                setCreateDialogOpen,
                setProjectDeleteTarget,
                onRenameProject: handleRenameProject,
                activeSectionId,
                handleSelectSection,
                sectionPath,
                scopeItems,
                cardDraggedId,
                cardDrop,
                flipRectsRef,
                handleGripPointerDown,
                openCardWorkspace,
                selectMode,
                setSelectedIds,
                onDelete,
                displayedItems,
                hasMore,
                allProjectCards,
                dateRange,
                loadMoreRef,
                sharedCardGridProps
              }}
            />
            <ItemDialog
              item={dialogCard}
              open={Boolean(dialogCard)}
              readOnly={sidebarTab === "review"}
              hasPrev={hasPrev}
              hasNext={hasNext}
              onClose={() => setDialogCard(null)}
              onNavigate={handleNavigate}
            />

            <DialogShell
              open={Boolean(reviewView.reviewTitlePending)}
              onClose={() => reviewSetTitlePending(null)}
              title="加入复习"
              maxWidth="xs"
              confirmLabel="加入复习"
              confirmDisabled={!reviewView.reviewTitleDraft.trim()}
              onConfirm={async () => {
                const card = allProjectCardsUnfiltered.find(
                  (i) => i.id === reviewView.reviewTitlePending
                )
                if (!card || !reviewView.reviewTitleDraft.trim()) return
                // Update card title (placed cards keep content "" —
                // the title lives on the placement).
                await updateProjectCard(
                  stripPlacementContent({
                    ...card,
                    title: reviewView.reviewTitleDraft.trim()
                  })
                )
                // Add to review (skip if it entered review while the
                // dialog was open — itemId has a unique index).
                const alreadyInReview = reviewItemIds.has(card.id)
                if (!alreadyInReview) {
                  try {
                    await addReview(createReviewEntry(card.id, card.projectId))
                  } catch (e) {
                    // The unique itemId index can reject if the card
                    // entered review while the dialog was open.
                    console.warn("[lime] addReview:", e)
                  }
                }
                reviewSetTitlePending(null)
                reviewView.setReviewTitleDraft("")
                // The useAppData effect reloads the review states when
                // reviewsVersion bumps (the _dbr broadcast also does).
                setReviewsVersion((v) => v + 1)
                setSnackbarMsg(alreadyInReview ? "已在复习中" : "已加入复习")
              }}>
              <Typography
                variant="body2"
                sx={{ mb: 2, color: "text.secondary" }}>
                请先为卡片设置摘要
              </Typography>
              <TextField
                fullWidth
                size="small"
                autoFocus
                placeholder="输入卡片摘要…"
                value={reviewView.reviewTitleDraft}
                onChange={(e) => reviewView.setReviewTitleDraft(e.target.value)}
                sx={{
                  mb: 2,
                  "& .MuiOutlinedInput-root": { borderRadius: 1 }
                }}
              />
            </DialogShell>

            <DeleteConfirmDialog
              open={Boolean(projectDeleteTarget)}
              batch={false}
              count={1}
              message={
                projectDeleteTarget
                  ? `确定要删除项目「${projectDeleteTarget.name}」吗？该项目下的 ${countByProject[projectDeleteTarget.id] ?? 0} 张卡片将一并删除，此操作不可撤销。`
                  : undefined
              }
              onCancel={() => setProjectDeleteTarget(null)}
              onConfirm={() => {
                if (projectDeleteTarget)
                  handleDeleteProject(projectDeleteTarget.id)
                setProjectDeleteTarget(null)
              }}
            />

            <DeleteConfirmDialog
              open={Boolean(todoDeleteTarget)}
              batch={false}
              count={1}
              itemLabel="这条待办"
              onCancel={() => setTodoDeleteTarget(null)}
              onConfirm={() => {
                if (todoDeleteTarget) handleDeleteTodo(todoDeleteTarget)
                setTodoDeleteTarget(null)
              }}
            />

            <DeleteConfirmDialog
              open={Boolean(readLaterDeleteTarget)}
              batch={false}
              count={1}
              itemLabel="这条稍后读"
              onCancel={() => setReadLaterDeleteTarget(null)}
              onConfirm={() => {
                if (readLaterDeleteTarget)
                  handleDeleteReadLater(readLaterDeleteTarget)
                setReadLaterDeleteTarget(null)
              }}
            />

            <DeleteConfirmDialog
              open={Boolean(confirmDeleteId) || confirmBatchDelete}
              batch={confirmBatchDelete}
              count={selectedIds.length}
              message={
                !confirmBatchDelete && deleteTargetIsPdf
                  ? "这张卡片来自 PDF 批注，删除将从项目移出（PDF 批注保留）。"
                  : undefined
              }
              onCancel={() => {
                setConfirmDeleteId(null)
                setConfirmBatchDelete(false)
              }}
              onConfirm={
                confirmBatchDelete
                  ? handleConfirmBatchDelete
                  : handleConfirmDelete
              }
            />

            <DeleteConfirmDialog
              open={Boolean(pdfDeleteTarget)}
              batch={false}
              count={1}
              itemLabel="这个 PDF"
              message={
                pdfDeleteTarget
                  ? `将删除「${pdfDeleteTarget.name}」及其全部批注与摘录卡片。`
                  : undefined
              }
              onCancel={() => setPdfDeleteTarget(null)}
              onConfirm={confirmDeletePdf}
            />

            <DeleteConfirmDialog
              open={confirmPdfBatchDelete}
              batch
              count={pdfBatchSelectedIds.length}
              itemLabel="个 PDF"
              message={`将删除选中的 ${pdfBatchSelectedIds.length} 个 PDF 及其全部批注与摘录卡片。`}
              onCancel={() => setConfirmPdfBatchDelete(false)}
              onConfirm={handleConfirmPdfBatchDelete}
            />

            <Menu
              anchorEl={pdfBatchMoveAnchor}
              open={Boolean(pdfBatchMoveAnchor)}
              onClose={() => setPdfBatchMoveAnchor(null)}
              slotProps={{
                paper: { sx: { py: 0.5, borderRadius: 1, minWidth: 160 } }
              }}>
              <Typography
                sx={{
                  fontSize: "0.68rem",
                  color: "text.disabled",
                  px: 1.5,
                  pt: 0.5,
                  pb: 0.25
                }}>
                移动到主题
              </Typography>
              <MenuItem
                onClick={() => handlePdfBatchMove(undefined)}
                sx={{ fontSize: "0.8rem", gap: 1 }}>
                <FolderRoundedIcon sx={{ fontSize: 15 }} />
                未分类
              </MenuItem>
              {topics.map((t) => (
                <MenuItem
                  key={t}
                  onClick={() => handlePdfBatchMove(t)}
                  sx={{ fontSize: "0.8rem", gap: 1 }}>
                  <FolderRoundedIcon sx={{ fontSize: 15 }} />
                  {t}
                </MenuItem>
              ))}
            </Menu>

            <DeleteConfirmDialog
              open={Boolean(topicDeleteTarget)}
              batch={false}
              count={1}
              itemLabel="这个主题"
              message={
                topicDeleteTarget
                  ? `将删除主题「${topicDeleteTarget}」，该主题下的 PDF 将回到「未分类」（文件与摘录保留）。`
                  : undefined
              }
              onCancel={() => setTopicDeleteTarget(null)}
              onConfirm={confirmDeleteTopic}
            />

            <DialogShell
              open={Boolean(pendingSectionDelete)}
              onClose={() => setPendingSectionDelete(null)}
              title="删除章节"
              confirmLabel="删除"
              confirmColor="error"
              onConfirm={confirmDeleteSection}>
              <>
                {pendingSectionDelete && (
                  <Typography variant="body2" color="text.secondary">
                    确定要删除此章节
                    {pendingSectionDelete.subSectionCount > 0 &&
                      ` 及 ${pendingSectionDelete.subSectionCount} 个子章节`}
                    ？其中 {pendingSectionDelete.cardCount} 张卡片将移至未分类。
                  </Typography>
                )}
              </>
            </DialogShell>

            <MergeConfirmDialog
              open={Boolean(mergeState)}
              items={mergeState ?? []}
              onClose={() => setMergeState(null)}
              onConfirm={handleConfirmMerge}
            />

            <NewProjectDialog
              open={createDialogOpen}
              name={newProjectName}
              error={projectError}
              onNameChange={(v) => {
                setNewProjectName(v)
                setProjectError(null)
              }}
              onClose={() => {
                setCreateDialogOpen(false)
                setProjectError(null)
              }}
              onCreate={() => {
                handleCreateProject()
                setCreateDialogOpen(false)
              }}
            />

            <SettingsDialog
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              preset={preset}
              onPresetChange={(name) => setPreset(name)}
            />

            <OpenPdfUrlDialog
              open={pdfUrlOpen}
              loading={pdfUrlLoading}
              onClose={() => setPdfUrlOpen(false)}
              onOpen={handleOpenPdfFromUrl}
            />

            <Toast
              open={Boolean(snackbar)}
              message={snackbar?.message ?? ""}
              severity={snackbar?.severity}
              onClose={() => setSnackbar(null)}
            />

            <CopyCardsMenu
              anchor={copyMenu?.anchor ?? null}
              title={
                copyMenu?.mode === "batch" ? "批量复制到项目" : "复制到项目"
              }
              projects={otherProjects}
              onSelect={(pid) => {
                if (copyMenu?.mode === "batch") handleBatchCopyCards(pid)
                else handleCopyCard(pid)
                setCopyMenu(null)
              }}
              onCreateProject={handleCreateProjectAndCopy}
              onClose={() => setCopyMenu(null)}
            />

            <MoveToSectionMenu
              anchor={moveMenu?.anchor ?? null}
              sections={activeProject?.sections ?? []}
              currentSectionId={
                moveMenu?.mode === "single" && moveSectionCardId
                  ? allProjectCardsUnfiltered.find(
                      (i) => i.id === moveSectionCardId
                    )?.sectionId ?? null
                  : null
              }
              onMove={(sid) => {
                if (moveMenu?.mode === "batch") handleBatchMoveConfirm(sid)
                else handleMoveCardConfirm(sid)
                setMoveMenu(null)
              }}
              onClose={() => setMoveMenu(null)}
            />
            <input
              ref={backupFileInputRef}
              type="file"
              hidden
              accept=".zip"
              onChange={handleImportBackupFile}
            />
            <input
              ref={pdfFileInputRef}
              type="file"
              hidden
              accept="application/pdf"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) {
                  handleOpenPdfFile(f)
                  navigate("pdf")
                }
                e.target.value = ""
              }}
            />
          </Box>
          <FooterBar
            sidebarTab={sidebarTab}
            pdfCurrentPage={pdfCurrentPage}
            pdfPageCount={pdfPageCount}
            totalItems={allProjectCardsUnfiltered.length}
            totalProjects={projects.length}
            dueCount={dueCount}
            syncStatus={syncStatus}
            version={chrome.runtime.getManifest().version}
            todoStats={todoStats}
            todoTab={activeTab}
            activeReadLater={activeReadLater}
            doneReadLater={doneReadLater}
            activeProjectName={activeProject?.name ?? null}
            activeProjectItemCount={
              allProjectCardsUnfiltered.filter(
                (i) => i.projectId === activeProjectId
              ).length
            }
          />
        </Box>
        {pdfSidebarView === "search" &&
        pdfCardsOpen &&
        sidebarTab === "pdf" &&
        Boolean(activePdfId) ? (
          <PdfSearchPanel
            width={pdfCardsWidth}
            onWidthChange={setPdfCardsWidth}
            dragging={pdfPanelDragging}
            onDragStart={startPanelDrag}
            onDragEnd={endPanelDrag}
            query={pdfSearch.query}
            caseSensitive={pdfSearch.caseSensitive}
            wholeWord={pdfSearch.wholeWord}
            entries={pdfSearch.entries}
            loading={pdfSearch.loading}
            currentIndex={pdfSearch.currentIndex}
            onOptionsChange={handlePdfSearchOptions}
            onSearch={(query) => handlePdfSearch(query)}
            onEntryClick={handlePdfSearchEntry}
            onNav={handlePdfSearchNav}
            onBack={() => setPdfSidebarView("cards")}
          />
        ) : (
          <PdfCardsPanel
            open={pdfCardsOpen && sidebarTab === "pdf" && Boolean(activePdfId)}
            width={pdfCardsWidth}
            onWidthChange={setPdfCardsWidth}
            dragging={pdfPanelDragging}
            onDragStart={startPanelDrag}
            onDragEnd={endPanelDrag}
            cards={pdfPanelCards}
            annotations={pdfPanelAnnotations}
            onCardClick={handlePanelCardClick}
            scrollTarget={pdfScrollTarget}
            projects={projects}
            placements={placements}
            onPlace={handlePlaceCards}
            onUnplace={handleUnplaceCards}
            onDelete={handleDeletePdfCards}
            onCreateProject={handleCreateProjectAndPlace}
            onJumpToProject={handleJumpToProject}
            onTypeChange={handlePdfTypeChange}
            selectedAnnId={pdfSelectedAnnId}
            pdfId={activePdfId}
            currentPage={pdfCurrentPage}
            onVocabularyJump={(occurrence) => {
              setPdfFlashTarget(null)
              setPdfSelected(null)
              setPdfScrollTarget(null)
              pdfVocabularyFlashToken.current += 1
              setPdfVocabularyFlashTarget({
                page: occurrence.page,
                rects: occurrence.rects,
                token: pdfVocabularyFlashToken.current
              })
            }}
          />
        )}
      </Box>
    </ThemeProvider>
  )
}
