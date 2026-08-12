import type { PlasmoCSConfig } from "plasmo"
import { useCallback, useEffect, useRef, useState } from "react"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import TextFieldsRoundedIcon from "@mui/icons-material/TextFieldsRounded"

import CaptureSidebar from "../components/CaptureSidebar"
import type { PanelData } from "../components/FloatingPanel"
import type { Project } from "../types"
import { sendMessage } from "../types/messages"
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

/** 常驻 Lime 悬浮球 — 点开菜单，「打开面板」唤起捕获侧栏。 */
function LimeFloatBall({ onOpen }: { onOpen: () => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <button
        onClick={(e) => setAnchor(e.currentTarget)}
        title="Lime"
        aria-label="Lime"
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          zIndex: 2147483646,
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: "none",
          background: "#4f46e5",
          color: "#ffffff",
          cursor: "pointer",
          fontSize: 16,
          fontWeight: 700,
          boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}>
        L
      </button>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { py: 0.5, borderRadius: 1, minWidth: 140 } } }}>
        <MenuItem
          sx={{ fontSize: "0.85rem", gap: 1 }}
          onClick={() => {
            setAnchor(null)
            onOpen()
          }}>
          <TextFieldsRoundedIcon sx={{ fontSize: 16 }} />
          打开面板
        </MenuItem>
      </Menu>
    </>
  )
}

/** Region-select (框选) capture: a mask overlay + a drag rectangle, then a
 *  visible-tab screenshot cropped to the rect (in the content script — the
 *  background SW has no DOM to crop with). */
async function startRegionSelectCapture(
  onImage: (dataUrl: string) => void,
  onCancel: () => void
): Promise<void> {
  // The drag rectangle carries the dimming via a huge box-shadow — the
  // SURROUNDING area darkens while the selected region stays clear (a full-page
  // mask would darken the selection too, and end up in the screenshot).
  const rectEl = document.createElement("div")
  rectEl.style.cssText =
    "position:fixed;border:1.5px dashed #4f46e5;background:transparent;box-shadow:0 0 0 9999px rgba(0,0,0,0.25);z-index:2147483646;pointer-events:none;display:none;"
  const dimEl = document.createElement("div")
  dimEl.style.cssText =
    "position:fixed;inset:0;z-index:2147483645;background:rgba(0,0,0,0.25);cursor:crosshair;"
  document.body.append(dimEl, rectEl)

  let dragging = false
  let sx = 0
  let sy = 0
  let done = false

  const cleanup = () => {
    if (done) return
    done = true
    document.removeEventListener("mousedown", onDown)
    document.removeEventListener("mousemove", onMove)
    document.removeEventListener("mouseup", onUp)
    document.removeEventListener("keydown", onKey)
    dimEl.remove()
    rectEl.remove()
  }

  const onDown = (e: MouseEvent) => {
    if (done) return
    dragging = true
    sx = e.clientX
    sy = e.clientY
    rectEl.style.display = "block"
  }
  const onMove = (e: MouseEvent) => {
    if (!dragging || done) return
    const x = Math.min(sx, e.clientX)
    const y = Math.min(sy, e.clientY)
    const w = Math.abs(e.clientX - sx)
    const h = Math.abs(e.clientY - sy)
    rectEl.style.left = x + "px"
    rectEl.style.top = y + "px"
    rectEl.style.width = w + "px"
    rectEl.style.height = h + "px"
  }
  const onUp = async (e: MouseEvent) => {
    if (!dragging || done) return
    dragging = false
    const x = Math.min(sx, e.clientX)
    const y = Math.min(sy, e.clientY)
    const w = Math.abs(e.clientX - sx)
    const h = Math.abs(e.clientY - sy)
    cleanup()
    if (w < 16 || h < 16) {
      onCancel()
      return
    }
    // Wait for the overlays' removal to actually paint — capturing in the same
    // tick would snapshot the dimming into the final image.
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r()))
    )
    try {
      const dataUrl = await sendMessage({ kind: "capture-visible-tab" })
      if (dataUrl) {
        const cropped = await cropRegion(dataUrl, x, y, w, h)
        if (cropped) onImage(cropped)
        else onCancel()
      } else onCancel()
    } catch (err) {
      console.warn("[lime] region capture failed:", err)
      onCancel()
    }
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      cleanup()
      onCancel()
    }
  }

  document.addEventListener("mousedown", onDown)
  document.addEventListener("mousemove", onMove)
  document.addEventListener("mouseup", onUp)
  document.addEventListener("keydown", onKey)
}

