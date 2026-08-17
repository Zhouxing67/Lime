// Generate fixture-links.pdf — link-jump verification (R8):
//  - Page 1: two link boxes — EXTERNAL (URI → example.com) + INTERNAL (GoTo → page 3)
//  - Page 2: a FULL-PAGE overlay URI link (the "click to read"/CC-strip case the
//    full-page-link guard must neutralize so selection/clicks keep working)
//  - Page 3: the internal-link target
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFString
} from "pdf-lib"
import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const here = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page1 = doc.addPage([595, 842])
  const page2 = doc.addPage([595, 842])
  const page3 = doc.addPage([595, 842])
  const { width, height } = page1.getSize()

  page1.drawText("Link fixture — click the boxes", {
    x: 60,
    y: height - 60,
    size: 16,
    font
  })
  page1.drawRectangle({
    x: 60,
    y: height - 170,
    width: 240,
    height: 60,
    borderColor: rgb(0.2, 0.2, 0.8),
    borderWidth: 2
  })
  page1.drawText("EXTERNAL -> example.com", {
    x: 70,
    y: height - 140,
    size: 12,
    font
  })
  page1.drawRectangle({
    x: 60,
    y: height - 270,
    width: 240,
    height: 60,
    borderColor: rgb(0.8, 0.2, 0.2),
    borderWidth: 2
  })
  page1.drawText("INTERNAL -> page 3", {
    x: 70,
    y: height - 240,
    size: 12,
    font
  })
  page2.drawText("page 2 — full-page overlay URI link (guard target)", {
    x: 60,
    y: height - 60,
    size: 16,
    font
  })
  page3.drawText("page 3 — internal link target", {
    x: 60,
    y: height - 60,
    size: 16,
    font
  })

  // Build a Link annotation dict (bottom-left origin rect) + attach it.
  const addLink = (page, rect, action) => {
    const annot = PDFDict.withContext(doc.context)
    annot.set(PDFName.of("Type"), PDFName.of("Annot"))
    annot.set(PDFName.of("Subtype"), PDFName.of("Link"))
    const rectArr = PDFArray.withContext(doc.context)
    for (const n of rect) rectArr.push(PDFNumber.of(n))
    annot.set(PDFName.of("Rect"), rectArr)
    if (action) annot.set(PDFName.of("A"), action)
    const ref = doc.context.register(annot)
    page.node.addAnnot(ref)
  }

  const uriAction = (url) => {
    const a = PDFDict.withContext(doc.context)
    a.set(PDFName.of("Type"), PDFName.of("Action"))
    a.set(PDFName.of("S"), PDFName.of("URI"))
    a.set(PDFName.of("URI"), PDFString.of(url))
    return a
  }

  // External URI link (box on page 1).
  addLink(
    page1,
    [60, height - 170, 300, height - 110],
    uriAction("https://example.com/")
  )
  // Internal GoTo link → page 3 (/Fit).
  {
    const destArr = PDFArray.withContext(doc.context)
    destArr.push(page3.ref)
    destArr.push(PDFName.of("Fit"))
    const annot = PDFDict.withContext(doc.context)
    annot.set(PDFName.of("Type"), PDFName.of("Annot"))
    annot.set(PDFName.of("Subtype"), PDFName.of("Link"))
    const rectArr = PDFArray.withContext(doc.context)
    for (const n of [60, height - 270, 300, height - 210])
      rectArr.push(PDFNumber.of(n))
    annot.set(PDFName.of("Rect"), rectArr)
    annot.set(PDFName.of("Dest"), destArr)
    const ref = doc.context.register(annot)
    page1.node.addAnnot(ref)
  }
  // Full-page overlay URI link on page 2 (the guard case).
  addLink(
    page2,
    [0, 0, width, height],
    uriAction("https://example.com/full-page")
  )

  const bytes = await doc.save()
  writeFileSync(path.join(here, "fixture-links.pdf"), bytes)
  console.log("wrote fixture-links.pdf", bytes.length, "bytes")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
