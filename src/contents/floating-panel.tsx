import type { PlasmoCSConfig } from "plasmo"
import { useCallback, useEffect, useRef, useState } from "react"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import TextFieldsRoundedIcon from "@mui/icons-material/TextFieldsRounded"
import BookmarkAddRoundedIcon from "@mui/icons-material/BookmarkAddRounded"

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

/** 常驻 Lime 悬浮球 — 点开菜单，「捕获选中内容」或「打开面板」唤起捕获侧栏。
 *  - Draggable (bottom-right anchored); the position is persisted per-host
 *    (`floatBallPos[hostname]`), so it stays where the user put it.
 *  - On PDF pages the pdf-saver pill occupies the same corner (bottom:20) —
 *    when it is present the ball lifts above it instead of being covered (B3).
 *  - Can be hidden per site (`floatBallHiddenHosts`); recovery lives in the
 *    options settings dialog. Alt+S / Alt+L keep working while hidden. */
function LimeFloatBall({
  onOpen,
  onCaptureSelection,
  onReadLater
}: {
  onOpen: () => void
  onCaptureSelection: () => void
  onReadLater: () => void
}) {
  const host = location.hostname
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [lifted, setLifted] = useState(false)
  const [pos, setPos] = useState<{ right: number; bottom: number } | null>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    startRight: number
    startBottom: number
    moved: boolean
  } | null>(null)
  const justMovedRef = useRef(false)

  useEffect(() => {
    setLifted(Boolean(document.querySelector('[data-lime-pdf-saver="1"]')))
    chrome.storage.local.get("floatBallPos", (data) => {
      const p = data.floatBallPos?.[host]
      if (p && typeof p.right === "number") setPos(p)
    })
  }, [host])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startRight: pos?.right ?? 20,
      startBottom: pos?.bottom ?? 20,
      moved: false
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.moved = true
    if (!d.moved) return
    const right = Math.max(4, Math.min(window.innerWidth - 52, d.startRight - dx))
    const bottom = Math.max(4, Math.min(window.innerHeight - 52, d.startBottom - dy))
    setPos({ right, bottom })
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    if (d.moved) {
      justMovedRef.current = true
      const next = {
        right: Math.max(4, Math.min(window.innerWidth - 52, d.startRight - (e.clientX - d.startX))),
        bottom: Math.max(4, Math.min(window.innerHeight - 52, d.startBottom - (e.clientY - d.startY)))
      }
      setPos(next)
      chrome.storage.local.get("floatBallPos", (data) => {
        chrome.storage.local.set({
          floatBallPos: { ...(data.floatBallPos ?? {}), [host]: next }
        })
      })
    }
  }

  const right = pos?.right ?? 20
  const bottom = pos?.bottom ?? (lifted ? 76 : 20)

  return (
    <>
      <button
        onClick={(e) => {
          if (justMovedRef.current) {
            justMovedRef.current = false
            e.preventDefault()
            return
          }
          setAnchor(e.currentTarget)
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        title="Lime"
        aria-label="Lime"
        style={{
          position: "fixed",
          right,
          bottom,
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
          justifyContent: "center",
          touchAction: "none"
        }}>
        L
      </button>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { py: 0.5, borderRadius: 1, minWidth: 150 } } }}>
        <MenuItem
          sx={{ fontSize: "0.85rem", gap: 1 }}
          onClick={() => {
            setAnchor(null)
            onCaptureSelection()
          }}>
          <TextFieldsRoundedIcon sx={{ fontSize: 16 }} />
          捕获选中内容
        </MenuItem>
        <MenuItem
          sx={{ fontSize: "0.85rem", gap: 1 }}
          onClick={() => {
            setAnchor(null)
            onReadLater()
          }}>
          <BookmarkAddRoundedIcon sx={{ fontSize: 16 }} />
          稍后读
        </MenuItem>
        <MenuItem
          sx={{ fontSize: "0.85rem", gap: 1 }}
          onClick={() => {
            setAnchor(null)
            onOpen()
          }}>
          <TextFieldsRoundedIcon sx={{ fontSize: 16 }} />
          打开面板
        </MenuItem>
        <MenuItem
          sx={{ fontSize: "0.85rem", gap: 1 }}
          onClick={() => {
            setAnchor(null)
            chrome.storage.local.get("floatBallHiddenHosts", (data) => {
              const list: string[] = data.floatBallHiddenHosts ?? []
              if (!list.includes(host)) {
                chrome.storage.local.set({
                  floatBallHiddenHosts: [...list, host]
                })
              }
            })
          }}>
          <TextFieldsRoundedIcon sx={{ fontSize: 16 }} />
          隐藏此页面悬浮球
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
      pageToast("框选区域过小")
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

/** Transient in-page toast (top-center, auto-dismiss) — the content script has
 *  no MUI Toast, so silent capture drops get a visible reason. */
let toastTimer: number | null = null
function pageToast(msg: string) {
  let el = document.getElementById("lime-toast")
  if (!el) {
    el = document.createElement("div")
    el.id = "lime-toast"
    el.style.cssText =
      "position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;" +
      "background:#111827;color:#f9fafb;font:12px/1.6 system-ui,sans-serif;" +
      "padding:8px 14px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.25);" +
      "opacity:0;transition:opacity 0.2s ease;pointer-events:none;max-width:70vw"
    document.body.append(el)
  }
  el.textContent = msg
  el.style.opacity = "1"
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    el.style.opacity = "0"
  }, 2200)
}

