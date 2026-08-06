import { withStore } from "./core"
import type { ReviewEntry, SrsData } from "../types"

export async function addReview(entry: ReviewEntry): Promise<void> {
  await withStore("reviews", "readwrite", (store) => {
    store.put(entry)
  })
}

export async function removeReview(itemId: string): Promise<void> {
  await withStore("reviews", "readwrite", (store) => {
    const idx = store.index("itemId")
    return new Promise<void>((resolve, reject) => {
      const req = idx.getKey(itemId)
      req.onsuccess = () => {
        if (req.result) store.delete(req.result as string)
        resolve()
      }
      req.onerror = () => reject(req.error)
    })
  })
}

export async function getReviewByItemId(
  itemId: string
): Promise<ReviewEntry | undefined> {
  return withStore("reviews", "readonly", (store) => {
    const idx = store.index("itemId")
    return new Promise<ReviewEntry | undefined>((resolve, reject) => {
      const req = idx.get(itemId)
      req.onsuccess = () => resolve(req.result as ReviewEntry | undefined)
      req.onerror = () => reject(req.error)
    })
  })
}

/** Shared light-weight due count — the SAME index query the toolbar badge uses,
 *  so the NavRail review icon + the badge always agree. */
export async function getDueCount(): Promise<number> {
  return (await getDueReviews()).length
}

export async function getDueReviews(): Promise<ReviewEntry[]> {
  return withStore("reviews", "readonly", (store) => {
    const idx = store.index("dueDate")
    const range = IDBKeyRange.upperBound(Date.now())
    return new Promise<ReviewEntry[]>((resolve, reject) => {
      const results: ReviewEntry[] = []
      const req = idx.openCursor(range)
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          const entry = cursor.value as ReviewEntry
          if (entry.status === "active") results.push(entry)
          cursor.continue()
        } else {
          resolve(results)
        }
      }
      req.onerror = () => reject(req.error)
    })
  })
}

export async function getAllReviews(): Promise<ReviewEntry[]> {
  return withStore("reviews", "readonly", (store) => {
    return new Promise<ReviewEntry[]>((resolve, reject) => {
      const results: ReviewEntry[] = []
      const req = store.openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          results.push(cursor.value as ReviewEntry)
          cursor.continue()
        } else {
          resolve(results)
        }
      }
      req.onerror = () => reject(req.error)
    })
  })
}

export async function updateReviewSrs(
  itemId: string,
  srs: SrsData
): Promise<void> {
  await withStore("reviews", "readwrite", (store) => {
    const idx = store.index("itemId")
    return new Promise<void>((resolve, reject) => {
      const req = idx.get(itemId)
      req.onsuccess = () => {
        const entry = req.result as ReviewEntry
        if (entry) {
          entry.srs = srs
          entry.dueDate = srs.dueDate
          // Promote to mastered at the interval cap; demote back to active
          // when the latest rating is a fail/partial (不认识/模糊) — even if
          // the interval stayed capped — or when a manual re-review resets it.
          const lastRating =
            srs.reviewHistory?.[srs.reviewHistory.length - 1]?.rating
          if (entry.status === "mastered") {
            entry.status =
              srs.interval < 365 ||
              (lastRating !== undefined && lastRating <= 2)
                ? "active"
                : "mastered"
          } else if (srs.interval >= 365) {
            entry.status = "mastered"
          }
          store.put(entry)
        }
        resolve()
      }
      req.onerror = () => reject(req.error)
    })
  })
}
