import { useEffect, useRef, useState } from "react"

import * as pdfjsLib from "pdfjs-dist"

import { getPdf } from "../database"
import type { PdfFile } from "../types"
import { ensurePdfWorker } from "../utils/pdfWorker"

// The ORIGINAL ESM worker served as a web-accessible asset (Parcel would wrap
// the .mjs into a UMD bundle that pdf.js can't load as a module worker). A Blob
// URL (via ensurePdfWorker) is robust for both the real Worker and pdf.js's
// fake-worker fallback (whose bundled dynamic import can't resolve a runtime
// chrome-extension:// URL). ensurePdfWorker() is awaited in the load effect.

export interface LoadedPdf {
  file: PdfFile
  doc: pdfjsLib.PDFDocumentProxy
  pageCount: number
  outline: Awaited<ReturnType<pdfjsLib.PDFDocumentProxy["getOutline"]>> | null
}

/** Content-relevant file signature — the placeholder→bytes fill changes it;
 *  annotation writes (also _dbpdf) don't. */
function fileSig(file: PdfFile | undefined): string {
  if (!file) return ""
  return `${file.bytes ? "bytes" : "no-bytes"}|${file.name}`
}

/** Load a stored PDF (bytes from IndexedDB) into a pdf.js document. */
export function usePdfDocument(pdfId: string | null) {
  const [loaded, setLoaded] = useState<LoadedPdf | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pdfVersion, setPdfVersion] = useState(0)
  const fileSigRef = useRef("")

  useEffect(() => {
    if (!pdfId) return
    // A synced placeholder gains its bytes when the user opens the matching
    // local file — addPdf merges the bytes onto the SAME content-hash id, so
    // pdfId alone never changes and the load effect wouldn't re-run (B4). Watch
    // the pdfs broadcast and reload only when the FILE changed (placeholder→
    // bytes); annotation writes also broadcast _dbpdf but must not reload the
    // open document.
    const onChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area !== "local" || !("_dbpdf" in changes)) return
      getPdf(pdfId).then((file) => {
        const sig = fileSig(file)
        if (sig !== fileSigRef.current) setPdfVersion((v) => v + 1)
      })
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [pdfId])

  useEffect(() => {
    if (!pdfId) {
      setLoaded(null)
      setError(null)
      return
    }
    let cancelled = false
    let task: pdfjsLib.PDFDocumentLoadingTask | null = null
    setLoaded(null)
    setError(null)
    ;(async () => {
      try {
        const file = await getPdf(pdfId)
        if (!file) {
          setError("PDF 不存在")
          return
        }
        if (!file.bytes) {
          fileSigRef.current = fileSig(file)
          setError("该 PDF 尚未同步文件，请打开本地文件后匹配批注")
          return
        }
        await ensurePdfWorker()
        task = pdfjsLib.getDocument({
          data: await file.bytes.arrayBuffer(),
          cMapUrl: chrome.runtime.getURL("assets/pdfjs/cmaps/"),
          cMapPacked: true,
          standardFontDataUrl: chrome.runtime.getURL(
            "assets/pdfjs/standard_fonts/"
          )
        })
        const doc = await task.promise
        if (cancelled) return
        const outline = await doc.getOutline().catch(() => null)
        fileSigRef.current = fileSig(file)
        setLoaded({ file, doc, pageCount: doc.numPages, outline })
      } catch (e) {
        setError((e as Error)?.message ?? "PDF 加载失败")
      }
    })()
    return () => {
      cancelled = true
      task?.destroy().catch(() => {})
    }
  }, [pdfId, pdfVersion])

  return { loaded, error }
}
