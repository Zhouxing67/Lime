import { tx, withStore } from "./core"
import { getByKeys } from "./helpers"
import { getMaxOrderInSection } from "./projectCards"
import type {
  PdfAnnotation,
  PdfCard,
  PdfFile,
  PdfMark,
  ProjectCard
} from "../types"
import { createPdfCard, sha256Bytes } from "../utils"

/** Add or "fill" a PDF. The id is the SHA-256 content hash of the bytes (a
 *  stable cross-device identity). If a record with the same id already holds
 *  the real bytes, the call is idempotent; a metadata-only placeholder gets
 *  filled when the matching local file is opened. Returns the content-hash id. */
export async function addPdf(pdf: PdfFile): Promise<string> {
  let id = pdf.id
  if (pdf.bytes) id = await sha256Bytes(pdf.bytes)
  const record: PdfFile = {
    ...pdf,
    id,
    lastOpened: pdf.lastOpened ?? pdf.addedAt
  }
  return withStore("pdfs", "readwrite", async (store) => {
    const existing = await new Promise<PdfFile | undefined>((resolve, reject) => {
      const r = store.get(id)
      r.onsuccess = () => resolve(r.result as PdfFile | undefined)
      r.onerror = () => reject(r.error)
    })
    // Keep a real file over a placeholder, and don't re-put the same file.
    if (existing?.bytes) return id
    // Filling a synced placeholder must NOT drop fields the placeholder carries
    // (topic, lastOpened) that the caller's record may lack — merge onto it.
    const merged = existing ? { ...existing, ...record } : record
    await new Promise<void>((resolve, reject) => {
      const r = store.put(merged)
      r.onsuccess = () => resolve()
      r.onerror = () => reject(r.error)
    })
    return id
  })
}

/** Mark a PDF as just-opened (drives recent-first ordering in the sidebar/hub). */
export async function touchPdf(id: string): Promise<void> {
  return withStore("pdfs", "readwrite", async (store) => {
    const pdf = await new Promise<PdfFile | undefined>((resolve, reject) => {
      const r = store.get(id)
      r.onsuccess = () => resolve(r.result as PdfFile | undefined)
      r.onerror = () => reject(r.error)
    })
    if (!pdf) return
    pdf.lastOpened = Date.now()
    await new Promise<void>((resolve, reject) => {
      const r = store.put(pdf)
      r.onsuccess = () => resolve()
      r.onerror = () => reject(r.error)
    })
  })
}

/** Set a PDF's topic (undefined → 未分类). Broadcasts _dbpdf → the library reloads. */
export async function updatePdfTopic(
  id: string,
  topic: string | undefined
): Promise<void> {
  return withStore("pdfs", "readwrite", async (store) => {
    const pdf = await new Promise<PdfFile | undefined>((resolve, reject) => {
      const r = store.get(id)
      r.onsuccess = () => resolve(r.result as PdfFile | undefined)
      r.onerror = () => reject(r.error)
    })
    if (!pdf) return
    if (topic) pdf.topic = topic
    else delete pdf.topic
    await new Promise<void>((resolve, reject) => {
      const r = store.put(pdf)
      r.onsuccess = () => resolve()
      r.onerror = () => reject(r.error)
    })
  })
}

export async function getPdf(id: string): Promise<PdfFile | undefined> {
  return withStore("pdfs", "readonly", (store) => {
    return new Promise((resolve, reject) => {
      const req = store.get(id)
      req.onsuccess = () => resolve(req.result as PdfFile | undefined)
      req.onerror = () => reject(req.error)
    })
  })
}

export async function listPdfs(): Promise<PdfFile[]> {
  return withStore("pdfs", "readonly", (store) => {
    return new Promise((resolve, reject) => {
      const results: PdfFile[] = []
      const req = store.openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          results.push(cursor.value as PdfFile)
          cursor.continue()
        } else {
          resolve(results.sort((a, b) => b.addedAt - a.addedAt))
        }
      }
      req.onerror = () => reject(req.error)
    })
  })
}

