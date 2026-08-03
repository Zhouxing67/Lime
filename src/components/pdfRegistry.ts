import * as pdfjsLib from "pdfjs-dist"

type TextLayer = InstanceType<typeof pdfjsLib.TextLayer>

/** Live registry of rendered pages' text layers, keyed by page number, so the
 *  toolbar can map a DOM selection back to text offsets. */
const registry = new Map<number, { holder: HTMLElement; textLayer: TextLayer }>()

export function registerTextLayer(
  page: number,
  entry: { holder: HTMLElement; textLayer: TextLayer }
): void {
  registry.set(page, entry)
}

export function unregisterTextLayer(page: number): void {
  registry.delete(page)
}

export function getTextLayer(page: number):
  | { holder: HTMLElement; textLayer: TextLayer }
  | undefined {
  return registry.get(page)
}