export default function LimePanel() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<PanelData | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [sidebarWidth, setSidebarWidth] = useState(360)
  const [ballEnabled, setBallEnabled] = useState(true)
  const [ballHiddenHere, setBallHiddenHere] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  // Lifted draft shared by the capture surface.
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [imageDraft, setImageDraft] = useState("")
  const [captureType, setCaptureType] = useState<"text" | "image">("text")
  const prevSelectionRef = useRef("")
  const dirtyRef = useRef(false)

  // Floating-ball visibility: a global switch + a per-host hidden list. When
  // hidden the ball isn't rendered, but Alt+S / Alt+L still open the capture
  // (capture is never unreachable).
  useEffect(() => {
    const read = () => {
      chrome.storage.local.get(
        ["floatBallEnabled", "floatBallHiddenHosts"],
        (data) => {
          setBallEnabled(data.floatBallEnabled !== false)
          setBallHiddenHere(
            (data.floatBallHiddenHosts ?? []).includes(location.hostname)
          )
        }
      )
    }
    read()
    chrome.storage.onChanged.addListener((changes) => {
      if ("floatBallEnabled" in changes || "floatBallHiddenHosts" in changes)
        read()
    })
    return () => chrome.storage.onChanged.removeListener(read)
  }, [])

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
    setConfirmDiscard(false)
    setOpen(false)
  }, [])

  // Closing the sidebar with an unsaved draft asks first — the old behavior
  // dropped the draft silently on Escape / 取消.
  const requestClose = useCallback(() => {
    if (dirtyRef.current && !confirmDiscard) {
      setConfirmDiscard(true)
      return
    }
    hide()
  }, [confirmDiscard, hide])

  // Capture the current text selection (Alt+S Mode A). Returns a status so the
  // caller can explain silent drops (too short / too long) instead of doing
  // nothing — the old behavior swallowed every failure.
  const captureSelection = useCallback(
    (): "ok" | "none" | "short" | "long" | "no-rect" => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.toString().trim().length === 0)
        return "none"
      const text = selectionWithMath(sel)
      if (text.length < 5) return "short"
      if (text.length > 2000) return "long"
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return "no-rect"
      show(text, rect)
      return "ok"
    },
    [show]
  )

  // Alt+L: open the capture sidebar. When text is selected, CARRY it into the
  // panel — the old path opened an empty sidebar, leaving mouse-only capture a
  // dead end. No selection → empty sidebar (guidance state).
  const openPanel = useCallback(() => {
    if (captureSelection() === "ok") return
    if (!data) {
      setData({ text: "", rect: new DOMRect(0, 0, 0, 0) })
    }
    setOpen(true)
  }, [captureSelection, data])

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
        requestClose()
        return
      }
      // Alt+S: CAPTURE — the perception modes (selection/formula/image).
      // Fill when the draft is empty (or the sidebar is closed), append when it
      // is open with a draft.
      if (e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault()
        // Mode A: a real selection — rebuild it with any formulas as $…$.
        // (shared with the ball's 捕获选中内容 / the panel-open path)
        const modeA = captureSelection()
        if (modeA === "ok") return
        if (modeA === "short") {
          pageToast("选中内容过短（至少 5 个字符）")
          return
        }
        if (modeA === "long") {
          pageToast("选中内容过长（最多 2000 字符）")
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
          } else {
            pageToast("段落过长，无法捕获")
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
          } else {
            pageToast("图片地址过长，无法捕获")
          }
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [show, requestClose, openPanel, captureSelection])

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
    onClose: requestClose,
    onProjectsChange: setProjects,
    onSelectedProjectChange: setSelectedProjectId,
    onDirtyChange,
    onCaptureRegion
  }

  return (
    <>
      {!open && ballEnabled && !ballHiddenHere && (
        <LimeFloatBall
          onOpen={openPanel}
          onCaptureSelection={() => {
            const r = captureSelection()
            if (r === "ok") return
            if (r !== "none") {
              pageToast(
                r === "short"
                  ? "选中内容过短（至少 5 个字符）"
                  : r === "long"
                    ? "选中内容过长（最多 2000 字符）"
                    : "无法定位选中内容"
              )
            }
            openPanel()
          }}
          onReadLater={() => {
            // 稍后读 = 把当前网页直接加入（仅标题 + URL，不带选中文本作为摘录）。
            // The SW handler toasts the result back to the page (kind:"toast"),
            // so we don't show a second panel toast here.
            void sendMessage({
              kind: "read-later",
              payload: {
                title: document.title,
                url: location.href
              }
            })
          }}
        />
      )}
      {open && data && (
        <CaptureSidebar
          {...sharedProps}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
        />
      )}
      {confirmDiscard && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 2147483647,
            background: "#ffffff",
            color: "#1f2937",
            font: "13px/1.6 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
            padding: "16px 18px",
            borderRadius: 10,
            boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
            maxWidth: 300,
            textAlign: "center"
          }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>丢弃未保存的摘录？</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
            面板里的内容尚未保存，关闭后将丢失。
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              onClick={requestClose}
              style={{
                border: "none",
                borderRadius: 8,
                padding: "6px 16px",
                fontSize: 12,
                fontWeight: 600,
                background: "#ef4444",
                color: "#fff",
                cursor: "pointer"
              }}>
              丢弃
            </button>
            <button
              onClick={() => setConfirmDiscard(false)}
              style={{
                border: "1px solid #d1d5db",
                borderRadius: 8,
                padding: "6px 16px",
                fontSize: 12,
                fontWeight: 600,
                background: "#fff",
                color: "#374151",
                cursor: "pointer"
              }}>
              继续编辑
            </button>
          </div>
        </div>
      )}
    </>
  )
}
