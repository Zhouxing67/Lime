import { annotationGeometry } from "./geometry"

describe("annotationGeometry", () => {
  const vp = { width: 612, height: 792, scale: 1.5 }

  const store = {
    pageNumber: 3,
    konvaClientRect: { x: 100, y: 200, width: 40, height: 30 },
    konvaString: ""
  }

  it("normalizes the clientRect center + bbox to 0-1 page coordinates", () => {
    const g = annotationGeometry(store, vp)
    // sx = vp.scale / vp.width = 1.5/612 = 1/408 (page width in PDF units)
    const sx = vp.scale / vp.width
    const sy = vp.scale / vp.height
    expect(g.pos).toEqual({
      x: (100 + 40 / 2) * sx,
      y: (200 + 30 / 2) * sy
    })
    expect(g.rects).toEqual([
      { x: 100 * sx, y: 200 * sy, w: 40 * sx, h: 30 * sy }
    ])
  })

  it("is SCALE-INVARIANT — a zoomed viewport yields identical normalized geometry", () => {
    const a = annotationGeometry(store, { width: 612, height: 792, scale: 1.5 })
    const b = annotationGeometry(store, { width: 1224, height: 1584, scale: 3 })
    const c = annotationGeometry(store, { width: 306, height: 396, scale: 0.75 })
    expect(b).toEqual(a)
    expect(c).toEqual(a)
  })

  it("extracts every stroke Line from the Konva serialization", () => {
    const multiStroke = {
      ...store,
      konvaString: JSON.stringify({
        className: "Group",
        children: [
          { className: "Line", attrs: { points: [0, 0, 10, 0, 10, 10] } },
          { className: "Line", attrs: { points: [20, 20, 30, 20] } },
          { className: "Rect", attrs: { x: 1, y: 1 } }
        ]
      })
    }
    const g = annotationGeometry(multiStroke, vp)
    const sx = vp.scale / vp.width
    const sy = vp.scale / vp.height
    expect(g.paths).toHaveLength(2)
    // multi-stroke → path is undefined (paths carries every stroke)
    expect(g.path).toBeUndefined()
    expect(g.paths![0]).toEqual([
      { x: 0, y: 0 },
      { x: 10 * sx, y: 0 },
      { x: 10 * sx, y: 10 * sy }
    ])
  })

  it("a single stroke also populates path", () => {
    const single = {
      ...store,
      konvaString: JSON.stringify({
        className: "Group",
        children: [{ className: "Line", attrs: { points: [0, 0, 10, 0] } }]
      })
    }
    const g = annotationGeometry(single, vp)
    expect(g.paths).toHaveLength(1)
    expect(g.path).toEqual(g.paths![0])
  })

  it("drops degenerate strokes (fewer than 4 points) and bad JSON", () => {
    const g = annotationGeometry(
      {
        ...store,
        konvaString: JSON.stringify({
          className: "Group",
          children: [
            { className: "Line", attrs: { points: [1, 2] } },
            { className: "Rect", attrs: { x: 1 } }
          ]
        })
      },
      vp
    )
    expect(g.path).toBeUndefined()
    expect(g.paths).toBeUndefined()

    const bad = annotationGeometry({ ...store, konvaString: "{not json" }, vp)
    expect(bad.path).toBeUndefined()
    expect(bad.rects).toBeDefined()
  })

  it("returns empty geometry for a missing clientRect or invalid viewport", () => {
    expect(
      annotationGeometry({ ...store, konvaClientRect: undefined }, vp)
    ).toEqual({})
    expect(annotationGeometry(store, undefined)).toEqual({})
    expect(annotationGeometry(store, { width: 0, height: 792, scale: 1 })).toEqual(
      {}
    )
  })
})