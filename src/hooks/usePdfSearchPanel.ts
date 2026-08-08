import { useCallback, useRef, useState } from "react"

import type { PdfSearchEntry, PdfSearchMatch } from "../components/pdfText"

export interface PdfSearchState {
  query: string
  caseSensitive: boolean
  wholeWord: boolean
  entries: PdfSearchEntry[]
  matches: PdfSearchMatch[]
  loading: boolean
  currentIndex: number
}

/** The right-sidebar search state + the seq-bumped request objects for
 *  PdfView. `searchRequest.seq` / `jumpRequest.seq` bump on every explicit
 *  search action so PdfView's usePdfSearch effect re-runs even on equal values. */
export function usePdfSearchPanel() {
  const [pdfSearch, setPdfSearch] = useState<PdfSearchState>({
    query: "",
    caseSensitive: false,
    wholeWord: false,
    entries: [],
    matches: [],
    loading: false,
    currentIndex: 0
  })
  const searchSeqRef = useRef(0)
  const jumpSeqRef = useRef(0)

  const handlePdfSearch = useCallback(
    (query: string, opts?: { caseSensitive?: boolean; wholeWord?: boolean }) => {
      searchSeqRef.current += 1
      setPdfSearch((s) => ({
        ...s,
        query,
        caseSensitive: opts?.caseSensitive ?? s.caseSensitive,
        wholeWord: opts?.wholeWord ?? s.wholeWord,
        loading: true,
        currentIndex: 0
      }))
    },
    []
  )

  const handlePdfSearchOptions = useCallback(
    (opts: { caseSensitive: boolean; wholeWord: boolean }, query: string) => {
      const q = query.trim()
      setPdfSearch((s) => ({ ...s, ...opts, query: q }))
      if (q) searchSeqRef.current += 1
    },
    []
  )

  const handlePdfSearchResults = useCallback(
    (res: { entries: PdfSearchEntry[]; matches: PdfSearchMatch[] }) => {
      setPdfSearch((s) => ({
        ...s,
        entries: res.entries,
        matches: res.matches,
        loading: false
      }))
    },
    []
  )

  const handlePdfSearchEntry = useCallback((index: number) => {
    jumpSeqRef.current += 1
    setPdfSearch((s) => ({ ...s, currentIndex: index }))
  }, [])

  const handlePdfSearchNav = useCallback((dir: 1 | -1) => {
    setPdfSearch((s) => {
      if (s.entries.length === 0) return s
      const next = (s.currentIndex + dir + s.entries.length) % s.entries.length
      jumpSeqRef.current += 1
      return { ...s, currentIndex: next }
    })
  }, [])

  return {
    pdfSearch,
    searchRequest: {
      query: pdfSearch.query,
      caseSensitive: pdfSearch.caseSensitive,
      wholeWord: pdfSearch.wholeWord,
      seq: searchSeqRef.current
    },
    jumpRequest: { index: pdfSearch.currentIndex, seq: jumpSeqRef.current },
    handlePdfSearch,
    handlePdfSearchOptions,
    handlePdfSearchResults,
    handlePdfSearchEntry,
    handlePdfSearchNav
  }
}
