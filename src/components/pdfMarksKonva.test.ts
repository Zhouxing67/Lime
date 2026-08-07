import { buildMarkGroup, markSignature } from "./pdfMarksKonva"
import { MARK_COLOR } from "./pdfTheme"
import type { PdfAnnotation } from "../types"

const ann = (over: Partial<PdfAnnotation>): PdfAnnotation => ({
  id: "a1",
  pdfId: "p",
  page: 1,
  kind: "text",
  type: "highlight",
  startOffset: 0,
  endOffset: 10,
  text: "quote",
  cardId: "c1",
  createdAt: 1,
  ...over
})

const rectsFor = () => [{ x: 10, y: 20, w: 100, h: 16 }]

describe("markSignature", () => {
  test("changes when geometry/type/color change, stable otherwise", () => {
    const base = ann({})
    expect(markSignature(base)).toBe(markSignature(ann({})))
    expect(markSignature(base)).not.toBe(markSignature(ann({ type: "frame" })))
    expect(markSignature(base)).not.toBe(
      markSignature(ann({ startOffset: 5 }))
    )
    expect(markSignature(base)).not.toBe(
      markSignature(ann({ color: "#abc" }))
    )
    expect(markSignature(ann({ kind: "region", rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.1 }] }))).toBe(
      markSignature(ann({ kind: "region", rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.1 }] }))
    )
  })
})

describe("buildMarkGroup", () => {
  test("highlight → one filled rect with the mark color", () => {
    const g = buildMarkGroup(ann({ color: undefined }), () => rectsFor(), { w: 800, h: 600 })
    expect(g).not.toBeNull()
    expect(g!.id()).toBe("a1")
    const shape = g!.getChildren()[0] as { attrs: Record<string, unknown> }
    expect(shape.attrs.fill).toBe(MARK_COLOR.highlight)
    expect(shape.attrs.cornerRadius).toBe(2)
  })

  test("frame → stroked rect with a hit-fill (whole interior clickable)", () => {
    const g = buildMarkGroup(
      ann({ kind: "region", type: "frame", rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.1 }] }),
      () => rectsFor(),
      { w: 800, h: 600 }
    )
    const shape = g!.getChildren()[0] as { attrs: Record<string, unknown> }
    expect(shape.attrs.stroke).toBe(MARK_COLOR.frame)
    expect(shape.attrs.strokeWidth).toBe(1.5)
    expect(shape.attrs.fill).toBeTruthy()
  })

  test("underline → bottom strip; strike → vertical-center strip", () => {
    const under = buildMarkGroup(ann({ type: "underline" }), () => rectsFor(), { w: 800, h: 600 })!
    // children[0] = invisible full-row hit rect; children[1] = the visible strip
    const us = under.getChildren()[1] as { attrs: Record<string, unknown> }
    expect(us.attrs.y).toBeCloseTo(20 + 16 - 1.5)
    expect(us.attrs.fill).toBe(MARK_COLOR.underline)
    const underHit = under.getChildren()[0] as { attrs: Record<string, unknown> }
    expect(underHit.attrs.opacity).toBe(0)
    expect(underHit.attrs.height).toBeCloseTo(16)

    const strike = buildMarkGroup(ann({ type: "strike" }), () => rectsFor(), { w: 800, h: 600 })!
    const ss = strike.getChildren()[1] as { attrs: Record<string, unknown> }
    expect(ss.attrs.y).toBeCloseTo(20 + 8 - 1)
    expect(ss.attrs.fill).toBe(MARK_COLOR.strike)
  })

  test("wavy → a path with the wavy stroke color", () => {
    const g = buildMarkGroup(ann({ type: "wavy" }), () => rectsFor(), { w: 800, h: 600 })!
    const p = g.getChildren()[1] as { attrs: Record<string, unknown> }
    expect(p.attrs.stroke).toBe(MARK_COLOR.wavy)
    expect(p.attrs.data).toContain("Q")
    const hit = g.getChildren()[0] as { attrs: Record<string, unknown> }
    expect(hit.attrs.opacity).toBe(0)
  })


  test("freehand → a thin line along the path; free-highlight → thick line", () => {
    const path = [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }, { x: 0.3, y: 0.15 }]
    const rects = [{ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }]
    const free = buildMarkGroup(
      ann({ kind: "region", type: "freehand", path, rects }),
      () => [{ x: 80, y: 60, w: 160, h: 60 }],
      { w: 800, h: 600 }
    )!
    const line = free.getChildren()[0] as unknown as { attrs: { points: number[]; strokeWidth: number } }
    expect(line.attrs.points[0]).toBeCloseTo(80)
    expect(line.attrs.points[1]).toBeCloseTo(60)
    expect(line.attrs.strokeWidth).toBe(2)

    const hl = buildMarkGroup(
      ann({ kind: "region", type: "free-highlight", path, rects }),
      () => [{ x: 80, y: 60, w: 160, h: 60 }],
      { w: 800, h: 600 }
    )!
    const hline = hl.getChildren()[0] as unknown as { attrs: { strokeWidth: number } }
    expect(hline.attrs.strokeWidth).toBe(14)
  })

  test("freetext → a stroked box (text is a DOM overlay)", () => {
    const g = buildMarkGroup(
      ann({ kind: "region", type: "freetext", text: "hi", rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.1 }] }),
      () => rectsFor(),
      { w: 800, h: 600 }
    )!
    const box = g.getChildren()[0] as unknown as { attrs: { stroke: string } }
    expect(box.attrs.stroke).toBe(MARK_COLOR.freetext)
  })

  test("signature includes path + freetext text", () => {
    expect(markSignature(ann({ kind: "region", type: "freehand", path: [{ x: 0.1, y: 0.2 }], rects: [] }))).not.toBe(
      markSignature(ann({ kind: "region", type: "freehand", path: [{ x: 0.9, y: 0.8 }], rects: [] }))
    )
    expect(markSignature(ann({ kind: "region", type: "freetext", text: "a", rects: [] }))).not.toBe(
      markSignature(ann({ kind: "region", type: "freetext", text: "b", rects: [] }))
    )
  })

  test("returns null when there are no rects", () => {
    expect(buildMarkGroup(ann({}), () => [], { w: 800, h: 600 })).toBeNull()
  })
})

