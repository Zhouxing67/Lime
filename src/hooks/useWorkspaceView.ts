import { useCallback, useRef, useState } from "react"

import type { SidebarTab } from "../components/NavRail"
import type { DisplayCard } from "../types"
import { nextSidebarAction } from "../utils/nav"
import { touchPdf } from "../database/pdfs"

export interface CardWorkspaceState {
  view: "edit" | "create"
  card: DisplayCard | null
}

/** The workspace view routing — sidebarTab + the left-drawer/reader mutex +
 *  the card-editor workspace + the single active PDF. The composition
 *  root (options) renders the shell and routes between the views using the
 *  returned state; this hook owns the view state and its coordination. */
export function useWorkspaceView(
  refreshRef: React.MutableRefObject<() => void>
) {
  const [sidebarTab, setSidebarTabState] = useState<SidebarTab>("projects")
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [readerOpen, setReaderOpen] = useState(false)
  const [cardWorkspace, setCardWorkspace] =
    useState<CardWorkspaceState | null>(null)
  const [activePdfId, setActivePdfId] = useState<string | null>(null)

  const sidebarTabRef = useRef(sidebarTab)
  sidebarTabRef.current = sidebarTab
  const activePdfIdRef = useRef<string | null>(null)
  activePdfIdRef.current = activePdfId
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

  // ---- single active PDF ----
  const openPdf = useCallback((id: string) => {
    touchPdf(id)
    setActivePdfId(id)
  }, [])

  const closePdf = useCallback((id: string) => {
    if (activePdfIdRef.current === id) {
      setActivePdfId(null)
    }
  }, [])

  // ---- navigation coordination ----
  /** Switch to a view: leave the card editor (workspace-only), refresh once
   *  when leaving the PDF view (its reload was skipped while inside). A same-
   *  tab navigation is a no-op except keeping the drawer open. */
  const navigate = useCallback(
    (tab: SidebarTab) => {
      const wasPdf = sidebarTabRef.current === "pdf"
      if (tab === sidebarTabRef.current) {
        openDrawer()
        return
      }
      setCardWorkspace(null)
      if (wasPdf) refreshRef.current()
      setSidebarTabState(tab)
      openDrawer()
    },
    [refreshRef, openDrawer]
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
