import JSZip from "jszip"
import { z } from "zod"

import {
  addAnnotation,
  addPdf,
  addPdfCard,
  addVocabularyCard,
  addProject,
  addProjectCard,
  addReadLater,
  addReview,
  addTodo,
  getAllAnnotations,
  getAllProjectCards,
  getAllReviews,
  getAllTodos,
  getProjectByName
} from "../database"
import {
  pdfAnnotationSchema,
  pdfCardSchema,
  pdfVocabularyCardSchema,
  projectCardSchema,
  projectSchema,
  readLaterSchema,
  reviewEntrySchema,
  todoCardSchema
} from "../types/schemas"
import type {
  PdfAnnotation,
  PdfCard,
  PdfMark,
  PdfVocabularyCard,
  Project,
  ProjectCard,
  ReadLater,
  ReviewEntry,
  Section,
  TodoCard
} from "../types"
import { splitLegacyItem, type LegacyItem } from "../utils/cards"

export interface ImportResult {
  imported: number
  skipped: number
  errors: { index: number; reason: string }[]
}

const VALID_TYPES = ["text", "image", "placed", "todo"] as const
const VALID_CARD_TYPES = ["text", "image", "placed"] as const
const VALID_MARKS: PdfMark[] = [
  "highlight",
  "underline",
  "wavy",
  "strike",
  "frame",
  "free-highlight",
  "freehand",
  "freetext"
]

/** A legacy monolithic card (the old `items` array). Validated loosely — the
 *  pdfRef shape is guarded so splitLegacyItem can't crash on malformed input. */
function validateLegacyItem(
  raw: unknown
): { item: LegacyItem } | { error: string } {
  if (!raw || typeof raw !== "object") {
    return { error: "条目不是有效对象" }
  }

  const obj = raw as Record<string, unknown>

  if (!VALID_TYPES.includes(obj.type as (typeof VALID_TYPES)[number])) {
    return { error: `无效的 type: "${obj.type}"` }
  }

  if (typeof obj.content !== "string" || obj.content.length === 0) {
    return { error: "content 缺失或为空" }
  }

  const source: Record<string, unknown> | undefined =
    obj.source && typeof obj.source === "object"
      ? (obj.source as Record<string, unknown>)
      : undefined

  // Spread the raw record first so NEW fields survive without a parallel
  // import patch; only the critical + known fields are validated below.
  const item: LegacyItem = { ...(raw as LegacyItem) }
  item.id =
    typeof obj.id === "string" && obj.id.length > 0
      ? obj.id
      : crypto.randomUUID()
  item.type = obj.type as LegacyItem["type"]
  item.content = obj.content
  item.createdAt =
    typeof obj.createdAt === "number" && obj.createdAt > 0
      ? obj.createdAt
      : Date.now()
  item.source = source
    ? {
        title: typeof source.title === "string" ? source.title : "",
        url: typeof source.url === "string" ? source.url : "",
        site: typeof source.site === "string" ? source.site : undefined
      }
    : undefined
  item.projectId =
    typeof obj.projectId === "string" && obj.projectId.length > 0
      ? obj.projectId
      : undefined
  item.hash =
    typeof obj.hash === "string" && obj.hash.length === 64
      ? obj.hash
      : undefined
  item.title =
    typeof obj.title === "string" && obj.title.length > 0
      ? obj.title
      : undefined
  item.order = typeof obj.order === "number" ? obj.order : undefined
  item.updatedAt =
    typeof obj.updatedAt === "number" && obj.updatedAt > 0
      ? obj.updatedAt
      : undefined
  item.images =
    Array.isArray(obj.images) &&
    obj.images.every((v) => typeof v === "string" && v.length > 0)
      ? (obj.images as string[])
      : undefined
  item.sectionId =
    typeof obj.sectionId === "string" && obj.sectionId.length > 0
      ? obj.sectionId
      : undefined
  item.dueDate =
    typeof obj.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(obj.dueDate)
      ? obj.dueDate
      : undefined
  // Guard the pdfRef shape (annotations page/annotationId are required for the
  // split; anything malformed degrades to a plain card instead of crashing).
  const pdfRef =
    obj.pdfRef && typeof obj.pdfRef === "object"
      ? (obj.pdfRef as Record<string, unknown>)
      : undefined
  if (
    pdfRef &&
    typeof pdfRef.pdfId === "string" &&
    typeof pdfRef.page === "number" &&
    typeof pdfRef.annotationId === "string"
  ) {
    item.pdfRef = {
      pdfId: pdfRef.pdfId,
      page: pdfRef.page,
      annotationId: pdfRef.annotationId
    }
  } else {
    item.pdfRef = undefined
  }

  return { item }
}

