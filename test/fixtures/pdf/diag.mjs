// R1 diagnostic — PDF selection/search-highlight root-cause probe.
//
// Run:  node test/fixtures/pdf/diag.mjs
//
// Read-only: touches no product code. Each replicated algorithm cites its
// source (file:line). The DOM-derived paths (S2-S8) are inherently
// browser-side; this script proves the DATA-layer mechanisms (F4/F2/F3) and
// the pure-geometry ones (annotation merge / ligature recall) on real code
// paths, leaving the browser-verifiable fixtures for the extension itself.
import * as pdfjs from "../../../assets/pdfjs/pdf.mjs"
import { readFileSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"
import path from "node:path"

const here = path.dirname(fileURLToPath(import.meta.url))
const PDFJS_DIST =
  "/home/xx/Lime/node_modules/.pnpm/pdfjs-dist@4.3.136/node_modules/pdfjs-dist"
const CMAPS = path.join(PDFJS_DIST, "cmaps")
const STDFONTS = path.join(PDFJS_DIST, "standard_fonts")

// The extension's search side sets GlobalWorkerOptions.workerSrc to a Blob URL
// of assets/pdfjs/pdf.worker.min.mjs; in Node a file URL goes down the fake
// worker path (dynamic import of the worker file), which is fine for extraction.
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.join(here, "../../../assets/pdfjs/pdf.worker.min.mjs")
).href

