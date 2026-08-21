import { z } from "zod"

/** Zod schemas are the single source of truth for the serialized record types.
 *  The TS types are derived via `z.infer` (see types/index.ts re-exports), and
 *  every import/sync deserializer validates through these schemas — so a data
 *  model change (add a field / tighten a type) updates the type AND the
 *  deserializer together, in one place. */

export const projectCardTypeSchema = z.enum(["text", "image", "placed"])
export type ProjectCardType = z.infer<typeof projectCardTypeSchema>

export const sourceMetaSchema = z.object({
  title: z.string(),
  url: z.string(),
  site: z.string().optional()
})
export type SourceMeta = z.infer<typeof sourceMetaSchema>

export const sectionSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  title: z.string(),
  order: z.number(),
  level: z.union([z.literal(1), z.literal(2)])
})
export type Section = z.infer<typeof sectionSchema>

export const srsRatingSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4)
])

export const srsDataSchema = z.object({
  dueDate: z.number(),
  interval: z.number(),
  easeFactor: z.number(),
  reviewCount: z.number(),
  lastReviewDate: z.number(),
  reviewHistory: z
    .array(z.object({ date: z.number(), rating: srsRatingSchema }))
    .optional()
})
export type SrsData = z.infer<typeof srsDataSchema>

export const webVocabularyEntrySchema = z.object({
  id: z.string(),
  term: z.string(),
  normalizedTerm: z.string(),
  translations: z.array(z.object({
    id: z.string(),
    text: z.string(),
    createdAt: z.number()
  })),
  createdAt: z.number(),
  updatedAt: z.number().optional()
})
export type WebVocabularyEntry = z.infer<typeof webVocabularyEntrySchema>

export const projectCardSchema = z.object({
  id: z.string(),
  type: projectCardTypeSchema,
  title: z.string().optional(),
  content: z.string().optional(),
  image: z.string().optional(),
  comment: z.string().optional(),
  source: sourceMetaSchema.optional(),
  sourceSite: z.string().optional(),
  images: z.array(z.string()).optional(),
  projectId: z.string(),
  sectionId: z.string().optional(),
  order: z.number().optional(),
  hash: z.string().optional(),
  pdfCardId: z.string().optional(),
  pdfVocabularyCardId: z.string().optional(),
  /** One web page = one aggregate card containing many translated terms. */
  webVocabularyEntries: z.array(webVocabularyEntrySchema).optional(),
  isDraft: z.boolean().optional(),
  draftOf: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number().optional()
})
export type ProjectCard = z.infer<typeof projectCardSchema>

export const pdfMarkSchema = z.enum([
  "highlight",
  "underline",
  "wavy",
  "strike",
  "frame",
  "free-highlight",
  "freehand",
  "freetext"
])
export type PdfMark = z.infer<typeof pdfMarkSchema>

export const pdfCardKindSchema = z.enum(["text", "region"])

export const pdfCardSchema = z.object({
  id: z.string(),
  pdfId: z.string(),
  page: z.number(),
  kind: pdfCardKindSchema,
  type: pdfMarkSchema,
  annotationId: z.string(),
  content: z.string().optional(),
  comment: z.string().optional(),
  pdfOrder: z.number(),
  projectCardId: z.string().optional(),
  createdAt: z.number()
})
export type PdfCard = z.infer<typeof pdfCardSchema>

export const todoCardSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  content: z.string(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dueDate 必须是 YYYY-MM-DD")
    .optional(),
  createdAt: z.number(),
  updatedAt: z.number().optional(),
  // todo-links: a todo may reference a PDF (pdfId) or a project card (cardId)
  // or a web URL — the linked source the todo is about.
  pdfId: z.string().optional(),
  cardId: z.string().optional(),
  url: z.string().optional()
})
export type TodoCard = z.infer<typeof todoCardSchema>

export const readLaterStatusSchema = z.enum(["unread", "reading", "done"])
export type ReadLaterStatus = z.infer<typeof readLaterStatusSchema>

