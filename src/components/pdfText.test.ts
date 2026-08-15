import {
  buildTextLayerIndex,
  caseFoldPreserving,
  extractLines,
  highlightRectsForOffsets,
  scanText,
  textLayerOffsets,
  textLayerRects
} from "./pdfText"

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

describe("caseFoldPreserving / length-changing folds (F2 regression)", () => {
  it("keeps the fold length identical even for İ → i\\u0307", () => {
    const full = "İstanbul 的港口"
    const folded = caseFoldPreserving(full)
    expect(folded.length).toBe(full.length)
    // The dotted capital I is NOT folded (its lowercase expands to 2 code
    // points) — indices stay aligned with the original string.
    expect(folded[0]).toBe("İ")
  })

  it("maps a query hit back onto the ORIGINAL characters", () => {
    // "İl xyz": old toLowerCase folded İ to "i\u0307" (2 units), shifting every
    // later index by +1 — "xyz" hit landed at 5 and highlighted "yz" instead.
    const full = "İl xyz"
    const { matches } = scanText(full, [{ start: 0, end: full.length }], "xyz", {})
    expect(matches).toHaveLength(1)
    const m = matches[0]
    // The preserved fold keeps "xyz" at its true offset 3.
    expect(m.start).toBe(3)
    expect(full.slice(m.start, m.end)).toBe("xyz")
  })

  it("still folds ordinary ASCII case-insensitively", () => {
    const full = "Alpha BETA"
    const { matches } = scanText(full, [{ start: 0, end: full.length }], "alpha", {})
    expect(matches).toHaveLength(1)
    expect(full.slice(matches[0].start, matches[0].end)).toBe("Alpha")
  })
})

describe("highlightRectsForOffsets (line-bridging overlay)", () => {
  // One visual line of words separated by huge "justify" gaps (the fracture
  // trigger). x-layout: word(0..200) space(200..205) is(305..320) space(320..325)
  // a(425..435) space(435..440) gap(540..560), all at y 100..120.
  function makeLine() {
    const holder = document.createElement("div")
    document.body.appendChild(holder)
    const words = [
      "antidisestablishmentarianism",
      " ",
      "is",
      " ",
      "a",
      " ",
      "gap"
    ]
    const spans = words.map((w) => {
      const s = document.createElement("span")
      s.textContent = w
      holder.appendChild(s)
      return s
    })
    const xs = [
      [0, 200],
      [200, 5],
      [305, 15],
      [320, 5],
      [425, 10],
      [435, 5],
      [540, 20]
    ]
    spans.forEach((s, i) => {
      s.getBoundingClientRect = () =>
        ({
          left: xs[i][0],
          top: 100,
          right: xs[i][0] + xs[i][1],
          bottom: 120,
          width: xs[i][1],
          height: 20
        }) as DOMRect
    })
    holder.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 600, bottom: 600, width: 600, height: 600 }) as DOMRect
    const textLayer = { textDivs: spans, textContentItemsStr: words } as any
    return { holder, spans, textLayer }
  }
  const LINE_LEN = "antidisestablishmentarianism is a gap".length

  const realGCR = Range.prototype.getClientRects
  beforeEach(() => {
    // char-proportional rect within the covering span (walks up past <mark>)
    const stub = function (this: Range) {
      const tn = this.startContainer as Text
      const span = tn.parentElement?.closest("span") ?? tn.parentElement
      const r = (span?.getBoundingClientRect?.() as any) as
        | { left: number; top: number; width: number; height: number }
        | undefined
      if (!r || !r.width) return []
      const data = tn.data
      const from = this.startOffset
      const to = this.endOffset
      const w0 = r.width * (data.length ? from / data.length : 0)
      const w1 = r.width * (data.length ? to / data.length : 0)
      return [
        {
          left: r.left + w0,
          top: r.top,
          right: r.left + w1,
          bottom: r.top + r.height,
          width: w1 - w0,
          height: r.height
        }
      ]
    }
    Range.prototype.getClientRects = stub as unknown as typeof Range.prototype.getClientRects
  })
  afterEach(() => {
    Range.prototype.getClientRects = realGCR
  })

  it("merges every covered word on a line into ONE continuous box (justify gaps bridged)", () => {
    const { holder, textLayer } = makeLine()
    const rects = highlightRectsForOffsets(textLayer, holder, 0, LINE_LEN)
    expect(rects).toHaveLength(1)
    expect(rects[0].x).toBeCloseTo(0)
    expect(rects[0].w).toBeCloseTo(560)
    expect(rects[0].y).toBeCloseTo(100)
    expect(rects[0].h).toBeCloseTo(20)
  })

  it("covers only the selected chars when the range starts/ends mid-span", () => {
    const { holder, textLayer } = makeLine()
    // "antidisestablishmentarianism " (28+1) = 29 chars; "is" = offsets [29, 31)
    const rects = highlightRectsForOffsets(textLayer, holder, 29, 31)
    expect(rects).toHaveLength(1)
    expect(rects[0].x).toBeCloseTo(305)
    expect(rects[0].w).toBeCloseTo(15)
  })

  it("keeps separate lines as separate boxes", () => {
    const { holder, spans, textLayer } = makeLine()
    const extra = document.createElement("span")
    extra.textContent = "secondline"
    holder.appendChild(extra)
    extra.getBoundingClientRect = () =>
      ({ left: 0, top: 160, right: 80, bottom: 180, width: 80, height: 20 }) as DOMRect
    const tl2 = {
      textDivs: [...spans, extra],
      textContentItemsStr: [...spans.map((s) => s.textContent!), "secondline"]
    } as any
    const rects = highlightRectsForOffsets(tl2, holder, 0, LINE_LEN + 11)
    expect(rects).toHaveLength(2)
  })

  it("survives a web-highlighter <mark> wrap (span text split into nested nodes)", () => {
    const { holder, spans, textLayer } = makeLine()
    const isSpan = spans[2]
    const mark = document.createElement("mark")
    mark.textContent = isSpan.textContent!
    isSpan.textContent = ""
    isSpan.appendChild(mark)
    const rects = highlightRectsForOffsets(textLayer, holder, 29, 31)
    expect(rects).toHaveLength(1)
    expect(rects[0].x).toBeCloseTo(305)
    expect(rects[0].w).toBeCloseTo(15)
  })
})
