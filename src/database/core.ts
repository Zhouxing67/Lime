import { splitLegacyItem, type LegacyItem } from "../utils/cards"
import type {
  PdfCard,
  PdfMark,
  PdfAnnotation,
  PdfFile,
  ReviewEntry,
  SrsData
} from "../types"
import { sha256Bytes } from "../utils"

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
export async function broadcastDbChange(name: TableNames): Promise<void> {
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
        const validProjectCardIds = new Set<string>()
        let collected = false
        let pending = 0
        let done = false

        const finish = () => {
          if (done) return
          done = true
          // Remap reviews of placed items onto their placement ids; DROP any
          // review whose item isn't a project card — only project cards are
          // reviewable, so a legacy pdf-only/todo card's review would be a
          // phantom inflating the badge + propagating through sync forever.
          const rc = reviewStore.openCursor()
          rc.onsuccess = (e) => {
            const c = (e.target as IDBRequest<IDBCursorWithValue>).result
            if (c) {
              const r = c.value as ReviewEntry
              const mapped = reviewRemap.get(r.itemId)
              if (mapped) c.update({ ...r, itemId: mapped })
              else if (!validProjectCardIds.has(r.itemId)) c.delete()
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
          const item = c.value as LegacyItem
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
            const convert = (annotationType?: PdfMark) => {
              const split = splitLegacyItem(item, annotationType)
              if (!split.pdfCard) {
                pending--
                maybeFinish()
                return
              }
              pdStore.put(split.pdfCard)
              if (split.placement) {
                pcStore.put(split.placement)
                // splitLegacyItem already set the mutual reference.
                reviewRemap.set(item.id, split.placement.id)
                validProjectCardIds.add(split.placement.id)
              }
              pending--
              maybeFinish()
            }
            annReq.onsuccess = () => {
              const ann = annReq.result as PdfAnnotation | undefined
              if (ann) {
                // The pdfCard keeps the old item id — the annotation's cardId
                // maps naturally + the old itemId field is retired.
                const updated = { ...ann, cardId: item.id } as PdfAnnotation
                delete (updated as unknown as Record<string, unknown>).itemId
                annStore.put(updated)
              }
              convert(ann?.type)
            }
            annReq.onerror = () => {
              // Annotation lookup failed — still convert (the type falls back
              // to highlight) so the migration can't hang or drop cards.
              convert(undefined)
            }
          } else {
            const split = splitLegacyItem(item)
            if (split.projectCard) {
              pcStore.put(split.projectCard)
              validProjectCardIds.add(split.projectCard.id)
            }
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

export async function withStore<T>(
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
 *   await tx({ projectCards: "readwrite", reviews: "readwrite" }, async (s) => {
 *     s.projectCards.delete(id)
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
