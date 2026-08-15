import { mergeRectsByLine } from "./merge_rects"

describe("mergeRectsByLine (annotation line-bridging)", () => {
  it("bridges justify word gaps on one line into a single box", () => {
    // The justify fixture's gap line: 4 words with 100px gaps, same line.
    const rects = [
      { x: 0, y: 100, width: 200, height: 20 },
      { x: 305, y: 100, width: 15, height: 20 },
      { x: 425, y: 100, width: 10, height: 20 },
      { x: 540, y: 100, width: 20, height: 20 }
    ]
    const merged = mergeRectsByLine(rects)
    expect(merged).toHaveLength(1)
    expect(merged[0].x).toBe(0)
    expect(merged[0].width).toBe(560)
    expect(merged[0].y).toBe(100)
    expect(merged[0].height).toBe(20)
  })

  it("keeps different lines as separate boxes", () => {
    const rects = [
      { x: 0, y: 100, width: 100, height: 20 },
      { x: 0, y: 160, width: 80, height: 20 },
      { x: 120, y: 160, width: 40, height: 20 }
    ]
    const merged = mergeRectsByLine(rects)
    expect(merged).toHaveLength(2)
    // line 1 = single box; line 2 = one bridged box
    const line2 = merged.find((m) => m.y === 160)!
    expect(line2.width).toBe(160)
  })

  it("merges partially-overlapping em boxes (mixed-font baseline) on one line", () => {
    // CJK em box taller than Latin, both on the same line (y overlap).
    const rects = [
      { x: 0, y: 100, width: 40, height: 20 },
      { x: 44, y: 102, width: 60, height: 24 }
    ]
    const merged = mergeRectsByLine(rects)
    expect(merged).toHaveLength(1)
    expect(merged[0].y).toBe(100)
    expect(merged[0].height).toBe(26)
  })

  it("returns [] for empty input", () => {
    expect(mergeRectsByLine([])).toEqual([])
  })

  it("keeps a single isolated mark as its own box", () => {
    const merged = mergeRectsByLine([{ x: 30, y: 50, width: 10, height: 16 }])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toEqual({ x: 30, y: 50, width: 10, height: 16 })
  })
})
