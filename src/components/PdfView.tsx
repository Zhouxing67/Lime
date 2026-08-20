import { useCallback, useEffect, useRef, useState } from "react"
import { Box, CircularProgress, Typography } from "@mui/material"

import PdfEngineView, { type PdfEngineViewProps } from "./PdfEngineView"
import PdfReaderPanel from "./PdfReaderPanel"
import { usePdfDocument } from "../hooks/usePdfDocument"
import { usePdfSearch } from "../hooks/usePdfSearch"
import {
  addVocabularyEntry,
  getAnnotationsByPdf,
  deleteAnnotationWithCard,
  saveAnnotationFromStore,
  updatePdfLastPage
} from "../database"
import { outlinePageNumber } from "./pdfText"
import type { PdfAnnotation, PdfOutlineItem } from "../types"
import type { PdfSearchEntry, PdfSearchMatch } from "./pdfText"
import type { IAnnotationStore } from "../pdf/inklayer/extensions/annotator/const/definitions"
import {
  cancelAiInterpretation,
  requestAiInterpretation
} from "../utils/ai"

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
  clearRingToken,
  annotationById,
  onToast,
  vocabularyFlashTarget
}: {
  pdfId: string | null
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
  annotationById?: Map<string, PdfAnnotation>
  onToast?: (message: string, severity?: "success" | "error") => void
  vocabularyFlashTarget?: PdfEngineViewProps["vocabularyFlashTarget"]
}) {
  const { loaded, error } = usePdfDocument(pdfId)
  const [stores, setStores] = useState<IAnnotationStore[]>([])
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null)
  const [pageJump, setPageJump] = useState<{ page: number; seq: number } | null>(null)
  const pageJumpSeqRef = useRef(0)
  const [currentPage, setCurrentPage] = useState(1)
  const restoredPdfIdRef = useRef<string | null>(null)
  const pageSaveTimerRef = useRef<number | null>(null)
  const pendingPageRef = useRef<number | null>(null)
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

  useEffect(() => {
    if (!loaded) {
      restoredPdfIdRef.current = null
      setPageJump(null)
      return
    }
    if (restoredPdfIdRef.current === loaded.file.id) return
    restoredPdfIdRef.current = loaded.file.id
    const restored = Math.min(
      loaded.pageCount,
      Math.max(1, loaded.file.lastPage ?? 1)
    )
    setCurrentPage(restored)
    if (
      restored > 1 &&
      !flashTarget &&
      !vocabularyFlashTarget &&
      !outlineDest
    ) {
      navigateTo(restored)
    }
  }, [
    loaded,
    flashTarget,
    vocabularyFlashTarget,
    outlineDest,
    navigateTo
  ])

  useEffect(() => {
    const pdfId = loaded?.file.id
    return () => {
      if (pageSaveTimerRef.current) {
        window.clearTimeout(pageSaveTimerRef.current)
        pageSaveTimerRef.current = null
      }
      const page = pendingPageRef.current
      pendingPageRef.current = null
      if (pdfId && page) void updatePdfLastPage(pdfId, page)
    }
  }, [loaded?.file.id])

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
      if (!loaded) return
      pendingPageRef.current = page
      if (pageSaveTimerRef.current) {
        window.clearTimeout(pageSaveTimerRef.current)
      }
      pageSaveTimerRef.current = window.setTimeout(() => {
        pageSaveTimerRef.current = null
        pendingPageRef.current = null
        void updatePdfLastPage(loaded.file.id, page)
      }, 750)
    },
    [loaded, onVisiblePageChange]
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
      paths?: { x: number; y: number }[][],
      comment?: string
    ) => {
      if (!loaded) return
      try {
        const saved = await saveAnnotationFromStore({
          pdfId: loaded.file.id,
          store: annotation,
          pos,
          rects,
          path,
          paths,
          comment
        })
        if (saved.cardId) {
          annIdToCardId.current.set(saved.id, saved.cardId)
        }
      } catch (e) {
        console.error("[pdf] saveAnnotationFromStore failed:", e)
        onToast?.("批注保存失败", "error")
        // Rethrow so EngineBridge's handleAdd catch can drop the mark from the
        // canvas via painter.removeAnnotationFromPanel — without the rejection
        // the mark lingers drawn-but-unpersisted (the engine has no external
        // update/removal channel other than that painter call).
        throw e
      }
    },
    [loaded, onToast]
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
        // Documented divergence: on a failed geometry edit the engine keeps the
        // edited mark while the DB keeps the old geometry — the engine has no
        // external re-draw channel, so they converge only on viewer remount.
        onToast?.("批注修改保存失败", "error")
      }
    },
    [loaded, onToast]
  )

  const handleSelected = useCallback(
    (annotation: IAnnotationStore | null, isClick?: boolean) => {
      // Mirror the engine's selector selection (mark click OR empty-click
      // deselect) into the panel's persistent card highlight.
      onAnnotationSelected?.(annotation ? annotation.id : null)
      if (!annotation || !isClick || !onJumpInPanel) return
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
          typeChangeRequest={typeChangeRequest}
          clearRingToken={clearRingToken}
          annotationById={annotationById}
          vocabularyFlashTarget={vocabularyFlashTarget}
          onAddVocabulary={async (data) => {
            if (!loaded) return
            try {
              const result = await addVocabularyEntry({
                pdfId: loaded.file.id,
                ...data
              })
              const unchanged =
                result.duplicateTranslation && result.duplicateOccurrence
              onToast?.(
                unchanged ? "该生词和翻译已存在" : "已加入生词卡",
                unchanged ? "error" : "success"
              )
            } catch (error) {
              console.error("[pdf] add vocabulary failed:", error)
              onToast?.("生词保存失败", "error")
              throw error
            }
          }}
          onAiInterpret={(text, requestId) =>
            requestAiInterpretation(requestId, text, loaded.file.aiContext)
          }
          onAiCancel={cancelAiInterpretation}
        />
      </Box>
    </Box>
  )
}
