export type ItemType = "text" | "image" | "link" | "todo"

export interface Section {
  id: string
  parentId: string | null
  title: string
  order: number
  level: 1 | 2
}

export interface SourceMeta {
  title: string
  url: string
  site?: string
}

export interface SrsData {
  dueDate: number
  interval: number
  easeFactor: number
  reviewCount: number
  lastReviewDate: number
  reviewHistory?: { date: number; rating: 1 | 2 | 3 | 4 }[]
}

export interface Item {
  id: string
  type: ItemType
  /** User's title/summary — the card's core identifier */
  title?: string
  content: string
  context?: {
    paragraph?: string
  }
  source?: SourceMeta
  createdAt: number
  projectId?: string
  sectionId?: string
  /** Mark as read/unread for link type */
  read?: boolean
  hash?: string
  /** Derived field for indexing */
  sourceSite?: string
  /** Manual ordering within a project (lower = earlier) */
  order?: number
  /** Last modification timestamp (for incremental sync) */
  updatedAt?: number
  /** Optional attached image URLs (mixed cards: text + images) */
  images?: string[]
  /** Todo due date as local "YYYY-MM-DD" (day-based expiry) */
  dueDate?: string
  /** Link back to a local PDF annotation (card belongs to the PDF, not a project) */
  pdfRef?: {
    pdfId: string
    page: number
    annotationId: string
  }
  /** Denormalized pdfRef.pdfId for the IndexedDB index (deep paths aren't indexable). */
  pdfRefPdfId?: string
}

export type PdfMark = "highlight" | "underline" | "wavy" | "strike" | "frame"

export interface PdfFile {
  id: string
  name: string
  /** The original PDF bytes (self-contained — reopening doesn't need the file path) */
  bytes: Blob
  pageCount: number
  addedAt: number
}

export interface PdfAnnotation {
  id: string
  pdfId: string
  /** 1-based page number */
  page: number
  /** text = text-selection mark (linked card is a text card); region = framed box (image card) */
  kind: "text" | "region"
  type: PdfMark
  /** text annotations: char offsets into the page's concatenated textContent */
  startOffset?: number
  endOffset?: number
  text?: string
  /** region annotations: rects in the page's CSS px at 100% zoom */
  rects?: { x: number; y: number; w: number; h: number }[]
  color?: string
  /** Linked card id (annotation ↔ card are 1:1) */
  itemId?: string
  createdAt: number
}

export interface SearchQuery {
  keyword?: string
  site?: string
  type?: ItemType
  from?: number
  to?: number
  projectId?: string
}

export type ReviewStatus = "active" | "mastered"

export interface ReviewEntry {
  id: string
  itemId: string
  projectId: string
  srs: SrsData
  status: ReviewStatus
  /** Denormalized from srs.dueDate for IndexedDB indexing */
  dueDate: number
  addedAt: number
}

export interface Project {
  id: string
  name: string
  createdAt: number
  note?: string
  lastOpened?: number
  sections?: Section[]
}

export type PresetName = "classic" | "indigo-crimson" | "forest" | "terracotta"

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
  classic: "经典蓝灰",
  "indigo-crimson": "靛蓝胭红",
  forest: "墨绿森林",
  terracotta: "赤陶暖调"
}
