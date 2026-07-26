import CloseRoundedIcon from "@mui/icons-material/CloseRounded"
import InboxRoundedIcon from "@mui/icons-material/InboxRounded"
import NoteAddRoundedIcon from "@mui/icons-material/NoteAddRounded"
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded"
import AddRoundedIcon from "@mui/icons-material/AddRounded"
import DoneAllRoundedIcon from "@mui/icons-material/DoneAllRounded"
import {
  Alert,
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
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery
} from "@mui/material"
import { ThemeProvider, alpha } from "@mui/material/styles"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import AppHeader from "./components/AppHeader"
import BatchToolbar from "./components/BatchToolbar"
import CardGrid from "./components/CardGrid"
import DateRangeFilter from "./components/DateRangeFilter"
import DeleteConfirmDialog from "./components/DeleteConfirmDialog"
import EmptyState from "./components/EmptyState"
import FilterChips from "./components/FilterChips"
import FooterBar from "./components/FooterBar"
import ItemDialog from "./components/ItemDialog"
import MoveCopyCards from "./components/MoveCopyCards"
import NewCardDialog from "./components/NewCardDialog"
import NewProjectDialog from "./components/NewProjectDialog"
import ReviewSession from "./components/ReviewSession"
import SettingsDialog from "./components/SettingsDialog"
import SidebarFilters from "./components/SidebarFilters"
import { useBackupSync } from "./hooks/useBackupSync"
import { useNewCard } from "./hooks/useNewCard"
import { useProjects } from "./hooks/useProjects"
import { useReview } from "./hooks/useReview"
import { dayKey, rateSrs } from "./hooks/useSrs"
import {
  addItem,
  addReview,
  deleteItem,
  deleteItems,
  getAllReviews,
  getDueReviews,
  isDuplicate,
  removeReview,
  searchItems,
  tx,
  updateItem,
  updateReviewSrs
} from "./database"
import { importFromZip } from "./import"
import { createAppTheme } from "./theme"
import type { Item, PresetName, SearchQuery, SrsData } from "./types"
import { computeItemHash } from "./utils"
import { sendMessage } from "./types/messages"

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
  const [sidebarTab, setSidebarTab] = useState<"projects" | "review" | "backup">("projects")
  const [reviewItems, setReviewItems] = useState<Item[]>([])
  const [reviewDateFilter, setReviewDateFilter] = useState<string | null>(null)
  const [ratingFilter, setRatingFilter] = useState<1 | 2 | 3 | 4 | null>(null)
  const [allItemsUnfiltered, setAllItemsUnfiltered] = useState<Item[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [readingFilter, setReadingFilter] = useState(false)
  const [dateRange, setDateRange] = useState<{ from?: number; to?: number } | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const [moveCardId, setMoveCardId] = useState<string | null>(null)
  const [copyCardId, setCopyCardId] = useState<string | null>(null)
  const [batchAction, setBatchAction] = useState<"move" | "copy" | null>(null)
  const [snackbarMsg, setSnackbarMsg] = useState("")
  const [backupSelectedIds, setBackupSelectedIds] = useState<string[]>([])
  const [syncStatus, setSyncStatus] = useState("")
  const [reviewItemIds, setReviewItemIds] = useState<Set<string>>(new Set())
  const [reviewSrsMap, setReviewSrsMap] = useState<Map<string, SrsData>>(new Map())
  const [reviewTitlePending, setReviewTitlePending] = useState<string | null>(null)
  const [reviewTitleDraft, setReviewTitleDraft] = useState("")
  // Review session state (owned by options.tsx, not ReviewSession)
  const [reviewIndex, setReviewIndex] = useState(0)
  const [reviewFlipped, setReviewFlipped] = useState(false)
  const [reviewCompleted, setReviewCompleted] = useState(false)
  const [sessionRatings, setSessionRatings] = useState<Map<string, number>>(new Map())
  const [animating, setAnimating] = useState(false)
  const [sessionTotal, setSessionTotal] = useState(0)

  console.debug("[review:state]", {
    reviewItems: reviewItems.length,
    reviewCompleted,
    reviewIndex,
    reviewFlipped,
    sidebarTab,
    reviewDateFilter,
    reviewItemIds: reviewItemIds.size
  })
  const [slideDir, setSlideDir] = useState<1 | -1>(1)

  const reviewProgress = useMemo(() => ({
    current: Math.min(reviewIndex + 1, reviewItems.length),
    total: reviewItems.length,
    sessionMastered: Array.from(sessionRatings.values()).filter((r) => r >= 3).length
  }), [reviewIndex, reviewItems.length, sessionRatings])

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
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt)
      setAllItems(list)
      setDisplayedItems(list.slice(0, ITEMS_PER_PAGE))
      setHasMore(list.length > ITEMS_PER_PAGE)
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
    handleDeleteProject
  } = useProjects({
    onSearch,
    onActivate: (id) => {
      setActiveProjectId(id)
      onSearch(id)
      sendMessage({ kind: "set-recent-project", projectId: id }).catch(() => {})
    },
    onDeactivate: () => {
      setActiveProjectId(null)
      setDialogItem(null)
      onSearch(null)
    }
  })

  const {
    dueCount,
    reviewStats,
    recentDates,
    reviewDateItems,
    handleStartReview,
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
    reviewItems, setReviewItems,
    reviewDateFilter, setReviewDateFilter
  })

  const cardFirstRating = useMemo(() => {
    const m = new Map<string, 1 | 2 | 3 | 4>()
    if (!reviewDateFilter) return m
    for (const [itemId, srs] of reviewSrsMap) {
      if (!srs.reviewHistory) continue
      const entry = srs.reviewHistory.find((e) => dayKey(e.date) === reviewDateFilter)
      if (entry) m.set(itemId, entry.rating)
    }
    return m
  }, [reviewDateFilter, reviewSrsMap])

  const filteredDateItems = useMemo(() => {
    if (!ratingFilter) return reviewDateItems
    return reviewDateItems.filter((item) => cardFirstRating.get(item.id) === ratingFilter)
  }, [reviewDateItems, ratingFilter, cardFirstRating])

  // Navigation within the current active list
  const handleNavigate = useCallback(
    (direction: "prev" | "next") => {
      if (!dialogItem) return
      const list = sidebarTab === "review" && reviewDateFilter
        ? filteredDateItems
        : displayedItems
      const idx = list.findIndex((i) => i.id === dialogItem.id)
      if (idx === -1) return
      const nextIdx = direction === "prev" ? idx - 1 : idx + 1
      if (nextIdx < 0 || nextIdx >= list.length) return
      setDialogItem(list[nextIdx])
    },
    [dialogItem, displayedItems, filteredDateItems, sidebarTab, reviewDateFilter]
  )

  const navList = sidebarTab === "review" && reviewDateFilter
    ? filteredDateItems
    : displayedItems
  const navIndex = dialogItem ? navList.findIndex((i) => i.id === dialogItem.id) : -1
  const hasPrev = navIndex > 0
  const hasNext = navIndex >= 0 && navIndex < navList.length - 1

  // Mount: initial load
  useEffect(() => {
    onSearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load unfiltered items for review (cross-project, independent of active project)
  useEffect(() => {
    searchItems({}).then(setAllItemsUnfiltered)
  }, [])

  // Load review states (refresh when data changes)
  useEffect(() => {
    getAllReviews().then((reviews) => {
      setReviewItemIds(new Set(reviews.map((r) => r.itemId)))
      setReviewSrsMap(new Map(reviews.map((r) => [r.itemId, r.srs])))
    })
  }, [allItemsUnfiltered])

  // Immediate search for non-keyword filter changes
  useEffect(() => {
    onSearch()
  }, [activeProjectId, dateRange])

  // Debounced search for keyword (avoids per-keystroke queries)
  useEffect(() => {
    const t = setTimeout(() => {
      onSearch()
    }, 300)
    return () => clearTimeout(t)
  }, [keyword])

  // Reset review session state when exiting review
  useEffect(() => {
    if (reviewItems.length === 0 && sidebarTab !== "review") {
      setReviewFlipped(false)
      setAnimating(false)
      setSlideDir(1)
      setReviewCompleted(false)
      setSessionRatings(new Map())
      setReviewIndex(0)
    }
  }, [reviewItems, sidebarTab])

  const handleToggleDrawer = () => {
    setDrawerOpen((prev) => !prev)
  }

  const handleOpenProject = (id: string) => {
    setActiveProjectId(id)
    onSearch(id)
    sendMessage({ kind: "set-recent-project", projectId: id }).catch(() => {})
  }

  const {
    newCardOpen,
    newCardTitle,
    newCardContent,
    setNewCardTitle,
    setNewCardContent,
    setNewCardOpen,
    handleNewCard,
    handleSaveNewCard
  } = useNewCard({ activeProjectId, onSearch })

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
  }, [hasMore])

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return
    setConfirmBatchDelete(true)
  }

  const handleConfirmBatchDelete = async () => {
    await deleteItems(selectedIds)
    setSelectMode(false)
    setSelectedIds([])
    setConfirmBatchDelete(false)
    onSearch()
  }

  const refreshAllData = useCallback(async () => {
    await loadProjects()
    await onSearch()
    const all = await searchItems({})
    setAllItemsUnfiltered(all)
    // reviewItemIds + reviewSrsMap updated by the effect on allItemsUnfiltered change
  }, [loadProjects, onSearch])

  const handleToggleReview = useCallback(
    async (itemId: string) => {
      const card = allItemsUnfiltered.find((i) => i.id === itemId)
      if (!card) return

      // If already in review, remove it
      if (reviewItemIds.has(itemId)) {
        console.debug("[review:toggle] removing", itemId)
        await removeReview(itemId)
        const dueAfter = await getDueReviews()
        console.debug("[review:toggle] removed, due count:", dueAfter.length)
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
      console.debug("[review:toggle] adding", itemId)
      await addReview({
        id: crypto.randomUUID(),
        itemId: card.id,
        projectId: card.projectId ?? "",
        srs: { dueDate: Date.now(), interval: 0, easeFactor: 2.5, reviewCount: 0, lastReviewDate: 0 },
        dueDate: Date.now(),
        status: "active",
        addedAt: Date.now()
      })
      const dueAfter = await getDueReviews()
      console.debug("[review:toggle] added, due count:", dueAfter.length)
      setReviewItemIds((prev) => new Set(prev).add(itemId))
      setSnackbarMsg("已加入复习")
    },
    [allItemsUnfiltered, reviewItemIds]
  )

  const handleReviewFlip = useCallback(() => {
    if (!animating) setReviewFlipped((prev) => !prev)
  }, [animating])

  const handleReviewRate = useCallback(
    async (rating: 1 | 2 | 3 | 4) => {
      if (reviewIndex >= reviewItems.length || animating || reviewItems.length === 0) return
      const current = reviewItems[reviewIndex]
      if (!current) return
      const currentSrs = reviewSrsMap.get(current.id)
      const newSrs = currentSrs
        ? rateSrs(currentSrs, rating)
        : rateSrs(
            { dueDate: Date.now(), interval: 0, easeFactor: 2.5, reviewCount: 0, lastReviewDate: 0 },
            rating
          )
      await updateReviewSrs(current.id, newSrs)
      setSessionRatings((prev) => {
        if (prev.has(current.id)) return prev
        const next = new Map(prev)
        next.set(current.id, rating)
        return next
      })
      setAnimating(true)
      setSlideDir(1)
      setTimeout(async () => {
        const due = await getDueReviews()
        const itemMap = new Map(allItemsUnfiltered.map((i) => [i.id, i]))
        const items = due.map((r) => itemMap.get(r.itemId)).filter((i): i is Item => i !== undefined)
        setReviewFlipped(false)
        if (items.length === 0) {
          setReviewCompleted(true)
          setReviewItems([])
        } else {
          setReviewItems(items)
          setReviewIndex(0)
        }
        setAnimating(false)
      }, 350)
    },
    [reviewIndex, reviewItems, reviewSrsMap, animating, allItemsUnfiltered]
  )

  const handleReviewPrev = useCallback(() => {
    if (reviewIndex > 0 && !animating) {
      setSlideDir(-1)
      setAnimating(true)
      setReviewFlipped(false)
      setTimeout(() => {
        setReviewIndex((i) => i - 1)
        setAnimating(false)
      }, 350)
    }
  }, [reviewIndex, animating])

  const handleReviewNext = useCallback(() => {
    if (reviewIndex < reviewItems.length - 1 && !animating) {
      setSlideDir(1)
      setAnimating(true)
      setReviewFlipped(false)
      setTimeout(() => {
        setReviewIndex((i) => i + 1)
        setAnimating(false)
      }, 350)
    }
  }, [reviewIndex, reviewItems.length, animating])

  const {
    backupFileInputRef,
    handleExportBackup,
    handleUploadSync,
    handleDownloadSync
  } = useBackupSync({
    projects,
    allItemsUnfiltered,
    backupSelectedIds,
    setBackupSelectedIds,
    syncStatus,
    setSyncStatus,
    refreshAllData,
    setSnackbarMsg
  })

  const handleImportBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const result = await importFromZip(file, backupSelectedIds.length > 0 ? backupSelectedIds : undefined)
      const msg = `导入完成：成功 ${result.imported} 条`
      const skipMsg = result.skipped > 0 ? `，跳过 ${result.skipped} 条` : ""
      if (result.errors.length > 0) {
        console.warn("导入跳过/失败的条目：", result.errors)
      }
      setSnackbarMsg(msg + skipMsg)
      await refreshAllData()
    } catch (err) {
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

  // Load LXGW WenKai font from CDN
  useEffect(() => {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = "https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.1.0/style.css"
    document.head.appendChild(link)
    return () => link.remove()
  }, [])

  // Subscribe to database changes via storage broadcast
  const refreshRef = useRef(refreshAllData)
  refreshRef.current = refreshAllData

  useEffect(() => {
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>
    ) => {
      if (changes._dbi || changes._dbp) {
        refreshRef.current()
      }
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [])

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null
  const otherProjects = useMemo(
    () => projects.filter((p) => p.id !== activeProjectId),
    [projects, activeProjectId]
  )

  const handleToggleRead = async (id: string) => {
    const item = allItems.find((i) => i.id === id)
    if (!item) return
    await updateItem({ ...item, read: !item.read })
    onSearch()
  }

  const handleToggleReadingFilter = () => {
    setReadingFilter((prev) => !prev)
  }

  const handleMoveCard = async (targetProjectId: string) => {
    if (!moveCardId) return
    const card = allItems.find((i) => i.id === moveCardId)
    if (card) {
      const hash = card.hash || (card.source ? await computeItemHash(card.content, card.source.url) : await computeItemHash(card.content, ""))
      if (await isDuplicate(hash, targetProjectId, card.source?.url)) {
        setSnackbarMsg("目标项目已存在相同内容，跳过移动")
        setMoveCardId(null)
        return
      }
      await updateItem({ ...card, projectId: targetProjectId, order: undefined })
    }
    setMoveCardId(null)
    onSearch()
  }

  const handleCopyCard = async (targetProjectId: string) => {
    if (!copyCardId) return
    const card = allItems.find((i) => i.id === copyCardId)
    if (card) {
      const newCard = {
        ...card,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        projectId: targetProjectId
      }
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

  const handleBatchMove = () => setBatchAction("move")
  const handleBatchCopy = () => setBatchAction("copy")

  const handleBatchMoveCopy = async (targetProjectId: string) => {
    let skipped = 0
    for (const id of selectedIds) {
      const card = allItems.find((i) => i.id === id)
      if (!card) continue
      if (batchAction === "move") {
      const hash = card.hash ?? await computeItemHash(card.content, card.source?.url ?? "")
        if (await isDuplicate(hash, targetProjectId, card.source?.url)) {
          skipped++
          continue
        }
        await updateItem({ ...card, projectId: targetProjectId, order: undefined })
      } else {
        const newCard = {
          ...card,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          projectId: targetProjectId
        }
        const saved = await addItem(newCard)
        if (!saved) skipped++
      }
    }
    setBatchAction(null)
    setSelectMode(false)
    setSelectedIds([])
    if (skipped > 0) setSnackbarMsg(`跳过 ${skipped} 条重复内容`)
    onSearch()
  }

  const readingFilteredItems = allItems.filter(
    (i) => i.type === "link" && !i.read
  )

  const sharedCardGridProps = {
    selectedIds,
    reviewItemIds,
    onOpenDialog: setDialogItem,
    onToggleReview: handleToggleReview,
    onToggleRead: handleToggleRead,
    onMoveToProject: setMoveCardId,
    onCopyToProject: setCopyCardId
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
      <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
        <SidebarFilters
          open={drawerOpen}
          width={drawerWidth}
          projects={projects}
          activeProjectId={activeProjectId}
          readingFilter={readingFilter}
          dueCount={dueCount}
          sidebarTab={sidebarTab}
          backupSelectedIds={backupSelectedIds}
          syncStatus={syncStatus}
          onToggleReadingFilter={handleToggleReadingFilter}
          onClose={handleToggleDrawer}
          onOpenProject={handleOpenProject}
          onRenameProject={handleRenameProject}
          onUpdateNote={handleUpdateNote}
          onDeleteProject={handleDeleteProject}
          onWidthChange={(w) => setDrawerWidth(w)}
          onSetSidebarTab={setSidebarTab}
          onNewProjectClick={() => setCreateDialogOpen(true)}
          onCloseProject={() => {
            setActiveProjectId(null)
            setDialogItem(null)
            onSearch(null)
          }}
          onToggleBackup={(id) =>
            setBackupSelectedIds((prev) =>
              prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
            )
          }
          onToggleBackupAll={() =>
            setBackupSelectedIds((prev) =>
              prev.length === projects.length ? [] : projects.map((p) => p.id)
            )
          }
          onExportBackup={handleExportBackup}
          onImportBackup={() => backupFileInputRef.current?.click()}
          onUploadSync={handleUploadSync}
          onDownloadSync={handleDownloadSync}
          recentDates={recentDates}
          reviewDateFilter={reviewDateFilter}
          onReviewDateClick={handleReviewDateClick}
        />

        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            height: "100vh",
            borderLeft: "2px solid",
            borderColor: "primary.main"
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
              onSettingsClick={() => setSettingsOpen(true)}
              reviewProgress={sidebarTab === "review" ? reviewProgress : undefined}
              reviewStats={sidebarTab === "review" ? reviewStats : undefined}
              activeProjectName={activeProject?.name}>
              {sidebarTab === "review" ? (
                <Tooltip title="退出复习">
                  <IconButton
                    size="small"
                    onClick={handleExitReview}
                    sx={{ color: "text.secondary", "&:hover": { color: "error.main" }, "&.Mui-focusVisible": { outline: "none" } }}>
                    <CloseRoundedIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                </Tooltip>
              ) : activeProject && (
                <>
                  <Tooltip title="新建卡片">
                    <IconButton
                      size="small"
                      onClick={handleNewCard}
                      sx={{ color: "text.secondary", "&:hover": { color: "primary.main" }, "&.Mui-focusVisible": { outline: "none" } }}>
                      <AddRoundedIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={selectMode ? "取消选择" : "选择卡片"}>
                    <IconButton
                      size="small"
                      onClick={onToggleSelectMode}
                      sx={{ color: selectMode ? "error.main" : "text.secondary", "&:hover": { color: "error.main" }, "&.Mui-focusVisible": { outline: "none" } }}>
                      <DoneAllRoundedIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                  </Tooltip>
                  <DateRangeFilter value={dateRange} onChange={setDateRange} />
                </>
              )}
            </AppHeader>

            {sidebarTab !== "review" && (
            <FilterChips
              keyword={keyword}
              onKeywordChange={setKeyword}
            />
            )}
          </Box>

          {sidebarTab === "review" && reviewDateFilter && (
            <Box sx={(theme: any) => ({ bgcolor: alpha(theme.palette.primary.main, 0.03), py: 1, px: 2 })}>
              <Stack direction="row" alignItems="center" spacing={0.5} flexWrap="wrap">
                <Typography variant="body2" sx={{ color: "text.secondary", mr: 1 }}>
                  回顾：{recentDates.find((d) => d.key === reviewDateFilter)?.label ?? reviewDateFilter}
                </Typography>
                {([null, 1, 2, 3, 4] as const).map((r) => {
                  const active = ratingFilter === r
                  const COLORS = ["#ef4444", "#f97316", "#22c55e", "#3b82f6"]
                  const LABELS = ["全部", "重来", "困难", "良好", "简单"]
                  const i = r === null ? 0 : r
                  const color = r === null ? "#94a3b8" : COLORS[r - 1]
                  return (
                    <Tooltip key={LABELS[i]} title={LABELS[i]}>
                      <Box
                        onClick={() => setRatingFilter(active ? null : r)}
                        sx={{
                          width: 14, height: 14, borderRadius: "50%", cursor: "pointer", flexShrink: 0,
                          bgcolor: active ? color : "transparent",
                          border: "2px solid",
                          borderColor: active ? color : "divider",
                          transition: "all 0.15s",
                          "&:hover": { borderColor: color, bgcolor: active ? color : `${color}22` }
                        }}
                      />
                    </Tooltip>
                  )
                })}
                <Box sx={{ flex: 1 }} />
                <Button size="small" onClick={() => { setReviewDateFilter(null); setRatingFilter(null) }} sx={{ borderRadius: 1 }}>
                  退出
                </Button>
              </Stack>
            </Box>
          )}

          <Box sx={{ flex: 1, overflow: "auto", minHeight: 0, bgcolor: (t: any) => t.palette.mode === "light" ? "#fcf9f3" : undefined }}>
          <Container sx={{ py: 4 }} maxWidth="xl">

            {selectMode && (
              <BatchToolbar
                selectedIds={selectedIds}
                onSelectAll={() =>
                  setSelectedIds(displayedItems.map((i) => i.id))
                }
                onBatchDelete={handleBatchDelete}
                onBatchMove={handleBatchMove}
                onBatchCopy={handleBatchCopy}
              />
            )}

            <Fade in key={sidebarTab} timeout={250}>
              <Box>
                {sidebarTab === "review" && reviewDateFilter ? (
                  <Box>
                    {ratingFilter && filteredDateItems.length === 0 ? (
                      <Typography variant="body2" sx={{ color: "text.secondary", textAlign: "center", py: 4 }}>
                        该评分下无卡片
                      </Typography>
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
                    item={reviewItems[reviewIndex] ?? null}
                    total={reviewCompleted ? sessionRatings.size : reviewItems.length}
                    current={Math.min(reviewIndex + 1, reviewItems.length)}
                    flipped={reviewFlipped}
                    completed={reviewCompleted}
                    animating={animating}
                    slideDir={slideDir}
                    ratings={sessionRatings}
                    masteredCount={reviewStats.masteredCount}
                    activeCount={reviewStats.activeCount}
                    todayRatings={todayRatings}
                    streakDays={streakDays}
                    onFlip={handleReviewFlip}
                    onRate={handleReviewRate}
                    onPrev={handleReviewPrev}
                    onNext={handleReviewNext}
                    onExit={handleExitReview}
                  />
            ) : (
              <>
            {!readingFilter && !activeProject && (
              <EmptyState
                icon={<InboxRoundedIcon className="empty-icon" sx={{ fontSize: 80, mb: 3 }} />}
                title="选择一个项目"
                subtitle="从左侧项目面板新建或打开项目，开始整理你的灵感卡片"
              />
            )}

            {readingFilter ? (
              readingFilteredItems.length === 0 ? (
                <EmptyState
                  icon={<SearchOffRoundedIcon className="empty-icon" sx={{ fontSize: 80, mb: 3 }} />}
                  title="阅读清单已清空"
                  subtitle="所有链接都已标记为已读"
                />
              ) : (
                <CardGrid
                  items={readingFilteredItems}
                  selectMode={selectMode}
                  onSelectItem={(id) =>
                    setSelectedIds((prev) =>
                      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
                    )
                  }
                   onDeleteItem={onDelete}
                   {...sharedCardGridProps}
                />
              )
            ) : null}

            {!readingFilter && activeProject && (
              <CardGrid
                items={displayedItems}
                selectMode={selectMode}
                onSelectItem={(id) =>
                  setSelectedIds((prev) =>
                    prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
                  )
                }
                onDeleteItem={onDelete}
                {...sharedCardGridProps}
              />
            )}

            {!readingFilter && activeProject && !hasMore && allItems.length === 0 && (
              keyword ? (
                <EmptyState
                  icon={<SearchOffRoundedIcon className="empty-icon" sx={{ fontSize: 80, mb: 3 }} />}
                  title="没有找到匹配的卡片"
                  subtitle="试试其他关键词"
                />
              ) : dateRange ? (
                <EmptyState
                  icon={<SearchOffRoundedIcon className="empty-icon" sx={{ fontSize: 80, mb: 3 }} />}
                  title="该时间段内无相关卡片"
                  subtitle="请调整日期范围"
                />
              ) : (
                <EmptyState
                  icon={<NoteAddRoundedIcon className="empty-icon" sx={{ fontSize: 80, mb: 3 }} />}
                  title="此项目暂无卡片"
                  subtitle="点击顶部 ＋ 按钮新建一张卡片"
                />
              )
            )}

            {hasMore && activeProject && !readingFilter && (
              <Box ref={loadMoreRef} sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                <CircularProgress size={24} />
              </Box>
            )}
              </>
            )}
              </Box>
            </Fade>

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
                await tx({ items: "readwrite", reviews: "readwrite" }, async (stores) => {
                  stores.items.put({ ...updated, updatedAt: Date.now() })
                  if (!updated.title) {
                    const idx = stores.reviews.index("itemId")
                    return new Promise<void>((resolve, reject) => {
                      const req = idx.getKey(updated.id)
                      req.onsuccess = () => {
                        if (req.result) stores.reviews.delete(req.result as string)
                        resolve()
                      }
                      req.onerror = () => reject(req.error)
                    })
                  }
                })
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
                <Typography variant="body2" sx={{ mb: 2, color: "text.secondary" }}>
                  请先为卡片设置摘要
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  autoFocus
                  placeholder="输入卡片摘要…"
                  value={reviewTitleDraft}
                  onChange={(e) => setReviewTitleDraft(e.target.value)}
                  sx={{ mb: 2, "& .MuiOutlinedInput-root": { borderRadius: 1 } }}
                />
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button size="small" onClick={() => setReviewTitlePending(null)} sx={{ borderRadius: 1 }}>
                    取消
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={!reviewTitleDraft.trim()}
                    sx={{ borderRadius: 1 }}
                    onClick={async () => {
                      const card = allItemsUnfiltered.find((i) => i.id === reviewTitlePending)
                      if (!card || !reviewTitleDraft.trim()) return
                      // Update card title
                      await updateItem({ ...card, title: reviewTitleDraft.trim() })
                      // Add to review
                      await addReview({
                        id: crypto.randomUUID(),
                        itemId: card.id,
                        projectId: card.projectId ?? "",
                        srs: { dueDate: Date.now(), interval: 0, easeFactor: 2.5, reviewCount: 0, lastReviewDate: 0 },
                        dueDate: Date.now(),
                        status: "active",
                        addedAt: Date.now()
                      })
                      setReviewTitlePending(null)
                      setReviewTitleDraft("")
                      const reviews = await getAllReviews()
                      setReviewItemIds(new Set(reviews.map((r) => r.itemId)))
                      setSnackbarMsg("已加入复习")
                    }}>
                    加入复习
                  </Button>
                </Stack>
              </DialogContent>
            </Dialog>

            <DeleteConfirmDialog
              open={Boolean(confirmDeleteId) || confirmBatchDelete}
              batch={confirmBatchDelete}
              count={selectedIds.length}
              onCancel={() => {
                setConfirmDeleteId(null)
                setConfirmBatchDelete(false)
              }}
              onConfirm={confirmBatchDelete ? handleConfirmBatchDelete : handleConfirmDelete}
            />

            <NewProjectDialog
              open={createDialogOpen}
              name={newProjectName}
              error={projectError}
              onNameChange={(v) => { setNewProjectName(v); setProjectError(null) }}
              onClose={() => { setCreateDialogOpen(false); setProjectError(null) }}
              onCreate={() => { handleCreateProject(); setCreateDialogOpen(false) }}
            />

            <SettingsDialog
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              preset={preset}
              onPresetChange={(name) => setPreset(name)}
            />

            <Snackbar
              open={Boolean(snackbarMsg)}
              autoHideDuration={2000}
              onClose={() => setSnackbarMsg("")}
              anchorOrigin={{ vertical: "top", horizontal: "center" }}>
              <Alert
                severity={snackbarMsg.includes("失败") ? "error" : "success"}
                variant="filled"
                sx={{ borderRadius: 1 }}>
                {snackbarMsg}
              </Alert>
            </Snackbar>

            <MoveCopyCards
              open={Boolean(moveCardId)}
              title="移动到…"
              projects={otherProjects}
              onSelect={handleMoveCard}
              onClose={() => setMoveCardId(null)}
            />

            <MoveCopyCards
              open={Boolean(copyCardId)}
              title="复制到…"
              projects={otherProjects}
              onSelect={handleCopyCard}
              onClose={() => setCopyCardId(null)}
            />

            <MoveCopyCards
              open={Boolean(batchAction)}
              title={batchAction === "move" ? "批量移动到…" : "批量复制到…"}
              projects={otherProjects}
              onSelect={handleBatchMoveCopy}
              onClose={() => setBatchAction(null)}
            />
            <input
              ref={backupFileInputRef}
              type="file"
              hidden
              accept=".zip"
              onChange={handleImportBackupFile}
            />
          </Container>
          </Box>
          <FooterBar
            totalItems={allItemsUnfiltered.length}
            totalProjects={projects.length}
            dueCount={dueCount}
            syncStatus={syncStatus}
            activeProjectName={activeProject?.name ?? null}
            activeProjectItemCount={allItemsUnfiltered.filter((i) => i.projectId === activeProjectId).length}
          />
        </Box>
      </Box>
    </ThemeProvider>
  )
}