/** Crop a captured viewport screenshot to a CSS-pixel rect (× devicePixelRatio). */
function cropRegion(
  dataUrl: string,
  x: number,
  y: number,
  w: number,
  h: number
): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const dpr = window.devicePixelRatio || 1
        const c = document.createElement("canvas")
        c.width = Math.max(1, Math.round(w * dpr))
        c.height = Math.max(1, Math.round(h * dpr))
        const ctx = c.getContext("2d")
        if (!ctx) {
          resolve(null)
          return
        }
        ctx.drawImage(
          img,
          x * dpr,
          y * dpr,
          w * dpr,
          h * dpr,
          0,
          0,
          c.width,
          c.height
        )
        resolve(c.toDataURL("image/png"))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

export default function LimePanel() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<PanelData | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [sidebarWidth, setSidebarWidth] = useState(360)
  // Lifted draft shared by the capture surface.
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [imageDraft, setImageDraft] = useState("")
  const [captureType, setCaptureType] = useState<"text" | "image">("text")
  const prevSelectionRef = useRef("")
  const dirtyRef = useRef(false)

  // The form reports whether it holds a draft; while it does, new Alt+S
  // selections are appended so they can't overwrite the in-progress capture.
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
      // selected & copied — Alt+S is their only append path.
      if (open && dirtyRef.current) {
        appendToDraft(text, type)
        return
      }
      prevSelectionRef.current = text
      setData({ text, rect })
      setTitle("")
      setContent(text)
      setImageDraft("")
      setCaptureType(type)
      setOpen(true)
    },
    [open, appendToDraft]
  )

  const hide = useCallback(() => {
    dirtyRef.current = false
    prevSelectionRef.current = ""
    setTitle("")
    setContent("")
    setImageDraft("")
    setOpen(false)
  }, [])

  // Alt+L: open the capture sidebar (no capture, no perception).
  const openPanel = useCallback(() => {
    if (!data) {
      setData({ text: "", rect: new DOMRect(0, 0, 0, 0) })
    }
    setOpen(true)
  }, [data])

  // 框选 capture: hide the sidebar, drag a rectangle over the page, screenshot +
  // crop it, then reopen the sidebar with the image draft filled.
  const onCaptureRegion = useCallback(() => {
    setOpen(false)
    window.setTimeout(() => {
      void startRegionSelectCapture(
        (dataUrl) => {
          // Fill the CONTENT (the image-mode preview shows <img src=content>),
          // matching the Alt+S-on-<img> capture path — not the URL quick-input.
          setCaptureType("image")
          setContent(dataUrl)
          setImageDraft("")
          setOpen(true)
        },
        () => {
          setOpen(true)
        }
      )
    }, 60)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        hide()
        return
      }
      // Alt+S: CAPTURE — the perception modes (selection/formula/image).
      // Fill when the draft is empty (or the sidebar is closed), append when it
      // is open with a draft.
      if (e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault()
        const sel = window.getSelection()
        // Mode A: a real selection — rebuild it with any formulas as $…$.
        if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) {
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

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [show, hide, openPanel])

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
  // The sidebar is interactive, so clear the attribute while open.
  useEffect(() => {
    if (!open) return
    const host = document.getElementById("__plasmo")
    if (host) host.removeAttribute("aria-hidden")
  }, [open])

  if (!data) return null

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
    onDirtyChange,
    onCaptureRegion
  }

  return (
    <>
      {!open && <LimeFloatBall onOpen={openPanel} />}
      {open && (
        <CaptureSidebar
          {...sharedProps}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
        />
      )}
    </>
  )
}
