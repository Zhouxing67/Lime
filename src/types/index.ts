/** Serialized record types are DERIVED from the Zod schemas in ./schemas (the
 *  single source of truth). Changing a data model updates the schema and both
 *  the type and the import/sync deserializers follow — never edit the record
 *  shapes here. */
import type {
  PdfCard,
  PdfMeta,
  PdfVocabularyCard,
  PdfMark,
  ProjectCard,
  ProjectCardType,
  ReadLater,
  Section,
  SrsData,
  TodoCard,
  VocabularyEntry
} from "./schemas"

export type {
  ProjectCardType,
  Section,
  SourceMeta,
  SrsData,
  ProjectCard,
  PdfMark,
  PdfCard,
  PdfMeta,
  PdfVocabularyCard,
  VocabularyEntry,
  VocabularyOccurrence,
  VocabularyTranslation,
  TodoCard,
  ReadLater,
  ReadLaterStatus,
  ReviewStatus,
  ReviewEntry,
  PdfAnnotation,
  Project
} from "./schemas"

/** The project view's render form of a ProjectCard. For a placed card
 *  (pdfCardId) the body/comment are RESOLVED from the linked pdfCard (the
 *  placement itself carries no content) + `pdfSource` carries the PDF page for
 *  the source footer + back-jump. Write handlers must call
 *  stripPlacementContent() before persisting a DisplayCard. */
export type DisplayCard = ProjectCard & {
  comment?: string
  /** The placed region annotation's crop image (from the linked annotation). */
  image?: string
  pdfSource?: {
    pdfId: string
    page: number
    pdfName?: string
    /** The linked pdfCard's mark type (for the compact placed-card marker). */
    type?: PdfMark
    kind?: "text" | "region"
  }
  vocabularySource?: {
    entryId: string
    occurrenceId: string
    rects: { x: number; y: number; w: number; h: number }[]
  }
  /** Structured vocabulary content; never encode it into the placed card's
   * readonly Markdown/text field. */
  vocabularyEntries?: VocabularyEntry[]
}

/** A PDF outline (TOC) tree node. */
export interface PdfOutlineItem {
  title: string
  dest: unknown
  items?: PdfOutlineItem[]
}

export interface PdfFile extends PdfMeta {
  /** The PDF bytes. NULL = a synced placeholder (metadata only — the file
   *  must be opened locally to attach its notes). */
  bytes: Blob | null
}

export interface SearchQuery {
  keyword?: string
  site?: string
  type?: ProjectCardType
  from?: number
  to?: number
  projectId?: string
}

export type PresetName =
  | "indigo-crimson"
  | "forest"
  | "terracotta"
  | "navy"
  | "purple"
  | "crimson"
  | "amber"

export type TodoFilter =
  | "all"
  | "incomplete"
  | "completed"
  | "overdue"
  | "today"

/** How merged cards join their content. */
export type MergeSeparator = "rule" | "ordered" | "unordered" | "none"

export interface TodoStats {
  total: number
  incomplete: number
  completed: number
  overdue: number
  today: number
}

export const PRESET_LABELS: Record<PresetName, string> = {
  "indigo-crimson": "紫檀",
  forest: "墨绿",
  terracotta: "暖陶",
  navy: "黛蓝",
  purple: "绛紫",
  crimson: "赤红",
  amber: "琥珀"
}
