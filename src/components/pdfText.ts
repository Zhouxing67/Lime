import * as pdfjsLib from "pdfjs-dist"
import type { PdfOutlineItem } from "../types"

/** Resolve an outline item's `.dest` to a 1-based page number. Only named
 *  (string) dests need `getDestination`; array dests carry the page ref already. */
export async function outlinePageNumber(
  doc: pdfjsLib.PDFDocumentProxy,
  item: PdfOutlineItem
): Promise<number | null> {
  try {
    let dest = item.dest
    if (typeof dest === "string") {
      dest = (await doc.getDestination(dest)) ?? undefined
    }
    if (Array.isArray(dest) && dest.length > 0) {
      const pageRef = dest[0]
      if (pageRef) {
        return (await doc.getPageIndex(pageRef)) + 1
      }
    }
  } catch {}
  return null
}

export interface PdfSearchMatch {
  page: number
  start: number
  end: number
}

type TextLayer = InstanceType<typeof pdfjsLib.TextLayer>

export interface PdfSearchEntry {
  page: number
  /** The full text line containing the first hit. */
  lineText: string
  /** Display snippet: ~10 chars before the hit, total ~40, trailing "…". */
  snippet: string
  /** Hit offsets into the page's concatenated text (for the PDF highlight). */
  start: number
  end: number
  /** Hit position within lineText (for the panel's bold highlight). */
  hitInLine: number
}

export interface PdfSearchOptions {
  caseSensitive?: boolean
  wholeWord?: boolean
}

export interface PdfSearchResult {
  /** ALL hits (for the PDF highlight + navigation). */
  matches: PdfSearchMatch[]
  /** One entry per line-with-hits (the panel list unit). */
  entries: PdfSearchEntry[]
}

const WORD_CHAR = /[A-Za-z0-9\u4e00-\u9fff]/

export interface TextLine {
  start: number
  end: number
}

/** Split text-content items into the concatenated string + line boundaries
 *  (a hasEOL item ends a line). Offsets in `full` are the SAME coordinate
 *  space as textLayerRects. */
export function extractLines(
  items: { str?: string; hasEOL?: boolean }[]
): { full: string; lines: TextLine[] } {
  let pos = 0
  const lines: TextLine[] = []
  let lineStart = 0
  for (const item of items) {
    const len = item.str?.length ?? 0
    if (item.hasEOL) {
      lines.push({ start: lineStart, end: pos + len })
      lineStart = pos + len
    }
    pos += len
  }
  if (lineStart < pos) lines.push({ start: lineStart, end: pos })
  return { full: items.map((i) => i.str ?? "").join(""), lines }
}

/** Pure per-page scan: all hits + one line-entry per line-with-hits. */
export function scanText(
  full: string,
  lines: TextLine[],
  q: string,
  opts: PdfSearchOptions = {}
): { matches: PdfSearchMatch[]; entries: PdfSearchEntry[] } {
  const matches: PdfSearchMatch[] = []
  const entries: PdfSearchEntry[] = []
  const coveredLines = new Set<number>()
  const needle = opts.caseSensitive ? q : q.toLowerCase()
  const haystack = opts.caseSensitive ? full : full.toLowerCase()
  // Hits scan in ascending order → a forward line pointer is O(lines + hits).
  let linePtr = 0
  let idx = haystack.indexOf(needle)
  while (idx >= 0) {
    const end = idx + needle.length
    while (linePtr < lines.length && lines[linePtr].end <= idx) linePtr++
    const lineIdx =
      linePtr < lines.length && lines[linePtr].start <= idx ? linePtr : -1
    if (opts.wholeWord) {
      // Line breaks act as separators (hasEOL concatenates without a space).
      const line = lineIdx >= 0 ? lines[lineIdx] : undefined
      const before = line && idx === line.start ? "" : idx > 0 ? haystack[idx - 1] : ""
      const after = line && end === line.end ? "" : end < haystack.length ? haystack[end] : ""
      if (WORD_CHAR.test(before) || WORD_CHAR.test(after)) {
        idx = haystack.indexOf(needle, idx + 1)
        continue
      }
    }
    matches.push({ page: 0, start: idx, end })
    if (lineIdx >= 0 && !coveredLines.has(lineIdx)) {
      coveredLines.add(lineIdx)
      const line = lines[lineIdx]
      const lineText = full.slice(line.start, line.end)
      const hitInLine = idx - line.start
      const from = Math.max(0, hitInLine - 10)
      let snippet = lineText.slice(from, from + 40)
      if (from + 40 < lineText.length) snippet += "…"
      entries.push({ page: 0, lineText, snippet, start: idx, end, hitInLine })
    }
    idx = haystack.indexOf(needle, idx + 1)
  }
  return { matches, entries }
}

