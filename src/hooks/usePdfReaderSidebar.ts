import { useCallback, useEffect, useRef, useState } from "react"

/** The reader panel (TOC | thumbnails) ↔ left sidebar mutual exclusion: at
 *  most ONE is open at a time (both can be closed) — keeps the layout at 4
 *  columns. options owns `drawerOpen` (the drawer render); the hook owns
 *  `readerOpen` + the swap handlers. */
export function usePdfReaderSidebar(
  drawerOpen: boolean,
  setDrawerOpen: (open: boolean) => void
) {
  const [readerOpen, setReaderOpen] = useState(false)
  const readerOpenRef = useRef(false)
  useEffect(() => {
    readerOpenRef.current = readerOpen
  }, [readerOpen])
  const drawerOpenRef = useRef(false)
  useEffect(() => {
    drawerOpenRef.current = drawerOpen
  }, [drawerOpen])

  const openReader = useCallback(() => {
    setReaderOpen(true)
    setDrawerOpen(false)
  }, [setDrawerOpen])

  const toggleReader = useCallback(() => {
    if (readerOpenRef.current) setReaderOpen(false)
    else {
      setReaderOpen(true)
      setDrawerOpen(false)
    }
  }, [setDrawerOpen])

  const openDrawer = useCallback(() => {
    setDrawerOpen(true)
    setReaderOpen(false)
  }, [setDrawerOpen])

  const toggleDrawer = useCallback(() => {
    if (drawerOpenRef.current) setDrawerOpen(false)
    else {
      setDrawerOpen(true)
      setReaderOpen(false)
    }
  }, [setDrawerOpen])

  const swapLeft = useCallback(() => {
    if (readerOpenRef.current) {
      setReaderOpen(false)
      setDrawerOpen(true)
    } else {
      setReaderOpen(true)
      setDrawerOpen(false)
    }
  }, [setDrawerOpen])

  return {
    readerOpen,
    openReader,
    toggleReader,
    openDrawer,
    toggleDrawer,
    swapLeft
  }
}
