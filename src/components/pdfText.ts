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

function cumulativeLengths(strs: string[]): number[] {
  const cum: number[] = []
  let acc = 0
  for (const s of strs) {
    acc += s.length
    cum.push(acc)
  }
  return cum
}

/** Map a text-layer selection to char offsets into the page's textContent. */
export function textLayerOffsets(
  textLayer: TextLayer,
  sel: Selection
): { start: number; end: number } | null {
  if (sel.isCollapsed || sel.rangeCount === 0) return null
  const divs = textLayer.textDivs
  const strs = textLayer.textContentItemsStr
  if (divs.length === 0) return null
  const cum = cumulativeLengths(strs)

  const nodeToIdx = (node: Node | null): number => {
    if (!node) return -1
    const el =
      node.nodeType === Node.TEXT_NODE
        ? (node.parentElement as HTMLElement | null)
        : (node as HTMLElement | null)
    return el ? divs.indexOf(el) : -1
  }

  const anchorIdx = nodeToIdx(sel.anchorNode)
  const focusIdx = nodeToIdx(sel.focusNode)
  if (anchorIdx < 0 || focusIdx < 0) return null

  const startDiv = Math.min(anchorIdx, focusIdx)
  const endDiv = Math.max(anchorIdx, focusIdx)
  const startOff = startDiv === anchorIdx ? sel.anchorOffset : sel.focusOffset
  const endOff = endDiv === focusIdx ? sel.focusOffset : sel.anchorOffset

  return {
    start: (startDiv > 0 ? cum[startDiv - 1] : 0) + Math.max(0, startOff),
    end: (endDiv > 0 ? cum[endDiv - 1] : 0) + Math.max(0, endOff)
  }
}

/** Holder-relative rects of the text spans covering [start, end). */
export function textLayerRects(
  textLayer: TextLayer,
  holder: HTMLElement,
  start: number,
  end: number
): PdfRect[] {
  const divs = textLayer.textDivs
  const strs = textLayer.textContentItemsStr
  if (divs.length === 0 || end <= start) return []
  const cum = cumulativeLengths(strs)
  const holderRect = holder.getBoundingClientRect()

  const rects: PdfRect[] = []
  let acc = 0
  for (let i = 0; i < divs.length; i++) {
    const len = strs[i]?.length ?? 0
    const divStart = acc
    const divEnd = acc + len
    acc = divEnd
    if (divEnd <= start) continue
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
