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
import type { PdfAnnotation } from "../types"
import { MARK_COLOR } from "./pdfTheme"

/** Build the Konva shapes for one annotation's rect (port of drawAnnotation).
 *  Every shape is inside a Konva.Group whose id === the annotation id, so the
 *  hit-test maps a click straight back to the annotation. */
function shapesFor(
  ann: PdfAnnotation,
  r: { x: number; y: number; w: number; h: number },
  box: { w: number; h: number }
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
      // Thin 1.5px line is unclickable — add an invisible full-row hit rect so
      // the whole text row selects the annotation.
      return [
        new Konva.Rect({
          x: r.x,
          y: r.y,
          width: r.w,
          height: r.h,
          fill: "#000",
          opacity: 0
        }),
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
      return [
        new Konva.Rect({
          x: r.x,
          y: r.y,
          width: r.w,
          height: r.h,
          fill: "#000",
          opacity: 0
        }),
        path
      ]
    }
    case "strike":
      return [
        new Konva.Rect({
          x: r.x,
          y: r.y,
          width: r.w,
          height: r.h,
          fill: "#000",
          opacity: 0
        }),
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
    case "free-highlight":
    case "freehand": {
      const pts: number[] = []
      for (const p of ann.path ?? []) pts.push(p.x * box.w, p.y * box.h)
      if (pts.length < 4) return []
      return [
        new Konva.Line({
          points: pts,
          stroke: MARK_COLOR[ann.type],
          strokeWidth: ann.type === "free-highlight" ? 14 : 2,
          lineCap: "round",
          lineJoin: "round",
          tension: 0.35
        })
      ]
    }
    case "freetext":
      // The box is drawn here; the text is a DOM overlay (.pdf-freetext) so it
      // stays editable + doesn't depend on canvas text measurement.
      return [
        new Konva.Rect({
          x: r.x,
          y: r.y,
          width: r.w,
          height: r.h,
          stroke: MARK_COLOR.freetext,
          strokeWidth: 1.5,
          cornerRadius: 2,
          fill: "rgba(255,255,255,0.04)"
        })
      ]
    default:
      return []
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
  freetextLayer(stage)?.replaceChildren()
  for (const ann of annotations) {
    try {
      const rects = getRects(ann)
      if (rects.length === 0) continue
      const group = new Konva.Group({ id: ann.id })
      for (const r of rects) {
        for (const shape of shapesFor(ann, r, { w: holderW, h: holderH }))
          group.add(shape)
      }
      setMarkBbox(group, rects)
      addHitRect(group)
      layer.add(group)
      syncFreetextDom(stage, ann, holderW, holderH)
    } catch (e) {
      console.warn(`[lime] mark draw failed for ${ann.id}:`, e)
    }
  }
  layer.draw()
}

/** Store the FULL source-rects bbox on the group. For thin-line marks
 *  (underline/strike/wavy) the group's shapes are sub-rects of the text row,
 *  so getClientRect() is a thin strip — the selection ring would frame the
 *  strip and cover the glyphs. `data-rect` keeps the full row box. */
function setMarkBbox(
  group: Konva.Group,
  rects: { x: number; y: number; w: number; h: number }[]
): void {
  let b: { x: number; y: number; x2: number; y2: number } | null = null
  for (const r of rects) {
    if (!b) b = { x: r.x, y: r.y, x2: r.x + r.w, y2: r.y + r.h }
    else {
      b.x = Math.min(b.x, r.x)
      b.y = Math.min(b.y, r.y)
      b.x2 = Math.max(b.x2, r.x + r.w)
      b.y2 = Math.max(b.y2, r.y + r.h)
    }
  }
  if (b) {
    group.setAttr("data-rect", {
      x: b.x,
      y: b.y,
      width: b.x2 - b.x,
      height: b.y2 - b.y
    })
  }
}

/** Give the group an invisible FULL-bbox hit rect (the visible thin-line shapes
 *  are a sub-rect of the text row, so the Konva hit graph only registers a thin
 *  strip — the mouse alternating on/off it made the hover dim flicker for
 *  删除线/自由画笔). The rect is `listening: true`; the visible shapes become
 *  `listening: false`. The Konva canvas is pointer-transparent, so the hit
 *  rects only affect the programmatic hit-testing (hover/click), never the
 *  text selection. */
function addHitRect(group: Konva.Group): void {
  const b = group.getAttr("data-rect") as
    | { x: number; y: number; width: number; height: number }
    | undefined
  if (!b) return
  group.children.forEach((c) => c.listening(false))
  group.add(
    new Konva.Rect({
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      fill: "rgba(0,0,0,0)",
      name: "pdf-mark-hit",
      listening: true
    })
  )
}

/** Build one annotation's Konva.Group (no stage access — jsdom-testable). */
export function buildMarkGroup(
  ann: PdfAnnotation,
  getRects: (ann: PdfAnnotation) => { x: number; y: number; w: number; h: number }[],
  box: { w: number; h: number }
): Konva.Group | null {
  const rects = getRects(ann)
  if (rects.length === 0) return null
  const group = new Konva.Group({ id: ann.id })
  for (const r of rects) {
    for (const shape of shapesFor(ann, r, box)) group.add(shape)
  }
  setMarkBbox(group, rects)
  addHitRect(group)
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
  const group = buildMarkGroup(ann, getRects, { w: holderW, h: holderH })
  if (!group) {
    removeFreetextDom(stage, ann.id)
    return false
  }
  layer.add(group)
  syncFreetextDom(stage, ann, holderW, holderH)
  layer.draw()
  return true
}

/** Incremental removal of one annotation's group. */
export function removeMark(stage: Konva.Stage, annId: string): void {
  const layer = stage.getLayers()[0]
  if (!layer) return
  layer.findOne(`#${annId}`)?.destroy()
  removeFreetextDom(stage, annId)
  layer.draw()
}

/** A DOM overlay for freetext content (the box is Konva; the text is DOM so it
 *  stays editable + doesn't depend on canvas text measurement). */
function freetextLayer(stage: Konva.Stage): HTMLElement | null {
  const container = stage.container()
  if (!container) return null
  let layer = container.querySelector<HTMLElement>(".pdf-freetext-layer")
  if (!layer) {
    layer = document.createElement("div")
    layer.className = "pdf-freetext-layer"
    container.appendChild(layer)
  }
  return layer
}

export function syncFreetextDom(
  stage: Konva.Stage,
  ann: PdfAnnotation,
  holderW: number,
  holderH: number
): void {
  const layer = freetextLayer(stage)
  if (!layer) return
  layer.querySelector(`[data-freetext="${ann.id}"]`)?.remove()
  if (ann.type !== "freetext" || !ann.text) return
  const r = (ann.rects ?? [])[0]
  if (!r) return
  const div = document.createElement("div")
  div.className = "pdf-freetext"
  div.dataset.freetext = ann.id
  div.style.cssText =
    `left:${r.x * holderW}px;top:${r.y * holderH}px;` +
    `width:${r.w * holderW}px;height:${r.h * holderH}px;`
  div.textContent = ann.text
  layer.appendChild(div)
}

function removeFreetextDom(stage: Konva.Stage, annId: string): void {
  const layer = freetextLayer(stage)
  layer?.querySelector(`[data-freetext="${annId}"]`)?.remove()
}

/** Geometry signature for the incremental diff — unchanged annotations skip. */
export function markSignature(ann: PdfAnnotation): string {
  return `${ann.id}|${ann.type}|${ann.color ?? ""}|${ann.startOffset ?? ""}|${
    ann.endOffset ?? ""
  }|${JSON.stringify(ann.rects ?? [])}|${JSON.stringify(ann.path ?? [])}|${
    ann.text ?? ""
  }`
}

// Per-stage tween: multiple pages are mounted (lazy render + keep-alive), and
// every page's selection effect calls selectMark/clearSelection — a module-level
// tween would be destroyed by whichever page runs last, leaving the ring stuck
// at opacity 0 (invisible). Keyed by stage so each page owns its fade.
const selectionTweens = new WeakMap<Konva.Stage, Konva.Tween>()

/** A full border ring around the annotation's bbox. Coordinates are rounded to
 *  whole pixels (crisp lines) and the stroke is drawn ENTIRELY OUTSIDE the
 *  bbox (a 1px gap) so the frame never covers the annotation's text. */
function makeSelectionRing(
  r: { x: number; y: number; width: number; height: number }
): Konva.Rect {
  const s = 2
  const gap = 1
  const x0 = Math.round(r.x)
  const y0 = Math.round(r.y)
  const x1 = Math.round(r.x + r.width)
  const y1 = Math.round(r.y + r.height)
  const pad = s / 2 + gap
  return new Konva.Rect({
    x: Math.round(x0 - pad),
    y: Math.round(y0 - pad),
    width: x1 - x0 + 2 * pad,
    height: y1 - y0 + 2 * pad,
    stroke: "rgba(99,102,241,1)",
    strokeWidth: s,
    cornerRadius: 2,
    name: "pdf-mark-selected",
    listening: false
  })
}

/** Draw a persistent selection frame around an annotation's group (the jump
 *  target "stays lit" until the user clicks elsewhere — InkLayer's model).
 *  Fades in smoothly; the frame sits outside the text. Uses the group's own
 *  position — no text-layer measurement, no DOM. */
export function selectMark(stage: Konva.Stage, annId: string): void {
  const layer = stage.getLayers()[0]
  if (!layer) return
  selectionTweens.get(stage)?.destroy()
  selectionTweens.delete(stage)
  layer.findOne(".pdf-mark-selected")?.destroy()
  const g = layer.findOne(`#${annId}`)
  if (g) {
    // Use the stored full-row bbox (thin-line marks: getClientRect is a strip).
    const dataRect = g.getAttr("data-rect") as
      | { x: number; y: number; width: number; height: number }
      | undefined
    const ring = makeSelectionRing(dataRect ?? g.getClientRect())
    ring.opacity(0.25)
    layer.add(ring)
    layer.draw()
    const tween = new Konva.Tween({
      node: ring,
      duration: 0.18,
      opacity: 1,
      easing: Konva.Easings.EaseOut,
      onFinish: () => layer.draw()
    })
    selectionTweens.set(stage, tween)
    tween.play()
  }
}

/** Fade out + remove the persistent selection frame. */
export function clearSelection(stage: Konva.Stage): void {
  const layer = stage.getLayers()[0]
  if (!layer) return
  selectionTweens.get(stage)?.destroy()
  selectionTweens.delete(stage)
  const sel = layer.findOne(".pdf-mark-selected")
  if (!sel) return
  const tween = new Konva.Tween({
    node: sel,
    duration: 0.15,
    opacity: 0,
    onFinish: () => {
      sel.destroy()
      layer.draw()
    }
  })
  tween.play()
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
