import { mergeRects } from "./pdfText"

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
