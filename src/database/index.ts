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
export * from "./vocabulary"

import type {
  PdfCard,
  PdfVocabularyCard,
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
  localReadLater?: ReadLater[],
  remoteVocabularyCards: PdfVocabularyCard[] = [],
  localVocabularyCards: PdfVocabularyCard[] = []
): Promise<void> {
  const remoteCardIds = new Set(remoteProjectCards.map((c) => c.id))
  const remotePdfIds = new Set(remotePdfCards.map((c) => c.id))
  const remoteTodoIds = new Set(remoteTodos.map((c) => c.id))
  const remoteProjectIds = new Set(remoteProjects.map((p) => p.id))
  const remoteReviewItemIds = new Set(remoteReviews.map((r) => r.itemId))
  const remoteReadLaterIds = new Set((remoteReadLater ?? []).map((r) => r.id))
  const remoteVocabularyIds = new Set(remoteVocabularyCards.map((card) => card.id))

  await tx(
    {
      projectCards: "readwrite",
      pdfCards: "readwrite",
      todos: "readwrite",
      projects: "readwrite",
      reviews: "readwrite",
      readLater: "readwrite",
      pdfVocabularyCards: "readwrite"
    },
    async (stores) => {
      for (const card of remoteProjectCards) {
        // Enforce the placement invariant at the write layer (A7) — the sync
        // payload's placements carry content in some edge states.
        stores.projectCards.put(
          card.pdfCardId || card.pdfVocabularyCardId
            ? { ...card, content: "" }
            : card
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
      // readLater: upsert remote + delete local-not-remote. The byPdfId index
      // is NON-unique (v15): done/archived cards coexist per PDF, so only
      // ACTIVE cards are deduped (a payload with two active records sharing a
      // pdfId keeps the first) and only an active conflict needs clearing —
      // a cross-device clash (two devices active-read-later'd the same PDF)
      // must not leave two active cards, so the put clears any existing ACTIVE
      // holder for that pdfId first (done holders are left alone).
      const rlIdx = stores.readLater.index("byPdfId")
      const seenActivePdfIds = new Set<string>()
      for (const rl of remoteReadLater ?? []) {
        const active = rl.pdfId != null && rl.status !== "done"
        if (active && seenActivePdfIds.has(rl.pdfId)) continue
        if (active) seenActivePdfIds.add(rl.pdfId)
        if (active) {
          const req = rlIdx.openCursor(IDBKeyRange.only(rl.pdfId))
          const holder = await new Promise<string | null>((resolve) => {
            req.onsuccess = () => {
              const c = req.result
              if (c && (c.value as { status?: string }).status !== "done") {
                resolve(c.primaryKey as string)
              } else if (c) {
                c.continue()
              } else {
                resolve(null)
              }
            }
            req.onerror = () => resolve(null)
          })
          if (holder && holder !== rl.id) stores.readLater.delete(holder)
        }
        stores.readLater.put(rl)
      }
      for (const rl of localReadLater ?? []) {
        if (!remoteReadLaterIds.has(rl.id)) stores.readLater.delete(rl.id)
      }
      // byPdfId is unique. Two devices can independently create aggregates
      // with different ids for the same PDF, so remove the displaced local
      // record before inserting the remote winner.
      const remoteVocabularyPdfIds = new Set(
        remoteVocabularyCards.map((card) => card.pdfId)
      )
      for (const card of localVocabularyCards) {
        if (
          !remoteVocabularyIds.has(card.id) ||
          remoteVocabularyPdfIds.has(card.pdfId)
        ) {
          stores.pdfVocabularyCards.delete(card.id)
        }
      }
      for (const card of remoteVocabularyCards) {
        stores.pdfVocabularyCards.put(card)
      }
    }
  )
}
