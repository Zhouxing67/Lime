import JSZip from "jszip"

import type { Item, Project, ReviewEntry } from "../types"

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
  reviews?: ReviewEntry[]
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

  const payload: {
    items: Item[]
    projects?: Project[]
    reviews?: ReviewEntry[]
  } = { items }
  if (projects && projects.length > 0) {
    payload.projects = projects.map(
      ({ id, name, createdAt, note, sections }) => ({
        id,
        name,
        createdAt,
        note,
        sections
      })
    )
  }
  if (reviews && reviews.length > 0) {
    payload.reviews = reviews
  }
  const json = JSON.stringify(payload, null, 2)
  zip.file("export.json", json)

  const blob = await zip.generateAsync({ type: "blob" })
  return blob
}