/** --------------------------------------------------------------------------
 *  Deserializer. SHAPE validation is owned by the single-source Zod schemas
 *  (src/types/schemas.ts — the same schemas that derive the TS types), so a
 *  data-model change updates the type AND this validator together. This file
 *  keeps only the IMPORT semantics a schema shouldn't own: scalar defaults,
 *  legacy field mapping, null→absence normalization, and preservation of
 *  forward-compatible unknown fields.
 *  ------------------------------------------------------------------------ */

/** zod parses strip unknown keys — restore them (only keys NOT in the schema's
 *  known shape) so forward-compatible fields survive export→import round-trips. */
function restoreUnknown<T extends object>(
  raw: unknown,
  validated: T,
  knownKeys: string[]
): T {
  const out: Record<string, unknown> = {
    ...(validated as Record<string, unknown>)
  }
  if (!raw || typeof raw !== "object") return validated
  for (const k of Object.keys(raw as Record<string, unknown>)) {
    if (!knownKeys.includes(k) && !(k in out)) {
      out[k] = (raw as Record<string, unknown>)[k]
    }
  }
  return out as T
}

/** Legacy exports sometimes stored optional fields as null; the schemas accept
 *  absence but not null, so drop nulls on the listed (optional) fields. */
function dropNulls(
  obj: Record<string, unknown>,
  optionalKeys: string[]
): Record<string, unknown> {
  const out = { ...obj }
  for (const k of optionalKeys) if (out[k] === null) delete out[k]
  return out
}

function defaultStr(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined
}

function defaultNum(v: unknown): number | undefined {
  return typeof v === "number" && v > 0 ? v : undefined
}

function firstIssue(err: z.ZodError): string {
  const issue = err.issues[0]
  return `无效的字段 "${issue.path.join(".") || "(根)"}": ${issue.message}`
}

function validateProjectCard(
  raw: unknown
): { card: ProjectCard } | { error: string } {
  if (!raw || typeof raw !== "object") {
    return { error: "卡片不是有效对象" }
  }

  const obj = raw as Record<string, unknown>

  if (
    !VALID_CARD_TYPES.includes(obj.type as (typeof VALID_CARD_TYPES)[number])
  ) {
    return { error: `无效的 type: "${obj.type}"` }
  }
  // content may be "" — a placed card (placement) carries no body by design.
  if (typeof obj.content !== "string") {
    return { error: "content 缺失或非字符串" }
  }

  const parsed = projectCardSchema.safeParse(
    dropNulls(
      {
        ...obj,
        // Lenient source normalization (legacy): title/url default to "".
        source: (() => {
          const s = obj.source as Record<string, unknown> | null | undefined
          if (!s || typeof s !== "object") return undefined
          return {
            title: typeof s.title === "string" ? s.title : "",
            url: typeof s.url === "string" ? s.url : "",
            site: typeof s.site === "string" ? s.site : undefined
          }
        })(),
        id: defaultStr(obj.id) ?? crypto.randomUUID(),
        createdAt: defaultNum(obj.createdAt) ?? Date.now(),
        projectId: typeof obj.projectId === "string" ? obj.projectId : ""
      },
      [
        "source",
        "hash",
        "title",
        "order",
        "updatedAt",
        "images",
        "sectionId",
        "sourceSite",
        "pdfCardId",
        "pdfVocabularyCardId",
        "comment",
        "image",
        "isDraft",
        "draftOf"
      ]
    )
  )
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  return {
    card: restoreUnknown(raw, parsed.data, Object.keys(projectCardSchema.shape))
  }
}

