import JSZip from "jszip"

import type {
  PdfAnnotation,
  PdfCard,
  PdfFile,
  Project,
  ProjectCard,
  ReviewEntry,
  TodoCard
} from "../types"

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, content] = dataUrl.split(",")
  const mime = /data:(.*?);base64/.exec(meta)?.[1] || "image/png"
  const bin = atob(content)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

export interface PdfExportMeta {
  id: string
  name: string
  pageCount: number
  addedAt: number
  lastOpened?: number
  topic?: string
}

export async function toJsonZip(
  projectCards: ProjectCard[],
  pdfCards: PdfCard[],
  todos: TodoCard[],
  projects?: Project[],
  reviews?: ReviewEntry[],
  pdfs?: PdfFile[],
  pdfAnnotations?: PdfAnnotation[]
): Promise<Blob> {
  const zip = new JSZip()

  // Image files: standalone image cards carry the data-URL in content, and a
  // region pdfCard's content IS its frame data-URL. Both are stored under
  // images/ (the JSON payload keeps the data-URL whole either way).
  for (const card of projectCards) {
    if (
      card.type === "image" &&
      typeof card.content === "string" &&
      card.content.startsWith("data:image")
    ) {
      const filename = `images/${card.hash || card.id}.png`
      zip.file(filename, dataUrlToBlob(card.content))
    }
  }
  for (const card of pdfCards) {
    if (
      card.kind === "region" &&
      typeof card.content === "string" &&
      card.content.startsWith("data:image")
    ) {
      zip.file(`images/${card.id}.png`, dataUrlToBlob(card.content))
    }
  }

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
  const json = JSON.stringify(payload, null, 2)
  zip.file("export.json", json)

  const blob = await zip.generateAsync({ type: "blob" })
  return blob
}
