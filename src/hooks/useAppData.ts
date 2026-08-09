import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type {
  PdfAnnotation,
  PdfCard,
  PdfFile,
  ProjectCard,
  ReviewEntry,
  SrsData,
  TodoCard
} from "../types"
import {
  getAllAnnotations,
  getAllPdfCards,
  getAllProjectCards,
  getAllReviews,
  getAllTodos,
  getAnnotationsByPdf,
  getIncompleteTodoCount,
  getPdfCards,
  getDueCount,
  listPdfs
} from "../database/index"
import { ensureRegionImage } from "../database/pdfs"
import { applyBadge } from "../utils"

export interface UseAppDataOpts {
  loadProjectsRef: React.MutableRefObject<() => Promise<unknown>>
  onSearchRef: React.MutableRefObject<() => Promise<void>>
  sidebarTabRef: React.MutableRefObject<string>
  activePdfIdRef: React.MutableRefObject<string | null>
}

/** The shared data hub — every cross-view data source (cards, todos, reviews,
 *  pdfs, annotations), the derived lookup maps, the debounced reloads, and the
 *  chrome.storage.onChanged broadcast listener. Adding a data source = one
 *  place to extend. */
export function useAppData({
  loadProjectsRef,
  onSearchRef,
  sidebarTabRef,
  activePdfIdRef
}: UseAppDataOpts) {
  const [pdfs, setPdfs] = useState<PdfFile[]>([])
  const [allProjectCardsUnfiltered, setAllProjectCardsUnfiltered] = useState<
    ProjectCard[]
  >([])
  const [allPdfCards, setAllPdfCards] = useState<PdfCard[]>([])
  const [annotationById, setAnnotationById] = useState<
    Map<string, PdfAnnotation>
  >(new Map())
  const [allTodos, setAllTodos] = useState<TodoCard[]>([])
  const [allReviews, setAllReviews] = useState<ReviewEntry[]>([])
  const [reviewsVersion, setReviewsVersion] = useState(0)
  const [reviewItemIds, setReviewItemIds] = useState<Set<string>>(new Set())
  const [reviewSrsMap, setReviewSrsMap] = useState<Map<string, SrsData>>(
    new Map()
  )
  const [masteredItemIds, setMasteredItemIds] = useState<Set<string>>(
    new Set()
  )
  const [pdfPanelAnnotations, setPdfPanelAnnotations] = useState<
    PdfAnnotation[]
  >([])
  const [pdfPanelCards, setPdfPanelCards] = useState<PdfCard[]>([])
  const [liteDueCount, setLiteDueCount] = useState(0)
  const [liteTodoCount, setLiteTodoCount] = useState(0)

  // ---- derived lookup maps ----
  // The pdfCard lookup (a placed card resolves its content via the linked
  // pdfCard, whose pdfId maps to the PdfFile for the name/footer).
  const pdfById = useMemo(() => {
    const m = new Map<string, PdfCard>()
    for (const c of allPdfCards) m.set(c.id, c)
    return m
  }, [allPdfCards])

  // PDF name for the placed-card footer (PDF名 · 第 X 页).
  const pdfNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of pdfs) m.set(p.id, p.name)
    return m
  }, [pdfs])

  const countByPdf = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of allPdfCards) {
      m[c.pdfId] = (m[c.pdfId] ?? 0) + 1
    }
    return m
  }, [allPdfCards])

  const countByProject = useMemo(() => {
    const m: Record<string, number> = {}
    for (const it of allProjectCardsUnfiltered) {
      m[it.projectId] = (m[it.projectId] ?? 0) + 1
    }
    return m
  }, [allProjectCardsUnfiltered])

  const draftByOriginal = useMemo(() => {
    const m = new Map<string, ProjectCard>()
    for (const c of allProjectCardsUnfiltered) {
      if (c.isDraft && c.draftOf) m.set(c.draftOf, c)
    }
    return m
  }, [allProjectCardsUnfiltered])

  // ---- loaders ----
  const loadTodos = useCallback(async () => {
    const todos = await getAllTodos()
    setAllTodos(todos)
  }, [])

  const loadPdfs = useCallback(async () => {
    const list = await listPdfs()
    setPdfs(list)
  }, [])

  // The cards panel's data (the active PDF's annotations + cards) is loaded
  // centrally here — the panel is a peer surface, not a PdfView sub-component.
  const loadPdfPanelData = useCallback(async () => {
    // Read the CURRENT active pdf via the ref — a debounced reload scheduled
    // for PDF A must not overwrite the panel after a switch to PDF B.
    const id = activePdfIdRef.current
    if (!id) {
      setPdfPanelAnnotations([])
      setPdfPanelCards([])
      return
    }
    const [ann, cards] = await Promise.all([
      getAnnotationsByPdf(id),
      getPdfCards(id)
    ])
    setPdfPanelAnnotations(ann)
    setPdfPanelCards(cards)
  }, [activePdfIdRef])

  const refreshLiteCounts = useCallback(async () => {
    const [due, todo] = await Promise.all([
      getDueCount(),
      getIncompleteTodoCount()
    ])
    setLiteDueCount(due)
    setLiteTodoCount(todo)
    applyBadge(due + todo)
  }, [])

  const pdfPanelTimerRef = useRef<number | null>(null)
  const schedulePdfPanelReload = useCallback(() => {
    if (pdfPanelTimerRef.current)
      window.clearTimeout(pdfPanelTimerRef.current)
    pdfPanelTimerRef.current = window.setTimeout(() => {
      pdfPanelTimerRef.current = null
      loadPdfPanelData()
    }, 100)
  }, [loadPdfPanelData])

  // Coalesce `_dbpdf` bursts (a legacy-annotation backfill, a batch
  // place/unplace): the library list + pdfCard cache + panel data all reload
  // through ONE debounced pass instead of per-broadcast store scans.
  const pdfDataTimerRef = useRef<number | null>(null)
  const schedulePdfDataReload = useCallback(() => {
    if (pdfDataTimerRef.current) window.clearTimeout(pdfDataTimerRef.current)
    pdfDataTimerRef.current = window.setTimeout(() => {
      pdfDataTimerRef.current = null
      loadPdfs()
      getAllPdfCards().then(setAllPdfCards)
      getAllAnnotations().then((list) =>
        setAnnotationById(new Map(list.map((a) => [a.id, a])))
      )
      loadPdfPanelData()
    }, 100)
  }, [loadPdfs, loadPdfPanelData])

  // Coalesce burst writes: a batch/annotation/toggle sequence fires many _dbi
  // broadcasts within ~150ms — debounce them into ONE refreshAllData instead of
  // a full-store re-scan per write.
  const refreshTimerRef = useRef<number | null>(null)
  const scheduleFullReload = useCallback(() => {
    if (sidebarTabRef.current !== "pdf") {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null
        refreshAllDataRef.current()
      }, 150)
    }
  }, [sidebarTabRef])

  const refreshAllDataRef = useRef<() => Promise<void>>(async () => {})
  const refreshAllData = useCallback(async () => {
    await loadProjectsRef.current()
    await onSearchRef.current()
    await loadTodos()
    const [all, pdfs] = await Promise.all([
      getAllProjectCards(),
      getAllPdfCards()
    ])
    setAllProjectCardsUnfiltered(all)
    setAllPdfCards(pdfs)
  }, [loadTodos, loadProjectsRef, onSearchRef])
  refreshAllDataRef.current = refreshAllData

  // ---- initial + reactive loads ----
  // Load unfiltered cards for review + hub counts + backup scope
  // (cross-project, independent of the active project), plus the pdfCards that
  // resolve placed cards' content for display.
  useEffect(() => {
    getAllProjectCards().then(setAllProjectCardsUnfiltered)
    getAllPdfCards().then(setAllPdfCards)
    getAllAnnotations().then((list) =>
      setAnnotationById(new Map(list.map((a) => [a.id, a])))
    )
  }, [])

  useEffect(() => {
    loadPdfs()
  }, [loadPdfs])

  // Load review states (refresh when items or review data change)
  useEffect(() => {
    getAllReviews().then((reviews) => {
      setAllReviews(reviews)
      setReviewItemIds(new Set(reviews.map((r) => r.itemId)))
      setReviewSrsMap(new Map(reviews.map((r) => [r.itemId, r.srs])))
      setMasteredItemIds(
        new Set(
          reviews
            .filter((r) => r.status === "mastered")
            .map((r) => r.itemId)
        )
      )
    })
  }, [allProjectCardsUnfiltered, reviewsVersion])

  useEffect(() => {
    loadPdfPanelData()
  }, [activePdfIdRef, loadPdfPanelData])

  // Lazy backfill: a placed region card whose annotation has no crop image
  // (pre-image placements) generates it on sight + refreshes the annotation
  // map. Idempotent — after the images land, `missing` is empty and the
  // effect stops.
  useEffect(() => {
    let cancelled = false
    const missing = allPdfCards.filter((c) => {
      if (c.kind !== "region") return false
      const ann = annotationById.get(c.annotationId)
      return Boolean(ann) && !ann!.image
    })
    if (missing.length === 0) return
    ;(async () => {
      for (const card of missing) {
        if (cancelled) return
        await ensureRegionImage(card.annotationId, card.pdfId)
      }
      if (cancelled) return
      const list = await getAllAnnotations()
      if (!cancelled)
        setAnnotationById(new Map(list.map((a) => [a.id, a])))
    })()
    return () => {
      cancelled = true
    }
  }, [allPdfCards, annotationById])

  useEffect(
    () => () => {
      if (pdfPanelTimerRef.current)
        window.clearTimeout(pdfPanelTimerRef.current)
      if (pdfDataTimerRef.current) window.clearTimeout(pdfDataTimerRef.current)
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current)
    },
    []
  )

  // ---- the cross-context broadcast listener ----
  useEffect(() => {
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>
    ) => {
      if (changes._dbp) {
        loadProjectsRef.current()
        schedulePdfPanelReload()
        refreshLiteCounts()
        if (sidebarTabRef.current !== "pdf") scheduleFullReload()
      }
      // projectCards writes: refresh the placements + the grids. The heavy
      // full reload stays gated behind the pdf view (the panel reload covers
      // the pdf-side needs there).
      if (changes._dbi) {
        getAllProjectCards().then(setAllProjectCardsUnfiltered)
        schedulePdfPanelReload()
        refreshLiteCounts()
        if (sidebarTabRef.current !== "pdf") scheduleFullReload()
      }
      // todos writes: light — refresh the todo list + the badge only, never
      // the project-card scan / full reload chain.
      if (changes._dbt) {
        loadTodos()
        refreshLiteCounts()
      }
      // Review writes broadcast `_dbr`: reload only review state (light),
      // never the full refreshAllData chain.
      if (changes._dbr) {
        setReviewsVersion((v) => v + 1)
        refreshLiteCounts()
      }
      // PDF writes broadcast `_dbpdf`: refresh the PDF library + the cards panel
      // + the pdfCard cache (placed cards' resolved content/comment re-render).
      if (changes._dbpdf) {
        // Debounced: a burst (backfill / batch place) coalesces into ONE
        // library + cards + panel reload instead of per-broadcast store scans.
        schedulePdfDataReload()
      }
      // Metadata-only (touchPdf/lastOpened): re-sort the library WITHOUT the
      // card/panel reload chain — opening a PDF must not rescan the cards.
      if (changes._dbpdfTouch) {
        loadPdfs()
      }
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [
    loadPdfs,
    loadPdfPanelData,
    loadTodos,
    refreshLiteCounts,
    scheduleFullReload,
    schedulePdfDataReload,
    schedulePdfPanelReload,
    sidebarTabRef,
    loadProjectsRef,
    onSearchRef
  ])

  return {
    pdfs,
    setPdfs,
    allProjectCardsUnfiltered,
    setAllProjectCardsUnfiltered,
    allPdfCards,
    setAllPdfCards,
    annotationById,
    setAnnotationById,
    allTodos,
    setAllTodos,
    allReviews,
    reviewsVersion,
    setReviewsVersion,
    reviewItemIds,
    setReviewItemIds,
    reviewSrsMap,
    setReviewSrsMap,
    masteredItemIds,
    pdfPanelAnnotations,
    pdfPanelCards,
    liteDueCount,
    liteTodoCount,
    pdfById,
    pdfNameById,
    countByPdf,
    countByProject,
    draftByOriginal,
    loadTodos,
    loadPdfs,
    loadPdfPanelData,
    refreshLiteCounts,
    schedulePdfPanelReload,
    schedulePdfDataReload,
    scheduleFullReload,
    refreshAllData
  }
}
