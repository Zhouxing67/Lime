import type { PlasmoCSConfig } from "plasmo"
import { useCallback, useEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"

import { sendMessage } from "../types/messages"

export const config: PlasmoCSConfig = {
  matches: ["https://*/*", "http://*/*"],
  all_frames: false
}

// Globals: mount root once, reuse across show/hide cycles
let panelRoot: ReturnType<typeof createRoot> | null = null
let panelContainer: HTMLDivElement | null = null

function ensurePanel(): HTMLDivElement {
  if (!panelContainer) {
    panelContainer = document.createElement("div")
    panelContainer.id = "lime-floating-panel"
    document.body.appendChild(panelContainer)
    panelRoot = createRoot(panelContainer)
  }
  return panelContainer
}

function FloatingPanel({
  text,
  rect,
  onClose,
  onSaved
}: {
  text: string
  rect: { top: number; left: number; bottom: number }
  onClose: () => void
  onSaved: () => void
}) {
  const [content, setContent] = useState(text)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const handleSave = useCallback(async () => {
    if (!content.trim()) return
    setSaving(true)
    try {
      const payload = {
        type: "text" as const,
        content: content.trim(),
        source: {
          title: document.title,
          url: window.location.href,
          site: window.location.hostname
        }
      }
      await sendMessage({ kind: "capture", payload })
      setSaved(true)
      setTimeout(onSaved, 800)
    } catch {
      setSaving(false)
    }
  }, [content, onSaved])

  // Position the panel
  useEffect(() => {
    const el = panelRef.current
    if (!el) return

    const panelW = 320
    const panelH = el.offsetHeight || 260
    const viewW = window.innerWidth
    const viewH = window.innerHeight

    let left = rect.left
    let top = rect.bottom + 6

    // Flip above if not enough room below
    if (top + panelH > viewH && rect.top > panelH) {
      top = rect.top - panelH - 6
    }
    // Keep within horizontal bounds
    if (left + panelW > viewW) {
      left = viewW - panelW - 12
    }
    if (left < 12) left = 12

    el.style.left = `${left}px`
    el.style.top = `${top}px`
  }, [rect])

  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        zIndex: 2147483646,
        width: 320,
        background: "#fff",
        borderRadius: 10,
        boxShadow: "0 4px 20px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.08)",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 13,
        color: "#333",
        overflow: "hidden"
      }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid #eee",
          background: "#fafafa"
        }}>
        <span style={{ fontWeight: 600, fontSize: 12, color: "#888", letterSpacing: "0.04em" }}>
          lime · 摘录
        </span>
        <button
          onClick={onClose}
          style={{
            border: "none",
            background: "none",
            cursor: "pointer",
            fontSize: 16,
            color: "#999",
            padding: "2px 6px",
            borderRadius: 4,
            lineHeight: 1
          }}>
          ✕
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: "8px 12px" }}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          style={{
            width: "100%",
            boxSizing: "border-box",
            border: "1px solid #ddd",
            borderRadius: 6,
            padding: "8px 10px",
            fontSize: 13,
            lineHeight: 1.6,
            resize: "vertical",
            fontFamily: "inherit",
            color: "#333",
            outline: "none"
          }}
        />
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 6,
          padding: "6px 12px 10px"
        }}>
        <button
          onClick={onClose}
          style={{
            border: "1px solid #ddd",
            background: "#fff",
            borderRadius: 6,
            padding: "6px 16px",
            fontSize: 12,
            cursor: "pointer",
            color: "#666"
          }}>
          取消
        </button>
        <button
          onClick={handleSave}
          disabled={saving || saved || !content.trim()}
          style={{
            border: "none",
            background: saved ? "#22c55e" : "#6366f1",
            borderRadius: 6,
            padding: "6px 16px",
            fontSize: 12,
            cursor: saving || saved ? "default" : "pointer",
            color: "#fff",
            fontWeight: 500,
            opacity: saving || !content.trim() ? 0.6 : 1
          }}>
          {saving ? "保存中…" : saved ? "✓ 已保存" : "保存"}
        </button>
      </div>
    </div>
  )
}

// ---- Mount / unmount logic ----

let hideTimer: ReturnType<typeof setTimeout> | null = null
let isPanelOpen = false

document.addEventListener("mouseup", (e) => {
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
  // Click inside the panel should not re-trigger
  if ((e.target as HTMLElement).closest("#lime-floating-panel")) return

  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    const sel = window.getSelection()
    const text = sel?.toString().trim()
    if (!text || text.length < 5 || text.length > 2000) {
      unmountPanel()
      return
    }
    const range = sel!.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      unmountPanel()
      return
    }

    showPanel(text, rect)
  }, 300)
})

document.addEventListener("keydown", (e) => {
  // Escape closes the panel
  if (e.key === "Escape" && isPanelOpen) {
    unmountPanel()
  }
})

function showPanel(text: string, rect: DOMRect) {
  isPanelOpen = true
  const container = ensurePanel()
  panelRoot!.render(
    <FloatingPanel
      text={text}
      rect={{ top: rect.top, left: rect.left, bottom: rect.bottom }}
      onClose={unmountPanel}
      onSaved={unmountPanel}
    />
  )
}

function unmountPanel() {
  isPanelOpen = false
  if (panelRoot) {
    panelRoot.unmount()
  }
  if (panelContainer) {
    panelContainer.remove()
    panelContainer = null
    panelRoot = null
  }
}
