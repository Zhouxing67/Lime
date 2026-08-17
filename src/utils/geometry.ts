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

/* ---- annotation → normalized page geometry (the inklayer engine bridge) ---- */

/** A pdf.js page viewport subset — only the fields the normalization needs. */
export interface ViewportLike {
  width: number
  height: number
  scale: number
}

export interface AnnotationGeometry {
  pos?: { x: number; y: number }
  rects?: { x: number; y: number; w: number; h: number }[]
  path?: { x: number; y: number }[]
  paths?: { x: number; y: number }[][]
}

/** The Konva serialization shape we read stroke points from. */
interface KonvaNodeLike {
  className?: string
  attrs?: { points?: number[] }
  children?: KonvaNodeLike[]
}

/** Normalize an engine store's stage-local geometry to 0-1 page coordinates.
 *
 *  Coordinate contract: the Konva stage is `{ width: vp.width, height: vp.height,
 *  scale: vp.scale }` — shape coordinates are in STAGE-LOCAL units, which equal
 *  PDF user-space points with a top-left origin (Y not flipped; zoom scales the
 *  stage, never the shapes). So `sx = vp.scale / vp.width = 1 / pageWidth` is
 *  SCALE-INVARIANT: zooming never rewrites the normalized geometry.
 *
 *  Also extracts every stroke (Line nodes) from the Konva serialization for the
 *  crop overlay — a multi-stroke freehand has several Lines, one per pen-up/down.
 */
export function annotationGeometry(
  store: {
    pageNumber: number
    konvaClientRect?: { x: number; y: number; width: number; height: number }
    konvaString?: string
  },
  vp: ViewportLike | undefined
): AnnotationGeometry {
  if (!vp || vp.width <= 0 || vp.height <= 0) return {}
  const r = store.konvaClientRect
  if (!r) return {}
  const sx = vp.scale / vp.width
  const sy = vp.scale / vp.height
  const pos = {
    x: (r.x + r.width / 2) * sx,
    y: (r.y + r.height / 2) * sy
  }
  const rects = [{ x: r.x * sx, y: r.y * sy, w: r.width * sx, h: r.height * sy }]
  let path: { x: number; y: number }[] | undefined
  let paths: { x: number; y: number }[][] | undefined
  try {
    const json = JSON.parse(store.konvaString ?? "") as KonvaNodeLike
    const allLines: number[][] = []
    const collectLines = (n: KonvaNodeLike) => {
      if (n?.className === "Line" && Array.isArray(n?.attrs?.points)) {
        allLines.push(n.attrs.points)
      }
      for (const c of n?.children ?? []) collectLines(c)
    }
    collectLines(json)
    const strokes = allLines
      .filter((pts) => pts.length >= 4)
      .map((pts) => {
        const stroke: { x: number; y: number }[] = []
        for (let i = 0; i < pts.length; i += 2) {
          stroke.push({ x: pts[i] * sx, y: pts[i + 1] * sy })
        }
        return stroke
      })
    if (strokes.length > 0) {
      path = strokes.length === 1 ? strokes[0] : undefined
      paths = strokes
    }
  } catch {
    // no path extracted — the crop overlay falls back to the bbox stroke
  }
  return { pos, rects, path, paths }
}
