import { collectAll, withStore } from "./core"
import type { ReadLater } from "../types"

/** Every read-later record (unsorted). */
export async function getAllReadLater(): Promise<ReadLater[]> {
  return withStore("readLater", "readonly", (store) =>
    collectAll<ReadLater>(store)
  )
}

/** Look up the ACTIVE (non-done) read-later record linked to a PDF, if any.
 *  Done/archived cards no longer block re-adding a PDF, so only an active one
 *  counts as "the" card for the PDF (one active card per PDF rule). */
export async function getReadLaterByPdfId(
  pdfId: string
): Promise<ReadLater | undefined> {
  return withStore("readLater", "readonly", (store) => {
    return new Promise((resolve, reject) => {
      const req = store.index("byPdfId").openCursor(IDBKeyRange.only(pdfId))
      req.onsuccess = () => {
        const c = req.result
        if (c) {
          if ((c.value as ReadLater).status !== "done") {
            resolve(c.value as ReadLater)
          } else {
            c.continue()
          }
        } else {
          resolve(undefined)
        }
      }
      req.onerror = () => reject(req.error)
    })
  })
}

/** Scan a store's byPdfId index (same tx) for an ACTIVE record holding the
 *  pdfId — the in-tx one-active-per-PDF check (IndexedDB readwrite txs on the
 *  same store are serialized, so this is race-free even without a unique
 *  index). Done/archived cards are ignored. */
function findActiveForPdf(
  store: IDBObjectStore,
  pdfId: string
): Promise<ReadLater | undefined> {
  return new Promise((resolve, reject) => {
    const req = store.index("byPdfId").openCursor(IDBKeyRange.only(pdfId))
    req.onsuccess = () => {
      const c = req.result
      if (c) {
        if ((c.value as ReadLater).status !== "done") resolve(c.value as ReadLater)
        else c.continue()
      } else {
        resolve(undefined)
      }
    }
    req.onerror = () => reject(req.error)
  })
}

/** Active (not-yet-read) read-later count — feeds the NavRail todo badge. */
export async function getActiveReadLaterCount(): Promise<number> {
  const all = await getAllReadLater()
  return all.filter((r) => r.status !== "done").length
}

/** Add a read-later record. Returns false (no write) when an ACTIVE card
 *  already references the same pdfId (one active card per PDF). Done/archived
 *  cards for the same PDF coexist freely. The check runs INSIDE the write tx. */
export async function addReadLater(item: ReadLater): Promise<boolean> {
  const ready: ReadLater = { ...item, updatedAt: item.updatedAt ?? Date.now() }
  return withStore("readLater", "readwrite", async (store) => {
    if (ready.pdfId && ready.status !== "done") {
      const existing = await findActiveForPdf(store, ready.pdfId)
      if (existing && existing.id !== ready.id) return false
    }
    await new Promise<void>((resolve, reject) => {
      const req = store.put(ready)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
    return true
  })
}

/** Update a read-later record. Returns false when the update would make an
 *  ACTIVE card collide with another active card's pdfId. Same in-tx check. */
export async function updateReadLater(item: ReadLater): Promise<boolean> {
  return withStore("readLater", "readwrite", async (store) => {
    if (item.pdfId && item.status !== "done") {
      const existing = await findActiveForPdf(store, item.pdfId)
      if (existing && existing.id !== item.id) return false
    }
    await new Promise<void>((resolve, reject) => {
      const req = store.put({ ...item, updatedAt: Date.now() })
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
    return true
  })
}

export async function deleteReadLater(id: string): Promise<void> {
  await withStore("readLater", "readwrite", async (store) => {
    await new Promise<void>((resolve, reject) => {
      const req = store.delete(id)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  })
}