/** Text search with case/whole-word options. Offsets are into each page's
 *  concatenated textContent (same coordinate space as textLayerRects). The
 *  result unit for the panel is a TEXT LINE: one line with several hits counts
 *  as ONE entry (first hit), while `matches` still carries every hit for the
 *  PDF highlight. Snippet: ~10 chars before the first hit, ~40 total, "…". */
export async function searchPdfText(
  doc: pdfjsLib.PDFDocumentProxy,
  query: string,
  opts: PdfSearchOptions = {},
  maxMatches = 500,
  signal?: AbortSignal
): Promise<PdfSearchResult> {
  const q = opts.caseSensitive ? query.trim() : query.trim().toLowerCase()
  if (!q) return { matches: [], entries: [] }
  const matches: PdfSearchMatch[] = []
  const entries: PdfSearchEntry[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    if (signal?.aborted) return { matches, entries }
    const page = await doc.getPage(p)
    // disableNormalization MUST match the TextLayer's streamTextContent —
    // otherwise ligatures/CJK substitution drift the offsets and the flash
    // highlights the wrong text.
    const tc = await page.getTextContent({ disableNormalization: true })
    const items = tc.items as { str?: string; hasEOL?: boolean }[]
    const { full, lines } = extractLines(items)
    const res = scanText(full, lines, q, opts)
    for (const m of res.matches) {
      if (matches.length >= maxMatches) break
      matches.push({ ...m, page: p })
    }
    for (const e of res.entries) {
      entries.push({ ...e, page: p })
    }
    if (matches.length >= maxMatches) break
  }
  return { matches, entries }
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

/** The rendered text spans of a text layer — the pdf.js TextLayer exposes
 *  `textDivs`; the official TextLayerBuilder only exposes its `.div`, so the
 *  spans are derived from the DOM (the builder's div holds the rendered spans). */
function getTextDivs(textLayer: any): HTMLElement[] {
  if (textLayer?.textDivs && textLayer.textDivs.length > 0) {
    return textLayer.textDivs
  }
  const div = textLayer?.div as HTMLElement | undefined
  if (div) {
    return Array.from(
      div.querySelectorAll(":scope > span, :scope .markedContent span")
    ).filter(
      (d) => d.textContent && d.textContent.length > 0
    ) as HTMLElement[]
  }
  return []
}

/** Cached per-render index (WeakMap → auto-invalidated when the text layer is
 *  re-rendered/unmounted, covering zoom/rotate + lifecycle). */
const indexCache = new WeakMap<object, TextLayerIndex>()

export function buildTextLayerIndex(textLayer: any): TextLayerIndex {
  const divs = getTextDivs(textLayer)
  const divIndex = new Map<HTMLElement, number>()
  const cumulative: number[] = []
  let acc = 0
  for (let i = 0; i < divs.length; i++) {
    divIndex.set(divs[i], i)
    cumulative.push(acc)
    acc += divs[i].textContent?.length ?? 0
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
  // Walk UP the ancestors: the selection endpoint can land inside a non-textDiv
  // wrapper (a marked-content / link span that contains the text div, or a
  // nested span) — find the nearest textDiv on the way to the layer root.
  let cur = el.parentElement as HTMLElement | null
  while (cur) {
    const found = idx.divIndex.get(cur)
    if (found !== undefined) return found
    cur = cur.parentElement as HTMLElement | null
  }
  if (el.tagName === "BR") {
    let next = el.nextElementSibling as HTMLElement | null
    while (next && !idx.divIndex.has(next))
      next = next.nextElementSibling as HTMLElement | null
    if (next) return idx.divIndex.get(next)!
    next = el.previousElementSibling as HTMLElement | null
    while (next && !idx.divIndex.has(next))
      next = next.previousElementSibling as HTMLElement | null
    return next ? idx.divIndex.get(next)! : -1
  }
  return -1
}

/** Map a text-layer selection to char offsets into the page's textContent. */
export function textLayerOffsets(
  textLayer: any,
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

/** Index of the first div whose char range covers `offset` (items contiguous). */
function findDivAtOffset(idx: TextLayerIndex, offset: number): number {
  const n = idx.divIndex.size
  if (n === 0) return -1
  const o = Math.max(0, Math.min(offset, idx.total - 1))
  let lo = 0
  let hi = n - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const divEnd = mid + 1 < n ? idx.cumulative[mid + 1] : idx.total
    if (divEnd > o) hi = mid
    else lo = mid + 1
  }
  return lo
}

/** Holder-relative rects of the text spans covering [start, end). The rects are
 *  CHAR-PRECISE: a DOM Range over the boundary text nodes + getClientRects()
 *  returns exactly the selected characters (same geometry as the native
 *  selection highlight) — NOT whole-div boxes, which overshoot both ends when
 *  a selection starts/ends mid-span and carry the full line box vertically. */
export function textLayerRects(
  textLayer: any,
  holder: HTMLElement,
  start: number,
  end: number
): PdfRect[] {
  const idx = getTextLayerIndex(textLayer)
  const divs = getTextDivs(textLayer)
  if (idx.divIndex.size === 0 || end <= start) return []
  const holderRect = holder.getBoundingClientRect()
  // The Konva canvas + all Lime overlays are `inset: 0` inside the holder —
  // i.e. anchored to the holder's PADDING box. getBoundingClientRect is the
  // BORDER box, and pdf.js gives every .page a 9px transparent border
  // (--page-border: 9px solid transparent) — rects must be relative to the
  // padding-box origin or the marks shift by the border width (~8.7px
  // down-right, the reported "横向偏 + 纵向偏").
  const originX = holderRect.left + holder.clientLeft
  const originY = holderRect.top + holder.clientTop
  const startDiv = findDivAtOffset(idx, start)
  const endDiv = findDivAtOffset(idx, end - 1)
  if (startDiv < 0 || endDiv < 0) return []
  // Build rects from the SPAN boxes (tight glyph boxes — reliable), not from
  // Range.getClientRects() which on Edge returns inflated line boxes, fails to
  // clip boundary chars inside white-space:pre+scaleX spans, and mis-matches
  // lines. Boundary chars are clipped via canvas text measurement instead.
  const rects: PdfRect[] = []
  for (let i = startDiv; i <= endDiv; i++) {
    const r = divs[i].getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) continue
    const dStart = idx.cumulative[i]
    const dEnd = i + 1 < divs.length ? idx.cumulative[i + 1] : idx.total
    let rect: PdfRect = {
      x: r.left - originX,
      y: r.top - originY,
      w: r.width,
      h: r.height
    }
    if (i === startDiv) {
      rect = clipDivText(divs[i], rect, Math.max(0, start - dStart), Infinity)
    }
    if (i === endDiv) {
      rect = clipDivText(divs[i], rect, 0, Math.max(0, end - dStart))
    }
    rects.push(rect)
  }
  return mergeRectsSameLine(rects)
}

let measureCanvas: HTMLCanvasElement | null = null

/** Width of `text` rendered in `font` via canvas measurement (falls back to
 *  0 when the 2d context is unavailable — the caller then skips clipping). */
function textWidth(text: string, font: string): number {
  if (!measureCanvas) measureCanvas = document.createElement("canvas")
  const ctx = measureCanvas.getContext("2d")
  if (!ctx) return 0
  ctx.font = font
  return ctx.measureText(text).width
}

/** Clip a span's rect horizontally to keep chars [from, to) of the span's text
 *  (Infinity to = keep to the end). The span's box is the tight glyph box; the
 *  boundary x is computed by measuring the kept fraction's natural width and
 *  scaling it to the box width. */
function clipDivText(
  div: HTMLElement,
  rect: PdfRect,
  from: number,
  to: number
): PdfRect {
  const text = div.textContent ?? ""
  if (!text) return rect
  const font = getComputedStyle(div).font
  const full = textWidth(text, font)
  if (full <= 0) return rect
  const fromF = Math.max(0, Math.min(from, text.length))
  const toF = Math.min(to, text.length)
  if (fromF > 0) {
    const f = textWidth(text.slice(0, fromF), font) / full
    rect.x += f * rect.w
    rect.w -= f * rect.w
  }
  if (toF < text.length) {
    const f = textWidth(text.slice(toF), font) / full
    rect.w -= f * rect.w
  }
  return rect
}

/** Merge rects on the SAME line (tops within 6px — mixed-font fragments on one
 *  line differ by a few px) into one box. NEVER merges across lines (adjacent
 *  lines are a full line advance apart). */
function mergeRectsSameLine(rects: PdfRect[]): PdfRect[] {
  if (rects.length === 0) return rects
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x)
  const out: PdfRect[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && Math.abs(r.y - last.y) < 6 && r.x <= last.x + last.w + 1) {
      last.x = Math.min(last.x, r.x)
      last.y = Math.min(last.y, r.y)
      last.w = Math.max(last.x + last.w, r.x + r.w) - last.x
      last.h = Math.max(last.y + last.h, r.y + r.h) - last.y
    } else {
      out.push({ ...r })
    }
  }
  return out
}

