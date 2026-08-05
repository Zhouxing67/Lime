import * as pdfjsLib from "pdfjs-dist"

export interface PdfSearchMatch {
  page: number
  start: number
  end: number
}

type TextLayer = InstanceType<typeof pdfjsLib.TextLayer>

/** Case-insensitive text search across all pages. Offsets are into each page's
 *  concatenated textContent (same coordinate space as textLayerRects), capped
 *  at MAX_MATCHES. */
export async function searchPdfText(
  doc: pdfjsLib.PDFDocumentProxy,
  query: string,
  maxMatches = 500,
  signal?: AbortSignal
): Promise<PdfSearchMatch[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const matches: PdfSearchMatch[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    if (signal?.aborted) return matches
    const page = await doc.getPage(p)
    // disableNormalization MUST match the TextLayer's streamTextContent —
    // otherwise ligatures/CJK substitution drift the offsets and the flash
    // highlights the wrong text.
    const tc = await page.getTextContent({ disableNormalization: true })
    const full = (tc.items as { str?: string }[])
      .map((i) => i.str ?? "")
      .join("")
    const lower = full.toLowerCase()
    let idx = lower.indexOf(q)
    while (idx >= 0 && matches.length < maxMatches) {
      matches.push({ page: p, start: idx, end: idx + q.length })
      idx = lower.indexOf(q, idx + 1)
    }
    if (matches.length >= maxMatches) break
  }
  return matches
}

export interface PdfRect {
  x: number
  y: number
  w: number
  h: number
}

interface TextLayerIndex {
  /** div → its index among textDivs */
  divIndex: Map<HTMLElement, number>
  /** cumulative[i] = char offset BEFORE div i */
  cumulative: number[]
  total: number
}

/** Cached per-render index (WeakMap → auto-invalidated when the text layer is
 *  re-rendered/unmounted, covering zoom/rotate + lifecycle). */
const indexCache = new WeakMap<TextLayer, TextLayerIndex>()

export function buildTextLayerIndex(textLayer: TextLayer): TextLayerIndex {
  const divs = textLayer.textDivs
  const strs = textLayer.textContentItemsStr
  const divIndex = new Map<HTMLElement, number>()
  const cumulative: number[] = []
  let acc = 0
  for (let i = 0; i < divs.length; i++) {
    divIndex.set(divs[i], i)
    cumulative.push(acc)
    acc += strs[i]?.length ?? 0
  }
  return { divIndex, cumulative, total: acc }
}

function getTextLayerIndex(textLayer: TextLayer): TextLayerIndex {
  let idx = indexCache.get(textLayer)
  if (!idx) {
    idx = buildTextLayerIndex(textLayer)
    indexCache.set(textLayer, idx)
  }
  return idx
}

/** Resolve a selection endpoint to a text-div index. A `<br>` (blank line / line
 *  break) maps to the NEXT text div so crossing a blank line keeps the range
 *  (instead of nodeToIdx returning -1 and dropping the highlight). */
function nodeToDivIndex(node: Node | null, idx: TextLayerIndex): number {
  if (!node) return -1
  const el =
    node.nodeType === Node.TEXT_NODE
      ? (node.parentElement as HTMLElement | null)
      : (node as HTMLElement | null)
  if (!el) return -1
  const direct = idx.divIndex.get(el)
  if (direct !== undefined) return direct
  if (el.tagName === "BR") {
    let cur = el.nextElementSibling as HTMLElement | null
    while (cur && !idx.divIndex.has(cur))
      cur = cur.nextElementSibling as HTMLElement | null
    if (cur) return idx.divIndex.get(cur)!
    cur = el.previousElementSibling as HTMLElement | null
    while (cur && !idx.divIndex.has(cur))
      cur = cur.previousElementSibling as HTMLElement | null
    return cur ? idx.divIndex.get(cur)! : -1
  }
  return -1
}

