import { readFileSync, readdirSync, renameSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"

// Parcel names shared/empty chunks with a leading `_` (e.g. `_empty.abc.js`).
// Chrome/Edge reserve `_`-prefixed filenames in extension packages and refuse
// to load the extension. Rename `_empty.*` → `empty.*` and rewrite every
// in-bundle reference so the extension loads.
const root = process.argv[2] ?? "build/chrome-mv3-prod"
if (!existsSync(root)) {
  console.error(`[fix-empty-chunks] missing ${root}`)
  process.exit(0)
}

const entries = readdirSync(root, { withFileTypes: true })
const emptyFiles = entries
  .filter((e) => e.isFile() && /^_empty\..*\.js$/.test(e.name))
  .map((e) => e.name)

for (const name of emptyFiles) {
  renameSync(join(root, name), join(root, name.replace(/^_/, "")))
}
if (emptyFiles.length) {
  console.log(`[fix-empty-chunks] renamed ${emptyFiles.join(", ")}`)
}

// Walk the tree and rewrite `_empty.<hash>.js` → `empty.<hash>.js` in text files.
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(js|mjs|html|css|json)$/.test(e.name)) {
      let s = readFileSync(p, "utf8")
      if (s.includes("_empty.")) {
        writeFileSync(p, s.replace(/_empty\./g, "empty."))
      }
    }
  }
}
walk(root)
console.log("[fix-empty-chunks] done")
