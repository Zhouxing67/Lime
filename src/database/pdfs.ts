import { collectAll, tx, withStore } from "./core"
import { getByKeys } from "./helpers"
import { getMaxOrderInSection } from "./projectCards"
import type {
  PdfAnnotation,
  PdfCard,
  PdfFile,
  PdfMark
} from "../types"
import { createPdfCard, sha256Bytes } from "../utils"
import { renderRegionImage } from "../utils/pdfRegionImage"
import { buildProjectCard, createPlacedCard } from "./projectCards"

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
export async function touchPdf(id: string): Promise<boolean | void> {
  // lastOpened is metadata-only — the lightweight `_dbpdfTouch` stamp re-sorts
  // the library without reloading the cards/annotations (open every PDF would
  // otherwise fire the full card-panel reload chain).
  return withStore(
    "pdfs",
    "readwrite",
    async (store) => {
      const pdf = await new Promise<PdfFile | undefined>((resolve, reject) => {
        const r = store.get(id)
        r.onsuccess = () => resolve(r.result as PdfFile | undefined)
        r.onerror = () => reject(r.error)
      })
      if (!pdf) return false
      pdf.lastOpened = Date.now()
      await new Promise<void>((resolve, reject) => {
        const r = store.put(pdf)
        r.onsuccess = () => resolve()
        r.onerror = () => reject(r.error)
      })
    },
    { broadcastKey: "_dbpdfTouch" }
  )
}

/** Set a PDF's topic (undefined → 未分类). Metadata-only → the lightweight
 *  `_dbpdfTouch` stamp re-sorts the library without reloading the cards. */
export async function updatePdfTopic(
  id: string,
  topic: string | undefined
): Promise<boolean | void> {
  return withStore("pdfs", "readwrite", async (store) => {
    const pdf = await new Promise<PdfFile | undefined>((resolve, reject) => {
      const r = store.get(id)
      r.onsuccess = () => resolve(r.result as PdfFile | undefined)
      r.onerror = () => reject(r.error)
    })
    if (!pdf) return false
    if (topic) pdf.topic = topic
    else delete pdf.topic
    await new Promise<void>((resolve, reject) => {
      const r = store.put(pdf)
      r.onsuccess = () => resolve()
      r.onerror = () => reject(r.error)
    })
  }, { broadcastKey: "_dbpdfTouch" })
}

/** Rename a PDF (metadata-only — the name changes re-sort the library via the
 *  lightweight `_dbpdfTouch` stamp, never the card/annotation reload chain). */
export async function renamePdfName(
  id: string,
  name: string
): Promise<boolean | void> {
  const trimmed = name.trim()
  if (!trimmed) return false
  return withStore("pdfs", "readwrite", async (store) => {
    const pdf = await new Promise<PdfFile | undefined>((resolve, reject) => {
      const r = store.get(id)
      r.onsuccess = () => resolve(r.result as PdfFile | undefined)
      r.onerror = () => reject(r.error)
    })
    if (!pdf) return false
    if (pdf.name === trimmed) return false
    pdf.name = trimmed
    await new Promise<void>((resolve, reject) => {
      const r = store.put(pdf)
      r.onsuccess = () => resolve()
      r.onerror = () => reject(r.error)
    })
  }, { broadcastKey: "_dbpdfTouch" })
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
  return withStore("pdfs", "readonly", (store) =>
    collectAll<PdfFile>(store).then((all) =>
      all.sort((a, b) => b.addedAt - a.addedAt)
    )
  )
}

/** A PDF record WITHOUT its bytes Blob — the library listing / sync payload
 *  need only the presence signal, never the file content (loadPdfs used to pull
 *  every PDF's bytes into JS at once). `hasBytes` preserves the placeholder
 *  semantics of the old `bytes !== null` check. */
export type PdfMetaLite = Omit<PdfFile, "bytes"> & { hasBytes: boolean }

export async function listPdfMeta(): Promise<PdfMetaLite[]> {
  return withStore("pdfs", "readonly", (store) =>
    collectAll<PdfFile>(store).then((all) =>
      all
        .map((p) => ({
          id: p.id,
          name: p.name,
          pageCount: p.pageCount,
          addedAt: p.addedAt,
          lastOpened: p.lastOpened,
          topic: p.topic,
          hasBytes: !!p.bytes
        }))
        .sort((a, b) => b.addedAt - a.addedAt)
    )
  )
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
      reviews: "readwrite",
      readLater: "readwrite"
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
      // The read-later card bound to this PDF (one per PDF via byPdfId) must
      // not dangle after the PDF is gone.
      await new Promise<void>((resolve, reject) => {
        const r = stores.readLater.index("byPdfId").getKey(id)
        r.onsuccess = () => {
          const key = r.result as string | undefined
          if (key) {
            const del = stores.readLater.delete(key)
            del.onsuccess = () => resolve()
            del.onerror = () => reject(del.error)
          } else {
            resolve()
          }
        }
        r.onerror = () => reject(r.error)
      })
    }
  )
}

