export interface RectLike {
  x: number
  y: number
  w: number
  h: number
}

/** The normalized center of the union of rects — the single shared "position"
 *  computation used by annotation creation (pos) and legacy pos backfill.
 *  Pass `norm` (the page size in CSS px) to get a 0-1 normalized result. */
export function rectsUnionCenter(
  rects: RectLike[] | undefined,
  norm?: { w: number; h: number }
): { x: number; y: number } | undefined {
  if (!rects || rects.length === 0) return undefined
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of rects) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.w)
    maxY = Math.max(maxY, r.y + r.h)
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  return norm ? { x: cx / norm.w, y: cy / norm.h } : { x: cx, y: cy }
}
