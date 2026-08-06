export type ProjectCardType = "text" | "image" | "link"

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

/** A project's card (the first-class card identity). A placed PDF card is a
 *  ProjectCard carrying `pdfCardId` (a reference to its PdfCard source — the
 *  placement model), so one record never mixes project and PDF identity. */
export interface ProjectCard {
  id: string
  type: ProjectCardType
  /** User's title/summary — the review gate (a card needs a title to review). */
  title?: string
  content: string
  source?: SourceMeta
  /** Derived from source for filtering (no index — in-memory filter). */
  sourceSite?: string
  /** Optional attached image URLs (mixed cards: text + images). */
  images?: string[]
  projectId: string
  sectionId?: string
  /** Manual ordering within a section (lower = earlier); 未分类 shares one space. */
  order?: number
  /** Dedup hash (content + source.url + images). */
  hash?: string
  /** Placement reference → the PdfCard this card was placed from (placed cards
   *  render/search via this reference; content is NOT copied). */
  pdfCardId?: string
  createdAt: number
  updatedAt?: number
}

/** A PDF annotation's excerpt card (the PDF panel's data). The annotation↔card
 *  1:1 lives here (annotationId). A placed pdfCard references its single
 *  placement (projectCardId, 1:1) for the reverse jump. */
export interface PdfCard {
  id: string
  pdfId: string
  /** 1-based page number. */
  page: number
  kind: "text" | "region"
  type: PdfMark
  annotationId: string
  /** The original quote (text) or the frame data-URL (region) — read-only. */
  content: string
  /** Personal note / 补充说明 (markdown) — the editable part, shared by both views. */
  idea?: string
  /** Position in the PDF (page-major + in-page offset/rect-y) — the panel sorts by this. */
  pdfOrder: number
  /** Placement reference → the ProjectCard placement (1:1, reverse jump). */
  projectCardId?: string
  createdAt: number
}

/** A todo (global, cross-project, identity-unique). */
export interface TodoCard {
  id: string
  title?: string
  /** The task list (markdown `- [ ]` / `- [x]`). */
  content: string
  /** Due date as local "YYYY-MM-DD" (day-based expiry). */
  dueDate?: string
  createdAt: number
  updatedAt?: number
}

export type AnyCard = ProjectCard | PdfCard | TodoCard

/** The project view's render form of a ProjectCard. For a placed card
 *  (pdfCardId) the body/idea are RESOLVED from the linked pdfCard (the
 *  placement itself carries no content) + `pdfSource` carries the PDF page for
 *  the source footer + back-jump. Write handlers must call
 *  stripPlacementContent() before persisting a DisplayCard. */
export type DisplayCard = ProjectCard & {
  idea?: string
  pdfSource?: { pdfId: string; page: number; pdfName?: string }
}

export type PdfMark = "highlight" | "underline" | "wavy" | "strike" | "frame"

export interface PdfFile {
  id: string
  name: string
  /** The PDF bytes. NULL = a synced placeholder (metadata only — the file
   *  must be opened locally to attach its notes). */
  bytes: Blob | null
  pageCount: number
  addedAt: number
  /** Last time the PDF was opened (for recent-first ordering / hub tiles). */
  lastOpened?: number
  /** Optional topic grouping (a plain string tag; PDFs with no topic are 未分类). */
  topic?: string
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
  /** region (框选) annotations: rects are NORMALIZED 0-1 fractions of the page
   *  box (scale-independent); render multiplies by the holder's displayed size */
  rects?: { x: number; y: number; w: number; h: number }[]
  color?: string
  /** Linked PdfCard id (annotation ↔ pdfCard are 1:1). */
  cardId?: string
  createdAt: number
}

export interface SearchQuery {
  keyword?: string
  site?: string
  type?: ProjectCardType
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
  classic: "青灰",
  "indigo-crimson": "紫檀",
  forest: "墨绿",
  terracotta: "暖陶"
}