function validatePdfCard(raw: unknown): { card: PdfCard } | { error: string } {
  if (!raw || typeof raw !== "object") {
    return { error: "PDF 卡片不是有效对象" }
  }

  const obj = raw as Record<string, unknown>

  // Legacy read-compat: cards no longer carry content; strip it on import so
  // old backups don't reintroduce the storage/display bloat.
  const normalized: Record<string, unknown> = { ...obj }
  delete normalized.content
  if (
    normalized.comment === undefined &&
    typeof obj.idea === "string" &&
    obj.idea.length > 0
  ) {
    normalized.comment = obj.idea
  }
  delete normalized.idea
  normalized.id = defaultStr(obj.id) ?? crypto.randomUUID()
  normalized.createdAt = defaultNum(obj.createdAt) ?? Date.now()
  if (typeof obj.pdfOrder !== "number") {
    normalized.pdfOrder = (typeof obj.page === "number" ? obj.page : 0) * 1e6
  }

  const parsed = pdfCardSchema.safeParse(
    dropNulls(normalized, [
      "comment",
      "content",
      "projectCardId",
      "kind",
      "type",
      "annotationId",
      "page",
      "pdfId"
    ])
  )
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  return {
    card: restoreUnknown(raw, parsed.data, Object.keys(pdfCardSchema.shape))
  }
}

function validateTodoCard(
  raw: unknown
): { card: TodoCard } | { error: string } {
  if (!raw || typeof raw !== "object") {
    return { error: "待办不是有效对象" }
  }

  const obj = raw as Record<string, unknown>

  if (typeof obj.content !== "string" || obj.content.length === 0) {
    return { error: "content 缺失或为空" }
  }

  const parsed = todoCardSchema.safeParse(
    dropNulls(
      {
        ...obj,
        id: defaultStr(obj.id) ?? crypto.randomUUID(),
        createdAt: defaultNum(obj.createdAt) ?? Date.now()
      },
      ["title", "dueDate", "updatedAt"]
    )
  )
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  return {
    card: restoreUnknown(raw, parsed.data, Object.keys(todoCardSchema.shape))
  }
}

function validateReadLater(raw: unknown): ReadLater | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.title !== "string" || obj.title.length === 0) return null

  const parsed = readLaterSchema.safeParse(
    dropNulls(
      {
        ...obj,
        id: defaultStr(obj.id) ?? crypto.randomUUID(),
        title: obj.title,
        status: obj.status === "reading" || obj.status === "done" ? obj.status : "unread",
        addedAt: defaultNum(obj.addedAt) ?? Date.now()
      },
      ["url", "pdfId", "excerpt", "notes", "updatedAt", "status"]
    )
  )
  if (!parsed.success) return null
  return restoreUnknown(raw, parsed.data, Object.keys(readLaterSchema.shape))
}

function validateReview(raw: unknown): ReviewEntry | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.itemId !== "string" || obj.itemId.length === 0) return null
  const srs = obj.srs as Record<string, unknown> | undefined
  if (!srs || typeof srs !== "object") return null

  const parsed = reviewEntrySchema.safeParse(
    dropNulls(
      {
        ...obj,
        id: defaultStr(obj.id) ?? crypto.randomUUID(),
        projectId: typeof obj.projectId === "string" ? obj.projectId : "",
        status: obj.status === "mastered" ? "mastered" : "active",
        dueDate: defaultNum(obj.dueDate) ?? Date.now(),
        addedAt: defaultNum(obj.addedAt) ?? Date.now(),
        srs: {
          ...srs,
          dueDate: defaultNum(srs.dueDate) ?? Date.now(),
          interval: typeof srs.interval === "number" ? srs.interval : 0,
          easeFactor: typeof srs.easeFactor === "number" ? srs.easeFactor : 2.5,
          reviewCount: typeof srs.reviewCount === "number" ? srs.reviewCount : 0,
          lastReviewDate:
            typeof srs.lastReviewDate === "number" ? srs.lastReviewDate : 0
        }
      },
      ["srs"]
    )
  )
  if (!parsed.success) return null
  return restoreUnknown(raw, parsed.data, Object.keys(reviewEntrySchema.shape))
}

function validatePdfAnnotation(raw: unknown): PdfAnnotation | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.pdfId !== "string" || typeof obj.page !== "number") return null

  const parsed = pdfAnnotationSchema.safeParse(
    dropNulls(
      {
        ...obj,
        id: defaultStr(obj.id) ?? crypto.randomUUID(),
        createdAt: defaultNum(obj.createdAt) ?? Date.now(),
        kind: obj.kind === "region" ? "region" : "text",
        type: VALID_MARKS.includes(obj.type as PdfMark)
          ? (obj.type as PdfMark)
          : "highlight"
      },
      [
        "cardId",
        "image",
        "text",
        "rects",
        "path",
        "paths",
        "color",
        "pos",
        "store",
        "startOffset",
        "endOffset",
        "updatedAt",
        "kind",
        "type"
      ]
    )
  )
  if (!parsed.success) return null
  return restoreUnknown(
    raw,
    parsed.data,
    Object.keys(pdfAnnotationSchema.shape)
  )
}