/** Delete a PDF + its annotations + its PDF cards together (no orphans). */
/** Delete a PDF + its pdfCards + their placements + annotations together
 *  (no orphans anywhere). */
export async function deletePdf(id: string): Promise<void> {
  await tx(
    {
      pdfCards: "readwrite",
      pdfAnnotations: "readwrite",
      projectCards: "readwrite",
      pdfs: "readwrite",
      reviews: "readwrite"
    },
    async (stores) => {
      const cards = await new Promise<PdfCard[]>((resolve, reject) => {
        const results: PdfCard[] = []
        const req = stores.pdfCards
          .index("pdfId")
          .openCursor(IDBKeyRange.only(id))
        req.onsuccess = () => {
          const cursor = req.result
          if (cursor) {
            results.push(cursor.value as PdfCard)
            cursor.continue()
          } else {
            resolve(results)
          }
        }
        req.onerror = () => reject(req.error)
      })
      for (const card of cards) {
        if (card.annotationId) stores.pdfAnnotations.delete(card.annotationId)
        if (card.projectCardId) {
          // 删父要删子 — cascade the placement + its review.
          const r = stores.reviews
            .index("itemId")
            .getKey(card.projectCardId)
          r.onsuccess = () => {
            if (r.result) stores.reviews.delete(r.result as string)
          }
          stores.projectCards.delete(card.projectCardId)
        }
        stores.pdfCards.delete(card.id)
      }
      await new Promise<void>((resolve, reject) => {
        const r = stores.pdfs.delete(id)
        r.onsuccess = () => resolve()
        r.onerror = () => reject(r.error)
      })
    }
  )
}

/** All pdfCards across every PDF (for backup/sync payloads). */
export async function getAllPdfCards(): Promise<PdfCard[]> {
  return withStore("pdfCards", "readonly", (store) => {
    return new Promise<PdfCard[]>((resolve, reject) => {
      const all: PdfCard[] = []
      const req = store.openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          all.push(cursor.value as PdfCard)
          cursor.continue()
        } else {
          resolve(all)
        }
      }
      req.onerror = () => reject(req.error)
    })
  })
}

/** Low-level insert/overwrite of a pdfCard (identity-keyed — used by import
 *  and legacy payload conversion; the 1:1 annotation link is the caller's job). */
export async function addPdfCard(card: PdfCard): Promise<void> {
  await withStore("pdfCards", "readwrite", (store) => {
    store.put(card)
  })
}

/** Persist a pdfCard edit (e.g. the idea/备注 for a placed card). Broadcasts
 *  _dbpdf → the options page reloads the panel + the resolved display. */
export async function updatePdfCard(card: PdfCard): Promise<void> {
  await tx(
    { pdfCards: "readwrite", pdfAnnotations: "readwrite" },
    async (stores) => {
      await new Promise<void>((resolve, reject) => {
        const r1 = stores.pdfCards.put(card)
        r1.onsuccess = () => {
          const r2 = stores.pdfAnnotations.get(card.annotationId)
          r2.onsuccess = () => {
            const ann = r2.result as PdfAnnotation | undefined
            if (ann) {
              ann.updatedAt = Date.now()
              const r3 = stores.pdfAnnotations.put(ann)
              r3.onsuccess = () => resolve()
              r3.onerror = () => reject(r3.error)
            } else {
              resolve()
            }
          }
          r2.onerror = () => reject(r2.error)
        }
        r1.onerror = () => reject(r1.error)
      })
    }
  )
}

/** All pdfCards belonging to a PDF (via the pdfId index), unsorted. */
export async function getPdfCards(pdfId: string): Promise<PdfCard[]> {
  return withStore("pdfCards", "readonly", (store) => {
    return new Promise((resolve, reject) => {
      const idx = store.index("pdfId")
      const req = idx.getAll(pdfId)
      req.onsuccess = () => resolve((req.result as PdfCard[]) ?? [])
      req.onerror = () => reject(req.error)
    })
  })
}

/** Page-major multiplier for a card's pdfOrder (page * BASE + in-page pos). */
export const PDF_ORDER_BASE = 1e6

