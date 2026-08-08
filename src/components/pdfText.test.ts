import {
  buildTextLayerIndex,
  extractLines,
  mergeRects,
  scanText,
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

describe("extractLines (hasEOL line splitting)", () => {
  it("splits items into lines at hasEOL boundaries", () => {
    const { full, lines } = extractLines([
      { str: "hello", hasEOL: false },
      { str: " world", hasEOL: true },
      { str: "second", hasEOL: true },
      { str: "third" }
    ])
    expect(full).toBe("hello worldsecondthird")
    expect(lines).toEqual([
      { start: 0, end: 11 },
      { start: 11, end: 17 },
      { start: 17, end: 22 }
    ])
  })
})

describe("scanText (line-unit entries + snippet)", () => {
  const { full, lines } = extractLines([
    { str: "alpha beta alpha", hasEOL: true },
    { str: "gamma delta", hasEOL: true },
    { str: "alphabet" }
  ])

  it("one line with multiple hits = ONE entry (first hit)", () => {
    const { matches, entries } = scanText(full, lines, "alpha", {})
    // "alpha" appears twice on line 1 + once in "alphabet" (line 3).
    expect(matches).toHaveLength(3)
    expect(entries).toHaveLength(2)
    expect(entries[0].lineText).toBe("alpha beta alpha")
    expect(entries[0].hitInLine).toBe(0)
  })

  it("caseSensitive excludes lower-case matches", () => {
    const { matches } = scanText(full, lines, "ALPHA", { caseSensitive: true })
    expect(matches).toHaveLength(0)
    const lower = scanText(full, lines, "alpha", { caseSensitive: false })
    expect(lower.matches.length).toBeGreaterThan(0)
  })

  it("wholeWord excludes matches inside words", () => {
    const { matches } = scanText(full, lines, "alpha", { wholeWord: true })
    // "alphabet" contains alpha but not as a whole word → excluded.
    expect(matches).toHaveLength(2)
  })

  it("snippet: ~10 chars before the hit, ~40 total, trailing ellipsis", () => {
    const longLine = "x".repeat(30) + "KEY" + "y".repeat(40)
    const { entries } = scanText(longLine, [{ start: 0, end: longLine.length }], "KEY", {})
    const e = entries[0]
    expect(e.hitInLine).toBe(30)
    expect(e.snippet.startsWith("x".repeat(10))).toBe(true)
    expect(e.snippet.endsWith("…")).toBe(true)
    expect(e.snippet.length).toBeLessThanOrEqual(41)
  })

  it("no trailing ellipsis when the line ends right after the snippet", () => {
    const short = "prefix KEY tail"
    const { entries } = scanText(short, [{ start: 0, end: short.length }], "KEY", {})
    expect(entries[0].snippet.endsWith("…")).toBe(false)
  })
})
