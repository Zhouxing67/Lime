import type { Item, ReviewEntry, SrsData } from "../types"
import { DAY_MS } from "../utils"

/** A fresh SrsData with no review history (first review). */
export function defaultSrs(): SrsData {
  return {
    dueDate: Date.now(),
    interval: 0,
    easeFactor: 2.5,
    reviewCount: 0,
    lastReviewDate: 0
  }
}

/** A fresh active ReviewEntry for a card — the single construction site. */
export function createReviewEntry(
  itemId: string,
  projectId: string
): ReviewEntry {
  return {
    id: crypto.randomUUID(),
    itemId,
    projectId,
    srs: defaultSrs(),
    dueDate: Date.now(),
    status: "active",
    addedAt: Date.now()
  }
}

/** Apply a rating to SrsData, returning a new SrsData.
 *
 * Three levels: 1=不认识 (fail, relearn immediately), 2=模糊 (slow growth),
 * 3/4=认识 (moderate growth). Interval growth uses fixed factors (×1.3 / ×1.6)
 * with a guaranteed minimum step of +1 day; the first review uses fixed
 * baselines (模糊 1d, 认识 2d) so the very first rating isn't collapsed to 1d.
 */
export function rateSrs(srs: SrsData, rating: 1 | 2 | 3 | 4): SrsData {
  let { interval, easeFactor, reviewCount } = srs
  reviewCount++
  const firstReview = interval === 0

  if (rating === 1) {
    interval = 1
    easeFactor = Math.max(1.3, easeFactor - 0.2)
  } else if (rating === 2) {
    interval = firstReview
      ? 1
      : Math.min(365, Math.max(interval + 1, Math.round(interval * 1.3)))
  } else {
    interval = firstReview
      ? 2
      : Math.min(365, Math.max(interval + 1, Math.round(interval * 1.6)))
    easeFactor = Math.round((easeFactor + 0.05) * 100) / 100
  }

  interval = Math.min(365, Math.max(1, interval))
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
    dueDate: rating === 1 ? now : now + interval * 86400000,
    lastReviewDate: now,
    reviewHistory
  }
}

export interface ReviewStats {
  masteredCount: number
  dueCount: number
  activeCount: number
}

export function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function getRecentItems(
  allItems: Item[],
  reviews: ReviewEntry[],
  days = 3
): { date: string; items: Item[] }[] {
  const cutoff = Date.now() - days * DAY_MS
  const itemMap = new Map(allItems.map((i) => [i.id, i]))

  // Group by each reviewHistory entry's day (not lastReviewDate, which would
  // hide a card from earlier days once it's reviewed again later). A card
  // appears once per day; legacy data with multiple same-day ratings dedupes.
  const seen = new Set<string>()
  const map = new Map<string, Item[]>()
  for (const r of reviews) {
    const item = itemMap.get(r.itemId)
    if (!item || !r.srs.reviewHistory) continue
    for (const h of r.srs.reviewHistory) {
      if (h.date < cutoff) continue
      const key = dayKey(h.date)
      const dedup = `${key}:${item.id}`
      if (seen.has(dedup)) continue
      seen.add(dedup)
      const arr = map.get(key) ?? []
      arr.push(item)
      map.set(key, arr)
    }
  }

  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, cardItems]) => ({ date, items: cardItems }))
}