/** All pdfCards across every PDF (for backup/sync payloads). */
export async function getAllPdfCards(): Promise<PdfCard[]> {
  return withStore("pdfCards", "readonly", (store) =>
    collectAll<PdfCard>(store)
  )
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

/** Map an inklayer AnnotationType number to our PdfMark. */
export function inkTypeToPdfMark(type: number): PdfMark {
  switch (type) {
    case 1:
      return "highlight"
    case 2:
      return "strike"
    case 3:
      return "underline"
    case 4:
      return "freetext"
    case 7:
      return "freehand"
    case 8:
      return "free-highlight"
    default:
      return "frame"
  }
}

/** Map an inklayer AnnotationType number to our annotation kind. */
export function inkTypeToKind(type: number): "text" | "region" {
  return type === 1 || type === 2 || type === 3 ? "text" : "region"
}

/** Persist an annotation created/changed by the inklayer engine + its pdfCard
 *  in ONE transaction. `pos` is the normalized (0-1) center the view computes
 *  from the Konva clientRect + the page box (column-aware panel sorting). */
export async function saveAnnotationFromStore(input: {
  pdfId: string
  store: {
    id: string
    pageNumber: number
    type: number
    title?: string
    color?: string | null
    konvaClientRect: { x: number; y: number; width: number; height: number }
    contentsObj?: { selectedText?: string; text?: string } | null
  }
  pos?: { x: number; y: number }
  /** Normalized (0-1) bbox — the view computes it from konvaClientRect ÷ page
   *  box; consumed by region crop rendering (annotationBbox/drawOverlay). */
  rects?: { x: number; y: number; w: number; h: number }[]
  /** Normalized (0-1) stroke points for freehand / free-highlight — extracted
   *  from the Konva serialization; consumed by the crop overlay. */
  path?: { x: number; y: number }[]
  /** All strokes (multi-stroke annotations) — the crop draws every one. */
  paths?: { x: number; y: number }[][]
}): Promise<PdfAnnotation> {
  const s = input.store
  const type = inkTypeToPdfMark(s.type)
  const kind = inkTypeToKind(s.type)
  const text =
    s.contentsObj?.selectedText || s.contentsObj?.text || s.title || undefined
  const now = Date.now()
  let result: PdfAnnotation | undefined

  await tx(
    { pdfAnnotations: "readwrite", pdfCards: "readwrite" },
    async (stores) => {
      // Read INSIDE the same transaction so concurrent saves serialize on the
      // store: a read-then-create split across two transactions would let both
      // observe no card and each create one, breaking the annotation↔card 1:1
      // (A5).
      const existing = (await getByKeys<PdfAnnotation>(stores.pdfAnnotations, [s.id]))[0]
      let cardId = existing?.cardId
      if (!cardId) {
        const card = createPdfCard({
          pdfId: input.pdfId,
          page: s.pageNumber,
          kind,
          type,
          annotationId: s.id,
          pdfOrder:
            s.pageNumber * PDF_ORDER_BASE +
            Math.round((input.pos?.y ?? 0) * 1e6)
        })
        cardId = card.id
        await new Promise<void>((resolve, reject) => {
          const r = stores.pdfCards.put(card)
          r.onsuccess = () => resolve()
          r.onerror = () => reject(r.error)
        })
      }
      const annotation: PdfAnnotation = {
        id: s.id,
        pdfId: input.pdfId,
        page: s.pageNumber,
        kind,
        type,
        text,
        color: s.color ?? undefined,
        pos: input.pos,
        rects: input.rects,
        path: input.path,
        paths: input.paths,
        store: s,
        // A geometry edit (rects/path/paths present) invalidates the crop image —
        // keep it only when no geometry changed, so the placed crop re-renders
        // from the new shape on the next placement.
        ...(input.rects || input.path || input.paths
          ? { image: undefined }
          : { ...(existing?.image ? { image: existing.image } : {}) }),
        cardId,
        updatedAt: now,
        createdAt: existing?.createdAt ?? now
      }
      await new Promise<void>((resolve, reject) => {
        const r = stores.pdfAnnotations.put(annotation)
        r.onsuccess = () => resolve()
        r.onerror = () => reject(r.error)
      })
      // A type switch must propagate to the linked pdfCard — the project view's
      // type chip reads pdfCard.type (B5). Keep it in the same tx.
      if (existing && existing.type !== annotation.type) {
        const linked = (await getByKeys<PdfCard>(stores.pdfCards, [existing.cardId ?? ""]))[0]
        if (linked && linked.type !== annotation.type) {
          await new Promise<void>((resolve, reject) => {
            const r = stores.pdfCards.put({
              ...linked,
              type: annotation.type,
              updatedAt: now
            })
            r.onsuccess = () => resolve()
            r.onerror = () => reject(r.error)
          })
        }
      }
      result = annotation
    }
  )
  return result!
}

/** Delete legacy offset-based PdfAnnotations (no `store` Konva geometry) that
 *  the inklayer engine can't render, plus their pdfCards / placements /
 *  reviews. Idempotent — run on app init to sweep pre-rewrite data. */
export async function cleanupLegacyPdfAnnotations(): Promise<number> {
  const all = await getAllAnnotations()
  const legacy = all.filter((a) => !a.store)
  let failed = 0
  for (const ann of legacy) {
    try {
      await deleteAnnotationWithCard(ann.id)
    } catch (e) {
      failed += 1
      console.warn("[lime] cleanup legacy annotation failed:", ann.id, e)
    }
  }
  // Audit trail: the sweep is destructive (annotation + card + placement +
  // review) — log what it removed so an unexpected loss is traceable.
  const removed = legacy.length - failed
  if (removed > 0) {
    console.warn(
      `[lime] legacy pdf cleanup: removed ${removed} pre-rewrite annotation(s) with no Konva store`,
      legacy.slice(0, 10).map((a) => a.id)
    )
  }
  return removed
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
  const regionCards: PdfCard[] = []
  await tx(
    { pdfCards: "readwrite", projectCards: "readwrite" },
    async (stores) => {
      const cards = await getByKeys<PdfCard>(stores.pdfCards, pdfCardIds)
      for (const pdfCard of cards) {
        if (pdfCard.projectCardId) continue // 1:1 guard — already placed
        runningMax += 1
        const placement = buildProjectCard({
          type: "placed",
          content: "",
          projectId,
          sectionId: undefined,
          pdfCardId: pdfCard.id
        })
        // Placed cards sort by the pdfOrder space — the placement order is the
        // running max of the shared 未分类 space (same as before).
        placement.order = runningMax
        stores.projectCards.put(placement)
        stores.pdfCards.put({ ...pdfCard, projectCardId: placement.id })
        if (pdfCard.kind === "region") regionCards.push(pdfCard)
      }
    }
  )
  // Post-pass: generate + persist the region crop images so placed region cards
  // can show the annotated area (renderRegionImage needs the pdf bytes + the
  // annotation geometry; the annotation is the single content source).
  await ensureRegionImages(regionCards)
}

/** Generate + store the crop image for ONE region annotation (idempotent —
 *  the image is the immutable visual of the region mark). Returns true when a
 *  new image was stored. */
export async function ensureRegionImage(
  annotationId: string,
  pdfId: string
): Promise<boolean> {
  try {
    const ann = await getAnnotation(annotationId)
    if (!ann) {
      console.warn("[lime] ensureRegionImage: annotation not found", annotationId)
      return false
    }
    if (ann.image) {
      return false
    }
    const pdf = await getPdf(pdfId)
    if (!pdf?.bytes) {
      console.warn("[lime] ensureRegionImage: pdf bytes missing", pdfId)
      return false
    }
    const image = await renderRegionImage(pdf.bytes, ann)
    if (!image) return false
    await updateAnnotationImage(annotationId, image)
    return true
  } catch (e) {
    console.warn("[lime] region image:", e)
    return false
  }
}

/** Batch wrapper used by placePdfCards (the post-tx pass). */
async function ensureRegionImages(cards: PdfCard[]): Promise<void> {
  for (const card of cards) await ensureRegionImage(card.annotationId, card.pdfId)
}

/** Store a region crop on an annotation (single write + ONE _dbpdf broadcast). */
export async function updateAnnotationImage(
  id: string,
  image: string
): Promise<boolean | void> {
  return withStore("pdfAnnotations", "readwrite", async (store) => {
    const ann = await new Promise<PdfAnnotation | undefined>((resolve, reject) => {
      const r = store.get(id)
      r.onsuccess = () => resolve(r.result as PdfAnnotation | undefined)
      r.onerror = () => reject(r.error)
    })
    if (!ann || ann.image === image) return false
    ann.image = image
    ann.updatedAt = Date.now()
    await new Promise<void>((resolve, reject) => {
      const r = store.put(ann)
      r.onsuccess = () => resolve()
      r.onerror = () => reject(r.error)
    })
  })
}

/** Place a single pdfCard — the typed single-card creation entry. */
export async function placePdfCard(
  pdfCardId: string,
  projectId: string
): Promise<boolean> {
  return createPlacedCard({ pdfCardId, projectId })
}

/** Remove pdfCards from their project — delete the placement + clear the
 *  reverse reference + the placement's review (only project cards review). */
export async function unplacePdfCards(pdfCardIds: string[]): Promise<void> {
  if (pdfCardIds.length === 0) return
  await tx(
    {
      pdfCards: "readwrite",
      projectCards: "readwrite",
      reviews: "readwrite",
      pdfAnnotations: "readwrite"
    },
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
        // The crop image only matters while the annotation is placed — drop it
        // on unplace to reclaim storage (the region's visual stays on the PDF).
        const ann = await new Promise<PdfAnnotation | undefined>(
          (resolve, reject) => {
            const g = stores.pdfAnnotations.get(pdfCard.annotationId)
            g.onsuccess = () => resolve(g.result as PdfAnnotation | undefined)
            g.onerror = () => reject(g.error)
          }
        )
        if (ann?.image) stores.pdfAnnotations.put({ ...ann, image: undefined })
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
  return withStore("pdfAnnotations", "readonly", (store) =>
    collectAll<PdfAnnotation>(store)
  )
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
  const ann = await getAnnotation(id)
  if (ann?.cardId) {
    // A bare delete would orphan the linked pdfCard + any placement — this
    // path must NOT be used for card-linked annotations (use
    // deleteAnnotationWithCard / deletePdfCards). Guard against silent breakage.
    throw new Error(
      "[lime] deleteAnnotation: annotation has a linked card — use deleteAnnotationWithCard"
    )
  }
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
  localAnnotations: PdfAnnotation[]
): Promise<void> {
  for (const pdf of remotePdfs) {
    await addPdf({ ...pdf, bytes: null })
  }
  const remoteIds = new Set(remoteAnnotations.map((a) => a.id))
  // ONE atomic transaction: annotation upserts + local-not-remote deletes +
  // the annotation↔card 1:1 backfill all commit together, so a crash between
  // them can't leave a card-less annotation (the old two-tx version transiently
  // broke the 1:1 invariant on crash between them).
  await tx(
    { pdfAnnotations: "readwrite", pdfCards: "readwrite" },
    async (stores) => {
      for (const ann of remoteAnnotations) stores.pdfAnnotations.put(ann)
      for (const local of localAnnotations) {
        if (!remoteIds.has(local.id)) stores.pdfAnnotations.delete(local.id)
      }
      // Enforce the annotation↔card 1:1: a remote annotation whose linked
      // pdfCard is absent (a filtered/legacy payload) would leave any placement
      // unresolvable — read the cards INSIDE this tx and create the missing
      // ones so the invariant holds atomically (R7).
      const existingCards = await new Promise<PdfCard[]>((resolve, reject) => {
        const results: PdfCard[] = []
        const req = stores.pdfCards.openCursor()
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
      const cardByAnn = new Map(existingCards.map((c) => [c.annotationId, c.id]))
      for (const ann of remoteAnnotations) {
        if (cardByAnn.has(ann.id)) continue
        const card = createPdfCard({
          pdfId: ann.pdfId,
          page: ann.page,
          kind: ann.kind,
          type: ann.type,
          annotationId: ann.id,
          pdfOrder:
            ann.page * PDF_ORDER_BASE +
            Math.round((ann.pos?.y ?? 0) * 1e6)
        })
        await new Promise<void>((resolve, reject) => {
          const r = stores.pdfCards.put(card)
          r.onsuccess = () => resolve()
          r.onerror = () => reject(r.error)
        })
      }
    }
  )
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
  }, { broadcastKey: "_dbpdfTouch" })
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
  }, { broadcastKey: "_dbpdfTouch" })
}
