import type { PlasmoCSConfig } from "plasmo"
import { useCallback, useEffect, useRef, useState } from "react"

import CaptureSidebar from "../components/CaptureSidebar"
import FloatingPanel from "../components/FloatingPanel"
import type { PanelData, PanelPosition } from "../components/FloatingPanel"
import type { Project } from "../types"
import { appendMarkdownImage } from "../utils"
import {
  flashMath,
  imageFromCursor,
  initMathHover,
  paragraphFromCursor,
  selectionWithMath,
  setMathHoverEnabled
} from "./formula"

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
  // Which capture surface is active (switch model — never both).
  const [surface, setSurface] = useState<"panel" | "sidebar">("panel")
  const [restorePanel, setRestorePanel] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(360)
  // Lifted draft shared by both surfaces.
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [imageDraft, setImageDraft] = useState("")
  const [captureType, setCaptureType] = useState<"text" | "image">("text")
  const prevSelectionRef = useRef("")
  const pinnedRef = useRef(pinned)
  const dirtyRef = useRef(false)
  // Remember which surface was last dismissed so the next Alt+L reopens it.
  const lastClosedRef = useRef<"panel" | "sidebar">("panel")

  useEffect(() => {
    pinnedRef.current = pinned
  }, [pinned])

  // The panel reports whether it holds a draft; while it does, new Alt+L
  // selections are ignored so they can't overwrite the in-progress capture.
  const onDirtyChange = useCallback((isDirty: boolean) => {
    dirtyRef.current = isDirty
    // A cleared draft must allow overwriting with the same selection again.
    if (!isDirty) prevSelectionRef.current = ""
  }, [])

  const appendToDraft = useCallback(
    (text: string, type: "text" | "image") => {
      if (captureType === "image") {
        // An image-only draft (content = a raw URL) becomes a text card.
        setCaptureType("text")
        setContent((prev) => {
          const first = `![图片](${prev.trim()})`
          return type === "image"
            ? appendMarkdownImage(first, text)
            : `${first}\n\n${text}`
        })
        return
      }
      setContent((prev) =>
        type === "image"
          ? appendMarkdownImage(prev, text)
          : `${prev.trimEnd()}\n\n${text}`.trimStart()
      )
    },
    [captureType]
  )

  const show = useCallback(
    (text: string, rect: DOMRect, type: "text" | "image" = "text") => {
      // A draft is already open: APPEND the new capture instead of replacing.
      // Text could be appended by copy-paste, but formulas/images can't be
      // selected & copied — Alt+L is their only append path. No dedup here —
      // repeating the same formula is legit. (The dedup below guards the FILL.)
      if (open && dirtyRef.current) {
        appendToDraft(text, type)
        return
      }
      // Fill path: while the panel is open + pinned, ignore re-showing the same
      // selection (a misclick). A cleared draft resets prevSelectionRef so the
      // same content can be captured again.
      if (text === prevSelectionRef.current && open && pinnedRef.current) return
      prevSelectionRef.current = text
      setData({ text, rect })
      setTitle("")
      setContent(text)
      setImageDraft("")
      setCaptureType(type)
      setRestorePanel(false)
      setSurface(lastClosedRef.current)
      setOpen(true)
    },
    [open, appendToDraft]
  )

  const hide = useCallback(() => {
    lastClosedRef.current = surface
    dirtyRef.current = false
    prevSelectionRef.current = ""
    setTitle("")
    setContent("")
    setImageDraft("")
    setOpen(false)
  }, [surface])

  const onPinChange = useCallback((next: boolean) => {
    setPinned(next)
  }, [])

  const switchToSidebar = useCallback(() => {
    setSurface("sidebar")
  }, [])

  const switchToPanel = useCallback(() => {
    setRestorePanel(true)
    setSurface("panel")
  }, [])

  // Alt+L: PURE panel open — no capture, no perception. Just bring the panel
  // surface to the front (a fresh open needs a placeholder data for position).
  const openPanel = useCallback(() => {
    setSurface("panel")
    setRestorePanel(false)
    if (!data) {
      const vw = window.innerWidth
      const vh = window.innerHeight
      setData({
        text: "",
        rect: new DOMRect(
          Math.round(vw / 2),
          Math.round(vh / 2),
          0,
          0
        )
      })
    }
    setOpen(true)
  }, [data])

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      const insidePanel = e.composedPath().some((el) => {
        if (!(el instanceof Element)) return false
        return el.closest?.("[data-lime-panel]") != null
      })
      if (insidePanel) return
      // 浮动面板点击外部关闭（钉住时保持）；侧栏只在 ✕/Escape 关闭
      if (surface === "panel" && !pinnedRef.current) hide()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (pinnedRef.current) setPinned(false)
        hide()
        return
      }
      // Alt+L: PURE panel open — no capture, no perception. If the panel is
      // already open this is a no-op (brings the panel surface to the front).
      if (e.altKey && e.key.toLowerCase() === "l") {
        e.preventDefault()
        openPanel()
        return
      }
      // Alt+S: CAPTURE — the perception modes (selection/formula/image).
      // Fill when the draft is empty (or the panel is closed), append when the
      // panel is open with a draft.
      if (e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault()
        const sel = window.getSelection()
        const rawText = sel?.toString().trim() ?? ""
        // Mode A: a real selection — rebuild it with any formulas as $…$.
        if (sel && !sel.isCollapsed && rawText.length >= 5) {
          const text = selectionWithMath(sel)
          if (text.length < 5 || text.length > 2000) return
          const rect = sel.getRangeAt(0).getBoundingClientRect()
          if (rect.width === 0 || rect.height === 0) return
          show(text, rect)
          return
        }
        // Mode B: no selection — capture the paragraph containing the formula
        // under the cursor (text + all its formulas). No length floor: even a
        // short standalone formula ($x$ = 3 chars) must be capturable.
        const hit = paragraphFromCursor()
        if (hit) {
          const { content, el } = hit
          if (content.length <= 8000) {
            const rect = el.getBoundingClientRect()
            if (rect.width > 0 && rect.height > 0) {
              show(content, rect)
              flashMath(el)
            }
          }
          return
        }
        // Mode C: an `<img>` under the cursor → image card.
        const hitImg = imageFromCursor()
        if (hitImg) {
          const { src, el } = hitImg
          if (src.length <= 8000) {
            const rect = el.getBoundingClientRect()
            if (rect.width > 0 && rect.height > 0) {
              show(src, rect, "image")
            }
          }
        }
      }
    }

    document.addEventListener("mouseup", handleMouseUp)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mouseup", handleMouseUp)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [show, hide, surface, openPanel])

  // Reload content script on extension update
  useEffect(() => {
    const h = (msg: unknown) => {
      if ((msg as { kind?: string })?.kind === "reload-extension")
        location.reload()
    }
    chrome.runtime.onMessage.addListener(h)
    return () => {
      chrome.runtime.onMessage.removeListener(h)
    }
  }, [])

  // Formula hover highlight + cursor tracking; honors the settings toggle.
  useEffect(() => {
    const cleanup = initMathHover()
    chrome.storage.local.get("mathHoverEnabled", (data) => {
      setMathHoverEnabled(data.mathHoverEnabled !== false)
    })
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>
    ) => {
      if ("mathHoverEnabled" in changes) {
        setMathHoverEnabled(changes.mathHoverEnabled.newValue !== false)
      }
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => {
      cleanup()
      chrome.storage.onChanged.removeListener(onChanged)
    }
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

  const sharedProps = {
    data,
    projects,
    selectedProjectId,
    title,
    setTitle,
    content,
    setContent,
    imageDraft,
    setImageDraft,
    captureType,
    onClose: hide,
    onProjectsChange: setProjects,
    onSelectedProjectChange: setSelectedProjectId,
    onDirtyChange
  }

  return surface === "panel" ? (
    <FloatingPanel
      {...sharedProps}
      pinned={pinned}
      position={position}
      restorePosition={restorePanel}
      onPinChange={onPinChange}
      onPositionChange={setPosition}
      onOpenSidebar={switchToSidebar}
    />
  ) : (
    <CaptureSidebar
      {...sharedProps}
      width={sidebarWidth}
      onWidthChange={setSidebarWidth}
      onBackToPanel={switchToPanel}
    />
  )
}