function validateProject(raw: unknown): Project | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.name !== "string" || obj.name.length === 0) return null

  // Sections without a parentId are treated as top-level (null) for compat.
  const sections: unknown = Array.isArray(obj.sections)
    ? obj.sections.map((s) => {
        const so = s as Record<string, unknown> | null
        return so && typeof so === "object" && so.parentId === undefined
          ? { ...so, parentId: null }
          : s
      })
    : obj.sections

  const parsed = projectSchema.safeParse(
    dropNulls(
      {
        ...obj,
        sections,
        id: defaultStr(obj.id) ?? crypto.randomUUID(),
        createdAt: defaultNum(obj.createdAt) ?? Date.now()
      },
      ["note", "lastOpened", "sections"]
    )
  )
  if (!parsed.success) return null
  return restoreUnknown(raw, parsed.data, Object.keys(projectSchema.shape))
}

interface ParsedExport {
  /** The plain legacy `items` array (v4 and older / very old bare arrays). */
  legacyItems: unknown[]
  /** The v5 three-store arrays. */
  projectCardsRaw: unknown[]
  pdfCardsRaw: unknown[]
  todosRaw: unknown[]
  importedProjects: Project[]
  importedReviews: ReviewEntry[]
  importedAnnotations: PdfAnnotation[]
  importedReadLater: ReadLater[]
  importedVocabularyCards: PdfVocabularyCard[]
  importedPdfMeta: {
    id: string
    name: string
    pageCount: number
    addedAt: number
    lastOpened?: number
    lastPage?: number
    aiContext?: string
    topic?: string
  }[]
}