/** Create a text annotation + its pdfCard in ONE transaction. */
export async function createTextAnnotationCard(input: {
  pdfId: string
  page: number
  type: Exclude<PdfMark, "frame">
  text: string
  startOffset: number
  endOffset: number
  title?: string
  /** Normalized (0-1) center — for column-aware panel sorting. */
  pos?: { x: number; y: number }
}): Promise<{ card: PdfCard; annotation: PdfAnnotation }> {
  const annotation: PdfAnnotation = {
    id: crypto.randomUUID(),
    pdfId: input.pdfId,
    page: input.page,
    kind: "text",
    type: input.type,
    startOffset: input.startOffset,
    endOffset: input.endOffset,
    text: input.text,
    pos: input.pos,
    createdAt: Date.now()
  }
  const card = createPdfCard({
    pdfId: input.pdfId,
    page: input.page,
    kind: "text",
    type: input.type,
    annotationId: annotation.id,
    pdfOrder: input.page * PDF_ORDER_BASE + input.startOffset
  })
  annotation.cardId = card.id
  await tx(
    { pdfCards: "readwrite", pdfAnnotations: "readwrite" },
    async (stores) => {
      await new Promise<void>((resolve, reject) => {
        const r1 = stores.pdfCards.put(card)
        r1.onsuccess = () => {
          const r2 = stores.pdfAnnotations.put(annotation)
          r2.onsuccess = () => resolve()
          r2.onerror = () => reject(r2.error)
        }
        r1.onerror = () => reject(r1.error)
      })
    }
  )
  return { card, annotation }
}

/** Create a region (框选) annotation + its pdfCard in ONE transaction. */
export async function createRegionAnnotationCard(input: {
  pdfId: string
  page: number
  rects: { x: number; y: number; w: number; h: number }[]
  /** Normalized (0-1) center — for column-aware panel sorting. */
  pos?: { x: number; y: number }
  /** Mark type: frame (default) / freehand / free-highlight / freetext. */
  type?: PdfMark
  /** freehand / free-highlight stroke points (normalized 0-1). */
  path?: { x: number; y: number }[]
  /** freetext content. */
  text?: string
}): Promise<{ card: PdfCard; annotation: PdfAnnotation }> {
  const type = input.type ?? "frame"
  const annotation: PdfAnnotation = {
    id: crypto.randomUUID(),
    pdfId: input.pdfId,
    page: input.page,
    kind: "region",
    type,
    rects: input.rects,
    path: input.path,
    text: input.text,
    pos: input.pos,
    createdAt: Date.now()
  }
  const y = input.rects.length > 0 ? input.rects[0].y : 0
  const card = createPdfCard({
    pdfId: input.pdfId,
    page: input.page,
    kind: "region",
    type,
    annotationId: annotation.id,
    pdfOrder: input.page * PDF_ORDER_BASE + Math.round(y * 1e6)
  })
  annotation.cardId = card.id
  await tx(
    { pdfCards: "readwrite", pdfAnnotations: "readwrite" },
    async (stores) => {
      await new Promise<void>((resolve, reject) => {
        const r1 = stores.pdfCards.put(card)
        r1.onsuccess = () => {
          const r2 = stores.pdfAnnotations.put(annotation)
          r2.onsuccess = () => resolve()
          r2.onerror = () => reject(r2.error)
        }
        r1.onerror = () => reject(r1.error)
      })
    }
  )
  return { card, annotation }
}

