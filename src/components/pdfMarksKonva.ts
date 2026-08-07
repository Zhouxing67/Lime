/**
 * pdfMarksKonva.ts — the annotation-mark layer drawn on a per-page Konva canvas.
 *
 * Replaces the DOM-div marks (PdfRenderer.drawPageAnnotations): with hundreds
 * of annotations the DOM version churned layout on every render. Canvas marks
 * are pixels — no DOM nodes, no re-layout, no per-mark style recalculation.
 *
 * Coordinate space = the page holder's CSS px (scale 1), matching the current
 * `textLayerRects` positions exactly. The Konva container/canvas are
 * `pointer-events: none` so text selection still reaches the pdf.js text layer;
 * mark clicks + hover are resolved by hit-testing the Konva hit graph via
 * `stage.getIntersection()` — empty areas stay fully selectable.
 */
import Konva from "konva"
import type { PdfAnnotation, PdfMark } from "../types"
import { MARK_COLOR } from "./pdfTheme"

/** Build the Konva shapes for one annotation's rect (port of drawAnnotation).
 *  Every shape is inside a Konva.Group whose id === the annotation id, so the
 *  hit-test maps a click straight back to the annotation. */
function shapesFor(
  ann: PdfAnnotation,
  r: { x: number; y: number; w: number; h: number }
): Konva.Shape[] {
  switch (ann.type) {
    case "highlight":
      return [
        new Konva.Rect({
          x: r.x,
          y: r.y,
          width: r.w,
          height: r.h,
          fill: MARK_COLOR.highlight,
          cornerRadius: 2
        })
      ]
    case "underline":
      return [
        new Konva.Rect({
          x: r.x,
          y: r.y + r.h - 1.5,
          width: r.w,
          height: 1.5,
          fill: MARK_COLOR.underline
        })
      ]
    case "wavy": {
      const path = new Konva.Path({
        x: r.x,
        y: r.y + r.h - 3,
        data: wavyPath(r.w),
        stroke: MARK_COLOR.wavy,
        strokeWidth: 1.5,
        fill: undefined
      })
      // The wavy stroke is thin — give the hit area the full row box so it's
      // still clickable across the text line.
      path.hitFunc((context, shape) => {
        context.beginPath()
        context.rect(0, -3, r.w, r.h)
        context.closePath()
        context.fillStrokeShape(shape)
      })
      return [path]
    }
    case "strike":
      return [
        new Konva.Rect({
          x: r.x,
          y: r.y + r.h / 2 - 1,
          width: r.w,
          height: 1.5,
          fill: MARK_COLOR.strike
        })
      ]
    case "frame":
      // Near-transparent fill so the WHOLE frame interior is clickable (the
      // DOM version made the full frame div pointer-events:auto).
      return [
        new Konva.Rect({
          x: r.x,
          y: r.y,
          width: r.w,
          height: r.h,
          stroke: MARK_COLOR.frame,
          strokeWidth: 1.5,
          cornerRadius: 2,
          fill: "rgba(0,0,0,0.01)"
        })
      ]
    default:
      return [
        new Konva.Rect({
          x: r.x,
          y: r.y,
          width: r.w,
          height: r.h,
          fill: MARK_COLOR.highlight,
          cornerRadius: 2
        })
      ]
  }
}

/** The shared wavy path (same amp/period as the DOM/SVG version). */
export function wavyPath(w: number): string {
  const amp = 2
  const period = 6
  const half = period / 2
  let d = `M0 0`
  let x = 0
  while (x < w) {
    d += ` Q${x + half / 2} ${-amp} ${x + half} 0`
    d += ` Q${x + (half + half / 2)} ${amp} ${x + period} 0`
    x += period
  }
  return d
}

/** Rebuild the mark layer for a page. `stage` spans the page holder (CSS px). */
export function drawMarks(
  stage: Konva.Stage,
  annotations: PdfAnnotation[],
  getRects: (ann: PdfAnnotation) => { x: number; y: number; w: number; h: number }[],
  holderW: number,
  holderH: number
): void {
  const layer = stage.getLayers()[0] ?? stage.getLayers()[0]
  layer.destroyChildren()
  stage.width(holderW)
  stage.height(holderH)
  for (const ann of annotations) {
    try {
      const rects = getRects(ann)
      if (rects.length === 0) continue
      const group = new Konva.Group({ id: ann.id })
      for (const r of rects) {
        for (const shape of shapesFor(ann, r)) group.add(shape)
      }
      layer.add(group)
    } catch (e) {
      console.warn(`[lime] mark draw failed for ${ann.id}:`, e)
    }
  }
  layer.draw()
}

/** Build one annotation's Konva.Group (no stage access — jsdom-testable). */
export function buildMarkGroup(
  ann: PdfAnnotation,
  getRects: (ann: PdfAnnotation) => { x: number; y: number; w: number; h: number }[]
): Konva.Group | null {
  const rects = getRects(ann)
  if (rects.length === 0) return null
  const group = new Konva.Group({ id: ann.id })
  for (const r of rects) {
    for (const shape of shapesFor(ann, r)) group.add(shape)
  }
  return group
}

/** Incremental upsert: replace (or add) ONE annotation's group on the stage —
 *  no full-page rebuild. Returns true if a group was drawn. */
export function upsertMark(
  stage: Konva.Stage,
  ann: PdfAnnotation,
  getRects: (ann: PdfAnnotation) => { x: number; y: number; w: number; h: number }[],
  holderW: number,
  holderH: number
): boolean {
  const layer = stage.getLayers()[0]
  if (!layer) return false
  stage.width(holderW)
  stage.height(holderH)
  layer.findOne(`#${ann.id}`)?.destroy()
  const group = buildMarkGroup(ann, getRects)
  if (!group) return false
  layer.add(group)
  layer.draw()
  return true
}

/** Incremental removal of one annotation's group. */
export function removeMark(stage: Konva.Stage, annId: string): void {
  const layer = stage.getLayers()[0]
  if (!layer) return
  layer.findOne(`#${annId}`)?.destroy()
  layer.draw()
}

/** Geometry signature for the incremental diff — unchanged annotations skip. */
export function markSignature(ann: PdfAnnotation): string {
  return `${ann.id}|${ann.type}|${ann.color ?? ""}|${ann.startOffset ?? ""}|${ann.endOffset ?? ""}|${JSON.stringify(ann.rects ?? [])}`
}

/** Hit-test a viewport point against the stage's hit graph → annotation id. */
export function marksAt(
  stage: Konva.Stage,
  containerRect: { left: number; top: number },
  clientX: number,
  clientY: number
): string | null {
  const pos = {
    x: clientX - containerRect.left,
    y: clientY - containerRect.top
  }
  const hit = stage.getIntersection(pos)
  if (!hit) return null
  const group = hit.findAncestor("Group") ?? hit.getParent()
  if (!group || typeof group.id() !== "string" || group.id() === "") return null
  return group.id()}
