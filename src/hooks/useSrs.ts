import { getAllReviews } from "../database"
import type { Item, ReviewEntry, SrsData } from "../types"

function defaultSrs(): SrsData {
  return {
    dueDate: Date.now(),
    interval: 0,
    easeFactor: 2.5,
    reviewCount: 0,
    lastReviewDate: 0
  }
}

/** Apply SM-2 rating to SrsData, returning a new SrsData */
export function rateSrs(srs: SrsData, rating: 1 | 2 | 3 | 4): SrsData {
  let { interval, easeFactor, reviewCount } = srs
  reviewCount++

  // First review (interval 0) needs a fixed baseline: multiplying 0 by EF
  // would always clamp to 1 day, making "简单" identical to "良好" on the
  // very first rating. Give 良好 a 1-day and 简单 a 4-day first interval
  // (Anki-style), then compound as usual from the second review.
  const firstReview = interval === 0

  if (rating < 3) {
    interval = 1
    easeFactor = Math.max(1.3, easeFactor - 0.2)
  } else if (rating === 3) {
    interval = firstReview ? 1 : Math.max(1, interval * easeFactor)
  } else {
    interval = firstReview
      ? 4
      : Math.max(1, interval * easeFactor * 1.3)
    easeFactor += 0.15
  }

  interval = Math.min(365, Math.max(1, Math.round(interval)))
  easeFactor = Math.max(1.3, Math.round(easeFactor * 100) / 100)

  const now = Date.now()
  const reviewHistory = [
    ...(srs.reviewHistory ?? []),
    { date: now, rating }
  ].slice(-200)

  return {
    interval,
    easeFactor,
    reviewCount,
    dueDate: rating < 3 ? now : now + interval * 86400000,
    lastReviewDate: now,
    reviewHistory
  }
}

export interface ReviewStats {
  masteredCount: number
  dueCount: number
  activeCount: number
}

const DAY_MS = 86400000

export function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export async function getRecentItems(
  allItems: Item[],
  days = 3
): Promise<{ date: string; items: Item[] }[]> {
  const cutoff = Date.now() - days * DAY_MS
  const reviews = await getAllReviews()
  // Filter for recently reviewed entries
  const recentReviews = reviews.filter((r) => r.srs.lastReviewDate >= cutoff)
  if (recentReviews.length === 0) return []

  // Build item lookup
  const itemMap = new Map(allItems.map((i) => [i.id, i]))

  // Group by date with actual items
  const map = new Map<string, Item[]>()
  for (const r of recentReviews) {
    const item = itemMap.get(r.itemId)
    if (!item) continue
    const key = dayKey(r.srs.lastReviewDate)
    const arr = map.get(key) ?? []
    arr.push(item)
    map.set(key, arr)
  }

  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, cardItems]) => ({ date, items: cardItems }))
}