/** Clip each rect's height to the underlying span's GLYPH box and merge rects
 *  on the SAME line into one box. Range.getClientRects() returns the full LINE
 *  box (font leading inflates it past the line-to-line advance), so adjacent
 *  lines' rects overlap vertically and a plain overlap-based merge (mergeRects)
 *  collapses whole paragraphs into one giant block — which broke underline
 *  (pushed to the merged bottom) and strike (one line at the merged middle).
 *  The span's own getBoundingClientRect is the tight glyph box; clipping to it
 *  stops the bleed into the next line AND keeps lines from merging. */
/** Union selection rects per line (same vertical band + horizontal adjacency)
 *  into single boxes — removes per-span overlap at CJK/Latin boundaries.
 *  `holder` (viewport rect) converts viewport coords; omit it when the rects
 *  are already holder-relative (textLayerRects output). */
export function mergeRects(
  rects: PdfRect[],
  holder?: DOMRect,
  gapTolerance = 1
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
    if (r.w <= 0 || r.h <= 0) continue
    const last = merged[merged.length - 1]
    // Same line (vertical overlap) + touching/nearby horizontally → union.
    if (
      last &&
      r.y < last.y + last.h &&
      r.x <= last.x + last.w + gapTolerance
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

/** Char offsets → a DOM Range over the text layer's spans (the reverse of
 *  textLayerOffsets). Used to feed a search match's offsets into the
 *  native getClientRects highlight. */
export function offsetsToRange(
  textLayer: any,
  start: number,
  end: number
): Range | null {
  if (start >= end) return null
  const idx = getTextLayerIndex(textLayer)
  const divs = getTextDivs(textLayer)
  const startDiv = findDivAtOffset(idx, start)
  const endDiv = findDivAtOffset(idx, Math.max(start, end - 1))
  if (startDiv < 0 || endDiv < 0) return null
  const startNode = divs[startDiv]?.firstChild
  const endNode = divs[endDiv]?.firstChild
  if (
    !startNode ||
    !endNode ||
    startNode.nodeType !== Node.TEXT_NODE ||
    endNode.nodeType !== Node.TEXT_NODE
  ) {
    return null
  }
  const s = startDiv > 0 ? idx.cumulative[startDiv] : 0
  const e = endDiv > 0 ? idx.cumulative[endDiv] : 0
  const range = document.createRange()
  const startText = startNode as Text
  const endText = endNode as Text
  try {
    range.setStart(startText, Math.min(Math.max(0, start - s), startText.length))
    range.setEnd(endText, Math.min(Math.max(0, end - e), endText.length))
  } catch {
    return null
  }
  return range
}
