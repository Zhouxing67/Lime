import * as pdfjsLib from "pdfjs-dist"

import type { PdfAnnotation } from "../types"
import { MARK_COLOR } from "../components/pdfTheme"

/** The annotation's bounding box in page CSS coordinates (from the normalized
 *  rects/path). null if the annotation has no usable geometry. */
function annotationBbox(
  ann: PdfAnnotation,
  baseW: number,
  baseH: number
): { x: number; y: number; w: number; h: number } | null {
  const pts: { x: number; y: number }[] = []
  if (ann.rects?.length) {
    for (const r of ann.rects) {
      pts.push({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h })
    }
  } else if (ann.path?.length) {
    pts.push(...ann.path)
  }
  if (!pts.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const x = minX * baseW
  const y = minY * baseH
  return { x, y, w: (maxX - minX) * baseW, h: (maxY - minY) * baseH }
}

/** Draw the annotation's visual onto the crop context (crop coords). The path
 *  points are NORMALIZED to the whole page — map them via the page size minus
 *  the crop's bbox origin, or the stroke would be compressed toward the top-left. */
function drawOverlay(
  ctx: CanvasRenderingContext2D,
  ann: PdfAnnotation,
  bbox: { x: number; y: number; w: number; h: number },
  scale: number,
  pageW: number,
  pageH: number
): void {
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  if (ann.type === "frame") {
    const x = 0
    const y = 0
    const w = bbox.w * scale
    const h = bbox.h * scale
    ctx.strokeStyle = MARK_COLOR.frame
    ctx.lineWidth = 1.5 * scale
    ctx.beginPath()
    ctx.moveTo(x + 2, y)
    ctx.lineTo(x + w - 2, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + 2)
    ctx.lineTo(x + w, y + h - 2)
    ctx.quadraticCurveTo(x + w, y + h, x + w - 2, y + h)
    ctx.lineTo(x + 2, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - 2)
    ctx.lineTo(x, y + 2)
    ctx.quadraticCurveTo(x, y, x + 2, y)
    ctx.stroke()
  } else if (ann.type === "freehand" || ann.type === "free-highlight") {
    const pts = (ann.path ?? []).map((p) => ({
      x: (p.x * pageW - bbox.x) * scale,
      y: (p.y * pageH - bbox.y) * scale
    }))
    if (pts.length < 2) return
    ctx.strokeStyle = MARK_COLOR[ann.type]
    ctx.lineWidth = (ann.type === "free-highlight" ? 14 : 2) * scale
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    // Tension-0.35 smoothing (mid-point quadratic, same as the Konva render).
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2
      const my = (pts[i].y + pts[i + 1].y) / 2
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y)
    ctx.stroke()
  }
}

/** Render a region annotation (frame/free-hand/free-highlight) as a standalone
 *  crop image — the PDF page at 2x, the annotation's bbox cropped, the mark
 *  visual overlaid. Returns a PNG dataURL (or null on failure / no geometry). */
export async function renderRegionImage(
  pdfBytes: Blob,
  ann: PdfAnnotation
): Promise<string | null> {
  try {
    const task = pdfjsLib.getDocument({
      data: await pdfBytes.arrayBuffer(),
      cMapUrl: chrome.runtime.getURL("assets/pdfjs/cmaps/"),
      cMapPacked: true,
      standardFontDataUrl: chrome.runtime.getURL("assets/pdfjs/standard_fonts/")
    })
    const doc = await task.promise
    try {
      const page = await doc.getPage(ann.page)
      const vp1 = page.getViewport({ scale: 1 })
      const bbox = annotationBbox(ann, vp1.width, vp1.height)
      if (!bbox || bbox.w <= 0 || bbox.h <= 0) return null
      const scale = 3
      const vp = page.getViewport({ scale })
      const full = document.createElement("canvas")
      full.width = Math.ceil(vp.width)
      full.height = Math.ceil(vp.height)
      await page.render({
        canvasContext: full.getContext("2d")!,
        viewport: vp
      }).promise
      const crop = document.createElement("canvas")
      crop.width = Math.max(1, Math.ceil(bbox.w * scale))
      crop.height = Math.max(1, Math.ceil(bbox.h * scale))
      const ctx = crop.getContext("2d")
      if (!ctx) return null
      ctx.drawImage(
        full,
        bbox.x * scale,
        bbox.y * scale,
        bbox.w * scale,
        bbox.h * scale,
        0,
        0,
        crop.width,
        crop.height
      )
      drawOverlay(ctx, ann, bbox, scale, vp1.width, vp1.height)
      return crop.toDataURL("image/png")
    } finally {
      task.destroy().catch(() => {})
    }
  } catch (e) {
    console.warn("[lime] region image render failed:", ann.id, e)
    return null
  }
}
