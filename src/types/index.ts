export type ProjectCardType = "text" | "image" | "placed"

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
  /** 卡片类型：
   *  text   = markdown 纯文本（可内嵌图片）
   *  image  = 二进制图片（网页截图，image 字段存 dataURL）
   *  placed = 置入卡（只读批注内容——渲染时从批注解析，解析视图）
   *  草稿卡（isDraft）的 type = 目标类型（promote 后成为的 kind）。 */
  type: ProjectCardType
  /** 摘要 — 可选（全部类型）；复习门槛（无 title 不能复习）。 */
  title?: string
  /** 内容 — text 必选（markdown）；image/placed 不可选（恒空，守卫保证）。 */
  content?: string
  /** 只读原始内容 — image 必选（dataURL）；placed 为解析视图（渲染时从批注取
   *  裁剪图/PDF 原文，不落库）；text 不可选。 */
  image?: string
  /** 备注 — text 不可选；image/placed 可选（markdown）。 */
  comment?: string
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
  /** 草稿标记——中间态卡片（编辑/新建中）。undefined/false = 非草稿（兼容旧数据）。 */
  isDraft?: boolean
  /** 编辑草稿 → 原卡片 id；新建草稿无此字段。展示时草稿优先于原卡。 */
  draftOf?: string
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
  /**
   * LEGACY read-compat: the original quote (text) or frame data-URL (region)
   * was stored on the card pre-6.0. Cards no longer carry content (the PDF
   * page itself shows the annotation; the card is a compact marker + comment).
   * Existing cards keep their old value (invisible) until the one-time
   * cleanup strips it; new cards never populate it.
   */
  content?: string
  /** Personal note / 备注 (markdown) — the editable part, shared by both views. */
  comment?: string
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
}

/** A PDF outline (TOC) tree node. */
export interface PdfOutlineItem {
  title: string
  dest: unknown
  items?: PdfOutlineItem[]
}

export type PdfMark =
  | "highlight"
  | "underline"
  | "wavy" // legacy (removed from creation; kept for data-compat)
  | "strike"
  | "frame"
  | "free-highlight"
  | "freehand"
  | "freetext"

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
  /** freehand / free-highlight strokes: NORMALIZED (0-1) points of the path. */
  path?: { x: number; y: number }[]
  /** Multiple strokes (each a separate pen-up/pen-down) — the crop overlay
   *  draws every stroke, not just the first. */
  paths?: { x: number; y: number }[][]
  /** Optional region crop image (frame/free-hand/free-highlight) — generated
   *  when the annotation is placed into a project, so the placed card can show
   *  the annotated region's visual without re-rendering the PDF. */
  image?: string
  color?: string
  /** Normalized (0-1) center of the mark — enables column-aware panel sorting
   *  (two-column papers: x<0.5 = left column, then top-to-bottom by y). */
  pos?: { x: number; y: number }
  /** Serialized inklayer IAnnotationStore (Konva geometry) — the render source
   *  for the new engine; legacy offset-based annotations don't carry it. */
  store?: unknown
  /** Linked PdfCard id (annotation ↔ pdfCard are 1:1). */
  cardId?: string
  /** Last modification time (type/color/comment edits) — display date. */
  updatedAt?: number
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

export type PresetName =
  | "indigo-crimson"
  | "forest"
  | "terracotta"
  | "navy"
  | "purple"
  | "crimson"

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
  crimson: "赤红"
}
