import { tx, withStore } from "./core"
import type { PdfCard, Project, ProjectCard } from "../types"
import { byRecency } from "../utils"

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

export async function touchProject(id: string): Promise<boolean | void> {
  await withStore("projects", "readwrite", (store) => {
    return new Promise<boolean | void>((resolve, reject) => {
      const r = store.get(id)
      r.onsuccess = () => {
        const project = r.result as Project | undefined
        if (!project) {
          resolve(false)
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
 *  3. Clears `sectionId` on all projectCards attached to any deleted section.
 *  Single transaction across projects + items for atomicity.
 */
export async function deleteSection(
  projectId: string,
  sectionId: string
): Promise<boolean | void> {
  await tx({ projects: "readwrite", projectCards: "readwrite" }, async (stores) => {
    const project = await new Promise<Project | undefined>((resolve) => {
      const req = stores.projects.get(projectId)
      req.onsuccess = () => resolve(req.result as Project | undefined)
      req.onerror = () => resolve(undefined)
    })
    if (!project || !project.sections) return false

    const sections = project.sections
    const target = sections.find((s) => s.id === sectionId)
    if (!target) return false

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
