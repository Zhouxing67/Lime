import { useState } from "react"

/** The review view's own filter + title-prompt state. The session queue and
 *  stats live in useReview; the derived view list (filteredDateItems) is
 *  computed by the composition root from this filter + the useReview items. */
export function useReviewView() {
  const [reviewDateFilter, setReviewDateFilter] = useState<string | null>(null)
  const [ratingFilter, setRatingFilter] = useState<1 | 2 | 3 | null>(null)
  const [reviewTitlePending, setReviewTitlePending] = useState<string | null>(
    null
  )
  const [reviewTitleDraft, setReviewTitleDraft] = useState("")

  return {
    reviewDateFilter,
    setReviewDateFilter,
    ratingFilter,
    setRatingFilter,
    reviewTitlePending,
    setReviewTitlePending,
    reviewTitleDraft,
    setReviewTitleDraft
  }
}
