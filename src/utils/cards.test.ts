import type { PdfAnnotation, PdfCard } from "../types"
import { sortPdfCards } from "./cards"

function card(id: string, annotationId: string, page: number, pdfOrder: number): PdfCard {
  return {
    id,
    pdfId: "p1",
    page,
    kind: "text",
    type: "highlight",
    annotationId,
    pdfOrder,
    createdAt: 1
  }
}

function ann(id: string, page: number, pos?: { x: number; y: number }, startOffset?: number): PdfAnnotation {
  return {
    id,
    pdfId: "p1",
    page,
    kind: "text",
    type: "highlight",
    startOffset,
    endOffset: (startOffset ?? 0) + 5,
    text: "x",
    pos,
    createdAt: 1
  }
}

describe("sortPdfCards", () => {
  test("single mode sorts by pdfOrder (page then offset)", () => {
    const cards = [card("a", "a", 2, 2e6), card("b", "b", 1, 1e6 + 5), card("c", "c", 1, 1e6)]
    const sorted = sortPdfCards(cards, [], "single")
    expect(sorted.map((c) => c.id)).toEqual(["c", "b", "a"])
  })

  test("two mode: left column fully precedes right column regardless of y", () => {
    const cards = [
      card("r-top", "r-top", 1, 1e6 + 1),
      card("l-bottom", "l-bottom", 1, 1e6 + 2)
    ]
    const anns = [
      ann("r-top", 1, { x: 0.75, y: 0.1 }),
      ann("l-bottom", 1, { x: 0.25, y: 0.9 })
    ]
    // Single mode: r-top (y 0.1) sorts first — wrong for two columns.
    expect(sortPdfCards(cards, anns, "single").map((c) => c.id)).toEqual([
      "r-top",
      "l-bottom"
    ])
    // Two mode: the left-column annotation (even though lower on the page)
    // must come first.
    expect(sortPdfCards(cards, anns, "two").map((c) => c.id)).toEqual([
      "l-bottom",
      "r-top"
    ])
  })

  test("two mode: within a column sorts top-to-bottom by y", () => {
    const cards = [
      card("l-top", "l-top", 1, 1e6),
      card("l-mid", "l-mid", 1, 1e6),
      card("r-low", "r-low", 1, 1e6)
    ]
    const anns = [
      ann("l-top", 1, { x: 0.1, y: 0.2 }),
      ann("l-mid", 1, { x: 0.1, y: 0.6 }),
      ann("r-low", 1, { x: 0.6, y: 0.9 })
    ]
    expect(sortPdfCards(cards, anns, "two").map((c) => c.id)).toEqual([
      "l-top",
      "l-mid",
      "r-low"
    ])
  })


  test("time mode: earliest annotation first", () => {
    const cards = [
      card("new", "new", 1, 1e6),
      card("old", "old", 1, 1e6),
      card("mid", "mid", 1, 1e6)
    ]
    const anns = [
      ann("old", 1, undefined, 0),
      ann("mid", 1, undefined, 0),
      ann("new", 1, undefined, 0)
    ]
    ;(anns[0] as { createdAt: number }).createdAt = 100
    ;(anns[1] as { createdAt: number }).createdAt = 200
    ;(anns[2] as { createdAt: number }).createdAt = 300
    expect(sortPdfCards(cards, anns, "time").map((c) => c.id)).toEqual([
      "old",
      "mid",
      "new"
    ])
  })

  test("two mode: annotations without pos degrade to single-column order", () => {
    const cards = [card("b", "b", 1, 1e6 + 9), card("a", "a", 1, 1e6)]
    const anns = [ann("a", 1), ann("b", 1)]
    expect(sortPdfCards(cards, anns, "two").map((c) => c.id)).toEqual(["a", "b"])
  })
})