export const readLaterSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().optional(),
  pdfId: z.string().optional(),
  excerpt: z.string().optional(),
  notes: z.string().optional(),
  status: readLaterStatusSchema,
  addedAt: z.number(),
  updatedAt: z.number().optional()
})
export type ReadLater = z.infer<typeof readLaterSchema>

export const vocabularyTranslationSchema = z.object({
  id: z.string(),
  text: z.string(),
  /** The PDF occurrence from which this translation was added. */
  occurrenceId: z.string().optional(),
  createdAt: z.number()
})
export type VocabularyTranslation = z.infer<typeof vocabularyTranslationSchema>

export const vocabularyOccurrenceSchema = z.object({
  id: z.string(),
  page: z.number(),
  text: z.string(),
  rects: z.array(z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number()
  })),
  startOffset: z.number().optional(),
  endOffset: z.number().optional(),
  createdAt: z.number()
})
export type VocabularyOccurrence = z.infer<typeof vocabularyOccurrenceSchema>

export const vocabularyEntrySchema = z.object({
  id: z.string(),
  term: z.string(),
  normalizedTerm: z.string(),
  translations: z.array(vocabularyTranslationSchema),
  occurrences: z.array(vocabularyOccurrenceSchema),
  createdAt: z.number(),
  updatedAt: z.number().optional()
})
export type VocabularyEntry = z.infer<typeof vocabularyEntrySchema>

export const pdfVocabularyCardSchema = z.object({
  id: z.string(),
  pdfId: z.string(),
  projectCardId: z.string(),
  entries: z.array(vocabularyEntrySchema),
  createdAt: z.number(),
  updatedAt: z.number().optional()
})
export type PdfVocabularyCard = z.infer<typeof pdfVocabularyCardSchema>

export const reviewStatusSchema = z.enum(["active", "mastered"])
export type ReviewStatus = z.infer<typeof reviewStatusSchema>

export const reviewEntrySchema = z.object({
  id: z.string(),
  itemId: z.string(),
  projectId: z.string(),
  srs: srsDataSchema,
  status: reviewStatusSchema,
  dueDate: z.number(),
  addedAt: z.number()
})
export type ReviewEntry = z.infer<typeof reviewEntrySchema>

export const pointSchema = z.object({ x: z.number(), y: z.number() })
export type Point = z.infer<typeof pointSchema>

export const rectSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
export type Rect = z.infer<typeof rectSchema>

export const pdfAnnotationSchema = z.object({
  id: z.string(),
  pdfId: z.string(),
  page: z.number(),
  kind: pdfCardKindSchema,
  type: pdfMarkSchema,
  startOffset: z.number().optional(),
  endOffset: z.number().optional(),
  text: z.string().optional(),
  rects: z.array(rectSchema).optional(),
  path: z.array(pointSchema).optional(),
  paths: z.array(z.array(pointSchema)).optional(),
  image: z.string().optional(),
  color: z.string().optional(),
  pos: pointSchema.optional(),
  store: z.unknown().optional(),
  cardId: z.string().optional(),
  updatedAt: z.number().optional(),
  createdAt: z.number()
})
export type PdfAnnotation = z.infer<typeof pdfAnnotationSchema>

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
  note: z.string().optional(),
  lastOpened: z.number().optional(),
  systemKind: z.literal("vocabulary").optional(),
  sections: z.array(sectionSchema).optional()
})
export type Project = z.infer<typeof projectSchema>

/** PDF metadata as it travels in sync payloads / backups (never the bytes). */
export const pdfMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  pageCount: z.number(),
  addedAt: z.number(),
  lastOpened: z.number().optional(),
  lastPage: z.number().int().positive().optional(),
  aiContext: z.string().max(8000).optional(),
  topic: z.string().optional()
})
export type PdfMeta = z.infer<typeof pdfMetaSchema>
