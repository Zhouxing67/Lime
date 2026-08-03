import JSZip from "jszip"

import {
  addItem,
  addProject,
  addReview,
  getAllReviews,
  getProjectByName,
  searchItems
} from "../database"
import type { Item, ItemType, Project, ReviewEntry, Section } from "../types"

export interface ImportResult {
  imported: number
  skipped: number
  errors: { index: number; reason: string }[]
}

const VALID_TYPES: ItemType[] = ["text", "image", "link", "todo"]

function validateItem(
  raw: unknown,
  index: number
): { item: Item } | { error: string } {
  if (!raw || typeof raw !== "object") {
    return { error: "条目不是有效对象" }
  }

  const obj = raw as Record<string, unknown>

  if (!VALID_TYPES.includes(obj.type as ItemType)) {
    return { error: `无效的 type: "${obj.type}"` }
  }

  if (typeof obj.content !== "string" || obj.content.length === 0) {
    return { error: "content 缺失或为空" }
  }

  const source: Record<string, unknown> | undefined =
    obj.source && typeof obj.source === "object"
      ? (obj.source as Record<string, unknown>)
      : undefined

  if (
    obj.type !== "todo" &&
    (!source || typeof source.url !== "string" || source.url.length === 0)
  ) {
    return { error: "source 缺失或不是对象" }
  }

  const id =
    typeof obj.id === "string" && obj.id.length > 0
      ? obj.id
      : crypto.randomUUID()

  const createdAt =
    typeof obj.createdAt === "number" && obj.createdAt > 0
      ? obj.createdAt
      : Date.now()

  const item: Item = {
    id,
    type: obj.type as ItemType,
    content: obj.content,
    source: source
      ? {
          title: typeof source.title === "string" ? source.title : "",
          url: source.url as string,
          site: typeof source.site === "string" ? source.site : undefined
        }
      : undefined,
    createdAt,
    context:
      obj.context && typeof obj.context === "object"
        ? (obj.context as Item["context"])
        : undefined,
    projectId:
      typeof obj.projectId === "string" && obj.projectId.length > 0
        ? obj.projectId
        : undefined
  }

  if (typeof obj.hash === "string" && obj.hash.length === 64) {
    item.hash = obj.hash
  }

  if (typeof obj.title === "string" && obj.title.length > 0) {
    item.title = obj.title
  }

  if (typeof obj.read === "boolean") {
    item.read = obj.read
  }

  if (typeof obj.order === "number") {
    item.order = obj.order
  }

  if (typeof obj.updatedAt === "number" && obj.updatedAt > 0) {
    item.updatedAt = obj.updatedAt
  }

  if (
    Array.isArray(obj.images) &&
    obj.images.every((v) => typeof v === "string" && v.length > 0)
  ) {
    item.images = obj.images as string[]
  }

  if (typeof obj.sectionId === "string" && obj.sectionId.length > 0) {
    item.sectionId = obj.sectionId
  }

  if (
    typeof obj.dueDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(obj.dueDate)
  ) {
    item.dueDate = obj.dueDate
  }

  return { item }
}

function validateReview(raw: unknown): ReviewEntry | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.itemId !== "string" || obj.itemId.length === 0) return null
  const srs = obj.srs as Record<string, unknown> | undefined
  if (!srs || typeof srs !== "object") return null
  return {
    id:
      typeof obj.id === "string" && obj.id.length > 0
        ? obj.id
        : crypto.randomUUID(),
    itemId: obj.itemId,
    projectId: typeof obj.projectId === "string" ? obj.projectId : "",
    status: obj.status === "mastered" ? "mastered" : "active",
    dueDate: typeof obj.dueDate === "number" ? obj.dueDate : Date.now(),
    addedAt: typeof obj.addedAt === "number" ? obj.addedAt : Date.now(),
    srs: {
      dueDate: typeof srs.dueDate === "number" ? srs.dueDate : Date.now(),
      interval: typeof srs.interval === "number" ? srs.interval : 0,
      easeFactor:
        typeof srs.easeFactor === "number" ? srs.easeFactor : 2.5,
      reviewCount: typeof srs.reviewCount === "number" ? srs.reviewCount : 0,
      lastReviewDate:
        typeof srs.lastReviewDate === "number" ? srs.lastReviewDate : 0,
      reviewHistory: Array.isArray(srs.reviewHistory)
        ? (srs.reviewHistory as ReviewEntry["srs"]["reviewHistory"])
        : undefined
    }
  }
}

