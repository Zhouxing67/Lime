import { useEffect, useRef, useState } from "react"
import * as pdfjsLib from "pdfjs-dist"

import { searchPdfText } from "../components/pdfText"
import type { PdfSearchEntry, PdfSearchMatch } from "../components/pdfText"

export interface PdfSearchFlash {
  page: number
  matches: { start: number; end: number }[]
  current: number
  /** The active query — lets the highlight verify its offsets against the
   *  rendered text layer (diagnostic). */
  query?: string
  /** The page's getTextContent concatenation — lets the diagnostic diff it
   *  against the rendered text layer's text (drift root cause). */
  full?: string
}

/** PDF full-text search coordination (hosted by PdfView, driven by the options
 *  root): runs `searchPdfText` on a seq-bumped request, reports the results up,
 *  and turns a jump request into a page navigation + an all-matches flash.
 *
 *  Seq protocol: `searchRequest.seq` / `jumpRequest.seq` MUST be bumped by the
 *  caller on every explicit action (Enter / checkbox / entry click / prev-next)
 *  — equal values don't retrigger the effects below. */
export function usePdfSearch(
  doc: pdfjsLib.PDFDocumentProxy | null,
  searchRequest: {
    query: string
    caseSensitive: boolean
    wholeWord: boolean
    seq: number
  } | null,
  onSearchResults:
    | ((res: { entries: PdfSearchEntry[]; matches: PdfSearchMatch[] }) => void)
    | undefined,
  jumpRequest: { index: number; seq: number } | null,
  navigateTo: (page: number) => void
): PdfSearchFlash | null {
  const [searchFlash, setSearchFlash] = useState<PdfSearchFlash | null>(null)
  const searchAbortRef = useRef<AbortController | null>(null)
  const lastSearchRef = useRef<{
    entries: PdfSearchEntry[]
    matches: PdfSearchMatch[]
    pageTexts?: Record<number, string>
  }>({
    entries: [],
    matches: []
  })
  useEffect(() => {
    return () => searchAbortRef.current?.abort()
  }, [])

  // Run a search requested by the options root (the right-sidebar panel).
  useEffect(() => {
    if (!doc || !searchRequest) return
    const q = searchRequest.query.trim()
    searchAbortRef.current?.abort()
    const ac = new AbortController()
    searchAbortRef.current = ac
    searchPdfText(
      doc,
      q,
      {
        caseSensitive: searchRequest.caseSensitive,
        wholeWord: searchRequest.wholeWord
      },
      500,
      ac.signal
    ).then((res) => {
      if (ac.signal.aborted) return
      lastSearchRef.current = res
      onSearchResults?.(res)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchRequest?.seq, doc])

  // Navigate to a search entry (from the right-sidebar panel).
  useEffect(() => {
    if (!jumpRequest) return
    const entry = lastSearchRef.current.entries[jumpRequest.index]
    if (!entry) return
    navigateTo(entry.page)
    const pageMatches = lastSearchRef.current.matches.filter(
      (m) => m.page === entry.page
    )
    const current = pageMatches.findIndex(
      (m) => m.start === entry.start && m.end === entry.end
    )
    setSearchFlash({
      page: entry.page,
      matches: pageMatches.map((m) => ({ start: m.start, end: m.end })),
      current: current >= 0 ? current : 0,
      query: searchRequest?.query,
      full: lastSearchRef.current.pageTexts?.[entry.page]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpRequest?.seq])

  return searchFlash
}