let failures = 0
const ok = (label, cond, detail = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`)
  if (!cond) failures++
}

/* ------------------------------------------------------------------ *
 * F4 — the engine/search getDocument parameter asymmetry.
 * Search side (src/hooks/usePdfDocument.ts:53-58) passes
 *   cMapUrl/cMapPacked/standardFontDataUrl.
 * Engine side (src/pdf/inklayer/hooks/usePdfViewer.ts:152-161) passes
 *   { data, disableRange } only.
 * On a CID/CMap-dependent PDF the two extractions differ, so the search
 * offsets (computed on the cMap side) point at a different character space
 * than the text layer (rendered by the engine side) — the offset drift.
 * ------------------------------------------------------------------ */
async function diagF4() {
  console.log("\n== F4: engine-vs-search getDocument text extraction ==")
  const data = readFileSync(path.join(here, "fixture-cjk-gbk.pdf"))
  // Copy into a fresh, non-pooled ArrayBuffer — fs.readFileSync returns a
  // Buffer over the shared 8KB pool; transferring a pooled buffer breaks the
  // pdf.js LoopbackPort structuredClone ("Cannot transfer object of unsupported
  // type").
  const bytes = new Uint8Array(data).slice()

  const textOf = async (doc) => {
    const out = []
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const tc = await page.getTextContent({ disableNormalization: true })
      out.push(tc.items.map((i) => i.str ?? "").join(""))
    }
    return out.join("\n")
  }

  const taskA = pdfjs.getDocument({
    data: bytes.slice(),
    cMapUrl: CMAPS + "/",
    cMapPacked: true,
    standardFontDataUrl: STDFONTS + "/"
  })
  const taskB = pdfjs.getDocument({ data: bytes.slice() })

  const [textA, textB] = await Promise.all([
    taskA.promise.then(textOf),
    taskB.promise.then(textOf)
  ])

  console.log("  [search side  cMap+stdFont] full text:")
  console.log("    " + textA.split("\n").join("\n    "))
  console.log("  [engine side  bare getDocument] full text:")
  console.log("    " + textB.split("\n").join("\n    "))
  ok(
    "search side decodes GBK CIDs into Chinese",
    /选区高亮/.test(textA) && /搜索偏移/.test(textA)
  )
  ok(
    "engine side produces the SAME characters (F4 would fail here)",
    textA === textB
  )
  taskA.destroy().catch(() => {})
  taskB.destroy().catch(() => {})
}

/* ------------------------------------------------------------------ *
 * F2 — scanText's length-changing case fold.
 * src/components/pdfText.ts:96-97 folds with toLowerCase(); characters
 * whose lowercase expands (U+0130 İ → "i\u0307", 2 code units) shift every
 * offset computed on the folded haystack relative to the original string the
 * DOM / text layer actually contains.
 * ------------------------------------------------------------------ */
function diagF2() {
  console.log("\n== F2: length-changing toLowerCase in scanText ==")
  // Replica of pdfText.ts:96-97 + the indexOf scan (87-127), on a line that
  // contains the Turkish dotted capital I.
  const full = "İstanbul 的港口  İzmir 与 安卡拉"
  const needle = "istan" // user searches lowercase "istan"
  const haystack = full.toLowerCase()
  const idx = haystack.indexOf(needle)
  console.log(
    `  full     (${full.length} units): ${full}`
  )
  console.log(
    `  folded   (${haystack.length} units): ${haystack}`
  )
  ok(
    "case fold does NOT change length on this string",
    full.length === haystack.length
  )
  if (idx >= 0) {
    // In folded space the hit starts after the 2-unit "i\u0307"; in original
    // space "İ" is ONE unit, so the DOM range for [start,end) lands one char
    // to the right — the offset drift.
    const origSlice = full.slice(idx, idx + needle.length)
    console.log(
      `  folded hit at ${idx} => original slice "${origSlice}" (not "istan")`
    )
    ok("folded offset maps onto the intended characters", origSlice === "istan")
  }
}

/* ------------------------------------------------------------------ *
 * F3 — leaf text-div index vs transient <mark> (web-highlighter) spans.
 * getTextDivs (pdfText.ts:188-206) keeps spans whose direct child is not a
 * span; a <mark> wrapped around a span's text is NOT a span, so the span
 * still passes the leaf test and its textContent is intact — cumulative
 * offsets stay correct. The real mark-induced failure is offsetsToRange
 * (pdfText.ts:498-506): divs[i].firstChild is the <mark> ELEMENT, not a text
 * node → the match is dropped (returns null) instead of drawn.
 * ------------------------------------------------------------------ */
async function diagF3() {
  console.log("\n== F3: transient web-highlighter <mark> vs offsetsToRange ==")
  // Minimal fake DOM that mirrors the REAL semantics getTextDivs /
  // offsetsToRange rely on (textContent aggregates descendants; a <mark> is
  // not a "span", so it neither fails the leaf test nor is collected by
  // querySelectorAll("span")). No jsdom needed (its native `canvas` binding
  // isn't built in this repo; jest mocks it instead).
  const TEXT_NODE_TYPE = 3
  const ELEMENT_NODE_TYPE = 1
  class FNode {
    constructor(nodeName, text = "") {
      this.nodeName = nodeName
      this.children = []
      this._text = text
      this.parent = null
    }
    get textContent() {
      if (this._text !== "") return this._text
      return this.children.map((c) => c.textContent).join("")
    }
    set textContent(v) {
      this._text = v
      this.children = []
    }
    appendChild(c) {
      c.parent = this
      this.children.push(c)
      return c
    }
    get firstChild() {
      return this.children[0] ?? null
    }
    get parentElement() {
      return this.parent ?? null
    }
    get tagName() {
      return this.nodeName
    }
    querySelectorAll(sel) {
      if (sel !== "span") throw new Error("unsupported selector " + sel)
      const out = []
      const walk = (n) => {
        for (const c of n.children) {
          if (c.nodeName === "SPAN") out.push(c)
          walk(c)
        }
      }
      walk(this)
      return out
    }
    querySelector(sel) {
      const m = /^:scope > (\w+)$/.exec(sel)
      if (!m) throw new Error("unsupported selector " + sel)
      return this.children.find((c) => c.nodeName === m[1].toUpperCase()) ?? null
    }
  }
  const div = new FNode("DIV")
  const mk = (text) => {
    const s = new FNode("SPAN")
    s.textContent = text
    div.appendChild(s)
    return s
  }
  // Replica of getTextDivs (pdfText.ts:198-203): leaf spans with text.
  const getTextDivs = (root) =>
    root.querySelectorAll("span").filter(
      (d) => !d.querySelector(":scope > span") && d.textContent?.length > 0
    )
  mk("AAAAA ") // span 0
  const s2 = mk("BBBBB ") // span 1
  mk("CCCCC") // span 2

  const index = () => {
    const divs = getTextDivs(div)
    const cumulative = []
    let acc = 0
    for (const d of divs) {
      cumulative.push(acc)
      acc += d.textContent?.length ?? 0
    }
    return { divs, cumulative, total: acc }
  }

  const before = index()
  ok(
    "clean index counts each span exactly once",
    before.total === 17 && before.divs.length === 3
  )

  // web-highlighter wraps the selection in <mark data-highlight-id> during
  // annotation creation (painter flow). Replicate: wrap s2's text node.
  const mark = new FNode("MARK")
  mark.setAttribute = () => {}
  mark.setAttribute("data-highlight-id", "1")
  mark.textContent = s2.textContent
  s2.textContent = ""
  s2.appendChild(mark)

  const polluted = index()
  ok(
    "span wrapped by <mark> still counted once (cumulative intact)",
    polluted.total === 17 && polluted.divs.length === 3
  )

  // offsetsToRange (pdfText.ts:498-506): requires divs[i].firstChild to be a
  // text node. After the mark wrap it is an element → the match is dropped.
  const hitSpan = polluted.divs[1]
  ok(
    "offsetsToRange pre-condition: firstChild is a text node",
    hitSpan.firstChild?.nodeType === TEXT_NODE_TYPE,
    `(actual: ${hitSpan.firstChild?.nodeName ?? "none"})`
  )
}

/* ------------------------------------------------------------------ *
 * Annotation fracture — mergeSpanRectsByRow (editor_highlight.ts:82-134).
 * MERGE_GAP = 4px. Justified lines produce word gaps >> 4px, so one visual
 * line of highlighted text splits into several Konva rectangles ("断裂").
 * ------------------------------------------------------------------ */
function diagAnnoMerge() {
  console.log("\n== Persistent-annotation fracture: mergeSpanRectsByRow ==")
  const mergeSpanRectsByRow = (rects) => {
    // Faithful replica of editor_highlight.ts:82-134.
    const ROW_TOLERANCE = 3
    const MERGE_GAP = 4
    if (rects.length === 0) return []
    const sorted = [...rects].sort((a, b) => a.y - b.y)
    const rows = []
    let currentRow = [sorted[0]]
    let currentRowY = sorted[0].y
    for (let i = 1; i < sorted.length; i++) {
      if (Math.abs(sorted[i].y - currentRowY) < ROW_TOLERANCE) currentRow.push(sorted[i])
      else {
        rows.push(currentRow)
        currentRow = [sorted[i]]
        currentRowY = sorted[i].y
      }
    }
    rows.push(currentRow)
    const merged = []
    for (const rowSpans of rows) {
      rowSpans.sort((a, b) => a.x - b.x)
      let current = { ...rowSpans[0] }
      for (let i = 1; i < rowSpans.length; i++) {
        const next = rowSpans[i]
        const currentRight = current.x + current.width
        const gap = next.x - currentRight
        if (gap <= MERGE_GAP) {
          current.width = Math.max(currentRight, next.x + next.width) - current.x
          current.height = Math.max(current.height, next.height)
          current.y = Math.min(current.y, next.y)
        } else {
          merged.push({ ...current })
          current = { ...next }
        }
      }
      merged.push({ ...current })
    }
    return merged
  }

  // One visual line of highlighted text on the justify fixture: the words are
  // separated by ~24px (the manual gap line) — well above MERGE_GAP=4.
  const wordRects = [
    { x: 60, y: 100, width: 150, height: 12 }, // antidisestablishmentarianism
    { x: 234, y: 100, width: 12, height: 12 }, // is
    { x: 276, y: 100, width: 9, height: 12 }, // a
    { x: 307, y: 100, width: 24, height: 12 } // gap
  ]
  const merged = mergeSpanRectsByRow(wordRects)
  console.log(`  input: 1 visual line, ${wordRects.length} word boxes, gaps 24px`)
  console.log(`  output: ${merged.length} Konva rectangle(s)`)
  console.log(
    "  " +
      merged
        .map((r) => `[x=${r.x}, w=${r.width}]`)
        .join(" ")
  )
  ok(
    "one visual line stays ONE rectangle (fracture would show >1)",
    merged.length === 1
  )
}

/* ------------------------------------------------------------------ *
 * Recall — raw indexOf can never match a ligature/smart-quote folding.
 * scanText (pdfText.ts:100) searches the folded haystack verbatim, so a query
 * "fi" cannot match the literal U+FB01 character the text layer renders.
 * ------------------------------------------------------------------ */
function diagRecall() {
  console.log("\n== Search recall: ligature chars are unfindable by raw indexOf ==")
  const line = "Efﬁcient oﬃcial facilities" // literal ﬁ/ﬂ (U+FB01/U+FB02)
  const q = "fi"
  const haystack = line.toLowerCase()
  const idx = haystack.indexOf(q)
  console.log(`  line: ${line}`)
  console.log(`  query "fi": raw indexOf -> ${idx === -1 ? "MISS (ligature invisible)" : "hit at " + idx}`)
  ok('raw indexOf finds "fi" in "Efﬁcient oﬃcial facilities"', idx >= 0)
}

const run = async () => {
  try {
    await diagF4()
  } catch (e) {
    console.log("\n== F4 aborted ==", e?.message ?? e)
    failures++
  }
  diagF2()
  await diagF3()
  diagAnnoMerge()
  diagRecall()
  console.log(`\n${failures === 0 ? "ALL PASS" : failures + " MECHANISM(S) CONFIRMED (expected pre-fix)"}`)
  process.exit(failures ? 1 : 0)
}
run()
