// Split database facade — re-exports the per-store modules.
// Keep bulkReplace here: it is the cross-store diff-based sync and spans
// projectCards/pdfCards/todos/projects/reviews in one atomic transaction.
export * from "./core"
export * from "./helpers"
export * from "./projectCards"
export * from "./todos"
export * from "./projects"
export * from "./reviews"
export * from "./pdfs"
export * from "./readLater"

import type {
  PdfCard,
  Project,
  ProjectCard,
  ReadLater,
  ReviewEntry,
  TodoCard
} from "../types"
import { tx } from "./core"

/**
 * Diff-based bulk replacement for sync download.
 * Uses a single atomic transaction across items, projects, and reviews.
 * Upserts remote entities and deletes any local entity whose id is not in the remote set.
 */
export async function bulkReplace(
  remoteProjectCards: ProjectCard[],
  remotePdfCards: PdfCard[],
  remoteTodos: TodoCard[],
  remoteProjects: Project[],
  remoteReviews: ReviewEntry[],
  localProjectCards: ProjectCard[],
  localPdfCards: PdfCard[],
  localTodos: TodoCard[],
  localProjects: Project[],
  localReviews: ReviewEntry[],
  remoteReadLater?: ReadLater[],
  localReadLater?: ReadLater[]
): Promise<void> {
  const remoteCardIds = new Set(remoteProjectCards.map((c) => c.id))
  const remotePdfIds = new Set(remotePdfCards.map((c) => c.id))
  const remoteTodoIds = new Set(remoteTodos.map((c) => c.id))
  const remoteProjectIds = new Set(remoteProjects.map((p) => p.id))
  const remoteReviewItemIds = new Set(remoteReviews.map((r) => r.itemId))
  const remoteReadLaterIds = new Set((remoteReadLater ?? []).map((r) => r.id))

  await tx(
    {
      projectCards: "readwrite",
      pdfCards: "readwrite",
      todos: "readwrite",
      projects: "readwrite",
      reviews: "readwrite",
      readLater: "readwrite"
    },
    async (stores) => {
      for (const card of remoteProjectCards) {
        // Enforce the placement invariant at the write layer (A7) — the sync
        // payload's placements carry content in some edge states.
        stores.projectCards.put(
          card.pdfCardId ? { ...card, content: "" } : card
        )
      }
      for (const card of localProjectCards) {
        if (!remoteCardIds.has(card.id)) stores.projectCards.delete(card.id)
      }
      for (const card of remotePdfCards) stores.pdfCards.put(card)
      for (const card of localPdfCards) {
        if (!remotePdfIds.has(card.id)) stores.pdfCards.delete(card.id)
      }
      for (const todo of remoteTodos) stores.todos.put(todo)
      for (const todo of localTodos) {
        if (!remoteTodoIds.has(todo.id)) stores.todos.delete(todo.id)
      }
      for (const project of remoteProjects) stores.projects.put(project)
      for (const project of localProjects) {
        if (!remoteProjectIds.has(project.id))
          stores.projects.delete(project.id)
      }
      const idx = stores.reviews.index("itemId")
      for (const review of remoteReviews) {
        const req = idx.getKey(review.itemId)
        const existing = await new Promise<string | null>((resolve) => {
          req.onsuccess = () => resolve((req.result as string) ?? null)
          req.onerror = () => resolve(null)
        })
        if (existing) stores.reviews.delete(existing)
        stores.reviews.put(review)
      }
      for (const review of localReviews) {
        if (!remoteReviewItemIds.has(review.itemId)) {
          const req = idx.getKey(review.itemId)
          await new Promise<void>((resolve) => {
            req.onsuccess = () => {
              if (req.result) stores.reviews.delete(req.result)
              resolve()
            }
            req.onerror = () => resolve()
          })
        }
      }
      // readLater: upsert remote (deduping the PDF one-card rule — a payload
      // with two records sharing a pdfId keeps the first, skips the rest) and
      // delete local-not-remote. Before each put, clear any local record that
      // already holds the pdfId in the UNIQUE byPdfId index — otherwise a
      // cross-device conflict (two devices read-later'd the same PDF) throws
      // ConstraintError and aborts the whole tx (mirrors the reviews loop).
      // The pre-delete also covers the dedup-skipped edge: the kept remote
      // record's put clears whatever local record holds its pdfId, even when
      // that local record matches a skipped remote duplicate.
      const rlIdx = stores.readLater.index("byPdfId")
      const seenPdfIds = new Set<string>()
      for (const rl of remoteReadLater ?? []) {
        // Treat "" as a real key too (the unique index keys on it) so two
        // records with an empty-string pdfId are deduped, not a ConstraintError.
        if (rl.pdfId != null && seenPdfIds.has(rl.pdfId)) continue
        if (rl.pdfId != null) seenPdfIds.add(rl.pdfId)
        if (rl.pdfId != null) {
          const req = rlIdx.getKey(rl.pdfId)
          const existing = await new Promise<string | null>((resolve) => {
            req.onsuccess = () => resolve((req.result as string) ?? null)
            req.onerror = () => resolve(null)
          })
          if (existing) stores.readLater.delete(existing)
        }
        stores.readLater.put(rl)
      }
      for (const rl of localReadLater ?? []) {
        if (!remoteReadLaterIds.has(rl.id)) stores.readLater.delete(rl.id)
      }
    }
  )
}
