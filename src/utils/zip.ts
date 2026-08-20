import JSZip from "jszip"

import type {
  PdfAnnotation,
  PdfCard,
  PdfFile,
  PdfVocabularyCard,
  Project,
  ProjectCard,
  ReadLater,
  ReviewEntry,
  TodoCard
} from "../types"

export interface PdfExportMeta {
  id: string
  name: string
  pageCount: number
  addedAt: number
  lastOpened?: number
  lastPage?: number
  topic?: string
}

export async function toJsonZip(
  projectCards: ProjectCard[],
  pdfCards: PdfCard[],
  todos: TodoCard[],
  projects?: Project[],
  reviews?: ReviewEntry[],
  pdfs?: PdfFile[],
  pdfAnnotations?: PdfAnnotation[],
  readLater?: ReadLater[],
  pdfVocabularyCards?: PdfVocabularyCard[]
): Promise<Blob> {
  const zip = new JSZip()

  // PDF files are stored as blobs (local-only domain; not in WebDAV sync).
  // Metadata-only placeholders (synced without the file) are skipped.
  const pdfMeta: PdfExportMeta[] = []
  for (const pdf of pdfs ?? []) {
    if (!pdf.bytes) continue
    zip.file(`pdfs/${pdf.id}.pdf`, pdf.bytes)
    pdfMeta.push({
      id: pdf.id,
      name: pdf.name,
      pageCount: pdf.pageCount,
      addedAt: pdf.addedAt,
      lastOpened: pdf.lastOpened,
      lastPage: pdf.lastPage,
      topic: pdf.topic
    })
  }

  const payload: {
    version: 5
    projectCards: ProjectCard[]
    pdfCards: PdfCard[]
    todos: TodoCard[]
    projects?: Project[]
    reviews?: ReviewEntry[]
    pdfAnnotations?: PdfAnnotation[]
    pdfs?: PdfExportMeta[]
    readLater?: ReadLater[]
    pdfVocabularyCards?: PdfVocabularyCard[]
  } = {
    version: 5,
    projectCards,
    pdfCards,
    todos
  }
  if (projects && projects.length > 0) {
    // Spread projects so new fields (e.g. lastOpened) survive backups without
    // a parallel export patch.
    payload.projects = projects.map((p) => ({ ...p }))
  }
  if (reviews && reviews.length > 0) {
    payload.reviews = reviews
  }
  if (pdfAnnotations && pdfAnnotations.length > 0) {
    payload.pdfAnnotations = pdfAnnotations
  }
  if (pdfMeta.length > 0) {
    payload.pdfs = pdfMeta
  }
  if (readLater && readLater.length > 0) {
    payload.readLater = readLater
  }
  if (pdfVocabularyCards && pdfVocabularyCards.length > 0) {
    payload.pdfVocabularyCards = pdfVocabularyCards
  }
  const json = JSON.stringify(payload, null, 2)
  zip.file("export.json", json)

  const blob = await zip.generateAsync({ type: "blob" })
  return blob
}
