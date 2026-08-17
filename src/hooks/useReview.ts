import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { SidebarTab } from "../components/NavRail"
import { getDueReviews } from "../database"
import type { DisplayCard, ReviewEntry } from "../types"
import { DAY_MS } from "../utils"
import { dayKey, getRecentItems as getRecentItemsBySrs } from "./useSrs"
import type { ReviewStats } from "./useSrs"

function pairWithItems(
  reviews: Awaited<ReturnType<typeof getDueReviews>>,
  cards: DisplayCard[]
): DisplayCard[] {
  const cardMap = new Map(cards.map((i) => [i.id, i]))
  return reviews
    .map((r) => cardMap.get(r.itemId))
    .filter((i): i is DisplayCard => i !== undefined)
}

interface UseReviewOptions {
  /** ALL cards across projects, display-resolved (a placed card's body/idea
   *  come from its linked pdfCard) — the review date view renders these. */
  allItemsUnfiltered: DisplayCard[]
  onSearch: () => Promise<void>
  sidebarTab: SidebarTab
  setSidebarTab: (tab: SidebarTab) => void
  setReviewItems: (items: DisplayCard[]) => void
  reviewDateFilter: string | null
  setReviewDateFilter: (key: string | null) => void
  /** All reviews, loaded once by the options composition root and passed in —
   *  the stats/ratings/streak derive from this in memory (no per-hook DB reads). */
  reviews: ReviewEntry[]
}

export function useReview(options: UseReviewOptions) {
  const {
    allItemsUnfiltered,
    onSearch,
    sidebarTab,
    setSidebarTab,
    reviewDateFilter,
    setReviewDateFilter,
    setReviewItems,
    reviews
  } = options

  const [dueCount, setDueCount] = useState(0)
  const [reviewStats, setReviewStats] = useState<ReviewStats>({
    masteredCount: 0,
    dueCount: 0,
    activeCount: 0
  })
  const [recentItems, setRecentItems] = useState<
    { date: string; items: DisplayCard[] }[]
  >([])
  const [todayRatings, setTodayRatings] = useState<
    [number, number, number]
  >([0, 0, 0])
  const [streakDays, setStreakDays] = useState(0)

  const allItemsRef = useRef(allItemsUnfiltered)
  allItemsRef.current = allItemsUnfiltered

  useEffect(() => {
    const now = Date.now()
    let dueCount = 0
    let activeCount = 0
    let masteredCount = 0
    for (const r of reviews) {
      if (r.status === "active") {
        activeCount++
        if (r.dueDate <= now) dueCount++
      }
      if (r.status === "mastered") masteredCount++
    }
    setDueCount(dueCount)
    setReviewStats({ masteredCount, dueCount, activeCount })
    // getRecentItems groups ProjectCards by review day; the items here are
    // already display-resolved (DisplayCard extends ProjectCard) — re-type the
    // grouped list so the date view renders the resolved content.
    setRecentItems(
      getRecentItemsBySrs(allItemsUnfiltered, reviews).map((g) => ({
        date: g.date,
        items: g.items as DisplayCard[]
      }))
    )
    const todayKey = dayKey(now)
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
    const day = new Date()
    let streak = 0
    for (let i = 0; i < sorted.length; i++) {
      const d = new Date(day)
      d.setDate(day.getDate() - i)
      if (sorted[i] === dayKey(d.getTime())) streak++
      else break
    }
    setStreakDays(streak)
  }, [allItemsUnfiltered, reviews])

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
      const key = dayKey(now - i * DAY_MS)
      const label = i === 0 ? "（今天）" : i === 1 ? "（昨天）" : "（前天）"
      const group = recentItems.find((g) => g.date === key)
      if (group) {
        const day = new Date(now - i * DAY_MS)
        result.push({
          key,
          label: `${day.getMonth() + 1}月${day.getDate()}日${label}`,
          count: group.items.length
        })
      }
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
