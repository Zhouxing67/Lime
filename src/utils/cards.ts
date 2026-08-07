import type { PdfCard, PdfMark, ProjectCard, TodoCard } from "../types"

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
  idea?: string
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
      idea: item.idea,
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
 *  effective body/idea come from the linked pdfCard. Non-placed cards return
 *  their own fields. */
export function resolveCardContent(
  card: ProjectCard,
  pdfById: Map<string, PdfCard>
): { content: string; idea?: string; title?: string } {
  if (!card.pdfCardId) {
    return { content: card.content, title: card.title }
  }
  const src = pdfById.get(card.pdfCardId)
  // Cards no longer carry content — the placement resolves an EMPTY body (the
  // PDF page shows the annotation); only the editable idea survives.
  return {
    content: "",
    idea: src?.idea,
    title: card.title
  }
}

/** A placed card's content must NEVER be written — the placement references the
 *  pdfCard (the pdfCard holds the quote). Strip the display copy before any
 *  write so a save can't corrupt the placement. */
export function stripPlacementContent(card: ProjectCard): ProjectCard {
  return card.pdfCardId ? { ...card, content: "" } : card
}
