import AddRoundedIcon from "@mui/icons-material/AddRounded"
import CloseRoundedIcon from "@mui/icons-material/CloseRounded"
import ViewColumnRoundedIcon from "@mui/icons-material/ViewColumnRounded"
import DoneAllRoundedIcon from "@mui/icons-material/DoneAllRounded"
import NoteAddRoundedIcon from "@mui/icons-material/NoteAddRounded"
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded"
import {
  alpha,
  Box,
  Button,
  CircularProgress,
  Container,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fade,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery
} from "@mui/material"
import { ThemeProvider } from "@mui/material/styles"
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react"

import AppHeader from "./components/AppHeader"
import BatchToolbar from "./components/BatchToolbar"
import DeleteSweepRoundedIcon from "@mui/icons-material/DeleteSweepRounded"
import FileCopyOutlinedIcon from "@mui/icons-material/FileCopyOutlined"
import FileDownloadRoundedIcon from "@mui/icons-material/FileDownloadRounded"
import MergeTypeRoundedIcon from "@mui/icons-material/MergeTypeRounded"
import CardGrid from "./components/CardGrid"
import DateRangeFilter from "./components/DateRangeFilter"
import DeleteConfirmDialog from "./components/DeleteConfirmDialog"
import DialogShell from "./components/DialogShell"
import EmptyState from "./components/EmptyState"
import FilterChips from "./components/FilterChips"
import FooterBar from "./components/FooterBar"
import ItemDialog from "./components/ItemDialog"
import CopyCardsDialog from "./components/CopyCardsDialog"
import MergeConfirmDialog from "./components/MergeConfirmDialog"
import NavRail from "./components/NavRail"
import type { SidebarTab } from "./components/NavRail"
import NewCardDialog from "./components/NewCardDialog"
import NewProjectDialog from "./components/NewProjectDialog"
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded"
import ProjectHub from "./components/ProjectHub"
import BackupView from "./components/BackupView"
import PdfHub from "./components/PdfHub"
import PdfCardsPanel from "./components/PdfCardsPanel"
import PdfView from "./components/PdfView"
import type { PdfOutlineItem } from "./components/PdfView"
import ProjectTree from "./components/ProjectTree"
import ReviewSession from "./components/ReviewSession"
import SettingsDialog from "./components/SettingsDialog"
import SidebarFilters from "./components/SidebarFilters"
import Toast from "./components/Toast"
import TodoView from "./components/TodoView"
import {
  addItem,
  addReview,
  batchUpdateItems,
  deleteItem,
  deleteItems,
  getAllReviews,
  getDueReviews,
  ensureItemOrder,
  addPdf,
  deletePdf,
  getItemsByPdf,
  getAnnotationsByPdf,
  listPdfs,
  renamePdfTopic,
  clearPdfTopic,
  updatePdfTopic,
  placePdfCard,
  unplacePdfCard,
  touchPdf,
  removeReview,
  searchItems,
  tx,
  updateItem,
  updateReviewSrs
} from "./database"
import { useBackupSync } from "./hooks/useBackupSync"
import { useCardDragReorder } from "./hooks/useCardDragReorder"
import { useNewCard } from "./hooks/useNewCard"
import { useProjects } from "./hooks/useProjects"
import { useReview } from "./hooks/useReview"
import { createReviewEntry, dayKey, rateSrs } from "./hooks/useSrs"
import { importFromZip } from "./import"
import { createAppTheme } from "./theme"
import { buildProjectMarkdown, buildScopeData } from "./utils/export"
import type { Item, MergeSeparator, PdfAnnotation, PdfFile, PresetName, Project, SearchQuery, SrsData, TodoFilter } from "./types"
import { sendMessage } from "./types/messages"
import { DAY_MS, RATING_META, buildMergedContent, cloneItem, compareCards, createItem, dueStatus, isTodoComplete, toggleMarkdownTask, todayLocalDate } from "./utils"

const MIN_DRAWER_WIDTH = 200
const MAX_DRAWER_WIDTH = 500

