import type { PlasmoCSConfig } from "plasmo"
import React, { useCallback, useEffect, useRef, useState } from "react"

import FloatingPanel from "../components/FloatingPanel"
import type { Project } from "../types"
import type { PanelData, PanelPosition } from "../components/FloatingPanel"

export const config: PlasmoCSConfig = {
  matches: ["https://*/*", "http://*/*"],
  all_frames: false
}

export default function LimePanel() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<PanelData | null>(null)
  const [pinned, setPinned] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [position, setPosition] = useState<PanelPosition>({ left: 0, top: 0 })
  const prevSelectionRef = useRef("")
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pinnedRef = useRef(pinned)
  const positionRef = useRef(position)

  useEffect(() => { pinnedRef.current = pinned }, [pinned])
  useEffect(() => { positionRef.current = position }, [position])

  const show = useCallback((text: string, rect: DOMRect) => {
    if (text === prevSelectionRef.current && open && pinnedRef.current) return
    prevSelectionRef.current = text
    setData({ text, rect })
    setOpen(true)
    console.log("[lime] showPanel", {
      React: typeof React,
      FloatingPanel: typeof FloatingPanel,
      open: true,
      pinned: pinnedRef.current,
      position: positionRef.current
    })
  }, [open])

  const hide = useCallback(() => {
    setOpen(false)
  }, [])

  const onPinChange = useCallback((next: boolean) => {
    setPinned(next)
  }, [])

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      const insidePanel = e.composedPath().some((el) => {
        if (!(el instanceof Element)) return false
        return el.closest?.("[data-lime-panel]") != null
      })
      if (insidePanel) return
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = setTimeout(() => {
        const sel = window.getSelection()
        const text = sel?.toString().trim()
        if (!text || text.length < 5 || text.length > 2000) {
          if (!pinnedRef.current) hide()
          return
        }
        const range = sel!.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) {
          if (!pinnedRef.current) hide()
          return
        }
        show(text, rect)
      }, 300)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (pinnedRef.current) setPinned(false)
        hide()
      }
    }

    document.addEventListener("mouseup", handleMouseUp)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mouseup", handleMouseUp)
      document.removeEventListener("keydown", handleKeyDown)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [show, hide])

  // Reload content script on extension update
  useEffect(() => {
    const h = (msg: unknown) => {
      if ((msg as { kind?: string })?.kind === "reload-extension") location.reload()
    }
    chrome.runtime.onMessage.addListener(h)
    return () => { chrome.runtime.onMessage.removeListener(h) }
  }, [])

  // Plasmo's overlay host (`#__plasmo`) sets aria-hidden="true" by default.
  // Our panel is interactive, so clear the attribute while open — otherwise the
  // focused buttons inside trigger a "Blocked aria-hidden on focused element"
  // a11y warning.
  useEffect(() => {
    if (!open) return
    const host = document.getElementById("__plasmo")
    if (host) host.removeAttribute("aria-hidden")
  }, [open])

  if (!open || !data) return null

  return (
    <FloatingPanel
      data={data}
      pinned={pinned}
      position={position}
      projects={projects}
      selectedProjectId={selectedProjectId}
      onClose={hide}
      onSaved={hide}
      onPinChange={onPinChange}
      onPositionChange={setPosition}
      onProjectsChange={setProjects}
      onSelectedProjectChange={setSelectedProjectId}
    />
  )
}
