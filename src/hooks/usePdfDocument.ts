import { useEffect, useState } from "react"

import * as pdfjsLib from "pdfjs-dist"

import { getPdf } from "../database"
import type { PdfFile } from "../types"

// The ORIGINAL ESM worker served as a web-accessible asset (Parcel would wrap
// the .mjs into a UMD bundle that pdf.js can't load as a module worker).
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(
  "assets/pdfjs/pdf.worker.min.mjs"
)

export interface LoadedPdf {
  file: PdfFile
  doc: pdfjsLib.PDFDocumentProxy
  pageCount: number
  outline: Awaited<ReturnType<pdfjsLib.PDFDocumentProxy["getOutline"]>> | null
}

/** Load a stored PDF (bytes from IndexedDB) into a pdf.js document. */
export function usePdfDocument(pdfId: string | null) {
  const [loaded, setLoaded] = useState<LoadedPdf | null>(null)
  const [error, setError] = useState<string | null>(null)

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
        setLoaded({ file, doc, pageCount: doc.numPages, outline })
      } catch (e) {
        setError((e as Error)?.message ?? "PDF 加载失败")
      }
    })()
    return () => {
      cancelled = true
      task?.destroy().catch(() => {})
    }
  }, [pdfId])

  return { loaded, error }
}
