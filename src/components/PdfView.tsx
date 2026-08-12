import { useCallback, useEffect, useRef, useState } from "react"
import { Box, CircularProgress, Typography } from "@mui/material"

import PdfEngineView from "./PdfEngineView"
import PdfReaderPanel from "./PdfReaderPanel"
import { usePdfDocument } from "../hooks/usePdfDocument"
import { usePdfSearch } from "../hooks/usePdfSearch"
import { getAnnotationsByPdf, deleteAnnotationWithCard, saveAnnotationFromStore } from "../database"
import { outlinePageNumber } from "./pdfText"
import type { PdfOutlineItem } from "../types"
import type { PdfSearchEntry, PdfSearchMatch } from "./pdfText"
import type { IAnnotationStore } from "../pdf/inklayer/extensions/annotator/const/definitions"

export default function PdfView({
  pdfId,
  outlineDest,
  flashTarget,
  onJumpInPanel,
  onVisiblePageChange,
  onPageCountChange,
  onSearchClick,
  searchRequest,
  onSearchResults,
  jumpRequest,
  readerOpen,
  onToggleReader,
  onSwapLeft,
  onOutlineClick,
  typeChangeRequest,
  onAnnotationSelected,
  clearRingToken
}: {
  pdfId: string | null
  onOutlineLoaded?: (outline: PdfOutlineItem[] | null) => void
  outlineDest?: PdfOutlineItem | null
  flashTarget?: { page: number; annId: string; token: number } | null
  onJumpInPanel?: (cardId: string) => void
  onVisiblePageChange?: (page: number) => void
  onPageCountChange?: (n: number) => void
  onSearchClick?: () => void
  searchRequest?: { query: string; caseSensitive: boolean; wholeWord: boolean; seq: number } | null
  onSearchResults?: (res: { entries: PdfSearchEntry[]; matches: PdfSearchMatch[] }) => void
  jumpRequest?: { index: number; seq: number } | null
  readerOpen?: boolean
  onToggleReader?: () => void
  onSwapLeft?: () => void
  onOutlineClick?: (item: PdfOutlineItem) => void
  typeChangeRequest?: { id: string; type: number; seq: number } | null
  onAnnotationSelected?: (annId: string | null) => void
  clearRingToken?: number
}) {
  const { loaded, error } = usePdfDocument(pdfId)
  const [stores, setStores] = useState<IAnnotationStore[]>([])
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null)
  const [pageJump, setPageJump] = useState<{ page: number; seq: number } | null>(null)
  const pageJumpSeqRef = useRef(0)
  const [currentPage, setCurrentPage] = useState(1)
  const annIdToCardId = useRef<Map<string, string>>(new Map())

  const navigateTo = useCallback((page: number) => {
    pageJumpSeqRef.current += 1
    setPageJump({ page, seq: pageJumpSeqRef.current })
  }, [])

  const searchFlash = usePdfSearch(
    loaded?.doc ?? null,
    searchRequest ?? null,
    onSearchResults,
    jumpRequest ?? null,
    navigateTo
  )
  useEffect(() => {
    if (loaded) onPageCountChange?.(loaded.pageCount)
  }, [loaded, onPageCountChange])

  // The engine bytes + annotations for the loaded PDF. Reloads on `_dbpdf`
  // (panel deletes/edits must reflect in the PDF immediately, no refresh).
  useEffect(() => {
    let cancelled = false
    setStores([])
    setBytes(null)
    if (!loaded || !loaded.file.bytes) {
      return
    }
    const loadBytes = async () => {
      if (!loaded.file.bytes) return
      const buf = await loaded.file.bytes.arrayBuffer()
      if (cancelled) return
      setBytes(buf)
    }
    const reload = async () => {
      const anns = await getAnnotationsByPdf(loaded.file.id)
      if (cancelled) return
      annIdToCardId.current = new Map(
        anns.filter((a) => a.cardId).map((a) => [a.id, a.cardId!])
      )
      setStores(
        anns
          .filter((a) => a.store != null)
          .map((a) => a.store as IAnnotationStore)
      )
    }
    void loadBytes()
    void reload()
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      // _dbpdf = annotations/cards changed elsewhere (panel) — refresh the
      // annotation list incrementally; the engine sync drops removed marks.
      if (area === "local" && changes._dbpdf) {
        void reload()
      }
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => {
      cancelled = true
      chrome.storage.onChanged.removeListener(onChange)
    }
  }, [loaded])

  const handleVisiblePage = useCallback(
    (page: number) => {
      setCurrentPage(page)
      onVisiblePageChange?.(page)
    },
    [onVisiblePageChange]
  )

  const handleOutlineClick = useCallback(
    async (item: PdfOutlineItem) => {
      if (!loaded?.doc) return
      onOutlineClick?.(item)
      const page = await outlinePageNumber(loaded.doc, item)
      if (page) navigateTo(page)
    },
    [loaded, onOutlineClick, navigateTo]
  )

  const handleAdd = useCallback(
    async (
      annotation: IAnnotationStore,
      pos?: { x: number; y: number },
      rects?: { x: number; y: number; w: number; h: number }[],
      path?: { x: number; y: number }[],
      paths?: { x: number; y: number }[][]
    ) => {
      if (!loaded) return
      try {
        const saved = await saveAnnotationFromStore({
          pdfId: loaded.file.id,
          store: annotation,
          pos,
          rects,
          path,
          paths
        })
        if (saved.cardId) {
          annIdToCardId.current.set(saved.id, saved.cardId)
        }
      } catch (e) {
        console.error("[pdf] saveAnnotationFromStore failed:", e)
      }
    },
    [loaded]
  )

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteAnnotationWithCard(id)
    } catch (e) {
      console.error("[pdf] deleteAnnotationWithCard failed:", e)
    }
  }, [])

  const handleChanged = useCallback(
    async (
      annotation: IAnnotationStore,
      pos?: { x: number; y: number },
      rects?: { x: number; y: number; w: number; h: number }[],
      path?: { x: number; y: number }[],
      paths?: { x: number; y: number }[][]
    ) => {
      if (!loaded) return
      try {
        // Edits change the geometry — refresh the crop's normalized fields so
        // the placed-card crop isn't stale after a move/resize.
        await saveAnnotationFromStore({
          pdfId: loaded.file.id,
          store: annotation,
          pos,
          rects,
          path,
          paths
        })
      } catch (e) {
        console.error("[pdf] saveAnnotationFromStore (changed) failed:", e)
      }
    },
    [loaded]
  )

  const handleSelected = useCallback(
    (annotation: IAnnotationStore | null) => {
      // Mirror the engine's selector selection (mark click OR empty-click
      // deselect) into the panel's persistent card highlight.
      onAnnotationSelected?.(annotation ? annotation.id : null)
      if (!annotation || !onJumpInPanel) return
      const cardId = annIdToCardId.current.get(annotation.id)
      if (cardId) onJumpInPanel(cardId)
    },
    [onJumpInPanel, onAnnotationSelected]
  )

  if (error) {
    return (
      <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}>
        <Typography color="error">{error}</Typography>
      </Box>
    )
  }

  if (!loaded || !bytes) {
    return (
      <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}>
        <CircularProgress size={28} />
      </Box>
    )
  }

  return (
    <Box sx={{ display: "flex", height: "100%", minHeight: 0, overflow: "hidden" }}>
      {readerOpen && (
        <Box
          sx={{
            width: 250,
            minWidth: 250,
            borderRight: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column"
          }}>
          <PdfReaderPanel
            outline={loaded.outline}
            doc={loaded.doc}
            currentPage={currentPage}
            onOutlineClick={handleOutlineClick}
            onJumpPage={navigateTo}
          />
        </Box>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <PdfEngineView
          data={bytes}
          title={loaded.file.name}
          annotations={stores}
          onAnnotationAdd={handleAdd}
          onAnnotationDelete={handleDelete}
          onAnnotationChanged={handleChanged}
          onAnnotationSelected={handleSelected}
          onVisiblePageChange={handleVisiblePage}
          onSearchClick={onSearchClick}
          onToggleReader={onToggleReader}
          onSwapLeft={onSwapLeft}
          readerOpen={readerOpen}
          flashTarget={flashTarget}
          pageJump={pageJump}
          searchFlash={searchFlash}
          searchQuery={searchRequest?.query}
          searchOptions={
            searchRequest
              ? {
                  caseSensitive: searchRequest.caseSensitive,
                  wholeWord: searchRequest.wholeWord
                }
              : undefined
          }
          typeChangeRequest={typeChangeRequest}
          clearRingToken={clearRingToken}
        />
      </Box>
    </Box>
  )
}
