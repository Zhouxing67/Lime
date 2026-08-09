import { useCallback, useRef, useState } from "react"

import type { SidebarTab } from "../components/NavRail"
import type { DisplayCard } from "../types"
import { nextSidebarAction } from "../utils/nav"
import { touchPdf } from "../database/pdfs"

export interface CardWorkspaceState {
  view: "edit" | "create"
  card: DisplayCard | null
}

const MAX_OPEN_PDFS = 4

/** The workspace view routing — sidebarTab + the left-drawer/reader mutex +
 *  the card-editor workspace + the PDF keep-alive multi-open. The composition
 *  root (options) renders the shell and routes between the views using the
 *  returned state; this hook owns the view state and its coordination. */
export function useWorkspaceView(refresh: () => void) {
  const [sidebarTab, setSidebarTabState] = useState<SidebarTab>("projects")
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [readerOpen, setReaderOpen] = useState(false)
  const [cardWorkspace, setCardWorkspace] =
    useState<CardWorkspaceState | null>(null)
  const [openPdfIds, setOpenPdfIds] = useState<string[]>([])
  const [activePdfId, setActivePdfId] = useState<string | null>(null)

  const sidebarTabRef = useRef(sidebarTab)
  sidebarTabRef.current = sidebarTab
  const activePdfIdRef = useRef<string | null>(null)
  activePdfIdRef.current = activePdfId
  const openPdfIdsRef = useRef<string[]>([])
  openPdfIdsRef.current = openPdfIds
  const drawerOpenRef = useRef(drawerOpen)
  drawerOpenRef.current = drawerOpen
  const readerOpenRef = useRef(readerOpen)
  readerOpenRef.current = readerOpen

  // ---- left-drawer ↔ reader-panel mutual exclusion (at most ONE open) ----
  const openReader = useCallback(() => {
    setReaderOpen(true)
    setDrawerOpen(false)
  }, [])

  const toggleReader = useCallback(() => {
    if (readerOpenRef.current) setReaderOpen(false)
    else {
      setReaderOpen(true)
      setDrawerOpen(false)
    }
  }, [])

  const openDrawer = useCallback(() => {
    setDrawerOpen(true)
    setReaderOpen(false)
  }, [])

  const toggleDrawer = useCallback(() => {
    if (drawerOpenRef.current) setDrawerOpen(false)
    else {
      setDrawerOpen(true)
      setReaderOpen(false)
    }
  }, [])

  const swapLeft = useCallback(() => {
    if (readerOpenRef.current) {
      setReaderOpen(false)
      setDrawerOpen(true)
    } else {
      setReaderOpen(true)
      setDrawerOpen(false)
    }
  }, [])

  // ---- the card-editor workspace ----
  const openCardWorkspace = useCallback(
    (view: "edit" | "create", card: DisplayCard | null) => {
      setCardWorkspace({ view, card })
    },
    []
  )
  const closeCardWorkspace = useCallback(() => setCardWorkspace(null), [])

  // ---- the PDF keep-alive multi-open (LRU capped) ----
  const openPdf = useCallback((id: string) => {
    touchPdf(id)
    const cur = openPdfIdsRef.current
    const next = cur.includes(id) ? cur : [...cur, id]
    const trimmed = next.length > MAX_OPEN_PDFS ? next.slice(1) : next
    setOpenPdfIds(trimmed)
    setActivePdfId(id)
  }, [])

  const closePdf = useCallback((id: string) => {
    const next = openPdfIdsRef.current.filter((x) => x !== id)
    setOpenPdfIds(next)
    if (activePdfIdRef.current === id) {
      setActivePdfId(next.length > 0 ? next[next.length - 1] : null)
    }
  }, [])

  // ---- navigation coordination ----
  /** Switch to a view: leave the card editor (workspace-only), refresh once
   *  when leaving the PDF view (its reload was skipped while inside). */
  const navigate = useCallback(
    (tab: SidebarTab) => {
      setCardWorkspace(null)
      if (sidebarTabRef.current === "pdf") refresh()
      setSidebarTabState(tab)
      openDrawer()
    },
    [refresh, openDrawer]
  )

  const handleSetSidebarTab = useCallback(
    (tab: SidebarTab) => {
      if (nextSidebarAction(tab, sidebarTabRef.current) === "toggle") {
        toggleDrawer()
      } else {
        navigate(tab)
      }
    },
    [toggleDrawer, navigate]
  )

  return {
    sidebarTab,
    sidebarTabRef,
    drawerOpen,
    pdfReaderOpen: readerOpen,
    cardWorkspace,
    openPdfIds,
    activePdfId,
    handleSetSidebarTab,
    navigate,
    openDrawer,
    toggleDrawer,
    swapLeft,
    toggleReader,
    openReader,
    openCardWorkspace,
    closeCardWorkspace,
    openPdf,
    closePdf
  }
}
