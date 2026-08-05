import type {
  PdfCard,
  PdfMark,
  PdfAnnotation,
  PdfFile,
  Project,
  ProjectCard,
  ReviewEntry,
  SearchQuery,
  SrsData,
  TodoCard
} from "../types"
import {
  byRecency,
  computeItemHash,
  createPdfCard,
  isTodoComplete,
  sha256Bytes
} from "../utils"

const DB_NAME = "pickquote-db"
const DB_VERSION = 12

type TableNames =
  | "projectCards"
  | "pdfCards"
  | "todos"
  | "projects"
  | "reviews"
  | "pdfs"
  | "pdfAnnotations"

// ---- Cross-context change notification ----
// Any successful write transaction automatically broadcasts a version stamp
// via chrome.storage.local. All extension bundles (SW, options, popups) listen
// to chrome.storage.onChanged, so every context gets notified without bridges.
async function broadcastDbChange(name: TableNames): Promise<void> {
  try {
    if (typeof chrome?.storage?.local?.set === "function") {
      const key =
        name === "projects"
          ? "_dbp"
          : name === "reviews"
            ? "_dbr"
            : name === "pdfs" ||
                name === "pdfAnnotations" ||
                name === "pdfCards"
              ? "_dbpdf"
              : "_dbi"
      await chrome.storage.local.set({ [key]: Date.now() })
    }
  } catch {}
}
// ---- End change notification ----

function openDb(version?: number): Promise<IDBDatabase> {
  const v = version ?? DB_VERSION
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, v)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains("items")) {
        const store = db.createObjectStore("items", { keyPath: "id" })
        store.createIndex("type", "type", { unique: false })
        store.createIndex("createdAt", "createdAt", { unique: false })
        store.createIndex("sourceSite", "sourceSite", { unique: false })
        store.createIndex("projectId", "projectId", { unique: false })
        store.createIndex("hash", "hash", { unique: false })
      } else {
        // v3 migration: add projectId index if missing
        try {
          const tx = req.transaction as IDBTransaction
          const store = tx.objectStore("items")
          if (!Array.from(store.indexNames).includes("projectId")) {
            store.createIndex("projectId", "projectId", { unique: false })
          }
        } catch {}
      }
      if (!db.objectStoreNames.contains("projects")) {
        const ps = db.createObjectStore("projects", { keyPath: "id" })
        ps.createIndex("name", "name", { unique: true })
      }
      // v6 migration: remove deprecated stores
      if (db.objectStoreNames.contains("categories")) {
        db.deleteObjectStore("categories")
      }
      if (db.objectStoreNames.contains("sources")) {
        db.deleteObjectStore("sources")
      }
      // v7 migration: create reviews store
      if (!db.objectStoreNames.contains("reviews")) {
        const rs = db.createObjectStore("reviews", { keyPath: "id" })
        rs.createIndex("itemId", "itemId", { unique: true })
        rs.createIndex("projectId", "projectId", { unique: false })
        rs.createIndex("status", "status", { unique: false })
        rs.createIndex("dueDate", "dueDate", { unique: false })
        // Migrate existing Item.srs → ReviewEntry
        if (db.objectStoreNames.contains("items")) {
          const tx = req.transaction as IDBTransaction
          const itemStore = tx.objectStore("items")
          itemStore.openCursor().onsuccess = (e) => {
            const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result
            if (cursor) {
              const item = cursor.value as {
                id: string
                projectId?: string
                createdAt: number
                srs?: SrsData
              }
              if (item.srs) {
                const review: ReviewEntry = {
                  id: crypto.randomUUID(),
                  itemId: item.id,
                  projectId: item.projectId ?? "",
                  srs: item.srs,
                  dueDate: item.srs.dueDate,
                  status: item.srs.interval >= 365 ? "mastered" : "active",
                  addedAt: item.createdAt
                }
                rs.put(review)
              }
              cursor.continue()
            }
          }
        }
      }
      // v9 migration: PDF stores
      if (!db.objectStoreNames.contains("pdfs")) {
        const ps = db.createObjectStore("pdfs", { keyPath: "id" })
        ps.createIndex("addedAt", "addedAt", { unique: false })
      }
      if (!db.objectStoreNames.contains("pdfAnnotations")) {
        const as = db.createObjectStore("pdfAnnotations", { keyPath: "id" })
        as.createIndex("pdfId", "pdfId", { unique: false })
      }
      // v10 migration: denormalized pdfRefPdfId index for fast per-PDF card
      // lookups (IndexedDB can't index the nested pdfRef.pdfId path).
      if (db.objectStoreNames.contains("items")) {
        const itemsStore = req.transaction.objectStore("items")
        if (!itemsStore.indexNames.contains("pdfRefPdfId")) {
          itemsStore.createIndex("pdfRefPdfId", "pdfRefPdfId", {
            unique: false
          })
        }
        const backfill = itemsStore.openCursor()
        backfill.onsuccess = () => {
          const cursor = backfill.result
          if (cursor) {
            const item = cursor.value
            if (item?.pdfRef?.pdfId && !item.pdfRefPdfId) {
              item.pdfRefPdfId = item.pdfRef.pdfId
              cursor.update(item)
            }
            cursor.continue()
          }
        }
      }
      // ---- v12 migration: split the monolithic items store into three typed
      // stores (projectCards / pdfCards / todos). A placed PDF card becomes TWO
      // records — a pdfCard source + a projectCard placement with mutual
      // references (pdfCardId / projectCardId). Reviews of placed items remap
      // to the placement ids. Runs on the upgrade transaction directly (the
      // tx() helper would re-open the DB — recursion, see the 9bd05a5 lesson).
      if (db.objectStoreNames.contains("items")) {
        const pc = db.createObjectStore("projectCards", { keyPath: "id" })
        pc.createIndex("projectId", "projectId", { unique: false })
        pc.createIndex("hash", "hash", { unique: false })
        pc.createIndex("pdfCardId", "pdfCardId", { unique: false })
        pc.createIndex("type", "type", { unique: false })
        pc.createIndex("createdAt", "createdAt", { unique: false })
        pc.createIndex("sourceSite", "sourceSite", { unique: false })
        const td = db.createObjectStore("todos", { keyPath: "id" })
        td.createIndex("dueDate", "dueDate", { unique: false })
        const pd = db.createObjectStore("pdfCards", { keyPath: "id" })
        pd.createIndex("pdfId", "pdfId", { unique: false })
        pd.createIndex("annotationId", "annotationId", { unique: false })
        pd.createIndex("projectCardId", "projectCardId", { unique: false })

        const tx = req.transaction as IDBTransaction
        const itemsStore = tx.objectStore("items")
        const pcStore = tx.objectStore("projectCards")
        const tdStore = tx.objectStore("todos")
        const pdStore = tx.objectStore("pdfCards")
        const annStore = tx.objectStore("pdfAnnotations")
        const reviewStore = tx.objectStore("reviews")
        const reviewRemap = new Map<string, string>()
        let collected = false
        let pending = 0
        let done = false

        const finish = () => {
          if (done) return
          done = true
          // Remap reviews of placed items onto their placement ids, then drop
          // the old monolithic store.
          const rc = reviewStore.openCursor()
          rc.onsuccess = (e) => {
            const c = (e.target as IDBRequest<IDBCursorWithValue>).result
            if (c) {
              const r = c.value as ReviewEntry
              const mapped = reviewRemap.get(r.itemId)
              if (mapped) c.update({ ...r, itemId: mapped })
              c.continue()
            } else {
              db.deleteObjectStore("items")
            }
          }
        }
        const maybeFinish = () => {
          if (collected && pending === 0) finish()
        }

        const cursorReq = itemsStore.openCursor()
        cursorReq.onsuccess = (e) => {
          const c = (e.target as IDBRequest<IDBCursorWithValue>).result
          if (!c) {
            collected = true
            maybeFinish()
            return
          }
          const item = c.value
          if (item.type === "todo") {
            tdStore.put({
              id: item.id,
              title: item.title,
              content: item.content,
              dueDate: item.dueDate,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt
            })
          } else if (item.pdfRef) {
            pending++
            const annReq = annStore.get(item.pdfRef.annotationId)
            annReq.onsuccess = () => {
              const ann = annReq.result as PdfAnnotation | undefined
              // The pdfCard keeps the old item id so the annotation's cardId
              // maps naturally (no id remap). The old itemId field is retired.
              const pdfCard: PdfCard = {
                id: item.id,
                pdfId: item.pdfRef.pdfId,
                page: item.pdfRef.page,
                annotationId: item.pdfRef.annotationId,
                kind: item.type === "image" ? "region" : "text",
                type: ann?.type ?? "highlight",
                content: item.content,
                idea: item.idea,
                pdfOrder: item.pdfOrder ?? item.pdfRef.page * 1e6,
                createdAt: item.createdAt
              }
              if (ann) {
                const updated = { ...ann, cardId: item.id } as PdfAnnotation
                delete (updated as unknown as Record<string, unknown>).itemId
                annStore.put(updated)
              }
              pdStore.put(pdfCard)
              if (item.projectId) {
                const placement: ProjectCard = {
                  id: crypto.randomUUID(),
                  type: item.type === "image" ? "image" : "text",
                  title: item.title,
                  content: "",
                  projectId: item.projectId,
                  sectionId: item.sectionId,
                  order: item.order,
                  pdfCardId: pdfCard.id,
                  createdAt: item.createdAt,
                  updatedAt: item.updatedAt
                }
                pcStore.put(placement)
                pdStore.put({ ...pdfCard, projectCardId: placement.id })
                reviewRemap.set(item.id, placement.id)
              }
              pending--
              maybeFinish()
            }
            annReq.onerror = () => {
              // Annotation lookup failed — still convert the card from the item
              // data so the migration can't hang (the pending gate).
              const ann = undefined
              pending--
              maybeFinish()
            }
          } else {
            pcStore.put({
              id: item.id,
              type: item.type === "link" ? "link" : item.type,
              title: item.title,
              content: item.content,
              source: item.source,
              sourceSite: item.sourceSite,
              images: item.images,
              projectId: item.projectId,
              sectionId: item.sectionId,
              order: item.order,
              hash: item.hash,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt
            })
          }
          c.continue()
        }
      }
    }
    req.onsuccess = async () => {
      const db = req.result
      await migratePdfIdsIfNeeded(db)
      resolve(db)
    }
    req.onerror = () => reject(req.error)
  })
}

