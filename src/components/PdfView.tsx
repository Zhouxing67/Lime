import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Box, CircularProgress, Typography } from "@mui/material"

import PdfEngineView from "./PdfEngineView"
import { usePdfDocument } from "../hooks/usePdfDocument"
import { getAnnotationsByPdf, deleteAnnotationWithCard, saveAnnotationFromStore } from "../database"
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
  onOutlineClick
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
}) {
  const { loaded, error } = usePdfDocument(pdfId)
  const [stores, setStores] = useState<IAnnotationStore[]>([])
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null)
  const annIdToCardId = useRef<Map<string, string>>(new Map())

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
      onVisiblePageChange?.(page)
    },
    [onVisiblePageChange]
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
    async (annotation: IAnnotationStore) => {
      if (!loaded) return
      try {
        await saveAnnotationFromStore({ pdfId: loaded.file.id, store: annotation })
      } catch (e) {
        console.error("[pdf] saveAnnotationFromStore (changed) failed:", e)
      }
    },
    [loaded]
  )

  const handleSelected = useCallback(
    (annotation: IAnnotationStore | null) => {
      if (!annotation || !onJumpInPanel) return
      const cardId = annIdToCardId.current.get(annotation.id)
      if (cardId) onJumpInPanel(cardId)
    },
    [onJumpInPanel]
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
    <Box sx={{ height: "100%", minHeight: 0, overflow: "hidden" }}>
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
      />
    </Box>
  )
}
