/** 行级矩形合并：把同一视觉行（垂直重叠）上的片段合并为一个连续块。 */

export interface LineMergeRect {
  x: number
  y: number
  width: number
  height: number
}

/** Group rects into visual LINES (vertical overlap) and merge every fragment on
 *  a line into ONE continuous box [minX, maxX] at the line's bounding box.
 *
 *  Why bridge ALL gaps instead of a small horizontal tolerance? A text-layer
 *  selection is a contiguous run of marks; two marks on the same visual line
 *  are therefore adjacent selected text, and any gap between them is a
 *  justified word gap that should read as ONE continuous highlight. The old
 *  MERGE_GAP=4px tolerance left justify-gapped lines split into fragments.
 */
export function mergeRectsByLine(rects: LineMergeRect[]): LineMergeRect[] {
  if (rects.length === 0) return []

  const rows: { top: number; bottom: number; items: LineMergeRect[] }[] = []
  for (const r of rects) {
    const row = rows.find((x) => r.y < x.bottom && r.y + r.height > x.top)
    if (row) {
      row.top = Math.min(row.top, r.y)
      row.bottom = Math.max(row.bottom, r.y + r.height)
      row.items.push(r)
    } else {
      rows.push({ top: r.y, bottom: r.y + r.height, items: [r] })
    }
  }

  return rows.map((row) => {
    let minX = Infinity
    let maxX = -Infinity
    for (const r of row.items) {
      if (r.x < minX) minX = r.x
      if (r.x + r.width > maxX) maxX = r.x + r.width
    }
    return {
      x: minX,
      y: row.top,
      width: maxX - minX,
      height: row.bottom - row.top
    }
  })
}