export default function OptionsPage() {
  const [allItems, setAllItems] = useState<Item[]>([])
  const [displayedItems, setDisplayedItems] = useState<Item[]>([])
  const [keyword, setKeyword] = useState("")
  const [dialogItem, setDialogItem] = useState<Item | null>(null)

  // Navigate prev/next within the currently displayed list
  const [hasMore, setHasMore] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerWidth, setDrawerWidth] = useState(280)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [preset, setPreset] = useState<PresetName>("classic")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("projects")
  const [pdfs, setPdfs] = useState<PdfFile[]>([])
  const [extraTopics, setExtraTopics] = useState<string[]>([])
  const [pdfCardsOpen, setPdfCardsOpen] = useState(true)
  const [pdfCardsWidth, setPdfCardsWidth] = useState(320)
  const [pdfPanelAnnotations, setPdfPanelAnnotations] = useState<
    PdfAnnotation[]
  >([])
  const [pdfPanelCards, setPdfPanelCards] = useState<Item[]>([])
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
  const pdfFlashToken = useRef(0)
  const pdfScrollToken = useRef(0)
  const [activePdfId, setActivePdfId] = useState<string | null>(null)
  const [pdfDeleteTarget, setPdfDeleteTarget] = useState<PdfFile | null>(null)
  const [topicDeleteTarget, setTopicDeleteTarget] = useState<string | null>(
    null
  )
  const [openPdfIds, setOpenPdfIds] = useState<string[]>([])
  const [pdfTocOpen, setPdfTocOpen] = useState(true)
  const [pdfOutlineByPdf, setPdfOutlineByPdf] = useState<
    Record<string, PdfOutlineItem[] | null>
  >({})
  const pdfOutline = activePdfId
    ? (pdfOutlineByPdf[activePdfId] ?? null)
    : null
  const activePdfIdRef = useRef<string | null>(null)
  activePdfIdRef.current = activePdfId
  const openPdfIdsRef = useRef<string[]>([])
  openPdfIdsRef.current = openPdfIds
  const [pdfOutlineDest, setPdfOutlineDest] = useState<PdfOutlineItem | null>(
    null
  )
  const [reviewItems, setReviewItems] = useState<Item[]>([])
  const [reviewDateFilter, setReviewDateFilter] = useState<string | null>(null)
  const [ratingFilter, setRatingFilter] = useState<1 | 2 | 3 | null>(null)
  const [allItemsUnfiltered, setAllItemsUnfiltered] = useState<Item[]>([])
  const [todoItems, setTodoItems] = useState<Item[]>([])
  const [todoEditingId, setTodoEditingId] = useState<string | null>(null)
  const [focusNewTaskId, setFocusNewTaskId] = useState<string | null>(null)
  const [todoFilter, setTodoFilter] = useState<TodoFilter>("incomplete")
  const [todoDeleteTarget, setTodoDeleteTarget] = useState<Item | null>(null)
  const [projectDeleteTarget, setProjectDeleteTarget] = useState<Project | null>(
    null
  )
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<{
    from?: number
    to?: number
  } | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const [copyCardId, setCopyCardId] = useState<string | null>(null)
  const [batchCopyOpen, setBatchCopyOpen] = useState(false)
  const [snackbarMsg, setSnackbarMsg] = useState("")
  const [backupSelectedIds, setBackupSelectedIds] = useState<string[]>([])
  const [backupScope, setBackupScope] = useState<"projects" | "pdfs">(
    "projects"
  )
  const [backupKeyword, setBackupKeyword] = useState("")
  const [backupSelectedPdfIds, setBackupSelectedPdfIds] = useState<string[]>([])
  const [syncStatus, setSyncStatus] = useState("")
  const [reviewItemIds, setReviewItemIds] = useState<Set<string>>(new Set())
  const [reviewSrsMap, setReviewSrsMap] = useState<Map<string, SrsData>>(
    new Map()
  )
  const [masteredItemIds, setMasteredItemIds] = useState<Set<string>>(
    new Set()
  )
  const [reviewTitlePending, setReviewTitlePending] = useState<string | null>(
    null
  )
  const [reviewTitleDraft, setReviewTitleDraft] = useState("")
  // Review session state (owned by options.tsx, not ReviewSession)
  const [reviewFlipped, setReviewFlipped] = useState(false)
  const [reviewCompleted, setReviewCompleted] = useState(false)
  /** Cards that left the queue this session (final rating >= 2). */
  const [sessionPassedIds, setSessionPassedIds] = useState<Set<string>>(
    new Set()
  )
  const [sessionRatedCount, setSessionRatedCount] = useState(0)
  /** The exact rateSrs result of each card's FIRST rating today (so same-day
   * re-ratings can re-schedule without re-applying rateSrs). */
  const firstSrsRef = useRef<Map<string, SrsData>>(new Map())
  const [animating, setAnimating] = useState(false)
  /** Bumped by `_dbr` broadcasts → triggers a lightweight review-state reload
   * (no full refreshAllData) so the session stays in sync with review writes. */
  const [reviewsVersion, setReviewsVersion] = useState(0)
  const [expandedNav, setExpandedNav] = useState<Set<string>>(new Set())
  const [navOpen, setNavOpen] = useState(false)
  const [activeSectionByProject, setActiveSectionByProject] = useState<
    Record<string, string | null>
  >({})
  const [pendingSectionDelete, setPendingSectionDelete] = useState<{
    sectionId: string
    cardCount: number
    subSectionCount: number
  } | null>(null)
  const [mergeState, setMergeState] = useState<Item[] | null>(null)

  const reviewProgress = useMemo(
    () => ({
      remaining: reviewItems.length,
      rated: sessionRatedCount,
      passed: sessionPassedIds.size
    }),
    [reviewItems.length, sessionRatedCount, sessionPassedIds]
  )

  const ITEMS_PER_PAGE = 20

  const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)")

  const theme = useMemo(
    () => createAppTheme(prefersDarkMode ? "dark" : "light", preset),
    [prefersDarkMode, preset]
  )

  useEffect(() => {
    chrome.storage.sync.get("preset", (data) => {
      if (data.preset) setPreset(data.preset as PresetName)
    })
  }, [])

  useEffect(() => {
    chrome.storage.sync.set({ preset })
  }, [preset])

  const onSearch = useCallback(
    async (projectId?: string | null) => {
      const pid = projectId !== undefined ? projectId : activeProjectId
      const q: SearchQuery = {
        keyword,
        projectId: pid ?? undefined,
        from: dateRange?.from,
        to: dateRange?.to
      }
      const list = await searchItems(q)
      // Todos are a global view of their own; never mix into project/search.
      const filtered = list.filter((i) => i.type !== "todo")
      filtered.sort(compareCards)
      setAllItems(filtered)
      setDisplayedItems(filtered.slice(0, ITEMS_PER_PAGE))
      setHasMore(filtered.length > ITEMS_PER_PAGE)
    },
    [keyword, activeProjectId, dateRange, ITEMS_PER_PAGE]
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
    onSearch,
    onActivate: (id) => {
      setSelectedIds([])
      setSelectMode(false)
      setActiveProjectId(id)
      setNavOpen(true)
      onSearch(id)
      sendMessage({ kind: "set-recent-project", projectId: id }).catch(() => {})
    },
    onDeactivate: (id?: string) => {
      setSelectedIds([])
      setSelectMode(false)
      setActiveProjectId(null)
      setNavOpen(false)
      setDialogItem(null)
      setKeyword("")
      setDateRange(null)
      if (id) {
        setActiveSectionByProject((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      }
      onSearch(null)
    }
  })

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
    allItemsUnfiltered,
    searchItems,
    onSearch,
    sidebarTab,
    setSidebarTab,
    reviewItems,
    setReviewItems,
    reviewDateFilter,
    setReviewDateFilter,
    reviewsVersion
  })

  const cardFirstRating = useMemo(() => {
    const m = new Map<string, 1 | 2 | 3>()
    if (!reviewDateFilter) return m
    for (const [itemId, srs] of reviewSrsMap) {
      if (!srs.reviewHistory) continue
      const entry = srs.reviewHistory.find(
        (e) => dayKey(e.date) === reviewDateFilter
      )
      if (entry) m.set(itemId, Math.min(entry.rating, 3) as 1 | 2 | 3)
    }
    return m
  }, [reviewDateFilter, reviewSrsMap])

  const filteredDateItems = useMemo(() => {
    if (!ratingFilter) return reviewDateItems
    return reviewDateItems.filter(
      (item) => cardFirstRating.get(item.id) === ratingFilter
    )
  }, [reviewDateItems, ratingFilter, cardFirstRating])

  // Mount: initial load
  useEffect(() => {
    onSearch()
    loadTodos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load unfiltered items for review (cross-project, independent of active project)
  useEffect(() => {
    searchItems({}).then(setAllItemsUnfiltered)
  }, [])

  // Load review states (refresh when items or review data change)
  useEffect(() => {
    getAllReviews().then((reviews) => {
      setReviewItemIds(new Set(reviews.map((r) => r.itemId)))
      setReviewSrsMap(new Map(reviews.map((r) => [r.itemId, r.srs])))
      setMasteredItemIds(
        new Set(
          reviews
            .filter((r) => r.status === "mastered")
            .map((r) => r.itemId)
        )
      )
    })
  }, [allItemsUnfiltered, reviewsVersion])

  // Immediate search for non-keyword filter changes
  useEffect(() => {
    onSearch()
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
  }, [keyword, activeProjectId])

  // Clear selection when the search scope changes so batch ops never act on
  // cards hidden by a new keyword/date range.
  useEffect(() => {
    setSelectedIds([])
  }, [keyword, dateRange, activeProjectId])

  // Reset review session state when exiting review
  useEffect(() => {
    if (reviewItems.length === 0 && sidebarTab !== "review") {
      setReviewFlipped(false)
      setAnimating(false)
      setReviewCompleted(false)
      setSessionPassedIds(new Set())
      setSessionRatedCount(0)
      firstSrsRef.current = new Map()
    }
  }, [reviewItems, sidebarTab])

  const handleToggleDrawer = () => {
    setDrawerOpen((prev) => !prev)
  }

  const handleOpenProject = (id: string) => {
    setSelectedIds([])
    setSelectMode(false)
    setActiveProjectId(id)
    setNavOpen(true)
    onSearch(id)
    sendMessage({ kind: "set-recent-project", projectId: id }).catch(() => {})
  }

  // Active section in the current project (sidebar tree -> main area).
  // Declared before useNewCard so new cards can default into it.
  const activeSectionId = activeProjectId
    ? (activeSectionByProject[activeProjectId] ?? null)
    : null

  const {
    newCardOpen,
    newCardTitle,
    newCardContent,
    setNewCardTitle,
    setNewCardContent,
    setNewCardOpen,
    handleNewCard,
    handleSaveNewCard
  } = useNewCard({
    activeProjectId,
    activeSectionId,
    onSearch
  })

  const onDelete = (id: string) => {
    setConfirmDeleteId(id)
  }

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return
    await deleteItem(confirmDeleteId)
    setConfirmDeleteId(null)
    onSearch()
  }

  // Keep a ref to the latest allItems so loadMore never uses stale data
  const allItemsRef = useRef(allItems)
  allItemsRef.current = allItems

  const loadMore = useCallback(() => {
    if (!hasMore) return
    const items = allItemsRef.current
    const currentLength = displayedItems.length
    const nextItems = items.slice(0, currentLength + ITEMS_PER_PAGE)
    setDisplayedItems(nextItems)
    setHasMore(nextItems.length < items.length)
  }, [displayedItems.length, hasMore, ITEMS_PER_PAGE])

  // Keep a stable ref to the latest loadMore function so the observer
  // effect doesn't need to re-create the IntersectionObserver on every data change.
  const loadMoreRefCallback = useRef(loadMore)
  loadMoreRefCallback.current = loadMore

  useEffect(() => {
    // The load-more sentinel only exists when these all hold; the observer
    // must be (re)created whenever its presence changes — otherwise the
    // spinner renders but nothing triggers loadMore (was: only [hasMore]).
    const sentinelVisible =
      hasMore &&
      !!activeProjectId &&
      Boolean(keyword || dateRange)
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
    const items = allItems.filter((i) => selectedIds.includes(i.id))
    setMergeState(items)
  }

  const handleConfirmMerge = async (
    mergedTitle: string,
    separator: MergeSeparator
  ) => {
    if (!mergeState || !activeProjectId) return

    const selectedItems = mergeState
    const ids = selectedItems.map((i) => i.id)

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

    const newItem = createItem({
      type: "text",
      title: mergedTitle.trim(),
      content: mergedContent,
      projectId: activeProjectId,
      images: allImages,
      ...(mergedSectionId ? { sectionId: mergedSectionId } : {})
    })
    // Place the merged card last in its scope (addItem-level auto-order).
    const readyItem = await ensureItemOrder(newItem)

    // Atomic transaction: insert new + delete originals + cleanup reviews
    await tx({ items: "readwrite", reviews: "readwrite" }, async (stores) => {
      await new Promise<void>((resolve, reject) => {
        const req = stores.items.put(readyItem)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
      for (const id of ids) {
        await new Promise<void>((resolve, reject) => {
          const req = stores.items.delete(id)
          req.onsuccess = () => resolve()
          req.onerror = () => reject(req.error)
        })
      }
      for (const id of ids) {
        await new Promise<void>((resolve) => {
          const req = stores.reviews
            .index("itemId")
            .openCursor(IDBKeyRange.only(id))
          req.onsuccess = () => {
            const cursor = req.result
            if (cursor) {
              cursor.delete()
              cursor.continue()
            } else resolve()
          }
          req.onerror = () => resolve()
        })
      }
    })

    setMergeState(null)
    setSelectedIds([])
    setSelectMode(false)
    await refreshAllData()
    setSnackbarMsg(`已合并为「${mergedTitle}」`)
  }

  const handleConfirmBatchDelete = async () => {
    await deleteItems(selectedIds)
    setSelectMode(false)
    setSelectedIds([])
    setConfirmBatchDelete(false)
    onSearch()
  }

  const loadTodos = useCallback(async () => {
    const todos = await searchItems({ type: "todo" })
    setTodoItems(todos)
  }, [])

  const refreshAllData = useCallback(async () => {
    await loadProjects()
    await onSearch()
    await loadTodos()
    const all = await searchItems({})
    setAllItemsUnfiltered(all)
    // reviewItemIds + reviewSrsMap updated by the effect on allItemsUnfiltered change
  }, [loadProjects, onSearch, loadTodos])

  const handleToggleReview = useCallback(
    async (itemId: string) => {
      const card = allItemsUnfiltered.find((i) => i.id === itemId)
      if (!card) return

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
        setReviewTitlePending(itemId)
        return
      }

      // Has title → add directly
      await addReview(createReviewEntry(itemId, card.projectId ?? ""))
      setReviewItemIds((prev) => new Set(prev).add(itemId))
      setSnackbarMsg("已加入复习")
    },
    [allItemsUnfiltered, reviewItemIds]
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
    [reviewSrsMap, masteredItemIds]
  )

  const handleReviewFlip = useCallback(() => {
    if (!animating) setReviewFlipped((prev) => !prev)
  }, [animating])

  const handleReviewRate = useCallback(
    async (rating: 1 | 2 | 3 | 4) => {
      if (animating || reviewItems.length === 0) return
      const current = reviewItems[0]
      if (!current) return

      const currentSrs = reviewSrsMap.get(current.id)
      // Existence guard: the review entry may have been removed mid-session
      // (cross-window/sync). Drop the phantom card without rating it.
      if (!currentSrs) {
        setReviewItems((q) => q.slice(1))
      } else {
        const today = dayKey(Date.now())
        const wasRatedToday =
          firstSrsRef.current.has(current.id) ||
          (currentSrs.reviewHistory?.some(
            (h) => dayKey(h.date) === today
          ) ?? false)

        if (!wasRatedToday) {
          // FIRST rating of the day → the only one that locks the schedule.
          const newSrs = rateSrs(currentSrs, rating)
          firstSrsRef.current.set(current.id, newSrs)
          await updateReviewSrs(current.id, newSrs)
          setSessionRatedCount((c) => c + 1)
          if (rating >= 2) {
            setReviewItems((q) => q.slice(1))
            setSessionPassedIds((prev) => new Set(prev).add(current.id))
          } else {
            setReviewItems((q) => [...q.slice(1), current])
          }
        } else {
          // Same-day re-rating: practice only, no schedule change. A re-pass
          // moves the failure's dueDate to tomorrow (so it won't re-appear
          // today); a re-fail keeps it in the session loop.
          setSessionRatedCount((c) => c + 1)
          if (rating >= 2) {
            const base = firstSrsRef.current.get(current.id) ?? currentSrs
            await updateReviewSrs(current.id, {
              ...base,
              dueDate: Date.now() + DAY_MS
            })
            setReviewItems((q) => q.slice(1))
            setSessionPassedIds((prev) => new Set(prev).add(current.id))
          } else {
            setReviewItems((q) => [...q.slice(1), current])
          }
        }
      }

      // The queue empties only when the last card is dropped/passed — the
      // only point that needs a live DB reconcile (mid-session additions).
      const willEmpty = (rating >= 2 || !currentSrs) && reviewItems.length === 1
      setAnimating(true)
      setTimeout(async () => {
        setReviewFlipped(false)
        setAnimating(false)
        if (willEmpty) {
          const due = await getDueReviews()
          const itemMap = new Map(allItemsUnfiltered.map((i) => [i.id, i]))
          const items = due
            .map((r) => itemMap.get(r.itemId))
            .filter((i): i is Item => i !== undefined)
          if (items.length === 0) {
            setReviewCompleted(true)
            setReviewItems([])
          } else {
            setReviewItems(items)
          }
        }
      }, 350)
    },
    [reviewItems, reviewSrsMap, animating, allItemsUnfiltered]
  )

  const {
    backupFileInputRef,
    handleExportBackup,
    handleUploadSync,
    handleDownloadSync
  } = useBackupSync({
    projects,
    allItemsUnfiltered,
    backupScope,
    backupSelectedIds,
    backupSelectedPdfIds,
    pdfs,
    syncStatus,
    setSyncStatus,
    refreshAllData,
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
      await refreshAllData()
    } catch (err) {
      console.error("[lime] 导入失败：", err)
      setSnackbarMsg(`导入失败：${err}`)
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
  }, [])

  // ---- Section handlers ----
  const toggleExpanded = useCallback((id: string) => {
    setExpandedNav((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

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
    [activeProjectId, handleAddSection]
  )

  const onRenameSection = useCallback(
    (parentId: string | null, sectionId: string, title: string) => {
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
  }, [activeProjectId, handleDeleteSection, pendingSectionDelete, projects])

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
        allItems.find((i) => i.id === itemId)?.sectionId ?? null
      const sectionItems = allItems.filter((i) =>
        targetSectionId ? i.sectionId === targetSectionId : !i.sectionId
      )
      const sorted = sectionItems.sort(compareCards)
      const filtered = sorted.filter((i) => i.id !== itemId)
      filtered.splice(targetOrder, 0, {
        ...allItems.find((i) => i.id === itemId)!,
        sectionId: targetSectionId ?? undefined
      })
      const updates = filtered.map((item, idx) => ({
        id: item.id,
        sectionId: targetSectionId ?? undefined,
        order: idx
      }))
      await batchUpdateItems(updates)
      await refreshAllData()
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
    [activeProjectId, allItems, refreshAllData, projects]
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

  // ---- PDF library ----
  const loadPdfs = useCallback(async () => {
    const list = await listPdfs()
    setPdfs(list)
  }, [])

  // The cards panel's data (the active PDF's annotations + cards) is loaded
  // centrally here — the panel is a peer surface, not a PdfView sub-component.
  const loadPdfPanelData = useCallback(async () => {
    if (!activePdfId) {
      setPdfPanelAnnotations([])
      setPdfPanelCards([])
      return
    }
    const [ann, cards] = await Promise.all([
      getAnnotationsByPdf(activePdfId),
      getItemsByPdf(activePdfId)
    ])
    setPdfPanelAnnotations(ann)
    setPdfPanelCards(cards)
  }, [activePdfId])

  useEffect(() => {
    loadPdfPanelData()
  }, [loadPdfPanelData])

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
  const MAX_OPEN_PDFS = 4
  const openPdf = useCallback((id: string) => {
    touchPdf(id)
    const cur = openPdfIdsRef.current
    const next = cur.includes(id) ? cur : [...cur, id]
    let trimmed = next
    if (next.length > MAX_OPEN_PDFS) {
      // LRU: evict the oldest-open PDF when the limit is exceeded.
      const evicted = next[0]
      setPdfOutlineByPdf((o) => {
        const c = { ...o }
        delete c[evicted]
        return c
      })
      trimmed = next.slice(1)
    }
    setOpenPdfIds(trimmed)
    setActivePdfId(id)
  }, [])
  const handleOpenPdf = openPdf
  const handleClosePdf = useCallback((id: string) => {
    const next = openPdfIdsRef.current.filter((x) => x !== id)
    setPdfOutlineByPdf((o) => {
      const c = { ...o }
      delete c[id]
      return c
    })
    setOpenPdfIds(next)
    if (activePdfIdRef.current === id) {
      setActivePdfId(next.length > 0 ? next[next.length - 1] : null)
    }
    setPdfOutlineDest(null)
  }, [])

  // Panel card click → flash the annotation in the (active) PdfView.
  const handlePanelCardClick = useCallback((card: Item) => {
    if (!card.pdfRef) return
    pdfFlashToken.current += 1
    setPdfFlashTarget({
      page: card.pdfRef.page,
      annId: card.pdfRef.annotationId,
      token: pdfFlashToken.current
    })
  }, [])

  // PdfView annotation popover "跳转卡片" → scroll the panel to that card.
  const handleJumpInPanel = useCallback((cardId: string) => {
    pdfScrollToken.current += 1
    setPdfScrollTarget({ cardId, token: pdfScrollToken.current })
  }, [])

  // Place PDF-sourced cards into a project (未分类) / unplace back to PDF-only.
  const handlePlaceCards = useCallback(
    async (cardIds: string[], projectId: string) => {
      for (const id of cardIds) await placePdfCard(id, projectId)
    },
    []
  )
  const handleUnplaceCards = useCallback(async (cardIds: string[]) => {
    for (const id of cardIds) await unplacePdfCard(id)
  }, [])

  // Placed card's project chip → jump to the project (未分类) + highlight it.
  const handleJumpToProject = useCallback((card: Item) => {
    if (!card.projectId) return
    setSidebarTab("projects")
    setActiveProjectId(card.projectId)
    setActiveSectionByProject((prev) => ({
      ...prev,
      [card.projectId!]: null
    }))
    setProjectCardHighlightId(card.id)
    if (projectCardHighlightTimer.current)
      window.clearTimeout(projectCardHighlightTimer.current)
    projectCardHighlightTimer.current = window.setTimeout(() => {
      setProjectCardHighlightId(null)
      projectCardHighlightTimer.current = null
    }, 2000)
  }, [])

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
    [openPdf]
  )

  const handleBackupToggleSelect = useCallback(
    (id: string) => {
      if (backupScope === "projects") {
        setBackupSelectedIds((prev) =>
          prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        )
      } else {
        setBackupSelectedPdfIds((prev) =>
          prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        )
      }
    },
    [backupScope]
  )

  const handleBackupSelectAll = useCallback(() => {
    if (backupScope === "projects") {
      setBackupSelectedIds((prev) =>
        prev.length === projects.length ? [] : projects.map((p) => p.id)
      )
    } else {
      setBackupSelectedPdfIds((prev) =>
        prev.length === pdfs.length ? [] : pdfs.map((p) => p.id)
      )
    }
  }, [backupScope, projects, pdfs])

  const handleDeletePdf = useCallback(
    (pdf: PdfFile) => {
      setPdfDeleteTarget(pdf)
    },
    []
  )

  const confirmDeletePdf = useCallback(async () => {
    if (!pdfDeleteTarget) return
    await deletePdf(pdfDeleteTarget.id)
    setOpenPdfIds((prev) => prev.filter((x) => x !== pdfDeleteTarget.id))
    setPdfOutlineByPdf((o) => {
      const c = { ...o }
      delete c[pdfDeleteTarget.id]
      return c
    })
    if (activePdfId === pdfDeleteTarget.id) setActivePdfId(null)
    setPdfDeleteTarget(null)
  }, [pdfDeleteTarget, activePdfId])

  // Subscribe to database changes via storage broadcast
  const refreshRef = useRef(refreshAllData)
  refreshRef.current = refreshAllData

  // Coalesce burst writes: a batch/annotation/toggle sequence fires many _dbi
  // broadcasts within ~150ms — debounce them into ONE refreshAllData instead of
  // a full-store re-scan per write.
  const refreshTimerRef = useRef<number | null>(null)
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>
    ) => {
      if (changes._dbi || changes._dbp) {
        if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = window.setTimeout(() => {
          refreshTimerRef.current = null
          refreshRef.current()
        }, 150)
      }
      // Review writes broadcast `_dbr`: reload only review state (light),
      // never the full refreshAllData chain.
      if (changes._dbr) {
        setReviewsVersion((v) => v + 1)
      }
      // PDF writes broadcast `_dbpdf`: refresh the PDF library + the cards panel.
      if (changes._dbpdf) {
        loadPdfs()
        loadPdfPanelData()
      }
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [loadPdfs, loadPdfPanelData])

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null

  const countByPdf = useMemo(() => {
    const m: Record<string, number> = {}
    for (const it of allItemsUnfiltered) {
      if (it.pdfRefPdfId) m[it.pdfRefPdfId] = (m[it.pdfRefPdfId] ?? 0) + 1
    }
    return m
  }, [allItemsUnfiltered])
  const otherProjects = useMemo(
    () => projects.filter((p) => p.id !== activeProjectId),
    [projects, activeProjectId]
  )

  // ---- Section view state (sidebar tree -> main area) ----
  const countBySection = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of allItems) {
      if (it.sectionId) m.set(it.sectionId, (m.get(it.sectionId) ?? 0) + 1)
    }
    return m
  }, [allItems])

  const unclassifiedByProject = useMemo(() => {
    const m: Record<string, number> = {}
    for (const it of allItems) {
      if (!it.sectionId) m[it.projectId] = (m[it.projectId] ?? 0) + 1
    }
    return m
  }, [allItems])

  // Per-project card counts (meaningful when no project is open, since
  // allItems then holds every project's cards for the hub overview).
  const countByProject = useMemo(() => {
    const m: Record<string, number> = {}
    for (const it of allItemsUnfiltered) {
      if (it.type !== "todo") m[it.projectId] = (m[it.projectId] ?? 0) + 1
    }
    return m
  }, [allItemsUnfiltered])

  const scopeItems = useMemo(() => {
    if (!activeSectionId) return allItems
    if (activeSectionId === "__unclassified__")
      return allItems.filter((i) => !i.sectionId)
    const section = activeProject?.sections?.find(
      (s) => s.id === activeSectionId
    )
    if (section?.level === 1) {
      const childIds = new Set(
        (activeProject?.sections ?? [])
          .filter((s) => s.level === 2 && s.parentId === activeSectionId)
          .map((s) => s.id)
      )
      return allItems.filter(
        (i) =>
          i.sectionId === activeSectionId ||
          (i.sectionId !== undefined && childIds.has(i.sectionId))
      )
    }
    return allItems.filter((i) => i.sectionId === activeSectionId)
  }, [allItems, activeSectionId, activeProject])

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
    [activeProjectId]
  )

  // Pointer-based card drag-reorder within the current scope (same section only).
  const {
    draggedId: cardDraggedId,
    drop: cardDrop,
    flipRectsRef,
    handleGripPointerDown
  } = useCardDragReorder({
    items: scopeItems,
    onMoveCard
  })

  // ItemDialog navigation follows the current view: review dates, full search
  // hits, or the visible section/project scope — not the paginated 20-card page.
  const navList =
    sidebarTab === "review" && reviewDateFilter
      ? filteredDateItems
      : keyword || dateRange
        ? allItems
        : scopeItems

  const handleNavigate = useCallback(
    (direction: "prev" | "next") => {
      if (!dialogItem) return
      const idx = navList.findIndex((i) => i.id === dialogItem.id)
      if (idx === -1) return
      const nextIdx = direction === "prev" ? idx - 1 : idx + 1
      if (nextIdx < 0 || nextIdx >= navList.length) return
      setDialogItem(navList[nextIdx])
    },
    [dialogItem, navList]
  )

  const navIndex = dialogItem
    ? navList.findIndex((i) => i.id === dialogItem.id)
    : -1
  const hasPrev = navIndex > 0
  const hasNext = navIndex >= 0 && navIndex < navList.length - 1

  const handleSetSidebarTab = useCallback(
    (tab: SidebarTab) => {
      if (tab === sidebarTab) {
        setDrawerOpen((prev) => !prev)
      } else {
        setSidebarTab(tab)
        setDrawerOpen(true)
      }
    },
    [sidebarTab]
  )

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
      const pdf = data._uiPdf as
        | { open?: boolean; width?: number }
        | undefined
      if (!pdf) return
      if (typeof pdf.open === "boolean") setPdfCardsOpen(pdf.open)
      if (typeof pdf.width === "number") setPdfCardsWidth(pdf.width)
    })
  }, [])

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
        allItemsUnfiltered,
        sectionId ?? null
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
    [projects, allItemsUnfiltered]
  )

  const handleCopyCard = async (targetProjectId: string) => {
    if (!copyCardId) return
    const card = allItems.find((i) => i.id === copyCardId)
    if (card) {
      const newCard = cloneItem(card, targetProjectId)
      const saved = await addItem(newCard)
      if (!saved) {
        setSnackbarMsg("目标项目已存在相同内容，跳过复制")
        setCopyCardId(null)
        onSearch()
        return
      }
    }
    setCopyCardId(null)
    onSearch()
  }

  const handleBatchCopy = () => setBatchCopyOpen(true)

  const handleBatchCopyCards = async (targetProjectId: string) => {
    let skipped = 0
    for (const id of selectedIds) {
      const card = allItems.find((i) => i.id === id)
      if (!card) continue
      const newCard = cloneItem(card, targetProjectId)
      const saved = await addItem(newCard)
      if (!saved) skipped++
    }
    setBatchCopyOpen(false)
    setSelectMode(false)
    setSelectedIds([])
    if (skipped > 0) setSnackbarMsg(`跳过 ${skipped} 条重复内容`)
    onSearch()
  }

  // ---- Todo state & handlers (global view, newest first, not draggable) ----
  const today = todayLocalDate()

  const todoStats = useMemo(() => {
    let incomplete = 0
    let completed = 0
    let overdue = 0
    let todayCount = 0
    for (const t of todoItems) {
      if (isTodoComplete(t.content)) {
        completed++
      } else {
        incomplete++
      }
      const s = dueStatus(t.dueDate, today)
      if (s === "overdue") overdue++
      if (s === "today") todayCount++
    }
    return { total: todoItems.length, incomplete, completed, overdue, today: todayCount }
  }, [todoItems, today])

  const filteredTodos = useMemo(() => {
    const list = todoItems.filter((t) => {
      switch (todoFilter) {
        case "all":
          return true
        case "incomplete":
          return !isTodoComplete(t.content)
        case "completed":
          return isTodoComplete(t.content)
        case "overdue":
          return dueStatus(t.dueDate, today) === "overdue"
        case "today":
          return dueStatus(t.dueDate, today) === "today"
      }
    })
    return list.sort((a, b) => {
      const ad = a.dueDate
      const bd = b.dueDate
      if (ad && bd) return ad.localeCompare(bd)
      if (ad) return -1
      if (bd) return 1
      return b.createdAt - a.createdAt
    })
  }, [todoItems, todoFilter, today])

  // Todo badge = incomplete todos only. Review cards must not inflate the
  // todo icon's number (review has its own due-count badge on the 复习 button).
  const todoCount = todoStats.incomplete

  const handleNewTodo = useCallback(() => {
    setFocusNewTaskId(null)
    setTodoFilter("incomplete")
    setTodoEditingId("__new__")
    setSidebarTab("todo")
  }, [])

  const handleStartEditTodo = useCallback((id: string) => {
    setFocusNewTaskId(null)
    setTodoEditingId(id)
  }, [])

  const handleQuickAdd = useCallback((item: Item) => {
    setTodoEditingId(item.id)
    setFocusNewTaskId(item.id)
  }, [])

  const handleToggleTodoTask = useCallback(
    async (item: Item, index: number) => {
      const next = toggleMarkdownTask(item.content, index)
      if (next === item.content) return
      await updateItem({ ...item, content: next })
    },
    []
  )

  const handleSaveTodo = useCallback(
    async (
      item: Item,
      title: string,
      content: string,
      dueDate?: string
    ) => {
      if (!title.trim() && !content.trim()) {
        setTodoEditingId(null)
        setFocusNewTaskId(null)
        return
      }
      const cleanDue =
        dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : undefined
      if (item.id === "__new__") {
        const created = createItem({
          type: "todo",
          title: title.trim() || undefined,
          content,
          ...(cleanDue && { dueDate: cleanDue })
        })
        await addItem(created, { skipDedup: true })
      } else {
        await updateItem({
          ...item,
          title: title.trim() || undefined,
          content,
          dueDate: cleanDue
        })
      }
      setTodoEditingId(null)
      setFocusNewTaskId(null)
    },
    []
  )

  const handleDeleteTodo = useCallback(async (item: Item) => {
    await deleteItem(item.id)
    setTodoEditingId(null)
    setFocusNewTaskId(null)
  }, [])

  // Full card set the current view renders. 全选 must target this scope, not
  // the paginated displayedItems slice (which only holds the first page) —
  // otherwise select-all in the section/outline view only picks 20 cards.
  const viewItems = keyword || dateRange ? allItems : scopeItems

  const sharedCardGridProps = {
    selectedIds,
    reviewItemIds,
    masteredItemIds,
    onOpenDialog: setDialogItem,
    onToggleReview: handleToggleReview,
    onReReview: handleReReview,
    onCopyToProject: setCopyCardId,
    onOpenPdfSource: handlePanelCardClick,
    highlightedId: projectCardHighlightId
  }

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
          minHeight: "100vh",
          bgcolor: "background.default"
        }}>
        <NavRail
          sidebarTab={sidebarTab}
          dueCount={dueCount}
          todoCount={todoCount}
          onSetSidebarTab={handleSetSidebarTab}
          onSettingsClick={() => setSettingsOpen(true)}
        />
        <SidebarFilters
          open={drawerOpen}
          width={drawerWidth}
          projects={projects}
          sidebarTab={sidebarTab}
          syncStatus={syncStatus}
          todoStats={todoStats}
          todoFilter={todoFilter}
          pdfs={pdfs}
          countByPdf={countByPdf}
          activePdfId={activePdfId}
          pdfOutline={pdfOutline}
          tocOpen={pdfTocOpen}
          onToggleToc={setPdfTocOpen}
          onTodoFilterChange={setTodoFilter}
          onOpenPdfClick={() => pdfFileInputRef.current?.click()}
          onOpenPdf={handleOpenPdf}
          onOutlineClick={setPdfOutlineDest}
          onWidthChange={(w) => setDrawerWidth(w)}
          onNewProjectClick={() => setCreateDialogOpen(true)}
          backupScope={backupScope}
          onBackupScopeChange={setBackupScope}
          onImportBackup={() => backupFileInputRef.current?.click()}
          onUploadSync={handleUploadSync}
          onDownloadSync={handleDownloadSync}
          recentDates={recentDates}
          reviewDateFilter={reviewDateFilter}
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
              setDialogItem(null)
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
            <AppHeader
              drawerOpen={drawerOpen}
              headerHeight={headerHeight}
              onToggleDrawer={handleToggleDrawer}
              reviewProgress={
                sidebarTab === "review" ? reviewProgress : undefined
              }
              activeProjectName={
                sidebarTab === "pdf" && activePdfId
                  ? (pdfs.find((p) => p.id === activePdfId)?.name.replace(
                      /\.pdf$/i,
                      ""
                    ) ?? null)
                  : (activeProject?.name ?? null)
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
                  <Tooltip title={pdfCardsOpen ? "折叠摘录面板" : "展开摘录面板"}>
                    <IconButton
                      size="small"
                      onClick={() => setPdfCardsOpen((o) => !o)}
                      sx={{
                        color: pdfCardsOpen ? "primary.main" : "text.secondary",
                        "&:hover": { color: "primary.main" },
                        "&.Mui-focusVisible": { outline: "none" }
                      }}>
                      <ViewColumnRoundedIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                  </Tooltip>
                </>
              ) : (
                activeProject && (
                  <>
                    <Tooltip title="新建卡片">
                      <IconButton
                        size="small"
                        onClick={handleNewCard}
                        sx={{
                          color: "text.secondary",
                          "&:hover": { color: "primary.main" },
                          "&.Mui-focusVisible": { outline: "none" }
                        }}>
                        <AddRoundedIcon sx={{ fontSize: 20 }} />
                      </IconButton>
                    </Tooltip>
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
                )
              )}
            </AppHeader>

            {sidebarTab !== "review" &&
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
                        label: "复制到",
                        icon: (
                          <FileCopyOutlinedIcon
                            sx={{ fontSize: 16, mr: 0.5 }}
                          />
                        ),
                        onClick: handleBatchCopy,
                        dividerBefore: true,
                        disabled: selectedIds.length === 0
                      },
                      {
                        label: "合并",
                        icon: (
                          <MergeTypeRoundedIcon sx={{ fontSize: 16, mr: 0.5 }} />
                        ),
                        onClick: handleBatchMerge,
                        disabled: selectedIds.length < 2
                      },
                      {
                        label: "删除选中",
                        icon: (
                          <DeleteSweepRoundedIcon sx={{ fontSize: 16, mr: 0.5 }} />
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

          {sidebarTab === "review" && reviewDateFilter && (
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
                  {recentDates.find((d) => d.key === reviewDateFilter)?.label ??
                    reviewDateFilter}
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
                  <Box
                    onClick={() => setRatingFilter(null)}
                    sx={(t) => ({
                      display: "flex",
                      alignItems: "center",
                      px: 0.75,
                      py: 0.25,
                      borderRadius: 1,
                      cursor: "pointer",
                      fontSize: "0.72rem",
                      lineHeight: 1.5,
                      color: ratingFilter === null ? t.palette.primary.main : "text.secondary",
                      bgcolor: ratingFilter === null ? alpha(t.palette.primary.main, 0.08) : "transparent",
                      "&:hover": { bgcolor: "action.hover" }
                    })}>
                    全部
                  </Box>
                  {RATING_META.map((meta, i) => {
                    const value = (i + 1) as 1 | 2 | 3
                    const active = ratingFilter === value
                    return (
                      <Box
                        key={meta.label}
                        onClick={() => setRatingFilter(active ? null : value)}
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
                          color: active ? meta.color : "text.secondary",
                          bgcolor: active ? alpha(meta.color, 0.08) : "transparent",
                          transition: "all 0.15s",
                          "&:hover": { bgcolor: "action.hover" }
                        }}>
                        <Box
                          sx={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            bgcolor: active ? meta.color : "text.disabled",
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
                    setReviewDateFilter(null)
                    setRatingFilter(null)
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
            {sidebarTab === "pdf" ? (
              openPdfIds.length > 0 ? (
                <Box
                  sx={{
                    display: "flex",
                    height: "100%",
                    minHeight: 0,
                    position: "relative"
                  }}>
                  <Box
                    sx={{
                      flex: 1,
                      minWidth: 400,
                      height: "100%",
                      overflow: "hidden"
                    }}>
                    {openPdfIds.map((id) => (
                      <Box
                        key={id}
                        sx={{
                          display: id === activePdfId ? "block" : "none",
                          height: "100%",
                          minHeight: 0
                        }}>
                        <PdfView
                          pdfId={id}
                          onOutlineLoaded={(o) =>
                            setPdfOutlineByPdf((prev) => ({
                              ...prev,
                              [id]: o
                            }))
                          }
                          outlineDest={pdfOutlineDest}
                          flashTarget={pdfFlashTarget}
                          onJumpInPanel={handleJumpInPanel}
                        />
                      </Box>
                    ))}
                  </Box>
                  <PdfCardsPanel
                    open={pdfCardsOpen}
                    width={pdfCardsWidth}
                    onWidthChange={setPdfCardsWidth}
                    onCollapse={() => setPdfCardsOpen(false)}
                    cards={pdfPanelCards}
                    annotations={pdfPanelAnnotations}
                    onCardClick={handlePanelCardClick}
                    scrollTarget={pdfScrollTarget}
                    projects={projects}
                    onPlace={handlePlaceCards}
                    onUnplace={handleUnplaceCards}
                    onJumpToProject={handleJumpToProject}
                  />
                </Box>
              ) : (
                <Box
                  sx={{
                    height: "100%",
                    overflowY: "auto",
                    bgcolor: (t) => t.custom.surface2
                  }}>
                  <Container sx={{ py: 4 }} maxWidth="xl">
                    <PdfHub
                      key={topics.join("|")}
                      pdfs={pdfs}
                      countByPdf={countByPdf}
                      onOpenPdf={handleOpenPdf}
                      onNewPdf={() => pdfFileInputRef.current?.click()}
                      onDeletePdf={handleDeletePdf}
                      topics={topics}
                      onNewTopic={handleNewTopic}
                      onRenameTopic={handleRenameTopic}
                      onDeleteTopic={handleDeleteTopic}
                      onMovePdf={handleMovePdf}
                    />
                  </Container>
                </Box>
              )
            ) : (
            <Container sx={{ py: 4 }} maxWidth="xl">
              <Fade in key={sidebarTab} timeout={250}>
                <Box>
                  {sidebarTab === "backup" ? (
                    <BackupView
                      scope={backupScope}
                      projects={projects}
                      pdfs={pdfs}
                      countByProject={countByProject}
                      countByPdf={countByPdf}
                      keyword={backupKeyword}
                      selectedIds={
                        backupScope === "projects"
                          ? backupSelectedIds
                          : backupSelectedPdfIds
                      }
                      onToggleSelect={handleBackupToggleSelect}
                    />
                  ) : sidebarTab === "todo" ? (
                    <TodoView
                      items={filteredTodos}
                      editingId={todoEditingId}
                      focusNewTaskId={focusNewTaskId}
                      onToggleTask={handleToggleTodoTask}
                      onStartEdit={handleStartEditTodo}
                      onCancelEdit={() => {
                        setTodoEditingId(null)
                        setFocusNewTaskId(null)
                      }}
                      onSave={handleSaveTodo}
                      onDelete={setTodoDeleteTarget}
                      onQuickAdd={handleQuickAdd}
                      onNewTodo={handleNewTodo}
                    />
                  ) : sidebarTab === "review" && reviewDateFilter ? (
                    <Box>
                      {ratingFilter && filteredDateItems.length === 0 ? (
                        <EmptyState
                          icon={
                            <SearchOffRoundedIcon
                              className="empty-icon"
                              sx={{ fontSize: 64, mb: 2 }}
                            />
                          }
                          title="该评分下无卡片"
                          subtitle="切换评分或清除筛选试试"
                        />
                      ) : (
                        <CardGrid
                          items={filteredDateItems}
                          selectMode={false}
                          readOnly
                          onSelectItem={() => {}}
                          onDeleteItem={() => {}}
                          firstRating={cardFirstRating}
                          {...sharedCardGridProps}
                        />
                      )}
                    </Box>
                  ) : sidebarTab === "review" ? (
                    <ReviewSession
                      item={reviewItems[0] ?? null}
                      remaining={reviewProgress.remaining}
                      ratedCount={reviewProgress.rated}
                      passedCount={reviewProgress.passed}
                      flipped={reviewFlipped}
                      completed={reviewCompleted}
                      animating={animating}
                      masteredCount={reviewStats.masteredCount}
                      activeCount={reviewStats.activeCount}
                      todayRatings={todayRatings}
                      streakDays={streakDays}
                      onFlip={handleReviewFlip}
                      onRate={handleReviewRate}
                      onExit={handleExitReview}
                    />
                  ) : (
                    <>
                      {!activeProject && (
                        <ProjectHub
                          projects={projects}
                          countByProject={countByProject}
                          keyword={keyword}
                          onOpenProject={(id) => {
                            // Hub keyword is a project filter, never a card
                            // search — clear it so the project opens unfiltered.
                            setKeyword("")
                            setDateRange(null)
                            handleOpenProject(id)
                          }}
                          onNewProject={() => setCreateDialogOpen(true)}
                          onDeleteProject={(id) => {
                            const proj = projects.find((p) => p.id === id)
                            if (proj) setProjectDeleteTarget(proj)
                          }}
                        />
                      )}

                      {activeProject &&
                        !keyword &&
                        !dateRange && (
                          <>
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                                px: 0.5,
                                pb: 1.5,
                                mb: 1,
                                borderBottom: "1px solid",
                                borderColor: "divider"
                              }}>
                              <Typography
                                variant="body2"
                                noWrap
                                sx={{
                                  color: "text.secondary",
                                  fontSize: "0.85rem",
                                  minWidth: 0
                                }}>
                                <Box
                                  component="span"
                                  sx={{
                                    color: "text.primary",
                                    fontWeight: 600,
                                    cursor: activeSectionId
                                      ? "pointer"
                                      : "default",
                                    "&:hover": activeSectionId
                                      ? { color: "primary.main" }
                                      : undefined
                                  }}
                                  onClick={
                                    activeSectionId
                                      ? () => handleSelectSection(null)
                                      : undefined
                                  }>
                                  {activeProject.name}
                                </Box>
                                {sectionPath.length > 0 &&
                                  sectionPath.map((seg, i) => {
                                    const isLast = i === sectionPath.length - 1
                                    const goTo = isLast
                                      ? undefined
                                      : () => handleSelectSection(seg.id)
                                    return (
                                      <Fragment key={seg.id}>
                                        <Box
                                          component="span"
                                          sx={{
                                            mx: 0.75,
                                            color: "text.disabled"
                                          }}>
                                          /
                                        </Box>
                                        <Box
                                          component="span"
                                          sx={{
                                            cursor: goTo ? "pointer" : "default",
                                            color: isLast
                                              ? "text.secondary"
                                              : "text.primary",
                                            "&:hover": goTo
                                              ? { color: "primary.main" }
                                              : undefined
                                          }}
                                          onClick={goTo}>
                                          {seg.title}
                                        </Box>
                                      </Fragment>
                                    )
                                  })}
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{
                                  color: "text.disabled",
                                  fontSize: "0.75rem",
                                  flexShrink: 0
                                }}>
                                {scopeItems.length} 张
                              </Typography>
                            </Box>
                            <CardGrid
                              items={scopeItems}
                              draggable
                              draggedId={cardDraggedId}
                              dropIndicator={cardDrop}
                              flipRectsRef={flipRectsRef}
                              onGripPointerDown={handleGripPointerDown}
                              onNewCard={handleNewCard}
                              selectMode={selectMode}
                              onSelectItem={(id) =>
                                setSelectedIds((prev) =>
                                  prev.includes(id)
                                    ? prev.filter((i) => i !== id)
                                    : [...prev, id]
                                )
                              }
                              onDeleteItem={onDelete}
                              {...sharedCardGridProps}
                            />
                          </>
                        )}

                      {activeProject &&
                        (keyword || dateRange) && (
                          <CardGrid
                            items={displayedItems}
                            selectMode={selectMode}
                            onSelectItem={(id) =>
                              setSelectedIds((prev) =>
                                prev.includes(id)
                                  ? prev.filter((i) => i !== id)
                                  : [...prev, id]
                              )
                            }
                            onDeleteItem={onDelete}
                            {...sharedCardGridProps}
                          />
                        )}

                      {activeProject &&
                        !hasMore &&
                        allItems.length === 0 &&
                        (keyword ? (
                          <EmptyState
                            icon={
                              <SearchOffRoundedIcon
                                className="empty-icon"
                                sx={{ fontSize: 80, mb: 3 }}
                              />
                            }
                            title="没有找到匹配的卡片"
                            subtitle="试试其他关键词"
                          />
                        ) : dateRange ? (
                          <EmptyState
                            icon={
                              <SearchOffRoundedIcon
                                className="empty-icon"
                                sx={{ fontSize: 80, mb: 3 }}
                              />
                            }
                            title="该时间段内无相关卡片"
                            subtitle="请调整日期范围"
                          />
                        ) : (
                          <EmptyState
                            icon={
                              <NoteAddRoundedIcon
                                className="empty-icon"
                                sx={{ fontSize: 80, mb: 3 }}
                              />
                            }
                            title="此项目暂无卡片"
                            subtitle="点击顶部 ＋ 按钮新建一张卡片"
                          />
                        ))}

                      {activeProject &&
                        !keyword &&
                        !dateRange &&
                        allItems.length > 0 &&
                        scopeItems.length === 0 && (
                          <EmptyState
                            icon={
                              <NoteAddRoundedIcon
                                className="empty-icon"
                                sx={{ fontSize: 80, mb: 3 }}
                              />
                            }
                            title="此章节暂无卡片"
                            subtitle="选中卡片后拖入侧栏对应章节，或使用「移动到章节」"
                          />
                        )}

                      {hasMore &&
                        activeProject &&
                        (keyword || dateRange) && (
                          <Box
                            ref={loadMoreRef}
                            sx={{
                              display: "flex",
                              justifyContent: "center",
                              py: 4
                            }}>
                            <CircularProgress size={24} />
                          </Box>
                        )}
                    </>
                  )}
                </Box>
              </Fade>

              </Container>
             )}

              <ItemDialog
                item={dialogItem}
                open={Boolean(dialogItem)}
                readOnly={sidebarTab === "review"}
                hasPrev={hasPrev}
                hasNext={hasNext}
                onClose={() => setDialogItem(null)}
                onNavigate={handleNavigate}
                onSave={async (updated) => {
                  // Atomically save item update and optionally remove from review
                  await tx(
                    { items: "readwrite", reviews: "readwrite" },
                    async (stores) => {
                      stores.items.put({ ...updated, updatedAt: Date.now() })
                      if (!updated.title) {
                        const idx = stores.reviews.index("itemId")
                        return new Promise<void>((resolve, reject) => {
                          const req = idx.getKey(updated.id)
                          req.onsuccess = () => {
                            if (req.result)
                              stores.reviews.delete(req.result as string)
                            resolve()
                          }
                          req.onerror = () => reject(req.error)
                        })
                      }
                    }
                  )
                  if (!updated.title) {
                    setReviewItemIds((prev) => {
                      const next = new Set(prev)
                      next.delete(updated.id)
                      return next
                    })
                  }
                  setDialogItem(null)
                  onSearch()
                }}
              />

              <NewCardDialog
                open={newCardOpen}
                title={newCardTitle}
                content={newCardContent}
                onTitleChange={setNewCardTitle}
                onContentChange={setNewCardContent}
                onClose={() => setNewCardOpen(false)}
                onSave={handleSaveNewCard}
              />

              <Dialog
                open={Boolean(reviewTitlePending)}
                onClose={() => setReviewTitlePending(null)}
                maxWidth="xs"
                fullWidth
                slotProps={{ paper: { sx: { borderRadius: 2 } } }}>
                <DialogTitle sx={{ fontSize: "1rem" }}>加入复习</DialogTitle>
                <DialogContent>
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
                    value={reviewTitleDraft}
                    onChange={(e) => setReviewTitleDraft(e.target.value)}
                    sx={{
                      mb: 2,
                      "& .MuiOutlinedInput-root": { borderRadius: 1 }
                    }}
                  />
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button
                      size="small"
                      onClick={() => setReviewTitlePending(null)}
                      sx={{ borderRadius: 1 }}>
                      取消
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      disabled={!reviewTitleDraft.trim()}
                      sx={{ borderRadius: 1 }}
                      onClick={async () => {
                        const card = allItemsUnfiltered.find(
                          (i) => i.id === reviewTitlePending
                        )
                        if (!card || !reviewTitleDraft.trim()) return
                        // Update card title
                        await updateItem({
                          ...card,
                          title: reviewTitleDraft.trim()
                        })
                        // Add to review (skip if it entered review while the
                        // dialog was open — itemId has a unique index).
                        const alreadyInReview = reviewItemIds.has(card.id)
                        if (!alreadyInReview) {
                          await addReview(
                            createReviewEntry(card.id, card.projectId ?? "")
                          )
                        }
                        setReviewTitlePending(null)
                        setReviewTitleDraft("")
                        const reviews = await getAllReviews()
                        setReviewItemIds(new Set(reviews.map((r) => r.itemId)))
                        setSnackbarMsg(
                          alreadyInReview ? "已在复习中" : "已加入复习"
                        )
                      }}>
                      加入复习
                    </Button>
                  </Stack>
                </DialogContent>
              </Dialog>

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
                open={Boolean(confirmDeleteId) || confirmBatchDelete}
                batch={confirmBatchDelete}
                count={selectedIds.length}
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
                      ？其中 {pendingSectionDelete.cardCount}{" "}
                      张卡片将移至未分类。
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

              <Toast
                open={Boolean(snackbarMsg)}
                message={snackbarMsg}
                onClose={() => setSnackbarMsg("")}
              />

              <CopyCardsDialog
                open={Boolean(copyCardId)}
                title="复制到…"
                projects={otherProjects}
                onSelect={handleCopyCard}
                onClose={() => setCopyCardId(null)}
              />

              <CopyCardsDialog
                open={batchCopyOpen}
                title="批量复制到…"
                projects={otherProjects}
                onSelect={handleBatchCopyCards}
                onClose={() => setBatchCopyOpen(false)}
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
                   setSidebarTab("pdf")
                 }
                 e.target.value = ""
               }}
             />
           </Box>
          <FooterBar
            sidebarTab={sidebarTab}
            totalItems={allItemsUnfiltered.length}
            totalProjects={projects.length}
            dueCount={dueCount}
            syncStatus={syncStatus}
            version={chrome.runtime.getManifest().version}
            todoStats={todoStats}
            activeProjectName={activeProject?.name ?? null}
            activeProjectItemCount={
              allItemsUnfiltered.filter((i) => i.projectId === activeProjectId)
                .length
            }
          />
        </Box>
      </Box>
    </ThemeProvider>
  )
}