/** Delete an annotation + its pdfCard + any placement (1:1 coupling). */
export async function deleteAnnotationWithCard(
  annotationId: string
): Promise<void> {
  await tx(
    {
      pdfAnnotations: "readwrite",
      pdfCards: "readwrite",
      projectCards: "readwrite",
      reviews: "readwrite"
    },
    async (stores) => {
      const ann = await new Promise<PdfAnnotation | undefined>((resolve, reject) => {
        const r = stores.pdfAnnotations.get(annotationId)
        r.onsuccess = () => resolve(r.result as PdfAnnotation | undefined)
        r.onerror = () => reject(r.error)
      })
      await new Promise<void>((resolve, reject) => {
        if (ann?.cardId) {
          // The pdfCard carries the placement reference — look it up first
          // (the projectCardId index key is the placement's PRIMARY key, not
          // the pdfCard id, so querying by ann.cardId never matched).
          const gr = stores.pdfCards.get(ann.cardId)
          gr.onsuccess = () => {
            const pdfCard = gr.result as PdfCard | undefined
            if (pdfCard?.projectCardId) {
              const rr = stores.reviews
                .index("itemId")
                .getKey(pdfCard.projectCardId)
              rr.onsuccess = () => {
                if (rr.result) stores.reviews.delete(rr.result as string)
              }
              rr.onerror = () =>
                console.warn(
                  "[lime] deleteAnnotationWithCard: review lookup failed"
                )
              stores.projectCards.delete(pdfCard.projectCardId)
            }
            stores.pdfCards.delete(ann.cardId!)
            const d = stores.pdfAnnotations.delete(annotationId)
            d.onsuccess = () => resolve()
            d.onerror = () => reject(d.error)
          }
          gr.onerror = () => {
            stores.pdfCards.delete(ann.cardId!)
            const d = stores.pdfAnnotations.delete(annotationId)
            d.onsuccess = () => resolve()
            d.onerror = () => reject(d.error)
          }
        } else {
          const d = stores.pdfAnnotations.delete(annotationId)
          d.onsuccess = () => resolve()
          d.onerror = () => reject(d.error)
        }
      })
    }
  )
}

/** Delete PDF cards + their linked annotations + their placements' reviews in
 *  ONE transaction (batch — pass `[card]` for a single card). A placement is
 *  deleted alongside its pdfCard; the pdfCard is always removed. */
export async function deletePdfCards(cards: PdfCard[]): Promise<void> {
  if (cards.length === 0) return
  await tx(
    {
      pdfCards: "readwrite",
      pdfAnnotations: "readwrite",
      projectCards: "readwrite",
      reviews: "readwrite"
    },
    async (stores) => {
      await new Promise<void>((resolve, reject) => {
        let remaining = cards.length
        for (const card of cards) {
          if (card.annotationId) {
            stores.pdfAnnotations.delete(card.annotationId)
          }
          if (card.projectCardId) {
            const r = stores.reviews.index("itemId").getKey(card.projectCardId)
            r.onsuccess = () => {
              if (r.result) stores.reviews.delete(r.result as string)
            }
            r.onerror = () =>
              console.warn("[lime] deletePdfCards: review lookup failed")
            stores.projectCards.delete(card.projectCardId)
          }
          const d = stores.pdfCards.delete(card.id)
          d.onsuccess = () => {
            if (--remaining === 0) resolve()
          }
          d.onerror = () => reject(d.error)
        }
      })
    }
  )
}

/** Place pdfCards into a project — create a placement record (projectCards) +
 *  the pdfCard's reverse reference, ONE tx + both broadcasts. 1:1 guarded. */
export async function placePdfCards(
  pdfCardIds: string[],
  projectId: string
): Promise<void> {
  if (pdfCardIds.length === 0) return
  const maxOrder = await getMaxOrderInSection(undefined)
  let runningMax = maxOrder
  await tx(
    { pdfCards: "readwrite", projectCards: "readwrite" },
    async (stores) => {
      const cards = await getByKeys<PdfCard>(stores.pdfCards, pdfCardIds)
      for (const pdfCard of cards) {
        if (pdfCard.projectCardId) continue // 1:1 guard — already placed
        runningMax += 1
        const placement: ProjectCard = {
          id: crypto.randomUUID(),
          type: pdfCard.kind === "region" ? "image" : "text",
          content: "",
          projectId,
          sectionId: undefined,
          order: runningMax,
          pdfCardId: pdfCard.id,
          createdAt: Date.now()
        }
        stores.projectCards.put(placement)
        stores.pdfCards.put({ ...pdfCard, projectCardId: placement.id })
      }
    }
  )
}