function validateProject(raw: unknown): Project | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.name !== "string" || obj.name.length === 0) return null
  const project: Project = {
    id:
      typeof obj.id === "string" && obj.id.length > 0
        ? obj.id
        : crypto.randomUUID(),
    name: obj.name,
    createdAt:
      typeof obj.createdAt === "number" && obj.createdAt > 0
        ? obj.createdAt
        : Date.now(),
    note: typeof obj.note === "string" ? obj.note : undefined
  }
  if (typeof obj.lastOpened === "number" && obj.lastOpened > 0) {
    project.lastOpened = obj.lastOpened
  }
  if (Array.isArray(obj.sections) && obj.sections.length > 0) {
    const sections: Section[] = []
    for (const s of obj.sections) {
      if (!s || typeof s !== "object") continue
      const so = s as Record<string, unknown>
      if (
        typeof so.id === "string" &&
        typeof so.title === "string" &&
        (so.level === 1 || so.level === 2) &&
        typeof so.order === "number"
      ) {
        sections.push({
          id: so.id,
          parentId: typeof so.parentId === "string" ? so.parentId : null,
          title: so.title,
          order: so.order,
          level: so.level
        })
      }
    }
    if (sections.length > 0) project.sections = sections
  }
  return project
}

export async function importFromZip(
  file: File,
  projectIds?: string[]
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] }

  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    return {
      ...result,
      errors: [{ index: -1, reason: "无法解压 ZIP 文件，文件可能已损坏" }]
    }
  }

  const jsonFile = zip.file("export.json")
  if (!jsonFile) {
    return {
      ...result,
      errors: [{ index: -1, reason: "ZIP 中未找到 export.json" }]
    }
  }

  let rawJson: string
  try {
    rawJson = await jsonFile.async("string")
  } catch {
    return {
      ...result,
      errors: [{ index: -1, reason: "读取 export.json 失败" }]
    }
  }

  let rawArray: unknown[]
  let importedProjects: Project[] = []
  let importedReviews: ReviewEntry[] = []
  try {
    const parsed = JSON.parse(rawJson)
    if (Array.isArray(parsed)) {
      // legacy format: plain items array
      rawArray = parsed
    } else if (typeof parsed === "object" && parsed !== null) {
      const obj = parsed as Record<string, unknown>
      if (Array.isArray(obj.items)) {
        rawArray = obj.items
      } else {
        return {
          ...result,
          errors: [{ index: -1, reason: "export.json 缺少 items 数组" }]
        }
      }
      if (Array.isArray(obj.projects)) {
        importedProjects = obj.projects
          .map(validateProject)
          .filter((p): p is Project => p !== null)
      }
      if (Array.isArray(obj.reviews)) {
        for (const rv of obj.reviews) {
          const review = validateReview(rv)
          if (review) importedReviews.push(review)
        }
      }
    } else {
      return {
        ...result,
        errors: [{ index: -1, reason: "export.json 格式无效" }]
      }
    }
  } catch {
    return {
      ...result,
      errors: [{ index: -1, reason: "export.json JSON 解析失败" }]
    }
  }

  // ---- project id remapping ----
  const projectIdMap = new Map<string, string>()
  for (const p of importedProjects) {
    if (projectIds && !projectIds.includes(p.id)) continue
    const existing = await getProjectByName(p.name)
    if (existing) {
      // reuse existing project id
      projectIdMap.set(p.id, existing.id)
    } else {
      // create new project (use original id or generate a new one)
      const newId = p.id || crypto.randomUUID()
      const project: Project = { ...p, id: newId }
      await addProject(project)
      projectIdMap.set(p.id, newId)
    }
  }

  const validItems: Item[] = []

  for (let i = 0; i < rawArray.length; i++) {
    const r = validateItem(rawArray[i], i)
    if ("error" in r) {
      result.errors.push({ index: i, reason: r.error })
      result.skipped++
    } else {
      const item = r.item
      // remap projectId
      if (item.projectId && projectIdMap.has(item.projectId)) {
        item.projectId = projectIdMap.get(item.projectId)!
      } else if (
        item.projectId &&
        importedProjects.some((p) => p.id === item.projectId)
      ) {
        // project was in the export but mapping failed -> set to undefined
        item.projectId = undefined
      }
      validItems.push(item)
    }
  }

  for (const item of validItems) {
    if (projectIds && !item.projectId) {
      result.skipped++
      continue
    }
    try {
      if (await addItem(item, item.type === "todo" ? { skipDedup: true } : undefined)) {
        result.imported++
      } else {
        result.skipped++
      }
    } catch {
      result.skipped++
    }
  }

  // ---- reviews import ----
  if (importedReviews.length > 0) {
    const validItemIds = new Set(
      (await searchItems({})).map((i) => i.id)
    )
    const existingReviewItemIds = new Set(
      (await getAllReviews()).map((r) => r.itemId)
    )
    for (const rv of importedReviews) {
      // Scope to the selected projects when a filter is active.
      if (projectIds && !projectIds.includes(rv.projectId)) continue
      if (projectIdMap.has(rv.projectId)) {
        rv.projectId = projectIdMap.get(rv.projectId)!
      }
      // Drop orphans (item not present) and duplicates (review already exists
      // for the item — itemId has a unique index).
      if (!validItemIds.has(rv.itemId)) continue
      if (existingReviewItemIds.has(rv.itemId)) continue
      try {
        await addReview(rv)
        existingReviewItemIds.add(rv.itemId)
      } catch {
        result.errors.push({ index: -1, reason: "复习条目导入失败" })
      }
    }
  }

  return result
}