// ---- One-time data migration: rewrite legacy uuid PDF ids → content-hash ids
// (stable cross-device identity for the notes-only sync). Idempotent.

async function migratePdfIdsIfNeeded(db: IDBDatabase): Promise<void> {
  try {
    const data = await chrome.storage.local.get("_pdfIdMigrated")
    if (data?._pdfIdMigrated) return

    const pdfs = await new Promise<PdfFile[]>((resolve, reject) => {
      const tx = db.transaction("pdfs", "readonly")
      const store = tx.objectStore("pdfs")
      const out: PdfFile[] = []
      const r = store.openCursor()
      r.onsuccess = () => {
        const c = r.result
        if (c) {
          out.push(c.value as PdfFile)
          c.continue()
        } else resolve(out)
      }
      r.onerror = () => reject(r.error)
    })

    const remap = new Map<string, string>()
    for (const pdf of pdfs) {
      if (!pdf.bytes) continue
      try {
        const hash = await sha256Bytes(pdf.bytes)
        if (hash !== pdf.id) remap.set(pdf.id, hash)
      } catch {
        /* unreadable bytes — leave as-is */
      }
    }
    if (remap.size > 0) {
      // Use the ALREADY-OPEN db — never `tx()`/`withStore()` here, they call
      // openDb() again → migration → recursion → every DB op hangs.
      await new Promise<void>((resolve, reject) => {
        const idbTx = db.transaction(
          ["pdfs", "pdfAnnotations", "pdfCards"],
          "readwrite"
        )
        const pdfStore = idbTx.objectStore("pdfs")
        const annStore = idbTx.objectStore("pdfAnnotations")
        const cardStore = idbTx.objectStore("pdfCards")
        const errors: DOMException[] = []
        idbTx.onerror = () => reject(idbTx.error)
        idbTx.onabort = () => reject(idbTx.error)
        idbTx.oncomplete = () =>
          errors.length ? reject(errors[0]) : resolve()

        const step = (i: number) => {
          if (i >= remap.size) return
          const [oldId, newId] = [...remap.entries()][i]
          const existingReq = pdfStore.get(newId)
          existingReq.onerror = () => {
            errors.push(existingReq.error as DOMException)
            step(i + 1)
          }
          existingReq.onsuccess = () => {
            const existing = existingReq.result as PdfFile | undefined
            const oldReq = pdfStore.get(oldId)
            oldReq.onsuccess = () => {
              const old = oldReq.result as PdfFile | undefined
              if (old && !existing?.bytes) {
                pdfStore.put({ ...old, id: newId })
              }
              pdfStore.delete(oldId)
              // rewrite annotations.pdfId
              const annReq = annStore
                .index("pdfId")
                .openCursor(IDBKeyRange.only(oldId))
              annReq.onerror = () => {
                errors.push(annReq.error as DOMException)
                step(i + 1)
              }
              annReq.onsuccess = () => {
                const c = annReq.result
                if (c) {
                  const ann = c.value as PdfAnnotation
                  ann.pdfId = newId
                  c.update(ann)
                  c.continue()
                } else {
                  // rewrite pdfCards.pdfId (the cards carry the old pdf id)
                  const cardReq = cardStore
                    .index("pdfId")
                    .openCursor(IDBKeyRange.only(oldId))
                  cardReq.onerror = () => {
                    errors.push(cardReq.error as DOMException)
                    step(i + 1)
                  }
                  cardReq.onsuccess = () => {
                    const c2 = cardReq.result
                    if (c2) {
                      const card = c2.value as PdfCard
                      card.pdfId = newId
                      c2.update(card)
                      c2.continue()
                    } else {
                      step(i + 1)
                    }
                  }
                }
              }
            }
          }
        }
        step(0)
      })
    }
    await chrome.storage.local.set({ _pdfIdMigrated: Date.now() })
  } catch (e) {
    console.warn("[lime] pdf id migration failed:", e)
  }
}

