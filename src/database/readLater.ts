import { collectAll, withStore } from "./core"
import type { ReadLater } from "../types"

/** Every read-later record (unsorted). */
export async function getAllReadLater(): Promise<ReadLater[]> {
  return withStore("readLater", "readonly", (store) =>
    collectAll<ReadLater>(store)
  )
}

/** Look up a read-later record by its linked PDF (via the unique byPdfId
 *  index). Returns undefined when no record references the PDF. */
export async function getReadLaterByPdfId(
  pdfId: string
): Promise<ReadLater | undefined> {
  return withStore("readLater", "readonly", (store) => {
    return new Promise((resolve, reject) => {
      const req = store.index("byPdfId").get(pdfId)
      req.onsuccess = () => resolve(req.result as ReadLater | undefined)
      req.onerror = () => reject(req.error)
    })
  })
}

/** Add a read-later record. Returns false (no write) when another record
 *  already references the same pdfId — the PDF one-card rule. The uniqueness
 *  check runs INSIDE the write tx (reading the unique byPdfId index) so two
 *  overlapping calls can't both pass a separate readonly check and then throw
 *  ConstraintError on the second put. */
export async function addReadLater(item: ReadLater): Promise<boolean> {
  const ready: ReadLater = { ...item, updatedAt: item.updatedAt ?? Date.now() }
  return withStore("readLater", "readwrite", async (store) => {
    if (ready.pdfId) {
      const existing = await new Promise<ReadLater | undefined>(
        (resolve, reject) => {
          const req = store.index("byPdfId").get(ready.pdfId)
          req.onsuccess = () => resolve(req.result as ReadLater | undefined)
          req.onerror = () => reject(req.error)
        }
      )
      if (existing) return false
    }
    await new Promise<void>((resolve, reject) => {
      const req = store.put(ready)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
    return true
  })
}

/** Update a read-later record. Returns false when the update would collide
 *  with another record's pdfId (the PDF one-card rule). The check runs inside
 *  the write tx (see addReadLater). */
export async function updateReadLater(item: ReadLater): Promise<boolean> {
  return withStore("readLater", "readwrite", async (store) => {
    if (item.pdfId) {
      const existing = await new Promise<ReadLater | undefined>(
        (resolve, reject) => {
          const req = store.index("byPdfId").get(item.pdfId)
          req.onsuccess = () => resolve(req.result as ReadLater | undefined)
          req.onerror = () => reject(req.error)
        }
      )
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
