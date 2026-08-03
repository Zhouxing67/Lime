import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { SidebarTab } from "../components/NavRail"
import {
  searchItems as dbSearch,
  getAllReviews,
  getDueReviews,
  getReviewStatsByStore
} from "../database"
import type { Item } from "../types"
import { DAY_MS } from "../utils"
import { dayKey, getRecentItems as getRecentItemsBySrs } from "./useSrs"
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

interface UseReviewOptions {
  allItemsUnfiltered: Item[]
  searchItems: typeof dbSearch
  onSearch: () => Promise<void>
  sidebarTab: SidebarTab
  setSidebarTab: (tab: SidebarTab) => void
  reviewItems: Item[]
  setReviewItems: (items: Item[]) => void
  reviewDateFilter: string | null
  setReviewDateFilter: (key: string | null) => void
  /** Bumped on `_dbr` broadcasts so review stats reload without refreshAllData. */
  reviewsVersion: number
}

export function useReview(options: UseReviewOptions) {
  const {
    allItemsUnfiltered,
    searchItems,
    onSearch,
    sidebarTab,
    setSidebarTab,
    reviewItems,
    reviewDateFilter,
    setReviewDateFilter,
    setReviewItems,
    reviewsVersion
  } = options

  const [dueCount, setDueCount] = useState(0)
  const [reviewStats, setReviewStats] = useState<ReviewStats>({
    masteredCount: 0,
    dueCount: 0,
    activeCount: 0
  })
  const [recentItems, setRecentItems] = useState<
    { date: string; items: Item[] }[]
  >([])
  const [todayRatings, setTodayRatings] = useState<
    [number, number, number]
  >([0, 0, 0])
  const [streakDays, setStreakDays] = useState(0)

  const allItemsRef = useRef(allItemsUnfiltered)
  allItemsRef.current = allItemsUnfiltered

  useEffect(() => {
    getReviewStatsByStore().then((s) => {
      setDueCount(s.dueCount)
      setReviewStats({
        masteredCount: s.masteredCount,
        dueCount: s.dueCount,
        activeCount: s.activeCount
      })
    })
    getRecentItemsBySrs(allItemsUnfiltered).then(setRecentItems)
    getAllReviews().then((reviews) => {
      const todayKey = dayKey(Date.now())
      const allDateKeys = new Set<string>()
      const counts: [number, number, number] = [0, 0, 0]
      for (const r of reviews) {
        if (!r.srs.reviewHistory) continue
        let foundToday = false
        for (const h of r.srs.reviewHistory) {
          allDateKeys.add(dayKey(h.date))
          if (dayKey(h.date) === todayKey && !foundToday) {
            foundToday = true
            // 1=不认识, 2=模糊, 3=认识; legacy 4 maps to 认识 (index 2).
            if (h.rating >= 1 && h.rating <= 4) {
              const idx = h.rating >= 3 ? 2 : h.rating - 1
              counts[idx]++
            }
          }
        }
      }
      setTodayRatings(counts)
      const sorted = Array.from(allDateKeys).sort().reverse()
      const now = new Date()
      let streak = 0
      for (let i = 0; i < sorted.length; i++) {
        const d = new Date(now)
        d.setDate(now.getDate() - i)
        if (sorted[i] === dayKey(d.getTime())) streak++
        else break
      }
      setStreakDays(streak)
    })
  }, [allItemsUnfiltered, reviewsVersion])

  // Load due cards every time the user enters review tab (always from DB)
  // allItemsUnfiltered NOT in deps to prevent refreshAllData from racing with rating timeout
  useEffect(() => {
    if (sidebarTab !== "review" || reviewDateFilter) {
      return
    }
    getDueReviews().then((due) => {
      const items = pairWithItems(due, allItemsRef.current)
      setReviewItems(items)
    })
  }, [sidebarTab, reviewDateFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const recentDates = useMemo(() => {
    const now = Date.now()
    const result: { key: string; label: string; count: number }[] = []
    for (let i = 0; i < 3; i++) {
      const d = new Date(now - i * DAY_MS)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      const label = i === 0 ? "（今天）" : i === 1 ? "（昨天）" : "（前天）"
      const group = recentItems.find((g) => g.date === key)
      if (group)
        result.push({
          key,
          label: `${d.getMonth() + 1}月${d.getDate()}日${label}`,
          count: group.items.length
        })
    }
    return result
  }, [recentItems])

  const reviewDateItems = useMemo(() => {
    if (!reviewDateFilter) return []
    return recentItems.find((g) => g.date === reviewDateFilter)?.items ?? []
  }, [reviewDateFilter, recentItems])

  const handleExitReview = useCallback(async () => {
    setReviewItems([])
    setReviewDateFilter(null)
    setSidebarTab("projects")
    await onSearch()
  }, [onSearch, setSidebarTab, setReviewItems, setReviewDateFilter])

  const handleReviewDateClick = useCallback(
    (dateKey: string | null) => {
      if (dateKey) setReviewItems([])
      setReviewDateFilter(dateKey)
      if (dateKey) setSidebarTab("review")
    },
    [setSidebarTab, setReviewDateFilter, setReviewItems]
  )

  return {
    dueCount,
    reviewStats,
    todayRatings,
    streakDays,
    recentDates,
    reviewDateItems,
    handleExitReview,
    handleReviewDateClick
  }
}
