import { cpSync, mkdirSync, existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const src = resolve(root, "node_modules/pdfjs-dist")
const dest = resolve(root, "assets/pdfjs")

mkdirSync(dest, { recursive: true })

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