async function withStore<T>(
  name: TableNames,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
  _retry = true
): Promise<T> {
  let db: IDBDatabase | null = null
  try {
    db = await openDb()
    const tx = db.transaction(name, mode)
    const store = tx.objectStore(name)
    const result = await fn(store)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => {
        if (mode === "readwrite") broadcastDbChange(name)
        resolve()
      }
      tx.onerror = () => reject(tx.error ?? new Error("Transaction failed"))
      tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"))
    })
    return result
  } catch (err) {
    // If the store doesn't exist, force a version upgrade to create it
    if (_retry && err instanceof DOMException && err.name === "NotFoundError") {
      const upDb = await openDb(DB_VERSION + 1)
      upDb.close()
      return withStore(name, mode, fn, false)
    }
    throw err
  } finally {
    db?.close()
  }
}

/**
 * Declarative multi-store IndexedDB transaction.
 * All operations in `fn` execute within a single atomic transaction.
 * On success, broadcasts _dbi/_dbp once. On error, the entire transaction rolls back.
 *
 * Usage:
 *   await tx({ items: "readwrite", reviews: "readwrite" }, async (s) => {
 *     s.items.delete(id)
 *     s.reviews.delete(reviewKey)
 *   })
 */
export async function tx<T>(
  storeMap: Partial<Record<TableNames, IDBTransactionMode>>,
  fn: (stores: Record<string, IDBObjectStore>) => Promise<T>
): Promise<T> {
  const names = Object.keys(storeMap) as TableNames[]
  const mode = names.some((n) => storeMap[n] === "readwrite")
    ? "readwrite"
    : "readonly"
  let db: IDBDatabase | null = null
  try {
    db = await openDb()
    const idbTx = db.transaction(names, mode)
    const stores: Record<string, IDBObjectStore> = {}
    for (const name of names) {
      stores[name] = idbTx.objectStore(name)
    }
    const result = await fn(stores)
    await new Promise<void>((resolve, reject) => {
      idbTx.oncomplete = () => {
        if (mode === "readwrite") {
          for (const name of names) broadcastDbChange(name)
        }
        resolve()
      }
      idbTx.onerror = () => reject(idbTx.error)
      idbTx.onabort = () => reject(idbTx.error)
    })
    return result
  } finally {
    db?.close()
  }
}

export async function isDuplicate(
  hash: string,
  projectId?: string,
  sourceUrl?: string
): Promise<boolean> {
  return withStore("projectCards", "readonly", async (store) => {
    const idx = store.index("hash")
    return new Promise<boolean>((resolve, reject) => {
      const req = idx.openCursor(IDBKeyRange.only(hash))
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) {
          resolve(false)
          return
        }
        const val = cursor.value as ProjectCard
        if (val.projectId === projectId && val.source?.url === sourceUrl) {
          resolve(true)
          return
        }
        cursor.continue()
      }
      req.onerror = () => reject(req.error)
    })
  })
}

function safeHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname
  } catch {
    return undefined
  }
}

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

