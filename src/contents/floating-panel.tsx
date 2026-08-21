import type { PlasmoCSConfig } from "plasmo"
import { useCallback, useEffect, useRef, useState } from "react"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import TextFieldsRoundedIcon from "@mui/icons-material/TextFieldsRounded"
import BookmarkAddRoundedIcon from "@mui/icons-material/BookmarkAddRounded"
import DashboardCustomizeRoundedIcon from "@mui/icons-material/DashboardCustomizeRounded"
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded"
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded"
import TranslateRoundedIcon from "@mui/icons-material/TranslateRounded"

import CaptureSidebar from "../components/CaptureSidebar"
import type { PanelData } from "../components/FloatingPanel"
import type { Project } from "../types"
import { sendMessage } from "../types/messages"
import { appendMarkdownImage, bytesToBase64 } from "../utils"
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
  const [pdfSaveState, setPdfSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle")
  const [translateOpen, setTranslateOpen] = useState(false)
  const [translateRect, setTranslateRect] = useState<DOMRect | null>(null)
  const [translateSource, setTranslateSource] = useState("")
  const [translation, setTranslation] = useState("")
  const [translationEditing, setTranslationEditing] = useState(false)
  const [translateState, setTranslateState] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [translateError, setTranslateError] = useState("")
  const [savingVocabulary, setSavingVocabulary] = useState(false)
  const translateRequestRef = useRef<string | null>(null)
  const translateCardRef = useRef<HTMLDivElement | null>(null)
  const [translateOffset, setTranslateOffset] = useState({ x: 0, y: 0 })
  const translateDragRef = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null)
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
    chrome.storage.local.get("floatBallPos", (data) => {
      const p = data.floatBallPos?.[host]
      if (p && typeof p.right === "number") setPos(p)
    })
  }, [host])

  const canSavePdf =
    document.contentType === "application/pdf" ||
    /\.pdf(?:\?|#|$)/i.test(location.href)

  const closeTranslate = useCallback(() => {
    const requestId = translateRequestRef.current
    translateRequestRef.current = null
    if (requestId && translateState === "loading") {
      void sendMessage({ kind: "ai-cancel", requestId })
    }
    setTranslateOpen(false)
  }, [translateState])

  useEffect(() => {
    if (!translateOpen) return
    const closeOnScroll = (event: Event) => {
      if (
        translateCardRef.current &&
        event.composedPath().includes(translateCardRef.current)
      )
        return
      closeTranslate()
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeTranslate()
    }
    window.addEventListener("scroll", closeOnScroll, true)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      window.removeEventListener("scroll", closeOnScroll, true)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [closeTranslate, translateOpen])

  useEffect(() => {
    if (!translateOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        !translateCardRef.current ||
        !event.composedPath().includes(translateCardRef.current)
      ) {
        closeTranslate()
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer, true)
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true)
  }, [closeTranslate, translateOpen])

  const runTranslation = async (source = translateSource) => {
    const requestId = crypto.randomUUID()
    translateRequestRef.current = requestId
    setTranslateState("loading")
    setTranslateError("")
    try {
      const result = await sendMessage<{ ok: boolean; text?: string; error?: string; cancelled?: boolean }>(
        { kind: "ai-translate", payload: { requestId, text: source } },
        120_000
      )
      if (translateRequestRef.current !== requestId) return
      if (!result.ok || !result.text) throw new Error(result.error ?? "翻译失败")
      setTranslation(result.text)
      setTranslateState("success")
    } catch (error) {
      if (translateRequestRef.current !== requestId) return
      setTranslateError((error as Error)?.message ?? "AI 服务连接失败")
      setTranslateState("error")
    }
  }

  const openTranslation = () => {
    const selection = window.getSelection()
    const source = selection?.toString().trim() ?? ""
    const rect = selection && selection.rangeCount > 0
      ? selection.getRangeAt(0).getBoundingClientRect()
      : null
    setAnchor(null)
    if (!source) {
      pageToast("请先在网页中选中文字")
      return
    }
    if (source.length > 10000) {
      pageToast("选中内容过长（最多 10000 字符）")
      return
    }
    setTranslateSource(source)
    setTranslateRect(rect)
    setTranslation("")
    setTranslationEditing(false)
    setTranslateOffset({ x: 0, y: 0 })
    setTranslateOpen(true)
    void runTranslation(source)
  }

  const saveCurrentPdf = async () => {
    if (!canSavePdf || pdfSaveState === "saving") return
    setAnchor(null)
    setPdfSaveState("saving")
    try {
      const response = await fetch(location.href, { credentials: "include" })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const bytes = new Uint8Array(await response.arrayBuffer())
      const name =
        decodeURIComponent(location.pathname.split("/").pop() ?? "") ||
        "web.pdf"
      const result = await sendMessage<{ ok: boolean; error?: string }>(
        {
          kind: "save-web-pdf",
          url: location.href,
          name,
          body: bytesToBase64(bytes)
        },
        120_000
      )
      if (!result?.ok) throw new Error(result?.error ?? "保存失败")
      setPdfSaveState("saved")
      pageToast("PDF 已保存到 Lime")
    } catch (error) {
      console.warn("[lime] save PDF failed:", error)
      setPdfSaveState("error")
      pageToast(`PDF 保存失败：${(error as Error)?.message ?? error}`)
    } finally {
      window.setTimeout(() => setPdfSaveState("idle"), 2200)
    }
  }

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
  const bottom = pos?.bottom ?? 20
  const translateWidth = Math.min(380, window.innerWidth - 24)
  const translateLeft = translateRect
    ? Math.max(
        12,
        Math.min(
          window.innerWidth - translateWidth - 12,
          translateRect.left + translateRect.width / 2 - translateWidth / 2
        )
      )
    : 12
  const translateBelow = Boolean(
    translateRect && translateRect.bottom + 280 < window.innerHeight
  )

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
        onMouseEnter={(event) => {
          if (!dragRef.current) {
            event.currentTarget.style.transform = "translateY(-2px) scale(1.03)"
            event.currentTarget.style.boxShadow =
              "0 12px 28px rgba(67,56,202,0.36), 0 3px 8px rgba(15,23,42,0.22)"
          }
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.transform = "none"
          event.currentTarget.style.boxShadow =
            "0 8px 24px rgba(67,56,202,0.3), 0 2px 6px rgba(15,23,42,0.2)"
        }}
        title="Lime"
        aria-label="Lime"
        style={{
          position: "fixed",
          right,
          bottom,
          zIndex: 2147483646,
          width: 46,
          height: 46,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.42)",
          background: "linear-gradient(145deg, #6366f1 0%, #4338ca 100%)",
          color: "#ffffff",
          cursor: "pointer",
          fontSize: 16,
          fontWeight: 700,
          boxShadow:
            "0 8px 24px rgba(67,56,202,0.3), 0 2px 6px rgba(15,23,42,0.2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          touchAction: "none",
          transition: "transform 0.2s ease, box-shadow 0.2s ease"
        }}>
        <span
          style={{
            position: "relative",
            display: "grid",
            placeItems: "center",
            width: 28,
            height: 28,
            borderRadius: 9,
            background: "rgba(255,255,255,0.14)",
            fontFamily: "Georgia, serif",
            fontSize: 18,
            fontWeight: 700,
            lineHeight: 1
          }}>
          L
          <span
            style={{
              position: "absolute",
              width: 6,
              height: 9,
              right: 3,
              top: 1,
              borderRadius: "6px 1px 6px 1px",
              background: "#a7f3d0",
              transform: "rotate(28deg)"
            }}
          />
        </span>
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
        <MenuItem sx={{ fontSize: "0.85rem", gap: 1 }} onClick={openTranslation}>
          <TranslateRoundedIcon sx={{ fontSize: 16 }} />
          翻译选中内容
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
          disabled={!canSavePdf || pdfSaveState === "saving"}
          title={canSavePdf ? "将当前 PDF 保存到 Lime" : "仅 PDF 页面可用"}
          sx={{ fontSize: "0.85rem", gap: 1 }}
          onClick={() => void saveCurrentPdf()}>
          <PictureAsPdfRoundedIcon sx={{ fontSize: 16 }} />
          {pdfSaveState === "saving"
            ? "正在保存 PDF…"
            : pdfSaveState === "saved"
              ? "PDF 已保存"
              : "保存 PDF 到 Lime"}
        </MenuItem>
        <MenuItem
          sx={{ fontSize: "0.85rem", gap: 1 }}
          onClick={() => {
            setAnchor(null)
            onOpen()
          }}>
          <DashboardCustomizeRoundedIcon sx={{ fontSize: 16 }} />
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
          <VisibilityOffRoundedIcon sx={{ fontSize: 16 }} />
          隐藏此页面悬浮球
        </MenuItem>
      </Menu>
      {translateOpen && translateRect && (
          <div
            ref={translateCardRef}
            data-lime-translate-card
            role="dialog"
            aria-label="网页翻译"
            style={{
              position: "fixed",
              zIndex: 2147483647,
              width: translateWidth,
              left: translateLeft,
              ...(translateBelow
                ? { top: Math.max(12, translateRect.bottom + 10) }
                : {
                    bottom: Math.max(
                      12,
                      window.innerHeight - translateRect.top + 10
                    )
                  }),
              boxSizing: "border-box",
              borderRadius: 8,
              border: "1px solid rgba(45,52,54,0.12)",
              background: "#ffffff",
              color: "#2d3436",
              boxShadow: "0 14px 38px rgba(15,23,42,0.16)",
              font: "13px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif",
              overflow: "hidden",
              transform: `translate(${translateOffset.x}px, ${translateOffset.y}px)`
            }}>
            <div
              onPointerDown={(event) => {
                if (event.button !== 0) return
                event.currentTarget.setPointerCapture(event.pointerId)
                translateDragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: translateOffset.x, originY: translateOffset.y }
              }}
              onPointerMove={(event) => {
                const drag = translateDragRef.current
                if (!drag || drag.pointerId !== event.pointerId) return
                setTranslateOffset({ x: drag.originX + event.clientX - drag.x, y: drag.originY + event.clientY - drag.y })
              }}
              onPointerUp={() => { translateDragRef.current = null }}
              onPointerCancel={() => { translateDragRef.current = null }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", cursor: "grab", touchAction: "none", userSelect: "none" }}>
              <strong style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>即时翻译</strong>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#a0a4a8" }}><circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" /></svg>
              <button onPointerDown={(event) => event.stopPropagation()} onClick={closeTranslate} aria-label="关闭翻译" style={{ width: 28, height: 28, display: "grid", placeItems: "center", border: 0, borderRadius: 8, background: "transparent", color: "#7b8186", cursor: "pointer", padding: 0 }}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
            </div>
            <div style={{ height: 1, margin: "0 8px", background: "rgba(45,52,54,0.08)" }} />
            <div style={{ padding: 12 }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: "#686f73", fontSize: 11, marginBottom: 2 }}>原文</div>
              <div style={{ color: "#686f73", font: "12px/1.55 Georgia,'Songti SC','Noto Serif CJK SC',serif", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{translateSource}</div>
            </div>
          {translateState === "loading" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 4px", color: "#686f73" }}><span style={{ color: "#4f46e5" }}>●</span>正在翻译…</div>
          )}
          {translateState === "error" && (
            <div style={{ padding: "8px 0", color: "#dc2626" }}>{translateError}<br /><button onClick={() => void runTranslation()} style={{ marginTop: 6, border: "1px solid #d8dcdf", borderRadius: 7, background: "#fff", padding: "5px 10px", cursor: "pointer" }}>重试</button></div>
          )}
          {translateState === "success" && (
            translationEditing ? (
              <textarea autoFocus value={translation} onChange={(event) => setTranslation(event.target.value)} rows={4} style={{ width: "100%", boxSizing: "border-box", resize: "vertical", border: "1px solid rgba(79,70,229,0.35)", borderRadius: 8, padding: "9px 10px", outline: "none", font: "inherit", color: "#2d3436", background: "#fafafa" }} />
            ) : (
              <div><div style={{ color: "#686f73", fontSize: 11, marginBottom: 4 }}>译文</div><div style={{ font: "14px/1.75 Georgia,'Songti SC','Noto Serif CJK SC',serif", whiteSpace: "pre-wrap", maxHeight: 190, overflowY: "auto" }}>{translation}</div></div>
            )
          )}
          <div style={{ height: 1, margin: "12px 0 10px", background: "rgba(45,52,54,0.08)" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", gap: 5 }}>
          <button disabled={translateState !== "success" || !translation.trim()} onClick={() => void navigator.clipboard.writeText(translation)} style={{ border: 0, background: "transparent", color: "#596166", padding: "6px 8px", cursor: "pointer", font: "inherit" }}>复制</button>
          <button disabled={translateState !== "success"} onClick={() => setTranslationEditing((value) => !value)} style={{ border: 0, background: "transparent", color: "#596166", padding: "6px 8px", cursor: "pointer", font: "inherit" }}>{translationEditing ? "完成" : "编辑"}</button>
          </div>
          <button
            disabled={translateState !== "success" || !translation.trim() || savingVocabulary}
            onClick={async () => {
              setSavingVocabulary(true)
              try {
                const result = await sendMessage<{ ok: boolean; error?: string }>({
                  kind: "add-web-vocabulary",
                  payload: {
                    term: translateSource,
                    translation,
                    source: { title: document.title, url: location.href }
                  }
                })
                if (!result.ok) throw new Error(result.error ?? "保存生词失败")
                closeTranslate()
              } catch (error) {
                setTranslateError((error as Error)?.message ?? "保存生词失败")
              } finally {
                setSavingVocabulary(false)
              }
            }} style={{ border: 0, borderRadius: 8, background: "#4f46e5", color: "#fff", padding: "7px 13px", cursor: "pointer", font: "inherit", fontWeight: 600 }}>
            {savingVocabulary ? "加入中…" : "加入生词"}
          </button>
          </div>
          {translateError && translateState === "success" && (
            <div style={{ color: "#dc2626", fontSize: 11, marginTop: 6 }}>{translateError}</div>
          )}
          </div>
          </div>
      )}
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