/** Place a single pdfCard (thin wrapper). */
export async function placePdfCard(
  pdfCardId: string,
  projectId: string
): Promise<void> {
  await placePdfCards([pdfCardId], projectId)
}

/** Remove pdfCards from their project — delete the placement + clear the
 *  reverse reference + the placement's review (only project cards review). */
export async function unplacePdfCards(pdfCardIds: string[]): Promise<void> {
  if (pdfCardIds.length === 0) return
  await tx(
    { pdfCards: "readwrite", projectCards: "readwrite", reviews: "readwrite" },
    async (stores) => {
      const cards = await getByKeys<PdfCard>(stores.pdfCards, pdfCardIds)
      for (const pdfCard of cards) {
        if (!pdfCard.projectCardId) continue
        const r = stores.reviews.index("itemId").getKey(pdfCard.projectCardId)
        r.onsuccess = () => {
          if (r.result) stores.reviews.delete(r.result as string)
        }
        r.onerror = () =>
          console.warn("[lime] unplacePdfCards: review lookup failed")
        stores.projectCards.delete(pdfCard.projectCardId)
        stores.pdfCards.put({ ...pdfCard, projectCardId: undefined })
      }
    }
  )
}

/** Remove a single pdfCard from its project (thin wrapper). */
export async function unplacePdfCard(pdfCardId: string): Promise<void> {
  await unplacePdfCards([pdfCardId])
}

/** All annotations across every PDF (for backup). */
export async function getAllAnnotations(): Promise<PdfAnnotation[]> {
  return withStore("pdfAnnotations", "readonly", (store) => {
    return new Promise((resolve, reject) => {
      const results: PdfAnnotation[] = []
      const req = store.openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          results.push(cursor.value as PdfAnnotation)
          cursor.continue()
        } else {
          resolve(results)
        }
      }
      req.onerror = () => reject(req.error)
    })
  })
}

/** Add or update a single annotation (low-level store CRUD). */
export async function addAnnotation(ann: PdfAnnotation): Promise<void> {
  return withStore("pdfAnnotations", "readwrite", async (store) => {
    await new Promise<void>((resolve, reject) => {
      const req = store.put(ann)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  })
}

export async function getAnnotation(
  id: string
): Promise<PdfAnnotation | undefined> {
  return withStore("pdfAnnotations", "readonly", (store) => {
    return new Promise((resolve, reject) => {
      const req = store.get(id)
      req.onsuccess = () => resolve(req.result as PdfAnnotation | undefined)
      req.onerror = () => reject(req.error)
    })
  })
}

export async function getAnnotationsByPdf(
  pdfId: string
): Promise<PdfAnnotation[]> {
  return withStore("pdfAnnotations", "readonly", (store) => {
    const idx = store.index("pdfId")
    return new Promise((resolve, reject) => {
      const results: PdfAnnotation[] = []
      const req = idx.openCursor(IDBKeyRange.only(pdfId))
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          results.push(cursor.value as PdfAnnotation)
          cursor.continue()
        } else {
          resolve(results)
        }
      }
      req.onerror = () => reject(req.error)
    })
  })
}