export async function addTodo(todo: TodoCard): Promise<void> {
  const ready: TodoCard = { ...todo, updatedAt: todo.updatedAt ?? Date.now() }
  await withStore("todos", "readwrite", async (store) => {
    await new Promise<void>((resolve, reject) => {
      const req = store.put(ready)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  })
}

export async function getAllTodos(): Promise<TodoCard[]> {
  return withStore("todos", "readonly", async (store) => {
    const all: TodoCard[] = []
    return new Promise<TodoCard[]>((resolve, reject) => {
      const cursorReq = store.openCursor()
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (cursor) {
          all.push(cursor.value as TodoCard)
          cursor.continue()
        } else {
          resolve(all)
        }
      }
      cursorReq.onerror = () => reject(cursorReq.error)
    })
  })
}

export async function updateTodo(todo: TodoCard): Promise<void> {
  await withStore("todos", "readwrite", (store) => {
    store.put({ ...todo, updatedAt: Date.now() })
  })
}

export async function deleteTodo(id: string): Promise<void> {
  await tx({ reviews: "readwrite", todos: "readwrite" }, async (stores) => {
    const idx = stores.reviews.index("itemId")
    return new Promise<void>((resolve, reject) => {
      const req = idx.getKey(id)
      req.onsuccess = () => {
        if (req.result) stores.reviews.delete(req.result as string)
        stores.todos.delete(id)
        resolve()
      }
      req.onerror = () => reject(req.error)
    })
  })
}

export async function searchProjectCards(q: SearchQuery): Promise<ProjectCard[]> {
  // Placed cards carry NO content (reference model) — to keyword-search their
  // PDF quotes, resolve the linked pdfCards BEFORE opening the projectCards
  // transaction (a nested transaction would commit the outer one on the await
  // gap → InvalidStateError).
  const keyword = q.keyword?.toLowerCase()
  const pdfById = keyword
    ? await withStore("pdfCards", "readonly", (pdfStore) =>
        new Promise<Map<string, PdfCard>>((resolveMap) => {
          const map = new Map<string, PdfCard>()
          const allReq = pdfStore.openCursor()
          allReq.onsuccess = () => {
            const c = allReq.result
            if (c) {
              map.set((c.value as PdfCard).id, c.value as PdfCard)
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
          const src = card.pdfCardId ? pdfById?.get(card.pdfCardId) : undefined
          kwMatch =
            card.content?.toLowerCase().includes(keyword) ||
            card.title?.toLowerCase().includes(keyword) ||
            card.source?.title?.toLowerCase().includes(keyword) ||
            !!src &&
              (src.content?.toLowerCase().includes(keyword) ||
                src.idea?.toLowerCase().includes(keyword))
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

// ---- Projects ----

export async function addProject(project: Project): Promise<void> {
  await withStore("projects", "readwrite", async (store) => {
    return new Promise<void>((resolve, reject) => {
      const idx = store.index("name")
      const req = idx.get(project.name)
      req.onsuccess = () => {
        if (req.result) {
          reject(new Error("项目已存在"))
          return
        }
        store.put(project)
        resolve()
      }
      req.onerror = () => reject(req.error)
    })
  })
}

export async function listProjects(): Promise<Project[]> {
  return withStore("projects", "readonly", async (store) => {
    const all: Project[] = []
    return new Promise<Project[]>((resolve, reject) => {
      const cursorReq = store.openCursor()
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (cursor) {
          all.push(cursor.value as Project)
          cursor.continue()
        } else {
          all.sort((a, b) => b.createdAt - a.createdAt)
          resolve(all)
        }
      }
      cursorReq.onerror = () => reject(cursorReq.error)
    })
  })
}

export async function getProjectByName(
  name: string
): Promise<Project | undefined> {
  return withStore("projects", "readonly", async (store) => {
    const idx = store.index("name")
    return new Promise<Project | undefined>((resolve, reject) => {
      const req = idx.get(name)
      req.onsuccess = () => resolve(req.result as Project | undefined)
      req.onerror = () => reject(req.error)
    })
  })
}

export async function updateProject(project: Project): Promise<void> {
  await withStore("projects", "readwrite", (store) => {
    store.put(project)
  })
}

export async function deleteProject(id: string): Promise<void> {
  // Atomic cascade: delete the project, its cards (incl. placements), and their
  // reviews. A placed card's pdfCard survives — the placement is deleted and the
  // pdfCard's reverse reference is cleared (it becomes a PDF-only card again).
  await tx(
    {
      projectCards: "readwrite",
      pdfCards: "readwrite",
      reviews: "readwrite",
      projects: "readwrite"
    },
    async (stores) => {
      const cardIds = await new Promise<string[]>((resolve, reject) => {
        const ids: string[] = []
        const idx = stores.projectCards.index("projectId")
        const req = idx.openCursor(IDBKeyRange.only(id))
        req.onsuccess = () => {
          const cursor = req.result
          if (cursor) {
            ids.push(cursor.primaryKey as string)
            cursor.continue()
          } else {
            resolve(ids)
          }
        }
        req.onerror = () => reject(req.error)
      })

      const reviewIdx = stores.reviews.index("itemId")
      for (const cardId of cardIds) {
        const k = await new Promise<IDBValidKey | null>((resolve) => {
          const r = reviewIdx.getKey(cardId)
          r.onsuccess = () => resolve(r.result ?? null)
          r.onerror = () => resolve(null)
        })
        if (k) stores.reviews.delete(k)
      }
      for (const cardId of cardIds) {
        const card = await new Promise<ProjectCard | undefined>((resolve) => {
          const r = stores.projectCards.get(cardId)
          r.onsuccess = () => resolve(r.result as ProjectCard | undefined)
          r.onerror = () => resolve(undefined)
        })
        if (card?.pdfCardId) {
          const pdfCard = await new Promise<PdfCard | undefined>((resolve) => {
            const r = stores.pdfCards.get(card.pdfCardId!)
            r.onsuccess = () => resolve(r.result as PdfCard | undefined)
            r.onerror = () => resolve(undefined)
          })
          if (pdfCard) {
            stores.pdfCards.put({ ...pdfCard, projectCardId: undefined })
          }
        }
        stores.projectCards.delete(cardId)
      }
      stores.projects.delete(id)
    }
  )
}

export async function touchProject(id: string): Promise<void> {
  await withStore("projects", "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const r = store.get(id)
      r.onsuccess = () => {
        const project = r.result as Project | undefined
        if (!project) {
          resolve()
          return
        }
        project.lastOpened = Date.now()
        const put = store.put(project)
        put.onsuccess = () => resolve()
        put.onerror = () => reject(put.error)
      }
      r.onerror = () => reject(r.error)
    })
  })
}

// ---- Sections (embedded in Project) ----

/**
 * Atomic cascade delete of a Section:
 *  1. Collects the target section id + all descendant section ids (level-2 children).
 *  2. Removes those sections from Project.sections.
 *  3. Clears `sectionId` on all items that were attached to any deleted section.
 *  Single transaction across projects + items for atomicity.
 */
export async function deleteSection(
  projectId: string,
  sectionId: string
): Promise<void> {
  await tx({ projects: "readwrite", projectCards: "readwrite" }, async (stores) => {
    const project = await new Promise<Project | undefined>((resolve) => {
      const req = stores.projects.get(projectId)
      req.onsuccess = () => resolve(req.result as Project | undefined)
      req.onerror = () => resolve(undefined)
    })
    if (!project || !project.sections) return

    const sections = project.sections
    const target = sections.find((s) => s.id === sectionId)
    if (!target) return

    const deletedIds = new Set<string>([sectionId])
    if (target.level === 1) {
      for (const s of sections) {
        if (s.parentId === sectionId) deletedIds.add(s.id)
      }
    }

    project.sections = sections.filter((s) => !deletedIds.has(s.id))
    stores.projects.put(project)

    const idx = stores.projectCards.index("projectId")
    await new Promise<void>((resolve, reject) => {
      const cursorReq = idx.openCursor(IDBKeyRange.only(projectId))
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (cursor) {
          const card = cursor.value as ProjectCard
          if (card.sectionId && deletedIds.has(card.sectionId)) {
            cursor.update({ ...card, sectionId: undefined })
          }
          cursor.continue()
        } else {
          resolve()
        }
      }
      cursorReq.onerror = () => reject(cursorReq.error)
    })
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

export async function getRecentProjects(limit = 3): Promise<Project[]> {
  const projects = await listProjects()
  return [...projects]
    .sort(
      byRecency(
        (p) => p.lastOpened,
        (a, b) => b.createdAt - a.createdAt
      )
    )
    .slice(0, limit)
}

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
  localReviews: ReviewEntry[]
): Promise<void> {
  const remoteCardIds = new Set(remoteProjectCards.map((c) => c.id))
  const remotePdfIds = new Set(remotePdfCards.map((c) => c.id))
  const remoteTodoIds = new Set(remoteTodos.map((c) => c.id))
  const remoteProjectIds = new Set(remoteProjects.map((p) => p.id))
  const remoteReviewItemIds = new Set(remoteReviews.map((r) => r.itemId))

  await tx(
    {
      projectCards: "readwrite",
      pdfCards: "readwrite",
      todos: "readwrite",
      projects: "readwrite",
      reviews: "readwrite"
    },
    async (stores) => {
      for (const card of remoteProjectCards) stores.projectCards.put(card)
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
    }
  )
}
// ---- Reviews ----

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

/** Shared light-weight incomplete-todo count (the toolbar badge's algorithm) —
 *  the NavRail todo icon uses it so it updates as fast as the badge. */
export async function getIncompleteTodoCount(): Promise<number> {
  const todos = await getAllTodos()
  return todos.filter((t) => !isTodoComplete(t.content)).length
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

// ---- PDF stores (v9) ----

/** Add or "fill" a PDF. The id is the SHA-256 content hash of the bytes (a
 *  stable cross-device identity). If a record with the same id already holds
 *  the real bytes, the call is idempotent; a metadata-only placeholder gets
 *  filled when the matching local file is opened. Returns the content-hash id. */
export async function addPdf(pdf: PdfFile): Promise<string> {
  let id = pdf.id
  if (pdf.bytes) id = await sha256Bytes(pdf.bytes)
  const record: PdfFile = {
    ...pdf,
    id,
    lastOpened: pdf.lastOpened ?? pdf.addedAt
  }
  return withStore("pdfs", "readwrite", async (store) => {
    const existing = await new Promise<PdfFile | undefined>((resolve, reject) => {
      const r = store.get(id)
      r.onsuccess = () => resolve(r.result as PdfFile | undefined)
      r.onerror = () => reject(r.error)
    })
    // Keep a real file over a placeholder, and don't re-put the same file.
    if (existing?.bytes) return id
    // Filling a synced placeholder must NOT drop fields the placeholder carries
    // (topic, lastOpened) that the caller's record may lack — merge onto it.
    const merged = existing ? { ...existing, ...record } : record
    await new Promise<void>((resolve, reject) => {
      const r = store.put(merged)
      r.onsuccess = () => resolve()
      r.onerror = () => reject(r.error)
    })
    return id
  })
}

/** Mark a PDF as just-opened (drives recent-first ordering in the sidebar/hub). */
export async function touchPdf(id: string): Promise<void> {
  return withStore("pdfs", "readwrite", async (store) => {
    const pdf = await new Promise<PdfFile | undefined>((resolve, reject) => {
      const r = store.get(id)
      r.onsuccess = () => resolve(r.result as PdfFile | undefined)
      r.onerror = () => reject(r.error)
    })
    if (!pdf) return
    pdf.lastOpened = Date.now()
    await new Promise<void>((resolve, reject) => {
      const r = store.put(pdf)
      r.onsuccess = () => resolve()
      r.onerror = () => reject(r.error)
    })
  })
}

/** Set a PDF's topic (undefined → 未分类). Broadcasts _dbpdf → the library reloads. */
export async function updatePdfTopic(
  id: string,
  topic: string | undefined
): Promise<void> {
  return withStore("pdfs", "readwrite", async (store) => {
    const pdf = await new Promise<PdfFile | undefined>((resolve, reject) => {
      const r = store.get(id)
      r.onsuccess = () => resolve(r.result as PdfFile | undefined)
      r.onerror = () => reject(r.error)
    })
    if (!pdf) return
    if (topic) pdf.topic = topic
    else delete pdf.topic
    await new Promise<void>((resolve, reject) => {
      const r = store.put(pdf)
      r.onsuccess = () => resolve()
      r.onerror = () => reject(r.error)
    })
  })
}

export async function getPdf(id: string): Promise<PdfFile | undefined> {
  return withStore("pdfs", "readonly", (store) => {
    return new Promise((resolve, reject) => {
      const req = store.get(id)
      req.onsuccess = () => resolve(req.result as PdfFile | undefined)
      req.onerror = () => reject(req.error)
    })
  })
}

export async function listPdfs(): Promise<PdfFile[]> {
  return withStore("pdfs", "readonly", (store) => {
    return new Promise((resolve, reject) => {
      const results: PdfFile[] = []
      const req = store.openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          results.push(cursor.value as PdfFile)
          cursor.continue()
        } else {
          resolve(results.sort((a, b) => b.addedAt - a.addedAt))
        }
      }
      req.onerror = () => reject(req.error)
    })
  })
}

/** Delete a PDF + its annotations + its PDF cards together (no orphans). */
/** Delete a PDF + its pdfCards + their placements + annotations together
 *  (no orphans anywhere). */
export async function deletePdf(id: string): Promise<void> {
  await tx(
    {
      pdfCards: "readwrite",
      pdfAnnotations: "readwrite",
      projectCards: "readwrite",
      pdfs: "readwrite",
      reviews: "readwrite"
    },
    async (stores) => {
      const cards = await new Promise<PdfCard[]>((resolve, reject) => {
        const results: PdfCard[] = []
        const req = stores.pdfCards
          .index("pdfId")
          .openCursor(IDBKeyRange.only(id))
        req.onsuccess = () => {
          const cursor = req.result
          if (cursor) {
            results.push(cursor.value as PdfCard)
            cursor.continue()
          } else {
            resolve(results)
          }
        }
        req.onerror = () => reject(req.error)
      })
      for (const card of cards) {
        if (card.annotationId) stores.pdfAnnotations.delete(card.annotationId)
        if (card.projectCardId) {
          // 删父要删子 — cascade the placement + its review.
          const r = stores.reviews
            .index("itemId")
            .getKey(card.projectCardId)
          r.onsuccess = () => {
            if (r.result) stores.reviews.delete(r.result as string)
          }
          stores.projectCards.delete(card.projectCardId)
        }
        stores.pdfCards.delete(card.id)
      }
      await new Promise<void>((resolve, reject) => {
        const r = stores.pdfs.delete(id)
        r.onsuccess = () => resolve()
        r.onerror = () => reject(r.error)
      })
    }
  )
}

/** All pdfCards belonging to a PDF (via the pdfId index), unsorted. */
export async function getPdfCards(pdfId: string): Promise<PdfCard[]> {
  return withStore("pdfCards", "readonly", (store) => {
    return new Promise((resolve, reject) => {
      const idx = store.index("pdfId")
      const req = idx.getAll(pdfId)
      req.onsuccess = () => resolve((req.result as PdfCard[]) ?? [])
      req.onerror = () => reject(req.error)
    })
  })
}

/** Page-major multiplier for a card's pdfOrder (page * BASE + in-page pos). */
const PDF_ORDER_BASE = 1e6

/** Create a text annotation + its pdfCard in ONE transaction. */
export async function createTextAnnotationCard(input: {
  pdfId: string
  page: number
  type: Exclude<PdfMark, "frame">
  text: string
  startOffset: number
  endOffset: number
  title?: string
}): Promise<{ card: PdfCard; annotation: PdfAnnotation }> {
  const annotation: PdfAnnotation = {
    id: crypto.randomUUID(),
    pdfId: input.pdfId,
    page: input.page,
    kind: "text",
    type: input.type,
    startOffset: input.startOffset,
    endOffset: input.endOffset,
    text: input.text,
    createdAt: Date.now()
  }
  const card = createPdfCard({
    pdfId: input.pdfId,
    page: input.page,
    kind: "text",
    type: input.type,
    annotationId: annotation.id,
    content: input.text,
    pdfOrder: input.page * PDF_ORDER_BASE + input.startOffset
  })
  annotation.cardId = card.id
  await tx(
    { pdfCards: "readwrite", pdfAnnotations: "readwrite" },
    async (stores) => {
      await new Promise<void>((resolve, reject) => {
        const r1 = stores.pdfCards.put(card)
        r1.onsuccess = () => {
          const r2 = stores.pdfAnnotations.put(annotation)
          r2.onsuccess = () => resolve()
          r2.onerror = () => reject(r2.error)
        }
        r1.onerror = () => reject(r1.error)
      })
    }
  )
  return { card, annotation }
}

/** Create a region (框选) annotation + its pdfCard in ONE transaction. */
export async function createRegionAnnotationCard(input: {
  pdfId: string
  page: number
  rects: { x: number; y: number; w: number; h: number }[]
  imageDataUrl: string
}): Promise<{ card: PdfCard; annotation: PdfAnnotation }> {
  const annotation: PdfAnnotation = {
    id: crypto.randomUUID(),
    pdfId: input.pdfId,
    page: input.page,
    kind: "region",
    type: "frame",
    rects: input.rects,
    createdAt: Date.now()
  }
  const y = input.rects.length > 0 ? input.rects[0].y : 0
  const card = createPdfCard({
    pdfId: input.pdfId,
    page: input.page,
    kind: "region",
    type: "frame",
    annotationId: annotation.id,
    content: input.imageDataUrl,
    pdfOrder: input.page * PDF_ORDER_BASE + Math.round(y * 1e6)
  })
  annotation.cardId = card.id
  await tx(
    { pdfCards: "readwrite", pdfAnnotations: "readwrite" },
    async (stores) => {
      await new Promise<void>((resolve, reject) => {
        const r1 = stores.pdfCards.put(card)
        r1.onsuccess = () => {
          const r2 = stores.pdfAnnotations.put(annotation)
          r2.onsuccess = () => resolve()
          r2.onerror = () => reject(r2.error)
        }
        r1.onerror = () => reject(r1.error)
      })
    }
  )
  return { card, annotation }
}

/** Delete an annotation + its pdfCard + any placement (1:1 coupling). */
export async function deleteAnnotationWithCard(
  annotationId: string
): Promise<void> {
  await tx(
    {
      pdfAnnotations: "readwrite",
      pdfCards: "readwrite",
      projectCards: "readwrite",
      reviews: "readwrite"
    },
    async (stores) => {
      const ann = await new Promise<PdfAnnotation | undefined>((resolve, reject) => {
        const r = stores.pdfAnnotations.get(annotationId)
        r.onsuccess = () => resolve(r.result as PdfAnnotation | undefined)
        r.onerror = () => reject(r.error)
      })
      await new Promise<void>((resolve, reject) => {
        if (ann?.cardId) {
          // The pdfCard carries the placement reference — look it up first
          // (the projectCardId index key is the placement's PRIMARY key, not
          // the pdfCard id, so querying by ann.cardId never matched).
          const gr = stores.pdfCards.get(ann.cardId)
          gr.onsuccess = () => {
            const pdfCard = gr.result as PdfCard | undefined
            if (pdfCard?.projectCardId) {
              const rr = stores.reviews
                .index("itemId")
                .getKey(pdfCard.projectCardId)
              rr.onsuccess = () => {
                if (rr.result) stores.reviews.delete(rr.result as string)
              }
              rr.onerror = () =>
                console.warn(
                  "[lime] deleteAnnotationWithCard: review lookup failed"
                )
              stores.projectCards.delete(pdfCard.projectCardId)
            }
            stores.pdfCards.delete(ann.cardId!)
            const d = stores.pdfAnnotations.delete(annotationId)
            d.onsuccess = () => resolve()
            d.onerror = () => reject(d.error)
          }
          gr.onerror = () => {
            stores.pdfCards.delete(ann.cardId!)
            const d = stores.pdfAnnotations.delete(annotationId)
            d.onsuccess = () => resolve()
            d.onerror = () => reject(d.error)
          }
        } else {
          const d = stores.pdfAnnotations.delete(annotationId)
          d.onsuccess = () => resolve()
          d.onerror = () => reject(d.error)
        }
      })
    }
  )
}

/** Delete PDF cards + their linked annotations + their placements' reviews in
 *  ONE transaction (batch — pass `[card]` for a single card). A placement is
 *  deleted alongside its pdfCard; the pdfCard is always removed. */
export async function deletePdfCards(cards: PdfCard[]): Promise<void> {
  if (cards.length === 0) return
  await tx(
    {
      pdfCards: "readwrite",
      pdfAnnotations: "readwrite",
      projectCards: "readwrite",
      reviews: "readwrite"
    },
    async (stores) => {
      await new Promise<void>((resolve, reject) => {
        let remaining = cards.length
        for (const card of cards) {
          if (card.annotationId) {
            stores.pdfAnnotations.delete(card.annotationId)
          }
          if (card.projectCardId) {
            const r = stores.reviews.index("itemId").getKey(card.projectCardId)
            r.onsuccess = () => {
              if (r.result) stores.reviews.delete(r.result as string)
            }
            stores.projectCards.delete(card.projectCardId)
          }
          const d = stores.pdfCards.delete(card.id)
          d.onsuccess = () => {
            if (--remaining === 0) resolve()
          }
          d.onerror = () => reject(d.error)
        }
      })
    }
  )
}

/** Parallel get by keys inside one transaction (resolve on all requests done). */
function getByKeys<T extends { id: string }>(
  store: IDBObjectStore,
  ids: string[]
): Promise<T[]> {
  return new Promise<T[]>((resolve, reject) => {
    const results: T[] = []
    let remaining = ids.length
    if (remaining === 0) {
      resolve(results)
      return
    }
    for (const id of ids) {
      const r = store.get(id)
      r.onsuccess = () => {
        const it = r.result as T | undefined
        if (it) results.push(it)
        if (--remaining === 0) resolve(results)
      }
      r.onerror = () => reject(r.error)
    }
  })
}

/** Parallel put inside one transaction (resolve when all are committed). */
function putAll<T extends { id: string }>(
  store: IDBObjectStore,
  items: T[]
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let remaining = items.length
    if (remaining === 0) {
      resolve()
      return
    }
    for (const it of items) {
      const r = store.put(it)
      r.onsuccess = () => {
        if (--remaining === 0) resolve()
      }
      r.onerror = () => reject(r.error)
    }
  })
}

/** Place pdfCards into a project — create a placement record (projectCards) +
 *  the pdfCard's reverse reference, ONE tx + both broadcasts. 1:1 guarded. */
export async function placePdfCards(
  pdfCardIds: string[],
  projectId: string
): Promise<void> {
  if (pdfCardIds.length === 0) return
  const maxOrder = await getMaxOrderInSection(undefined)
  let runningMax = maxOrder
  await tx(
    { pdfCards: "readwrite", projectCards: "readwrite" },
    async (stores) => {
      const cards = await getByKeys<PdfCard>(stores.pdfCards, pdfCardIds)
      for (const pdfCard of cards) {
        if (pdfCard.projectCardId) continue // 1:1 guard — already placed
        runningMax += 1
        const placement: ProjectCard = {
          id: crypto.randomUUID(),
          type: pdfCard.kind === "region" ? "image" : "text",
          content: "",
          projectId,
          sectionId: undefined,
          order: runningMax,
          pdfCardId: pdfCard.id,
          createdAt: Date.now()
        }
        stores.projectCards.put(placement)
        stores.pdfCards.put({ ...pdfCard, projectCardId: placement.id })
      }
    }
  )
  await broadcastDbChange("pdfs")
}

/** Place a single pdfCard (thin wrapper). */
export async function placePdfCard(
  pdfCardId: string,
  projectId: string
): Promise<void> {
  await placePdfCards([pdfCardId], projectId)
}

/** Remove pdfCards from their project — delete the placement + clear the
 *  reverse reference + the placement's review (only project cards review). */
export async function unplacePdfCards(pdfCardIds: string[]): Promise<void> {
  if (pdfCardIds.length === 0) return
  await tx(
    { pdfCards: "readwrite", projectCards: "readwrite", reviews: "readwrite" },
    async (stores) => {
      const cards = await getByKeys<PdfCard>(stores.pdfCards, pdfCardIds)
      for (const pdfCard of cards) {
        if (!pdfCard.projectCardId) continue
        const r = stores.reviews.index("itemId").getKey(pdfCard.projectCardId)
        r.onsuccess = () => {
          if (r.result) stores.reviews.delete(r.result as string)
        }
        stores.projectCards.delete(pdfCard.projectCardId)
        stores.pdfCards.put({ ...pdfCard, projectCardId: undefined })
      }
    }
  )
  await broadcastDbChange("pdfs")
}

/** Remove a single pdfCard from its project (thin wrapper). */
export async function unplacePdfCard(pdfCardId: string): Promise<void> {
  await unplacePdfCards([pdfCardId])
}

/** All annotations across every PDF (for backup). */
export async function getAllAnnotations(): Promise<PdfAnnotation[]> {
  return withStore("pdfAnnotations", "readonly", (store) => {
    return new Promise((resolve, reject) => {
      const results: PdfAnnotation[] = []
      const req = store.openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          results.push(cursor.value as PdfAnnotation)
          cursor.continue()
        } else {
          resolve(results)
        }
      }
      req.onerror = () => reject(req.error)
    })
  })
}

