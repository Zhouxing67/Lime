import * as pdfjsLib from "pdfjs-dist"

let blobWorkerUrl: string | null = null
let workerPromise: Promise<string> | null = null

/** Point the pdf.js worker at a Blob URL built from the shipped worker file.
 *  A chrome-extension:// worker URL can fail to spawn a real Worker in some
 *  contexts, and pdf.js then falls back to a "fake worker" whose dynamic
 *  `import(workerSrc)` is rewritten by the bundler into a require that can't
 *  resolve a runtime URL ("Cannot find module …"). A Blob URL works for BOTH
 *  `new Worker(url, {type:"module"})` and the fake worker's `import(url)`. */
export function ensurePdfWorker(): Promise<string> {
  if (blobWorkerUrl) return Promise.resolve(blobWorkerUrl)
  if (workerPromise) return workerPromise
  workerPromise = (async () => {
    const url = chrome.runtime.getURL("assets/pdfjs/pdf.worker.min.mjs")
    // The background service worker has no URL.createObjectURL — fall back to
    // the web-accessible asset URL there (it never renders PDFs anyway).
    if (
      typeof URL === "undefined" ||
      typeof URL.createObjectURL !== "function"
    ) {
      blobWorkerUrl = url
      pdfjsLib.GlobalWorkerOptions.workerSrc = url
      return url
    }
    const resp = await fetch(url)
    const code = await resp.text()
    const blob = new Blob([code], { type: "text/javascript" })
    blobWorkerUrl = URL.createObjectURL(blob)
    pdfjsLib.GlobalWorkerOptions.workerSrc = blobWorkerUrl
    return blobWorkerUrl
  })()
  return workerPromise
}
