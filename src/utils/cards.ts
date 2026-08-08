import type { PdfAnnotation, PdfCard, PdfMark, ProjectCard, TodoCard } from "../types"

/** A legacy monolithic card (the pre-v12 Item shape) — as stored in old DBs,
 *  old ZIP exports, and old v4 sync payloads. */
export interface LegacyItem {
  id: string
  type: "text" | "image" | "link" | "todo"
  title?: string
  content: string
  context?: { paragraph?: string }
  source?: { title: string; url: string; site?: string }
  createdAt: number
  projectId?: string
  sectionId?: string
  read?: boolean
  hash?: string
  sourceSite?: string
  order?: number
  updatedAt?: number
  images?: string[]
  dueDate?: string
  pdfRef?: { pdfId: string; page: number; annotationId: string }
  pdfRefPdfId?: string
  pdfOrder?: number
  comment?: string
}

/** The pieces a legacy card splits into under the three-store model. */
export interface LegacySplit {
  todo?: TodoCard
  /** Plain project card (no pdfRef). */
  projectCard?: ProjectCard
  /** The pdfCard (pdfRef cards — both placed and pdf-only). */
  pdfCard?: PdfCard
  /** The placement record (pdfRef + projectId). */
  placement?: ProjectCard
}

/** Split a legacy monolithic card into the three-store pieces. The pdfCard
 *  KEEPS the old item id (so the annotation's cardId maps naturally); a placed
 *  card additionally gets a placement (a new uuid) with mutual references.
 *  Shared by the v12 migration, the v4→v5 sync reader, and legacy ZIP import. */
export function splitLegacyItem(
  item: LegacyItem,
  annotationType?: PdfMark
): LegacySplit {
  if (item.type === "todo") {
    return {
      todo: {
        id: item.id,
        title: item.title,
        content: item.content,
        dueDate: item.dueDate,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }
    }
  }
  if (item.pdfRef) {
    const pdfCard: PdfCard = {
      id: item.id,
      pdfId: item.pdfRef.pdfId,
      page: item.pdfRef.page,
      annotationId: item.pdfRef.annotationId,
      kind: item.type === "image" ? "region" : "text",
      type: annotationType ?? "highlight",
      content: item.content,
      comment: item.comment,
      pdfOrder: item.pdfOrder ?? item.pdfRef.page * 1e6,
      createdAt: item.createdAt
    }
    if (item.projectId) {
      const placement: ProjectCard = {
        id: crypto.randomUUID(),
        type: item.type === "image" ? "image" : "text",
        title: item.title,
        content: "",
        projectId: item.projectId,
        sectionId: item.sectionId,
        order: item.order,
        pdfCardId: pdfCard.id,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }
      pdfCard.projectCardId = placement.id
      return { pdfCard, placement }
    }
    return { pdfCard }
  }
  return {
    projectCard: {
      id: item.id,
      type: item.type === "link" ? "link" : item.type,
      title: item.title,
      content: item.content,
      source: item.source,
      sourceSite: item.sourceSite,
      images: item.images,
      projectId: item.projectId ?? "",
      sectionId: item.sectionId,
      order: item.order,
      hash: item.hash,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }
  }
}

/** Display resolution for a placed card — the placement carries NO content; the
 *  effective body/comment come from the linked pdfCard. Non-placed cards return
 *  their own fields. */
export function resolveCardContent(
  card: ProjectCard,
  pdfById: Map<string, PdfCard>
): { content: string; comment?: string; title?: string } {
  if (!card.pdfCardId) {
    return { content: card.content, title: card.title }
  }
  const src = pdfById.get(card.pdfCardId)
  // Cards no longer carry content — the placement resolves an EMPTY body (the
  // PDF page shows the annotation); only the editable comment survives.
  return {
    content: "",
    comment: src?.comment,
    title: card.title
  }
}

/** A placed card's content must NEVER be written — the placement references the
 *  pdfCard (the pdfCard holds the quote). Strip the display copy before any
 *  write so a save can't corrupt the placement. */
export function stripPlacementContent(card: ProjectCard): ProjectCard {
  return card.pdfCardId ? { ...card, content: "" } : card
}

/** Column-aware panel sort for PDF annotation cards. "single" = the legacy
 *  pdfOrder (page → page-internal y/offset). "two" = two-column papers: group
 *  by column (center x < 0.5 = left), then top-to-bottom within the column.
 *  "time" = creation/update time, earliest first. Annotations without pos
 *  (created before pos existed) degrade to the single-column order. */
export function sortPdfCards(
  cards: PdfCard[],
  annotations: PdfAnnotation[],
  mode: "single" | "two" | "time"
): PdfCard[] {
  const annById = new Map(annotations.map((a) => [a.id, a]))
  return [...cards].sort((a, b) => {
    if (mode === "time") {
      const da = annById.get(a.annotationId)
      const db = annById.get(b.annotationId)
      const ta = da?.updatedAt ?? da?.createdAt ?? 0
      const tb = db?.updatedAt ?? db?.createdAt ?? 0
      return ta - tb || a.annotationId.localeCompare(b.annotationId)
    }
    const single =
      a.pdfOrder - b.pdfOrder || a.annotationId.localeCompare(b.annotationId)
    if (mode !== "two") return single
    const an = annById.get(a.annotationId)
    const bn = annById.get(b.annotationId)
    const ca = an?.pos ? (an.pos.x < 0.5 ? 0 : 1) : 0
    const cb = bn?.pos ? (bn.pos.x < 0.5 ? 0 : 1) : 0
    const ya = an?.pos?.y ?? an?.rects?.[0]?.y ?? an?.startOffset ?? 0
    const yb = bn?.pos?.y ?? bn?.rects?.[0]?.y ?? bn?.startOffset ?? 0
    return (
      a.page - b.page ||
      ca - cb ||
      ya - yb ||
      a.annotationId.localeCompare(b.annotationId)
    )
  })
}
