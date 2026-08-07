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
    const g = buildMarkGroup(ann({ color: undefined }), () => rectsFor())
    expect(g).not.toBeNull()
    expect(g!.id()).toBe("a1")
    const shape = g!.getChildren()[0] as { attrs: Record<string, unknown> }
    expect(shape.attrs.fill).toBe(MARK_COLOR.highlight)
    expect(shape.attrs.cornerRadius).toBe(2)
  })

  test("frame → stroked rect with a hit-fill (whole interior clickable)", () => {
    const g = buildMarkGroup(
      ann({ kind: "region", type: "frame", rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.1 }] }),
      () => rectsFor()
    )
    const shape = g!.getChildren()[0] as { attrs: Record<string, unknown> }
    expect(shape.attrs.stroke).toBe(MARK_COLOR.frame)
    expect(shape.attrs.strokeWidth).toBe(1.5)
    expect(shape.attrs.fill).toBeTruthy()
  })

  test("underline → bottom strip; strike → vertical-center strip", () => {
    const under = buildMarkGroup(ann({ type: "underline" }), () => rectsFor())!
    const us = under.getChildren()[0] as { attrs: Record<string, unknown> }
    expect(us.attrs.y).toBeCloseTo(20 + 16 - 1.5)
    expect(us.attrs.fill).toBe(MARK_COLOR.underline)

    const strike = buildMarkGroup(ann({ type: "strike" }), () => rectsFor())!
    const ss = strike.getChildren()[0] as { attrs: Record<string, unknown> }
    expect(ss.attrs.y).toBeCloseTo(20 + 8 - 1)
    expect(ss.attrs.fill).toBe(MARK_COLOR.strike)
  })

  test("wavy → a path with the wavy stroke color", () => {
    const g = buildMarkGroup(ann({ type: "wavy" }), () => rectsFor())!
    const p = g.getChildren()[0] as { attrs: Record<string, unknown> }
    expect(p.attrs.stroke).toBe(MARK_COLOR.wavy)
    expect(p.attrs.data).toContain("Q")
  })

  test("returns null when there are no rects", () => {
    expect(buildMarkGroup(ann({}), () => [])).toBeNull()
  })
})