export async function deleteAnnotation(id: string): Promise<void> {
  return withStore("pdfAnnotations", "readwrite", async (store) => {
    await new Promise<void>((resolve, reject) => {
      const req = store.delete(id)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  })
}

// ---- PDF notes-only sync application ----

/** Apply the remote PDF domain after a notes-only download: upsert PDF
 *  metadata as placeholders (local file bytes are preserved), upsert remote
 *  annotations + delete local annotations not on the remote. */
export async function applyPdfSync(
  remotePdfs: {
    id: string
    name: string
    pageCount: number
    addedAt: number
    lastOpened?: number
    topic?: string
  }[],
  remoteAnnotations: PdfAnnotation[],
  _localPdfs: PdfFile[],
  localAnnotations: PdfAnnotation[]
): Promise<void> {
  for (const pdf of remotePdfs) {
    await addPdf({ ...pdf, bytes: null })
  }
  const remoteIds = new Set(remoteAnnotations.map((a) => a.id))
  await tx({ pdfAnnotations: "readwrite" }, async (stores) => {
    for (const ann of remoteAnnotations) stores.pdfAnnotations.put(ann)
    for (const local of localAnnotations) {
      if (!remoteIds.has(local.id)) stores.pdfAnnotations.delete(local.id)
    }
  })
}

/** Change an annotation's mark type (e.g. underline → highlight). The 1:1 card
 *  is untouched — only the overlay style re-renders via the _dbpdf broadcast. */
export async function updateAnnotationType(
  id: string,
  type: PdfMark
): Promise<void> {
  return withStore("pdfAnnotations", "readwrite", async (store) => {
    const ann = await new Promise<PdfAnnotation | undefined>((resolve, reject) => {
      const r = store.get(id)
      r.onsuccess = () => resolve(r.result as PdfAnnotation | undefined)
      r.onerror = () => reject(r.error)
    })
    if (!ann) return
    ann.type = type
    ann.updatedAt = Date.now()
    await new Promise<void>((resolve, reject) => {
      const r = store.put(ann)
      r.onsuccess = () => resolve()
      r.onerror = () => reject(r.error)
    })
  })
}

/** Backfill an annotation's normalized center (for two-column sorting). */
export async function updateAnnotationPos(
  id: string,
  pos: { x: number; y: number }
): Promise<void> {
  return withStore("pdfAnnotations", "readwrite", async (store) => {
    const ann = await new Promise<PdfAnnotation | undefined>((resolve, reject) => {
      const r = store.get(id)
      r.onsuccess = () => resolve(r.result as PdfAnnotation | undefined)
      r.onerror = () => reject(r.error)
    })
    if (!ann || ann.pos) return
    ann.pos = pos
    await new Promise<void>((resolve, reject) => {
      const r = store.put(ann)
      r.onsuccess = () => resolve()
      r.onerror = () => reject(r.error)
    })
  })
}

/** Edit a freetext annotation's content. */
export async function updateAnnotationText(
  id: string,
  text: string
): Promise<void> {
  return withStore("pdfAnnotations", "readwrite", async (store) => {
    const ann = await new Promise<PdfAnnotation | undefined>((resolve, reject) => {
      const r = store.get(id)
      r.onsuccess = () => resolve(r.result as PdfAnnotation | undefined)
      r.onerror = () => reject(r.error)
    })
    if (!ann) return
    ann.text = text
    ann.updatedAt = Date.now()
    await new Promise<void>((resolve, reject) => {
      const r = store.put(ann)
      r.onsuccess = () => resolve()
      r.onerror = () => reject(r.error)
    })
  })
}

/** Rename a topic across all PDFs carrying it. */
export async function renamePdfTopic(
  oldTopic: string,
  newTopic: string
): Promise<void> {
  return withStore("pdfs", "readwrite", async (store) => {
    const all = await new Promise<PdfFile[]>((resolve, reject) => {
      const r = store.getAll()
      r.onsuccess = () => resolve((r.result as PdfFile[]) ?? [])
      r.onerror = () => reject(r.error)
    })
    for (const pdf of all) {
      if (pdf.topic !== oldTopic) continue
      pdf.topic = newTopic
      await new Promise<void>((resolve, reject) => {
        const r = store.put(pdf)
        r.onsuccess = () => resolve()
        r.onerror = () => reject(r.error)
      })
    }
  })
}

/** Clear a topic from every PDF carrying it (→ 未分类). */
export async function clearPdfTopic(topic: string): Promise<void> {
  return withStore("pdfs", "readwrite", async (store) => {
    const all = await new Promise<PdfFile[]>((resolve, reject) => {
      const r = store.getAll()
      r.onsuccess = () => resolve((r.result as PdfFile[]) ?? [])
      r.onerror = () => reject(r.error)
    })
    for (const pdf of all) {
      if (pdf.topic !== topic) continue
      delete pdf.topic
      await new Promise<void>((resolve, reject) => {
        const r = store.put(pdf)
        r.onsuccess = () => resolve()
        r.onerror = () => reject(r.error)
      })
    }
  })
}
