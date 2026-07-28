import type { Item, Project, ReviewEntry, SearchQuery, SrsData } from "../types"
import { computeItemHash } from "../utils"

const DB_NAME = "pickquote-db"
const DB_VERSION = 8

type TableNames = "items" | "projects" | "reviews"

// ---- Cross-context change notification ----
// Any successful write transaction automatically broadcasts a version stamp
// via chrome.storage.local. All extension bundles (SW, options, popups) listen
// to chrome.storage.onChanged, so every context gets notified without bridges.
async function broadcastDbChange(name: TableNames): Promise<void> {
  try {
    if (typeof chrome?.storage?.local?.set === "function") {
      await chrome.storage.local.set({ [name === "projects" ? "_dbp" : "_dbi"]: Date.now() })
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
              const item = cursor.value as Item & { srs?: SrsData }
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
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
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
    if (
      _retry &&
      err instanceof DOMException &&
      err.name === "NotFoundError"
    ) {
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
  const mode = names.some((n) => storeMap[n] === "readwrite") ? "readwrite" : "readonly"
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
  return withStore("items", "readonly", async (store) => {
    const idx = store.index("hash")
    return new Promise<boolean>((resolve, reject) => {
      const req = idx.openCursor(IDBKeyRange.only(hash))
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) {
          resolve(false)
          return
        }
        const val = cursor.value as Item
        if (
          val.projectId === projectId &&
          val.source?.url === sourceUrl
        ) {
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

export async function addItem(item: Item): Promise<boolean> {
  const normalized: Item = {
    ...item,
    updatedAt: item.updatedAt ?? Date.now(),
    sourceSite:
      item.source?.site ??
      (item.source ? safeHostname(item.source.url) : undefined),
    hash:
      item.hash ||
      (item.source
        ? await computeItemHash(item.content, item.source.url, item.images)
        : await computeItemHash(item.content, "", item.images))
  }

  return withStore("items", "readwrite", async (store) => {
    const idx = store.index("hash")
    return new Promise<boolean>((resolve, reject) => {
      const req = idx.openCursor(IDBKeyRange.only(normalized.hash))
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) {
          store.put(normalized)
          resolve(true)
          return
        }
        const existing = cursor.value as Item
        if (
          existing.projectId === normalized.projectId &&
          existing.source?.url === normalized.source?.url
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

export async function searchItems(q: SearchQuery): Promise<Item[]> {
  return withStore("items", "readonly", async (store) => {
    const results: Item[] = []
    return new Promise<Item[]>((resolve, reject) => {
      const source =
        q.projectId
          ? store.index("projectId")
          : store.index("createdAt")
      const range = q.projectId ? IDBKeyRange.only(q.projectId) : null
      const cursorReq = source.openCursor(range, q.projectId ? undefined : "prev")
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (!cursor) {
          resolve(results)
          return
        }
        const item = cursor.value as Item
        if (
          (!q.type || item.type === q.type) &&
          (!q.site || item.sourceSite === q.site) &&
          (!q.from || item.createdAt >= q.from) &&
          (!q.to || item.createdAt < q.to) &&
          (!q.projectId || item.projectId === q.projectId) &&
          (!q.keyword ||
            item.content?.toLowerCase().includes(q.keyword.toLowerCase()) ||
            item.title?.toLowerCase().includes(q.keyword.toLowerCase()) ||
            item.source?.title?.toLowerCase().includes(q.keyword.toLowerCase()))
        ) {
          results.push(item)
        }
        cursor.continue()
      }
      cursorReq.onerror = () => reject(cursorReq.error)
    })
  })
}

export async function deleteItem(id: string): Promise<void> {
  // Cascade: remove associated review entry and item in one atomic transaction
  await tx({ reviews: "readwrite", items: "readwrite" }, async (stores) => {
    const idx = stores.reviews.index("itemId")
    return new Promise<void>((resolve, reject) => {
      const req = idx.getKey(id)
      req.onsuccess = () => {
        if (req.result) stores.reviews.delete(req.result as string)
        stores.items.delete(id)
        resolve()
      }
      req.onerror = () => reject(req.error)
    })
  })
}

export async function deleteItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  // Cascade: remove associated review entries and items in one atomic transaction
  await tx({ reviews: "readwrite", items: "readwrite" }, async (stores) => {
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
      stores.items.delete(id)
    }
  })
}

export async function updateItem(item: Item): Promise<void> {
  await withStore("items", "readwrite", (store) => {
    store.put({ ...item, updatedAt: Date.now() })
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
  // Atomic cascade: delete project, its items, and associated reviews in one transaction
  await tx({ items: "readwrite", reviews: "readwrite", projects: "readwrite" }, async (stores) => {
    const itemIds: string[] = await new Promise((resolve, reject) => {
      const ids: string[] = []
      const idx = stores.items.index("projectId")
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
    const reviewKeys = await Promise.all(
      itemIds.map((itemId) =>
        new Promise<IDBValidKey | null>((resolve) => {
          const req = reviewIdx.getKey(itemId)
          req.onsuccess = () => resolve(req.result ?? null)
          req.onerror = () => resolve(null)
        })
      )
    )
    for (const key of reviewKeys) {
      if (key) stores.reviews.delete(key)
    }
    for (const itemId of itemIds) {
      stores.items.delete(itemId)
    }
    stores.projects.delete(id)
  })
}

export async function touchProject(id: string): Promise<void> {
  const projects = await listProjects()
  const project = projects.find((p) => p.id === id)
  if (project) {
    project.lastOpened = Date.now()
    await updateProject(project)
  }
}

// ---- Sections (embedded in Project) ----

/**
 * Atomic cascade delete of a Section:
 *  1. Collects the target section id + all descendant section ids (level-2 children).
 *  2. Removes those sections from Project.sections.
 *  3. Clears `sectionId` on all items that were attached to any deleted section.
 *  Single transaction across projects + items for atomicity.
 */
export async function deleteSection(projectId: string, sectionId: string): Promise<void> {
  await tx({ projects: "readwrite", items: "readwrite" }, async (stores) => {
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

    const idx = stores.items.index("projectId")
    await new Promise<void>((resolve, reject) => {
      const cursorReq = idx.openCursor(IDBKeyRange.only(projectId))
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (cursor) {
          const item = cursor.value as Item
          if (item.sectionId && deletedIds.has(item.sectionId)) {
            cursor.update({ ...item, sectionId: undefined })
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

/**
 * Update a single item's sectionId.
 * Pass undefined to move the card to "未分类".
 */
export async function updateItemSection(itemId: string, sectionId: string | undefined): Promise<void> {
  await withStore("items", "readwrite", async (store) => {
    return new Promise<void>((resolve, reject) => {
      const req = store.get(itemId)
      req.onsuccess = () => {
        const item = req.result as Item | undefined
        if (!item) { resolve(); return }
        store.put({ ...item, sectionId, updatedAt: Date.now() })
        resolve()
      }
      req.onerror = () => reject(req.error)
    })
  })
}

/**
 * Batch update multiple items' sectionId and/or order in a single atomic transaction.
 * Only items whose id is in the updates array are touched; others are unchanged.
 */
export async function batchUpdateItems(
  updates: { id: string; sectionId?: string; order?: number }[]
): Promise<void> {
  if (updates.length === 0) return
  await withStore("items", "readwrite", async (store) => {
    const items = await Promise.all(
      updates.map(
        (u) =>
          new Promise<{ id: string; item?: Item }>((resolve) => {
            const req = store.get(u.id)
            req.onsuccess = () => resolve({ id: u.id, item: req.result as Item | undefined })
            req.onerror = () => resolve({ id: u.id })
          })
      )
    )
    for (let i = 0; i < items.length; i++) {
      const { item } = items[i]
      if (!item) continue
      const u = updates[i]
      store.put({
        ...item,
        ...("sectionId" in u ? { sectionId: u.sectionId } : {}),
        ...("order" in u ? { order: u.order } : {}),
        updatedAt: Date.now()
      })
    }
  })
}

export async function getRecentProjects(limit = 3): Promise<Project[]> {
  const projects = await listProjects()
  return projects.sort((a, b) => (b.lastOpened ?? 0) - (a.lastOpened ?? 0)).slice(0, limit)
}

/**
 * Diff-based bulk replacement for sync download.
 * Uses a single atomic transaction across items, projects, and reviews.
 * Upserts remote entities and deletes any local entity whose id is not in the remote set.
 */
export async function bulkReplace(
  remoteItems: Item[],
  remoteProjects: Project[],
  remoteReviews: ReviewEntry[],
  localItems: Item[],
  localProjects: Project[],
  localReviews: ReviewEntry[]
): Promise<void> {
  const remoteItemIds = new Set(remoteItems.map((i) => i.id))
  const remoteProjectIds = new Set(remoteProjects.map((p) => p.id))
  const remoteReviewItemIds = new Set(remoteReviews.map((r) => r.itemId))

  await tx(
    { items: "readwrite", projects: "readwrite", reviews: "readwrite" },
    async (stores) => {
      // items
      for (const item of remoteItems) stores.items.put(item)
      for (const item of localItems) {
        if (!remoteItemIds.has(item.id)) stores.items.delete(item.id)
      }
      // projects
      for (const project of remoteProjects) stores.projects.put(project)
      for (const project of localProjects) {
        if (!remoteProjectIds.has(project.id)) stores.projects.delete(project.id)
      }
      // reviews: upsert remote, delete local-not-in-remote
      for (const review of remoteReviews) stores.reviews.put(review)
      const idx = stores.reviews.index("itemId")
      for (const review of localReviews) {
        if (!remoteReviewItemIds.has(review.itemId)) {
          const req = idx.getKey(review.itemId)
          await new Promise<void>((resolve) => { req.onsuccess = () => { if (req.result) stores.reviews.delete(req.result); resolve() }; req.onerror = () => resolve() })
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

export async function getReviewByItemId(itemId: string): Promise<ReviewEntry | undefined> {
  return withStore("reviews", "readonly", (store) => {
    const idx = store.index("itemId")
    return new Promise<ReviewEntry | undefined>((resolve, reject) => {
      const req = idx.get(itemId)
      req.onsuccess = () => resolve(req.result as ReviewEntry | undefined)
      req.onerror = () => reject(req.error)
    })
  })
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

export async function getReviewStatsByStore(): Promise<{
  dueCount: number
  activeCount: number
  masteredCount: number
}> {
  return withStore("reviews", "readonly", (store) => {
    return new Promise((resolve, reject) => {
      let dueCount = 0
      let activeCount = 0
      let masteredCount = 0
      const now = Date.now()
      const req = store.openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          const entry = cursor.value as ReviewEntry
          if (entry.status === "active") {
            activeCount++
            if (entry.dueDate <= now) dueCount++
          }
          if (entry.status === "mastered") masteredCount++
          cursor.continue()
        } else {
          resolve({ dueCount, activeCount, masteredCount })
        }
      }
      req.onerror = () => reject(req.error)
    })
  })
}

export async function updateReviewSrs(itemId: string, srs: SrsData): Promise<void> {
  await withStore("reviews", "readwrite", (store) => {
    const idx = store.index("itemId")
    return new Promise<void>((resolve, reject) => {
      const req = idx.get(itemId)
      req.onsuccess = () => {
        const entry = req.result as ReviewEntry
        if (entry) {
          entry.srs = srs
          entry.dueDate = srs.dueDate
          // Auto-promote to mastered when interval reaches max
          if (srs.interval >= 365) entry.status = "mastered"
          store.put(entry)
        }
        resolve()
      }
      req.onerror = () => reject(req.error)
    })
  })
}
