import { cpSync, mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const src = resolve(root, "node_modules/pdfjs-dist")
const dest = resolve(root, "assets/pdfjs")

mkdirSync(dest, { recursive: true })

// The official pdf_viewer.mjs — copied + patched with DEFENSIVE page-number
// coercion: a string page number reaching the viewer (e.g. injected via
// _location.pageNumber on some load paths) makes pdf.js's currentScale setter
// throw "scrollPageIntoView: "1" is not a valid pageNumber". Coerce at the two
// entry points that STORE the value.
const viewer = resolve(src, "web/pdf_viewer.mjs")
if (existsSync(viewer)) {
  const destFile = resolve(dest, "pdf_viewer.mjs")
  const original = readFileSync(viewer, "utf8")
  let content = original
  content = content.replace(
    "  _setCurrentPageNumber(val, resetCurrentPageView = false) {",
    "  _setCurrentPageNumber(val, resetCurrentPageView = false) {\n    val = Number(val) | 0;"
  )
  content = content.replace(
    "    const pageView = Number.isInteger(pageNumber) && this._pages[pageNumber - 1];",
    "    pageNumber = Number(pageNumber) | 0;\n    const pageView = Number.isInteger(pageNumber) && this._pages[pageNumber - 1];"
  )
  if (content !== original) {
    writeFileSync(destFile, content)
    console.log("[pdfjs-assets] patched pdf_viewer.mjs page-number coercion")
  } else {
    writeFileSync(destFile, original)
    console.log("[pdfjs-assets] copied pdf_viewer.mjs (no patches applied)")
  }
}

// The ORIGINAL ESM worker (self-contained) — must NOT go through Parcel's
// bundler, or pdf.js's `new Worker(src, {type:"module"})` gets a UMD wrapper
// that breaks, and the fake-worker fallback hits a transpiled `import()`.
const worker = resolve(src, "build/pdf.worker.min.mjs")
if (existsSync(worker)) {
  cpSync(worker, resolve(dest, "pdf.worker.min.mjs"))
}

// The main pdf.js API is bundled via the `pdfjs-dist` alias (plain copy — no
// patch: the fake-worker fallback is handled at runtime by a Blob workerSrc,
// see src/utils/pdfWorker.ts, since an eval-based import would violate CSP).
const api = resolve(src, "build/pdf.mjs")
if (existsSync(api)) {
  cpSync(api, resolve(dest, "pdf.mjs"))
  console.log("[pdfjs-assets] copied pdf.mjs")
}

for (const dir of ["cmaps", "standard_fonts"]) {
  const from = resolve(src, dir)
  if (!existsSync(from)) {
    console.warn(`[pdfjs-assets] missing ${dir}, skipping`)
    continue
  }
  mkdirSync(resolve(dest, dir), { recursive: true })
  cpSync(from, resolve(dest, dir), { recursive: true })
}

// Official viewer CSS + its image assets — the official PDFViewer (BaseViewer)
// contract REQUIRES this stylesheet (`.pdfViewer .page` variables, textLayer
// layout + selection bridge, annotationLayer links). Without it the viewer
// renders but text selection/links break.
const css = resolve(src, "web/pdf_viewer.css")
if (existsSync(css)) {
  let cssContent = readFileSync(css, "utf8")
  // The annotation-editor cursor custom properties carry RELATIVE urls, which
  // resolve against the ELEMENT's document base at usage time (inklayer reuses
  // these variables for its own tool cursors) — on a page under tabs/ that
  // becomes tabs/images/cursor-*.svg → 404. Rewrite to root-absolute
  // (/assets/pdfjs/images/...) which resolves to the extension origin.
  cssContent = cssContent.replace(
    /url\(images\/cursor-([a-zA-Z]+)\.svg\)/g,
    "url(/assets/pdfjs/images/cursor-$1.svg)"
  )
  writeFileSync(resolve(dest, "pdf_viewer.css"), cssContent)
}
const cssImages = resolve(src, "web/images")
if (existsSync(cssImages)) {
  mkdirSync(resolve(dest, "images"), { recursive: true })
  cpSync(cssImages, resolve(dest, "images"), { recursive: true })
}
console.log(
  "[pdfjs-assets] copied worker + cmaps + standard_fonts + pdf_viewer.css -> assets/pdfjs"
)
