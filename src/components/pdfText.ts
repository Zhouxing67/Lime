import * as pdfjsLib from "pdfjs-dist"

type TextLayer = InstanceType<typeof pdfjsLib.TextLayer>

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
