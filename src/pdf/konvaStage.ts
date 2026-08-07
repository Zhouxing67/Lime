/**
 * konvaStage.ts — per-page Konva stage management.
 *
 * Port of InkLayer's createKonvaStage: the stage spans the rendered PDF page
 * with `scale = viewport.scale`, so stage units equal PDF points. Geometry is
 * drawn in stage coordinates (Y-axis points DOWN — PDF-space Y-up values must
 * go through flipY()). Renderers/editors share this store so every page has
 * exactly one stage + one annotation layer.
 */
import Konva from "konva"

export interface StageViewport {
  /** CSS px of the rendered page (== viewport.width from pdf.js). */
  width: number
  height: number
  /** pdf.js viewport.scale — konva scale. */
  scale: number
}

/** Create a Konva stage for one page. `container` is an absolute overlay div. */
export function createKonvaStage(
  container: HTMLDivElement,
  viewport: StageViewport
): Konva.Stage {
  const stage = new Konva.Stage({
    container,
    width: viewport.width,
    height: viewport.height,
    scale: { x: viewport.scale, y: viewport.scale }
  })
  stage.add(new Konva.Layer())
  return stage
}

/** The annotation layer of a stage (created by createKonvaStage). */
export function bgLayer(stage: Konva.Stage): Konva.Layer {
  return stage.getLayers()[0]
}

export function disposeStage(stage: Konva.Stage | null | undefined): void {
  if (stage) stage.destroy()
}

/**
 * Per-PDF stage registry keyed by 1-based page. One instance per open PDF;
 * pages are created/disposed as the pdf.js viewer renders/discards them.
 */
export class KonvaPageStore {
  private stages = new Map<number, Konva.Stage>()

  set(page: number, stage: Konva.Stage): void {
    this.dispose(page)
    this.stages.set(page, stage)
  }

  get(page: number): Konva.Stage | undefined {
    return this.stages.get(page)
  }

  dispose(page: number): void {
    const s = this.stages.get(page)
    if (s) {
      s.destroy()
      this.stages.delete(page)
    }
  }

  clear(): void {
    for (const page of Array.from(this.stages.keys())) this.dispose(page)
  }

  get size(): number {
    return this.stages.size
  }
}