/** Add or update a single annotation (low-level store CRUD). */
export async function addAnnotation(ann: PdfAnnotation): Promise<void> {
  return withStore("pdfAnnotations", "readwrite", async (store) => {
    await new Promise<void>((resolve, reject) => {
      const req = store.put(ann)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  })
}

export async function getAnnotation(
  id: string
): Promise<PdfAnnotation | undefined> {
  return withStore("pdfAnnotations", "readonly", (store) => {
    return new Promise((resolve, reject) => {
      const req = store.get(id)
      req.onsuccess = () => resolve(req.result as PdfAnnotation | undefined)
      req.onerror = () => reject(req.error)
    })
  })
}

export async function getAnnotationsByPdf(
  pdfId: string
): Promise<PdfAnnotation[]> {
  return withStore("pdfAnnotations", "readonly", (store) => {
    const idx = store.index("pdfId")
    return new Promise((resolve, reject) => {
      const results: PdfAnnotation[] = []
      const req = idx.openCursor(IDBKeyRange.only(pdfId))
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          results.push(cursor.value as PdfAnnotation)
          cursor.continue()
        } else {
          resolve(results)
        }
      }
      req.onerror = () => reject(req.error)
    })
  })
}

export async function deleteAnnotation(id: string): Promise<void> {
  return withStore("pdfAnnotations", "readwrite", async (store) => {
    await new Promise<void>((resolve, reject) => {
      const req = store.delete(id)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  })
}

// ---- PDF notes-only sync application ----

/** Apply the remote PDF domain after a notes-only download: upsert PDF
 *  metadata as placeholders (local file bytes are preserved), upsert remote
 *  annotations + delete local annotations not on the remote. */
export async function applyPdfSync(
  remotePdfs: {
    id: string
    name: string
    pageCount: number
    addedAt: number
    lastOpened?: number
    topic?: string
  }[],
  remoteAnnotations: PdfAnnotation[],
  _localPdfs: PdfFile[],
  localAnnotations: PdfAnnotation[]
): Promise<void> {
  for (const pdf of remotePdfs) {
    await addPdf({ ...pdf, bytes: null })
  }
  const remoteIds = new Set(remoteAnnotations.map((a) => a.id))
  await tx({ pdfAnnotations: "readwrite" }, async (stores) => {
    for (const ann of remoteAnnotations) stores.pdfAnnotations.put(ann)
    for (const local of localAnnotations) {
      if (!remoteIds.has(local.id)) stores.pdfAnnotations.delete(local.id)
    }
  })
}

/** Change an annotation's mark type (e.g. underline → highlight). The 1:1 card
 *  is untouched — only the overlay style re-renders via the _dbpdf broadcast. */
export async function updateAnnotationType(
  id: string,
  type: PdfMark
): Promise<void> {
  return withStore("pdfAnnotations", "readwrite", async (store) => {
    const ann = await new Promise<PdfAnnotation | undefined>((resolve, reject) => {
      const r = store.get(id)
      r.onsuccess = () => resolve(r.result as PdfAnnotation | undefined)
      r.onerror = () => reject(r.error)
    })
    if (!ann) return
    ann.type = type
    await new Promise<void>((resolve, reject) => {
      const r = store.put(ann)
      r.onsuccess = () => resolve()
      r.onerror = () => reject(r.error)
    })
  })
}

/** Rename a topic across all PDFs carrying it. */
export async function renamePdfTopic(
  oldTopic: string,
  newTopic: string
): Promise<void> {
  return withStore("pdfs", "readwrite", async (store) => {
    const all = await new Promise<PdfFile[]>((resolve, reject) => {
      const r = store.getAll()
      r.onsuccess = () => resolve((r.result as PdfFile[]) ?? [])
      r.onerror = () => reject(r.error)
    })
    for (const pdf of all) {
      if (pdf.topic !== oldTopic) continue
      pdf.topic = newTopic
      await new Promise<void>((resolve, reject) => {
        const r = store.put(pdf)
        r.onsuccess = () => resolve()
        r.onerror = () => reject(r.error)
      })
    }
  })
}

/** Clear a topic from every PDF carrying it (→ 未分类). */
export async function clearPdfTopic(topic: string): Promise<void> {
  return withStore("pdfs", "readwrite", async (store) => {
    const all = await new Promise<PdfFile[]>((resolve, reject) => {
      const r = store.getAll()
      r.onsuccess = () => resolve((r.result as PdfFile[]) ?? [])
      r.onerror = () => reject(r.error)
    })
    for (const pdf of all) {
      if (pdf.topic !== topic) continue
      delete pdf.topic
      await new Promise<void>((resolve, reject) => {
        const r = store.put(pdf)
        r.onsuccess = () => resolve()
        r.onerror = () => reject(r.error)
      })
    }
  })
}
