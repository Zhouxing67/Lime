import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { getDueReviews, getReviewStatsByStore, searchItems as dbSearch } from "../database"
import type { Item } from "../types"
import { getRecentItems as getRecentItemsBySrs } from "./useSrs"
import type { ReviewStats } from "./useSrs"

function pairWithItems(
  reviews: Awaited<ReturnType<typeof getDueReviews>>,
  items: Item[]
): Item[] {
  const itemMap = new Map(items.map((i) => [i.id, i]))
  return reviews
    .map((r) => itemMap.get(r.itemId))
    .filter((i): i is Item => i !== undefined)
}

export function useReview(options: {
  allItemsUnfiltered: Item[]
  searchItems: typeof dbSearch
  onSearch: () => Promise<void>
  sidebarTab: "projects" | "review" | "backup"
  setSidebarTab: (tab: "projects" | "review" | "backup") => void
  reviewItems: Item[]
  setReviewItems: (items: Item[]) => void
  previewCount: number
  setPreviewCount: (n: number) => void
  previewItems: Item[]
  setPreviewItems: (items: Item[]) => void
  reviewDateFilter: string | null
  setReviewDateFilter: (key: string | null) => void
  reviewProgress: { current: number; total: number }
  setReviewProgress: (p: { current: number; total: number }) => void
}) {
  const {
    allItemsUnfiltered,
    searchItems,
    onSearch,
    sidebarTab,
    setSidebarTab,
    previewCount,
    setPreviewCount,
    setPreviewItems,
    reviewItems,
    reviewDateFilter,
    setReviewDateFilter,
    setReviewProgress,
    setReviewItems
  } = options

  // Guards against concurrent async start/exit
  const reviewStartingRef = useRef(false)

  const [dueCount, setDueCount] = useState(0)
  const [reviewStats, setReviewStats] = useState<ReviewStats>({
    totalReviews: 0,
    masteredCount: 0,
    dueCount: 0,
    streakDays: 0,
    dailyActivity: [],
    accuracyRate: 0,
    todayRatingDistribution: [0, 0, 0, 0]
  })
  const [recentItems, setRecentItems] = useState<{ date: string; items: Item[] }[]>([])

  useEffect(() => {
    getReviewStatsByStore().then((s) => {
      setDueCount(s.dueCount)
      setReviewStats({
        totalReviews: 0,
        masteredCount: s.masteredCount,
        dueCount: s.dueCount,
        streakDays: 0,
        dailyActivity: [],
        accuracyRate: 0,
        todayRatingDistribution: [0, 0, 0, 0]
      })
    })
    getRecentItemsBySrs().then(setRecentItems)
  }, [allItemsUnfiltered])

  const recentDates = useMemo(() => {
    const DAY_MS = 86400000
    const now = Date.now()
    const result: { key: string; label: string; count: number }[] = []
    for (let i = 0; i < 3; i++) {
      const d = new Date(now - i * DAY_MS)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      const label = i === 0 ? "（今天）" : i === 1 ? "（昨天）" : "（前天）"
      const group = recentItems.find((g) => g.date === key)
      if (group) {
        result.push({ key, label: `${d.getMonth() + 1}月${d.getDate()}日${label}`, count: group.items.length })
      }
    }
    return result
  }, [recentItems])

  const reviewDateItems = useMemo(() => {
    if (!reviewDateFilter) return []
    return recentItems.find((g) => g.date === reviewDateFilter)?.items ?? []
  }, [reviewDateFilter, recentItems])

  const handleStartReview = useCallback(async () => {
    if (reviewStartingRef.current) return
    reviewStartingRef.current = true
    try {
      setPreviewCount(0)
      setPreviewItems([])
      const due = await getDueReviews()
      const items = pairWithItems(due, allItemsUnfiltered)
      setReviewItems(items)
      setSidebarTab("review")
    } finally {
      reviewStartingRef.current = false
    }
  }, [allItemsUnfiltered, setSidebarTab, setPreviewCount, setPreviewItems, setReviewItems])

  useEffect(() => {
    if (sidebarTab === "review" && !reviewDateFilter && reviewItems.length === 0) {
      handleStartReview()
    }
  }, [sidebarTab, reviewDateFilter, handleStartReview, reviewItems])

  const handleExitReview = useCallback(async () => {
    setReviewItems([])
    setSidebarTab("projects")
    await onSearch()
  }, [onSearch, setSidebarTab, setReviewItems])

  const handlePreview = useCallback(
    async (count: number) => {
      if (count === previewCount) {
        setPreviewCount(0)
        setPreviewItems([])
        setSidebarTab("projects")
        return
      }
      setPreviewCount(count)
      setReviewDateFilter(null)
      setSidebarTab("review")
      const due = await getDueReviews()
      const items = pairWithItems(due, allItemsUnfiltered)
      setPreviewItems(items.slice(0, count))
    },
    [previewCount, allItemsUnfiltered, setSidebarTab, setPreviewCount, setPreviewItems, setReviewDateFilter]
  )

  const handleReviewDateClick = useCallback((dateKey: string | null) => {
    setReviewDateFilter(dateKey)
    setPreviewCount(0)
    setPreviewItems([])
    if (dateKey) setSidebarTab("review")
  }, [setSidebarTab, setReviewDateFilter, setPreviewCount, setPreviewItems])

  return {
    dueCount,
    reviewStats,
    recentDates,
    reviewDateItems,
    handleStartReview,
    handleExitReview,
    handlePreview,
    handleReviewDateClick,
    recentItems
  }
}