export function parseExport(rawJson: string): ParsedExport | { error: string } {
  const parsed = JSON.parse(rawJson)
  if (Array.isArray(parsed)) {
    // very old legacy format: plain items array
    return {
      legacyItems: parsed,
      projectCardsRaw: [],
      pdfCardsRaw: [],
      todosRaw: [],
      importedProjects: [],
      importedReviews: [],
      importedAnnotations: [],
      importedReadLater: [],
      importedVocabularyCards: [],
      importedPdfMeta: []
    }
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { error: "export.json 格式无效" }
  }
  const obj = parsed as Record<string, unknown>
  // R2: a v6 sync payload carries image/PDF *references* that need the sync
  // flow's online hydration — importing it as a v5 ZIP silently drops them.
  if (obj.version === 6 || typeof obj.contentHash === "string") {
    return {
      error:
        "这是同步格式的备份（图片与 PDF 需在线下载）。请用「备份与同步」的下载功能恢复，而不是导入此文件。"
    }
  }
  const isV5 =
    Array.isArray(obj.projectCards) ||
    Array.isArray(obj.pdfCards) ||
    Array.isArray(obj.todos)
  if (!isV5 && !Array.isArray(obj.items)) {
    return { error: "export.json 缺少 items 或 projectCards 数组" }
  }
  const importedProjects: Project[] = Array.isArray(obj.projects)
    ? obj.projects.map(validateProject).filter((p): p is Project => p !== null)
    : []
  const importedReviews: ReviewEntry[] = []
  if (Array.isArray(obj.reviews)) {
    for (const rv of obj.reviews) {
      const review = validateReview(rv)
      if (review) importedReviews.push(review)
    }
  }
  const importedAnnotations: PdfAnnotation[] = []
  if (Array.isArray(obj.pdfAnnotations)) {
    for (const ra of obj.pdfAnnotations) {
      const ann = validatePdfAnnotation(ra)
      if (ann) importedAnnotations.push(ann)
    }
  }
  const importedReadLater: ReadLater[] = []
  if (Array.isArray(obj.readLater)) {
    for (const rl of obj.readLater) {
      const item = validateReadLater(rl)
      if (item) importedReadLater.push(item)
    }
  }
  const importedVocabularyCards: PdfVocabularyCard[] = Array.isArray(
    obj.pdfVocabularyCards
  )
    ? obj.pdfVocabularyCards
        .map((raw) => pdfVocabularyCardSchema.safeParse(raw))
        .filter((result) => result.success)
        .map((result) => result.data)
    : []
  const importedPdfMeta =
    (obj.pdfs as {
      id: string
      name: string
      pageCount: number
      addedAt: number
      lastOpened?: number
      lastPage?: number
      aiContext?: string
      topic?: string
    }[]) ?? []
  return {
    legacyItems: isV5 ? [] : (obj.items as unknown[]),
    projectCardsRaw: Array.isArray(obj.projectCards)
      ? (obj.projectCards as unknown[])
      : [],
    pdfCardsRaw: Array.isArray(obj.pdfCards) ? (obj.pdfCards as unknown[]) : [],
    todosRaw: Array.isArray(obj.todos) ? (obj.todos as unknown[]) : [],
    importedProjects,
    importedReviews,
    importedAnnotations,
    importedReadLater,
    importedVocabularyCards,
    importedPdfMeta
  }
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

  let parsed: ParsedExport
  try {
    const p = parseExport(rawJson)
    if ("error" in p) {
      return { ...result, errors: [{ index: -1, reason: p.error }] }
    }
    parsed = p
  } catch {
    return {
      ...result,
      errors: [{ index: -1, reason: "export.json JSON 解析失败" }]
    }
  }

  const {
    legacyItems,
    projectCardsRaw,
    pdfCardsRaw,
    todosRaw,
    importedProjects,
    importedReviews,
    importedAnnotations,
    importedReadLater,
    importedVocabularyCards,
    importedPdfMeta
  } = parsed

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

  // ---- collect + validate the three-store records ----
  const validProjectCards: ProjectCard[] = []
  const validPdfCards: PdfCard[] = []
  const validTodos: TodoCard[] = []
  // Legacy: placed items split into pdfCard (old id) + placement (new uuid) —
  // reviews that referenced the old id must remap onto the placement.
  const reviewRemap = new Map<string, string>()
  const annTypeById = new Map<string, PdfMark>()
  for (const ann of importedAnnotations) {
    annTypeById.set(ann.id, ann.type)
  }

  if (legacyItems.length > 0) {
    for (let i = 0; i < legacyItems.length; i++) {
      const r = validateLegacyItem(legacyItems[i])
      if ("error" in r) {
        result.errors.push({ index: i, reason: r.error })
        result.skipped++
        continue
      }
      const split = splitLegacyItem(
        r.item,
        r.item.pdfRef ? annTypeById.get(r.item.pdfRef.annotationId) : undefined
      )
      if (split.todo) {
        validTodos.push(split.todo)
      } else if (split.pdfCard) {
        validPdfCards.push(split.pdfCard)
        if (split.placement) {
          validProjectCards.push(split.placement)
          reviewRemap.set(split.pdfCard.id, split.placement.id)
        }
      } else if (split.projectCard) {
        validProjectCards.push(split.projectCard)
      }
    }
  } else {
    for (const raw of projectCardsRaw) {
      const r = validateProjectCard(raw)
      if ("error" in r) {
        result.errors.push({ index: -1, reason: r.error })
        result.skipped++
        continue
      }
      validProjectCards.push(r.card)
    }
    for (const raw of pdfCardsRaw) {
      const r = validatePdfCard(raw)
      if ("error" in r) {
        result.errors.push({ index: -1, reason: r.error })
        result.skipped++
        continue
      }
      validPdfCards.push(r.card)
    }
    for (const raw of todosRaw) {
      const r = validateTodoCard(raw)
      if ("error" in r) {
        result.errors.push({ index: -1, reason: r.error })
        result.skipped++
        continue
      }
      validTodos.push(r.card)
    }
  }

  // ---- projectId remap on projectCards (placements included) ----
  for (const card of validProjectCards) {
    if (card.projectId && projectIdMap.has(card.projectId)) {
      card.projectId = projectIdMap.get(card.projectId)!
    } else if (card.projectId) {
      // The project is not part of this import (a PDF-scope backup carries no
      // projects, or the project was filtered out). A placement can't exist
      // without its project — it is dropped below (its pdfCard stays as a
      // PDF-only card). A plain card keeps an empty membership so it never
      // points at a nonexistent project.
      card.projectId = ""
    }
  }

  // ---- PDFs import FIRST: the exported pdf id may be a legacy uuid; addPdf
  // recomputes the content-hash id, so we remap cards/annotations onto it. ----
  const pdfIdSet = new Set<string>()
  const pdfIdMap = new Map<string, string>()
  const pdfMetaByName = new Map<
    string,
    {
      id: string
      name: string
      pageCount: number
      addedAt: number
      lastOpened?: number
      lastPage?: number
      aiContext?: string
      topic?: string
    }
  >()
  for (const meta of importedPdfMeta) pdfMetaByName.set(meta.id, meta)
  for (const zipPath of Object.keys(zip.files)) {
    if (!zipPath.startsWith("pdfs/") || !zipPath.endsWith(".pdf")) continue
    const id = zipPath.slice("pdfs/".length, -".pdf".length)
    try {
      const bytes = await zip.files[zipPath].async("blob")
      const meta = pdfMetaByName.get(id)
      const actualId = await addPdf({
        id,
        name: meta?.name ?? "",
        bytes,
        pageCount: meta?.pageCount ?? 0,
        addedAt: meta?.addedAt ?? Date.now(),
        lastOpened: meta?.lastOpened,
        lastPage: meta?.lastPage,
        aiContext: meta?.aiContext,
        topic: meta?.topic
      })
      pdfIdSet.add(actualId)
      if (actualId !== id) pdfIdMap.set(id, actualId)
    } catch {
      result.errors.push({ index: -1, reason: "PDF 文件导入失败" })
    }
  }

  // ---- decide which placements survive (their project + content source must exist) ----
  const pdfCardById = new Map(validPdfCards.map((c) => [c.id, c]))
  const vocabularyCardById = new Map(
    importedVocabularyCards.map((card) => [card.id, card])
  )
  const payloadAnnIds = new Set(importedAnnotations.map((a) => a.id))
  const insertablePlacementIds = new Set<string>()
  const cardsToInsert: ProjectCard[] = []
  for (const card of validProjectCards) {
    // Filtered imports only restore cards of the selected projects.
    if (projectIds && !card.projectId) {
      result.skipped++
      continue
    }
    if (!card.projectId && (card.pdfCardId || card.pdfVocabularyCardId)) {
      // A placement without a project is dead weight — its quote lives in the
      // pdfCard, which imports as a PDF-only card.
      result.skipped++
      continue
    }
    if (card.pdfCardId) {
      // A placement is only restorable when its linked pdfCard is in this
      // payload AND that pdfCard's annotation (the actual quote/crop) resolves
      // — otherwise the restored card would render empty forever (A8, e.g.
      // projects-scope backups exported before the annotations were carried).
      const linked = pdfCardById.get(card.pdfCardId)
      const annotationResolves =
        linked?.annotationId && payloadAnnIds.has(linked.annotationId)
      if (!linked || !annotationResolves) {
        result.skipped++
        continue
      }
    }
    if (card.pdfVocabularyCardId) {
      // Both sides of the aggregate↔placement link must agree. Importing only
      // one side would leave either an empty project card or an unreachable
      // vocabulary aggregate behind.
      const linked = vocabularyCardById.get(card.pdfVocabularyCardId)
      if (!linked || linked.projectCardId !== card.id) {
        result.skipped++
        continue
      }
    }
    cardsToInsert.push(card)
    if (card.pdfCardId) insertablePlacementIds.add(card.id)
  }

  // ---- pdfId remap on pdfCards (exported pdf id → content-hash id) ----
  for (const pdfCard of validPdfCards) {
    if (pdfIdMap.has(pdfCard.pdfId)) {
      pdfCard.pdfId = pdfIdMap.get(pdfCard.pdfId)!
    }
    if (
      pdfCard.projectCardId &&
      !insertablePlacementIds.has(pdfCard.projectCardId)
    ) {
      // The placement wasn't restored — the pdfCard stays PDF-only.
      pdfCard.projectCardId = undefined
    }
  }
  for (const vocabularyCard of importedVocabularyCards) {
    if (pdfIdMap.has(vocabularyCard.pdfId)) {
      vocabularyCard.pdfId = pdfIdMap.get(vocabularyCard.pdfId)!
    }
  }

  // ---- insert todos (global, identity-unique — never gated on projects) ----
  for (const todo of validTodos) {
    try {
      await addTodo(todo)
      result.imported++
    } catch (e) {
      result.errors.push({
        index: -1,
        reason: `待办导入异常: ${(e as Error)?.message ?? e}`
      })
      result.skipped++
    }
  }

  // ---- insert pdfCards ----
  for (const pdfCard of validPdfCards) {
    try {
      await addPdfCard(pdfCard)
      result.imported++
    } catch (e) {
      result.errors.push({
        index: -1,
        reason: `PDF 卡片导入异常: ${(e as Error)?.message ?? e}`
      })
      result.skipped++
    }
  }

  // ---- insert projectCards (placements skip dedup — they're identity-unique) ----
  for (const card of cardsToInsert) {
    try {
      const ok = await addProjectCard(
        card,
        card.pdfCardId || card.pdfVocabularyCardId
          ? { skipDedup: true }
          : undefined
      )
      if (ok) {
        result.imported++
      } else {
        result.skipped++
      }
    } catch (e) {
      result.errors.push({
        index: -1,
        reason: `导入异常（${card.type}）: ${(e as Error)?.message ?? e}`
      })
      result.skipped++
    }
  }

  for (const vocabularyCard of importedVocabularyCards) {
    const placement = cardsToInsert.find(
      (card) => card.id === vocabularyCard.projectCardId
    )
    if (!placement) {
      result.skipped++
      continue
    }
    try {
      await addVocabularyCard(vocabularyCard)
      result.imported++
    } catch (error) {
      result.errors.push({
        index: -1,
        reason: `生词卡导入异常: ${(error as Error)?.message ?? error}`
      })
      result.skipped++
    }
  }

  // ---- reviews import ----
  if (importedReviews.length > 0) {
    const validIds = new Set([
      ...(await getAllProjectCards()).map((c) => c.id),
      ...(await getAllTodos()).map((t) => t.id)
    ])
    const existingReviewItemIds = new Set(
      (await getAllReviews()).map((r) => r.itemId)
    )
    for (const rv of importedReviews) {
      // Scope to the selected projects when a filter is active.
      if (projectIds && !projectIds.includes(rv.projectId)) continue
      if (projectIdMap.has(rv.projectId)) {
        rv.projectId = projectIdMap.get(rv.projectId)!
      }
      // Legacy placed-card reviews referenced the old monolithic item id —
      // remap onto the placement id.
      const mapped = reviewRemap.get(rv.itemId)
      if (mapped) rv.itemId = mapped
      // Drop orphans (card not present) and duplicates (review already exists
      // for the card — itemId has a unique index).
      if (!validIds.has(rv.itemId)) continue
      if (existingReviewItemIds.has(rv.itemId)) continue
      try {
        await addReview(rv)
        existingReviewItemIds.add(rv.itemId)
      } catch {
        result.errors.push({ index: -1, reason: "复习条目导入失败" })
      }
    }
  }

  // ---- annotations import (local-only domain) ----
  const existingAnnotationIds = new Set(
    (await getAllAnnotations()).map((a) => a.id)
  )
  // The note-layer: annotations referenced by the restored pdfCards must import
  // even when their pdf isn't in the payload (projects-scope backup restores
  // placed cards + their quote without the PDF file — F1).
  const pdfCardAnnIds = new Set(
    validPdfCards.map((c) => c.annotationId).filter(Boolean)
  )
  for (const ann of importedAnnotations) {
    const mappedId = pdfIdMap.get(ann.pdfId) ?? ann.pdfId
    // Drop orphans (pdf not imported AND no pdfCard references it) and
    // duplicates (id unique index).
    if (!pdfIdSet.has(mappedId) && !pdfCardAnnIds.has(ann.id)) continue
    if (existingAnnotationIds.has(ann.id)) continue
    ann.pdfId = mappedId
    // Legacy annotations carried itemId instead of cardId — the linked pdfCard
    // kept the old item id, so the reference is the same value.
    const legacy = ann as PdfAnnotation & { itemId?: string }
    if (!ann.cardId && legacy.itemId) ann.cardId = legacy.itemId
    delete (ann as unknown as Record<string, unknown>).itemId
    try {
      await addAnnotation(ann)
      existingAnnotationIds.add(ann.id)
      result.imported++
    } catch {
      result.errors.push({ index: -1, reason: "批注导入失败" })
    }
  }

  // ---- read-later import (global, not project-scoped) ----
  for (const rl of importedReadLater) {
    try {
      // addReadLater enforces the PDF one-card rule (a duplicate pdfId is
      // skipped, not written).
      const ok = await addReadLater(rl)
      if (ok) result.imported++
      else result.skipped++
    } catch (e) {
      result.errors.push({
        index: -1,
        reason: `稍后阅读导入异常: ${(e as Error)?.message ?? e}`
      })
      result.skipped++
    }
  }

  return result
}
