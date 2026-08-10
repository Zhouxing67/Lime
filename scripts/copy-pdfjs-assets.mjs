import { cpSync, mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const src = resolve(root, "node_modules/pdfjs-dist")
const dest = resolve(root, "assets/pdfjs")

mkdirSync(dest, { recursive: true })

// The official pdf_viewer.mjs — copied + patched: it carries one regex with the
// `v` (UnicodeSets) flag that Parcel's parser rejects. Swap it for a v-flag-free
// URL/email regex (the autolinker is a minor sub-feature of the viewer).
const viewer = resolve(src, "web/pdf_viewer.mjs")
if (existsSync(viewer)) {
  let content = readFileSync(viewer, "utf8")
  const lines = content.split("\n")
  const idx = lines.findIndex((l) => l.includes("/gv;"))
  if (idx >= 0) {
    lines[idx] =
      '    this.#regex ??= /(?:\\bhttps?:\\/\\/|\\bwww\\.)[^\\s<>"\']+|[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+/g;'
    content = lines.join("\n")
  }
  writeFileSync(resolve(dest, "pdf_viewer.mjs"), content)
  console.log("[pdfjs-assets] copied + patched pdf_viewer.mjs")
}

// The ORIGINAL ESM worker (self-contained) — must NOT go through Parcel's
// bundler, or pdf.js's `new Worker(src, {type:"module"})` gets a UMD wrapper
// that breaks, and the fake-worker fallback hits a transpiled `import()`.
const worker = resolve(src, "build/pdf.worker.min.mjs")
if (existsSync(worker)) {
  cpSync(worker, resolve(dest, "pdf.worker.min.mjs"))
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
console.log("[pdfjs-assets] copied worker + cmaps + standard_fonts -> assets/pdfjs")
