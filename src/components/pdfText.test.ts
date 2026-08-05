import {
  buildTextLayerIndex,
  mergeRects,
  textLayerOffsets,
  textLayerRects
} from "./pdfText"

const holder = { left: 100, top: 200 } as DOMRect

describe("mergeRects (unified selection highlight)", () => {
  it("unions overlapping same-line rects (CJK/Latin boundary)", () => {
    // Two adjacent/overlapping rects on the same line.
    const rects = [
      { x: 120, y: 220, w: 40, h: 14 }, // Latin "ab"
      { x: 156, y: 220, w: 60, h: 14 } // CJK "你好" (overlaps the Latin box)
    ]
    const merged = mergeRects(rects, holder)
    expect(merged).toHaveLength(1)
    expect(merged[0].x).toBeCloseTo(20)
    expect(merged[0].w).toBeCloseTo(96)
  })

  it("keeps different-line rects separate", () => {
    const rects = [
      { x: 120, y: 220, w: 40, h: 14 },
      { x: 120, y: 260, w: 40, h: 14 }
    ]
    const merged = mergeRects(rects, holder)
    expect(merged).toHaveLength(2)
  })

  it("merges touching rects (no gap)", () => {
    const rects = [
      { x: 120, y: 220, w: 30, h: 14 },
      { x: 150, y: 220, w: 30, h: 14 }
    ]
    const merged = mergeRects(rects, holder)
    expect(merged).toHaveLength(1)
    expect(merged[0].w).toBeCloseTo(60)
  })
})

describe("textLayer index + offsets + rects", () => {
  function makeLayer() {
    const holder = document.createElement("div")
    document.body.appendChild(holder)
    const d1 = document.createElement("div")
    d1.textContent = "abc"
    const br = document.createElement("br")
    const d2 = document.createElement("div")
    d2.textContent = "def"
    const d3 = document.createElement("div")
    d3.textContent = "ghi"
    holder.append(d1, br, d2, d3)
    const textLayer = {
      textDivs: [d1, d2, d3],
      textContentItemsStr: ["abc", "def", "ghi"]
    } as any
    return { holder, d1, d2, d3, br, textLayer }
  }
  const fakeSel = (o: any) =>
    ({ isCollapsed: false, rangeCount: 1, ...o }) as unknown as Selection

  it("builds the div→index map + cumulative offsets", () => {
    const { textLayer } = makeLayer()
    const idx = buildTextLayerIndex(textLayer)
    expect(idx.divIndex.size).toBe(3)
    expect(idx.cumulative).toEqual([0, 3, 6])
    expect(idx.total).toBe(9)
  })

  it("maps a selection ending on a <br> to the next line (blank-line crossing)", () => {
    const { d1, br, textLayer } = makeLayer()
    const offs = textLayerOffsets(
      textLayer,
      fakeSel({ anchorNode: d1.firstChild, anchorOffset: 0, focusNode: br, focusOffset: 0 })
    )
    expect(offs).toEqual({ start: 0, end: 3 })
  })

  it("rects cover only the selected divs (binary search)", () => {
    const { holder, d1, d2, d3, textLayer } = makeLayer()
    const box = (x: number) => ({ left: x, top: 0, width: 30, height: 12 })
    d1.getBoundingClientRect = () => box(0) as any
    d2.getBoundingClientRect = () => box(30) as any
    d3.getBoundingClientRect = () => box(60) as any
    holder.getBoundingClientRect = () => box(0) as any
    const rects = textLayerRects(textLayer, holder, 3, 6) // "def"
    expect(rects).toHaveLength(1)
    expect(rects[0].x).toBeCloseTo(30)
  })
})
