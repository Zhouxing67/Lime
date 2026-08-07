import { tx, withStore } from "./core"
import { safeHostname } from "./helpers"
import type { PdfAnnotation, PdfCard, ProjectCard, SearchQuery } from "../types"
import { computeItemHash } from "../utils"

/** Highest `order` in a section (未分类 = no sectionId), -1 when empty. The
 *  projectCards store holds only project cards — the 未分类 rule is plain. */
export async function getMaxOrderInSection(
  sectionId: string | undefined
): Promise<number> {
  return withStore("projectCards", "readonly", (store) => {
    return new Promise<number>((resolve) => {
      let max = -1
      const req = store.openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          const it = cursor.value as ProjectCard
          const inSection = sectionId
            ? it.sectionId === sectionId
            : !it.sectionId
          if (
            inSection &&
            typeof it.order === "number" &&
            it.order > max
          ) {
            max = it.order
          }
          cursor.continue()
        } else {
          resolve(max)
        }
      }
      req.onerror = () => resolve(-1)
    })
  })
}

/** Returns the card with a guaranteed `order` (section max + 1 when absent). */
export async function ensureOrder<T extends ProjectCard>(card: T): Promise<T> {
  if (card.order !== undefined) return card
  const max = await getMaxOrderInSection(card.sectionId)
  return { ...card, order: max + 1 }
}

export async function addProjectCard(
  card: ProjectCard,
  opts?: { skipDedup?: boolean }
): Promise<boolean> {
  const normalized: ProjectCard = {
    ...card,
    updatedAt: card.updatedAt ?? Date.now(),
    sourceSite:
      card.source?.site ??
      (card.source ? safeHostname(card.source.url) : undefined),
    hash:
      card.hash ||
      (card.source
        ? await computeItemHash(card.content, card.source.url, card.images)
        : await computeItemHash(card.content, "", card.images))
  }
  const ready = await ensureOrder(normalized)

  return withStore("projectCards", "readwrite", async (store) => {
    // Placed cards are identity-unique — the placement model, not content dedup.
    if (opts?.skipDedup) {
      await new Promise<void>((resolve, reject) => {
        const req = store.put(ready)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
      return true
    }
    const idx = store.index("hash")
    return new Promise<boolean>((resolve, reject) => {
      const req = idx.openCursor(IDBKeyRange.only(ready.hash))
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) {
          store.put(ready)
          resolve(true)
          return
        }
        const existing = cursor.value as ProjectCard
        if (
          existing.projectId === ready.projectId &&
          existing.source?.url === ready.source?.url
        ) {
          resolve(false)
        } else {
          cursor.continue()
        }
      }
      req.onerror = () => reject(req.error)
    })
  })
}

export async function searchProjectCards(q: SearchQuery): Promise<ProjectCard[]> {
  // Placed cards carry NO content (reference model) — to keyword-search their
  // PDF quotes, resolve the linked annotations' text (the quote lives on the
  // pdfAnnotation now) BEFORE opening the projectCards transaction (a nested
  // transaction would commit the outer one on the await gap →
  // InvalidStateError).
  const keyword = q.keyword?.toLowerCase()
  // pdfCardId → the annotation's quote text (the pdfAnnotation.cardId links
  // back to its pdfCard). Resolved BEFORE the projectCards transaction.
  const quoteByPdfCardId = keyword
    ? await withStore("pdfAnnotations", "readonly", (annStore) =>
        new Promise<Map<string, string>>((resolveMap) => {
          const map = new Map<string, string>()
          const allReq = annStore.openCursor()
          allReq.onsuccess = () => {
            const c = allReq.result
            if (c) {
              const a = c.value as PdfAnnotation
              if (a.text && a.cardId) map.set(a.cardId, a.text)
              c.continue()
            } else resolveMap(map)
          }
          allReq.onerror = () => resolveMap(map)
        })
      )
    : undefined
  return withStore("projectCards", "readonly", async (store) => {
    const results: ProjectCard[] = []
    return new Promise<ProjectCard[]>((resolve, reject) => {
      let source: IDBIndex | IDBObjectStore
      let range: IDBKeyRange | null = null
      let direction: IDBCursorDirection = "next"
      if (q.projectId) {
        source = store.index("projectId")
        range = IDBKeyRange.only(q.projectId)
      } else if (q.type && !q.site && !q.keyword && !q.from && !q.to) {
        source = store.index("type")
        range = IDBKeyRange.only(q.type)
      } else {
        source = store.index("createdAt")
        direction = "prev"
      }
      const cursorReq = source.openCursor(range, direction)
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (!cursor) {
          resolve(results)
          return
        }
        const card = cursor.value as ProjectCard
        let kwMatch = true
        if (keyword) {
          const quote = card.pdfCardId
            ? quoteByPdfCardId?.get(card.pdfCardId)
            : undefined
          kwMatch =
            card.content?.toLowerCase().includes(keyword) ||
            card.title?.toLowerCase().includes(keyword) ||
            card.source?.title?.toLowerCase().includes(keyword) ||
            !!quote && quote.toLowerCase().includes(keyword)
        }
        if (
          (!q.type || card.type === q.type) &&
          (!q.site || card.sourceSite === q.site) &&
          (!q.from || card.createdAt >= q.from) &&
          (!q.to || card.createdAt < q.to) &&
          (!q.projectId || card.projectId === q.projectId) &&
          kwMatch
        ) {
          results.push(card)
        }
        cursor.continue()
      }
      cursorReq.onerror = () => reject(cursorReq.error)
    })
  })
}

