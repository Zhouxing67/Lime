import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { DisplayCard, SrsData } from "../types"
import { getDueReviews, updateReviewSrs } from "../database/index"
import { DAY_MS } from "../utils"
import { dayKey, rateSrs } from "./useSrs"

export interface UseReviewSessionOpts {
  /** Display-resolved cards (a placed card's review renders the resolved
   *  body/comment) — used to pair due review entries with their cards. */
  displayCardsUnfiltered: DisplayCard[]
  reviewSrsMap: Map<string, SrsData>
  sidebarTab: string
}

/** The review SESSION state machine — the live queue, flip/anim, per-session
 *  pass/rate tallies, and the rating handler (first-rating-of-the-day locks the
 *  schedule; same-day re-ratings are practice — see AGENTS.md Review).
 *  Owned here, not by options.tsx; useReview gets setReviewItems to seed/exit
 *  the queue. */
export function useReviewSession({
  displayCardsUnfiltered,
  reviewSrsMap,
  sidebarTab
}: UseReviewSessionOpts) {
  const [reviewItems, setReviewItems] = useState<DisplayCard[]>([])
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
  const reviewProgress = useMemo(
    () => ({
      remaining: reviewItems.length,
      rated: sessionRatedCount,
      passed: sessionPassedIds.size
    }),
    [reviewItems.length, sessionRatedCount, sessionPassedIds]
  )


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
          // Display-resolved pairing: a placed card's review entry points at its
          // placement, and the session renders the resolved body/comment.
          const itemMap = new Map(displayCardsUnfiltered.map((i) => [i.id, i]))
          const items = due
            .map((r) => itemMap.get(r.itemId))
            .filter((i): i is DisplayCard => i !== undefined)
          if (items.length === 0) {
            setReviewCompleted(true)
            setReviewItems([])
          } else {
            setReviewItems(items)
          }
        }
      }, 350)
    },
    [reviewItems, reviewSrsMap, animating, displayCardsUnfiltered]
  )

  return {
    reviewItems,
    setReviewItems,
    reviewFlipped,
    reviewCompleted,
    reviewProgress,
    animating,
    handleReviewFlip,
    handleReviewRate
  }
}
