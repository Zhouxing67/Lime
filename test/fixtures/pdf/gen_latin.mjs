// Generate fixture-justify-latin.pdf (R1 diagnostics):
//  - Page 1: two justified columns. Justified lines with few/long words
//    produce inter-word gaps well over 6px — the S4 / mergeSpanRectsByRow
//    fracture trigger. Line 1.7 is manually placed with an explicit ~24px gap.
//  - Page 2: DejaVu Sans embedded, text using the literal ligature chars
//    U+FB01 (fi) / U+FB02 (fl). pdf.js extraction yields the same chars, so a
//    raw indexOf search for "fi" will MISS these matches (recall gap) while a
//    real "fi" elsewhere on the page still matches.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const here = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const page = doc.addPage([595, 842])
  const { height } = page.getSize()

  page.drawText("Justified text — inter-word gap fixture", {
    x: 60,
    y: height - 60,
    size: 16,
    font: bold
  })

  // justify(): draw text justified into [x0,x1]; returns the next y.
  const justify = (text, x0, x1, y, size, leading) => {
    const words = text.split(/\s+/)
    let line = []
    let lineWidth = 0
    const flush = (cur, lastLine) => {
      if (!cur.length) return
      const tw = cur.reduce((s, w) => s + font.widthOfTextAtSize(w, size), 0)
      let x = x0
      if (lastLine || cur.length === 1) {
        for (const w of cur) {
          page.drawText(w, { x, y, size, font })
          x += font.widthOfTextAtSize(w, size)
        }
      } else {
        const gap = ((x1 - x0) - tw) / (cur.length - 1)
        for (const w of cur) {
          page.drawText(w, { x, y, size, font })
          x += font.widthOfTextAtSize(w, size) + gap
        }
      }
    }
    for (const w of words) {
      const ww = font.widthOfTextAtSize(w, size)
      const space = font.widthOfTextAtSize(" ", size)
      if (line.length && lineWidth + space + ww > x1 - x0) {
        flush(line, false)
        line = [w]
        lineWidth = ww
        y -= leading
      } else {
        lineWidth += ww + (line.length ? space : 0)
        line.push(w)
      }
    }
    flush(line, true)
    return y
  }

  const colA = [
    "The quick brown fox jumps over the lazy dog.",
    "Antidisestablishmentarianism is a long word test.",
    "Supercalifragilisticexpialidocious means something wonderful.",
    "Justified text spreads word spacing evenly across each line.",
    "Lines with few words end up with very wide inter-word gaps.",
    "A highlight merger with a small gap tolerance draws them as separate blocks."
  ]
  const colB = [
    "Search highlights must sit exactly on top of the matched characters.",
    "When a line is justified its word gaps can exceed six pixels.",
    "A selection overlay merging fragments with a six pixel tolerance shows a gap.",
    "The same geometry drives the persisted Konva annotation rectangles.",
    "These rectangles merge only when their horizontal gap stays under four pixels."
  ]

  let y = height - 100
  const x0a = 60
  const x1a = 285
  const x0b = 315
  const x1b = 535
  for (const p of colA) y = justify(p, x0a, x1a, y, 11, 18)
  let yb = height - 100
  for (const p of colB) yb = justify(p, x0b, x1b, yb, 11, 18)

  // A manually placed line with an explicit ~24px inter-word gap so the
  // fracture is reproducible at a glance (not dependent on my line-break math).
  const yManual = height - 320
  page.drawText("antidisestablishmentarianism", {
    x: x0a,
    y: yManual,
    size: 11,
    font
  })
  page.drawText("is", { x: x0a + 210, y: yManual, size: 11, font })
  page.drawText("a", { x: x0a + 210 + 30, y: yManual, size: 11, font })
  page.drawText("gap", { x: x0a + 210 + 30 + 22, y: yManual, size: 11, font })
  page.drawText("= 24px", {
    x: x0a,
    y: yManual - 16,
    size: 8,
    color: rgb(0.4, 0.4, 0.4),
    font
  })

  // ---- Page 2: ligature chars via embedded DejaVu Sans ----
  const dejavuBytes = readFileSync(
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
  )
  const dejavu = await doc.embedFont(dejavuBytes)
  const p2 = doc.addPage([595, 842])
  const h2 = p2.getSize().height
  p2.drawText("Ligature recall fixture (literal U+FB01 / U+FB02)", {
    x: 60,
    y: h2 - 60,
    size: 16,
    font: bold
  })
  const ligLines = [
    "Efﬁcient oﬃcial facilities oﬀer suﬃcient traﬃc.",
    "The oﬃce staﬀ ﬁled the ﬁnancial ﬁgures.",
    "A plain efficient official office with ordinary fi fl.",
    "Search for the two-letter fi above and below this line."
  ]
  let ly = h2 - 100
  for (const ln of ligLines) {
    p2.drawText(ln, { x: 60, y: ly, size: 12, font: dejavu })
    ly -= 22
  }
  // Control line in the standard-14 Helvetica (no OpenType GSUB ligature
  // substitution): the plain "fi"/"fl" pairs here stay ordinary characters.
  // Searching "fi" should hit THIS line but miss every DejaVu ligature above.
  p2.drawText("Control line (Helvetica): efficient official office, ordinary fi.", {
    x: 60,
    y: ly - 22,
    size: 12,
    font
  })

  const out = path.join(here, "fixture-justify-latin.pdf")
  writeFileSync(out, await doc.save())
  console.log("wrote", out, (await doc.save()).length, "bytes")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
