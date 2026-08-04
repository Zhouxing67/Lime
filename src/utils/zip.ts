import JSZip from "jszip"

import type { Item, PdfAnnotation, PdfFile, Project, ReviewEntry } from "../types"

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, content] = dataUrl.split(",")
  const mime = /data:(.*?);base64/.exec(meta)?.[1] || "image/png"
  const bin = atob(content)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

export async function toJsonZip(
  items: Item[],
  projects?: Project[],
  reviews?: ReviewEntry[],
  pdfs?: PdfFile[],
  pdfAnnotations?: PdfAnnotation[]
): Promise<Blob> {
  const zip = new JSZip()

  for (const it of items) {
    if (
      it.type === "image" &&
      typeof it.content === "string" &&
      it.content.startsWith("data:image")
    ) {
      const filename = `images/${it.hash || `${Date.now()}-${Math.random().toString(16).slice(2)}`}.png`
      const blob = dataUrlToBlob(it.content)
      zip.file(filename, blob)
    }
  }

  // PDF files are stored as blobs (local-only domain; not in WebDAV sync).
  // Metadata-only placeholders (synced without the file) are skipped.
  const pdfMeta: { id: string; name: string; addedAt: number }[] = []
  for (const pdf of pdfs ?? []) {
    if (!pdf.bytes) continue
    zip.file(`pdfs/${pdf.id}.pdf`, pdf.bytes)
    pdfMeta.push({ id: pdf.id, name: pdf.name, addedAt: pdf.addedAt })
  }

  const payload: {
    items: Item[]
    projects?: Project[]
    reviews?: ReviewEntry[]
    pdfAnnotations?: PdfAnnotation[]
    pdfs?: { id: string; name: string; addedAt: number }[]
  } = { items }
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