export async function deleteProjectCard(id: string): Promise<void> {
  await tx({ reviews: "readwrite", projectCards: "readwrite" }, async (stores) => {
    const idx = stores.reviews.index("itemId")
    return new Promise<void>((resolve, reject) => {
      const req = idx.getKey(id)
      req.onsuccess = () => {
        if (req.result) stores.reviews.delete(req.result as string)
        stores.projectCards.delete(id)
        resolve()
      }
      req.onerror = () => reject(req.error)
    })
  })
}

export async function deleteProjectCards(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await tx({ reviews: "readwrite", projectCards: "readwrite" }, async (stores) => {
    const idx = stores.reviews.index("itemId")
    const reviewKeys = await new Promise<(IDBValidKey | null)[]>((resolve) => {
      const results: (IDBValidKey | null)[] = []
      let pending = ids.length
      for (const id of ids) {
        const req = idx.getKey(id)
        req.onsuccess = () => {
          results.push(req.result)
          if (--pending === 0) resolve(results)
        }
        req.onerror = () => {
          results.push(null)
          if (--pending === 0) resolve(results)
        }
      }
    })
    for (const key of reviewKeys) {
      if (key) stores.reviews.delete(key)
    }
    for (const id of ids) {
      stores.projectCards.delete(id)
    }
  })
}

export async function getAllProjectCards(): Promise<ProjectCard[]> {
  return withStore("projectCards", "readonly", (store) => {
    return new Promise<ProjectCard[]>((resolve, reject) => {
      const all: ProjectCard[] = []
      const req = store.openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          all.push(cursor.value as ProjectCard)
          cursor.continue()
        } else {
          resolve(all)
        }
      }
      req.onerror = () => reject(req.error)
    })
  })
}

export async function getProjectCardById(
  id: string
): Promise<ProjectCard | undefined> {
  return withStore("projectCards", "readonly", (store) => {
    return new Promise((resolve, reject) => {
      const r = store.get(id)
      r.onsuccess = () => resolve(r.result as ProjectCard | undefined)
      r.onerror = () => reject(r.error)
    })
  })
}

export async function updateProjectCard(card: ProjectCard): Promise<void> {
  await withStore("projectCards", "readwrite", (store) => {
    store.put({ ...card, updatedAt: Date.now() })
  })
}

export async function batchUpdateProjectCards(
  updates: { id: string; sectionId?: string; order?: number }[]
): Promise<void> {
  if (updates.length === 0) return
  await withStore("projectCards", "readwrite", async (store) => {
    const cards = await Promise.all(
      updates.map(
        (u) =>
          new Promise<{ id: string; card?: ProjectCard }>((resolve) => {
            const req = store.get(u.id)
            req.onsuccess = () =>
              resolve({ id: u.id, card: req.result as ProjectCard | undefined })
            req.onerror = () => resolve({ id: u.id })
          })
      )
    )
    for (let i = 0; i < cards.length; i++) {
      const { card } = cards[i]
      if (!card) continue
      const u = updates[i]
      store.put({
        ...card,
        ...("sectionId" in u ? { sectionId: u.sectionId } : {}),
        ...("order" in u ? { order: u.order } : {}),
        updatedAt: Date.now()
      })
    }
  })
}