/** Map a text-layer selection to char offsets into the page's textContent. */
export function textLayerOffsets(
  textLayer: TextLayer,
  sel: Selection
): { start: number; end: number } | null {
  if (sel.isCollapsed || sel.rangeCount === 0) return null
  const idx = getTextLayerIndex(textLayer)
  if (idx.divIndex.size === 0) return null
  const anchorIdx = nodeToDivIndex(sel.anchorNode, idx)
  const focusIdx = nodeToDivIndex(sel.focusNode, idx)
  if (anchorIdx < 0 || focusIdx < 0) return null
  const startDiv = Math.min(anchorIdx, focusIdx)
  const endDiv = Math.max(anchorIdx, focusIdx)
  const anchorIsBr =
    sel.anchorNode instanceof HTMLElement && sel.anchorNode.tagName === "BR"
  const focusIsBr =
    sel.focusNode instanceof HTMLElement && sel.focusNode.tagName === "BR"
  const startOff = anchorIsBr
    ? 0
    : startDiv === anchorIdx
      ? sel.anchorOffset
      : sel.focusOffset
  const endOff = focusIsBr
    ? 0
    : endDiv === focusIdx
      ? sel.focusOffset
      : sel.anchorOffset
  return {
    start:
      (startDiv > 0 ? idx.cumulative[startDiv] : 0) + Math.max(0, startOff),
    end: (endDiv > 0 ? idx.cumulative[endDiv] : 0) + Math.max(0, endOff)
  }
}

/** Holder-relative rects of the text spans covering [start, end). */
export function textLayerRects(
  textLayer: TextLayer,
  holder: HTMLElement,
  start: number,
  end: number
): PdfRect[] {
  const idx = getTextLayerIndex(textLayer)
  const divs = textLayer.textDivs
  const strs = textLayer.textContentItemsStr
  if (idx.divIndex.size === 0 || end <= start) return []
  const holderRect = holder.getBoundingClientRect()
  const rects: PdfRect[] = []
  // Binary search the first div whose end exceeds `start` (items are contiguous).
  let lo = 0
  let hi = divs.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const divEnd =
      mid + 1 < divs.length ? idx.cumulative[mid + 1] : idx.total
    if (divEnd > start) hi = mid
    else lo = mid + 1
  }
  for (let i = lo; i < divs.length; i++) {
    const len = strs[i]?.length ?? 0
    const divStart = idx.cumulative[i]
    if (divStart >= end) break
    const r = divs[i].getBoundingClientRect()
    if (r.width > 0 && r.height > 0) {
      rects.push({
        x: r.left - holderRect.left,
        y: r.top - holderRect.top,
        w: r.width,
        h: r.height
      })
    }
  }
  return rects
}

/** Union selection rects per line (same vertical band + horizontal adjacency)
 *  into single boxes — removes per-span overlap at CJK/Latin boundaries.
 *  `holder` (viewport rect) converts viewport coords; omit it when the rects
 *  are already holder-relative (textLayerRects output). */
export function mergeRects(
  rects: PdfRect[],
  holder?: DOMRect
): PdfRect[] {
  const norm = holder
    ? rects.map((r) => ({
        x: r.x - holder.left,
        y: r.y - holder.top,
        w: r.w,
        h: r.h
      }))
    : rects.map((r) => ({ ...r }))
  norm.sort((a, b) => a.y - b.y || a.x - b.x)
  const merged: PdfRect[] = []
  for (const r of norm) {
    const last = merged[merged.length - 1]
    // Same line (vertical overlap) + touching/horizontal overlap → union.
    if (
      last &&
      r.y < last.y + last.h &&
      r.x <= last.x + last.w + 1
    ) {
      const x0 = Math.min(last.x, r.x)
      const x1 = Math.max(last.x + last.w, r.x + r.w)
      const y0 = Math.min(last.y, r.y)
      const y1 = Math.max(last.y + last.h, r.y + r.h)
      last.x = x0
      last.y = y0
      last.w = x1 - x0
      last.h = y1 - y0
    } else {
      merged.push({ ...r })
    }
  }
  return merged
}
