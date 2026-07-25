import type { PlasmoCSConfig } from "plasmo"
import { useCallback, useEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"

import { sendMessage } from "../types/messages"
import type { Project } from "../types"

export const config: PlasmoCSConfig = {
  matches: ["https://*/*", "http://*/*"],
  all_frames: false
}

// ---- Persistent lifecycle globals ----
let panelRoot: ReturnType<typeof createRoot> | null = null
let shadowHost: HTMLDivElement | null = null
let shadowRoot: ShadowRoot | null = null

let moduleState = {
  isPinned: false,
  selectedProjectId: "",
  projects: [] as Project[],
  panelLeft: 0,
  panelTop: 0,
  isOpen: false,
  isDragging: false,
  dragOffsetX: 0,
  dragOffsetY: 0
}

async function fetchProjects(): Promise<Project[]> {
  try {
    const result = await chrome.runtime.sendMessage({ kind: "list-projects" })
    return (result as Project[]) ?? []
  } catch {
    return []
  }
}

function buildStyles(): HTMLStyleElement {
  const style = document.createElement("style")
  style.textContent = `
    .lp-header { display:flex; align-items:center; padding:8px 12px; border-bottom:1px solid #eee; background:#fafafa; gap:6px; }
    .lp-header-title { font-weight:600; font-size:12px; color:#888; letter-spacing:0.04em; flex-shrink:0; }
    .lp-header-actions { display:flex; align-items:center; gap:4px; margin-left:auto; }
    .lp-btn { border:none; background:none; cursor:pointer; font-size:16px; border-radius:4px; padding:2px 6px; line-height:1; display:flex; align-items:center; justify-content:center; }
    .lp-btn:hover { background:#e5e7eb; }
    .lp-select { font-size:12px; border:1px solid #ddd; border-radius:4px; padding:3px 6px; background:#fff; color:#555; max-width:120px; cursor:pointer; }
    .lp-title-input { width:100%; box-sizing:border-box; border:1px solid #ddd; border-radius:6px; padding:7px 10px; font-size:13px; font-weight:500; font-family:inherit; color:#333; outline:none; margin-bottom:6px; }
    .lp-title-input:focus { border-color:#6366f1; }
    .lp-textarea { width:100%; box-sizing:border-box; border:1px solid #ddd; border-radius:6px; padding:8px 10px; font-size:13px; line-height:1.6; resize:vertical; font-family:inherit; color:#333; outline:none; margin:0; }
    .lp-textarea:focus { border-color:#6366f1; }
    .lp-footer { display:flex; justify-content:flex-end; gap:6px; padding:6px 12px 10px; }
    .lp-footer-btn { border-radius:6px; padding:6px 16px; font-size:12px; cursor:pointer; border:none; font-weight:500; }
    .lp-footer-cancel { border:1px solid #ddd; background:#fff; color:#666; }
    .lp-footer-save { color:#fff; }
    .lp-footer-save:disabled { opacity:0.6; cursor:default; }
  `
  return style
}

function ensureShadowHost(): HTMLDivElement {
  if (!shadowHost) {
    shadowHost = document.createElement("div")
    shadowHost.id = "lime-floating-panel"
    shadowRoot = shadowHost.attachShadow({ mode: "open" })
    shadowRoot.appendChild(buildStyles())
    const mount = document.createElement("div")
    mount.id = "lime-root"
    shadowRoot.appendChild(mount)
    document.body.appendChild(shadowHost)
    panelRoot = createRoot(mount)
  }
  return shadowHost
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
  const [title, setTitle] = useState("")
  const [content, setContent] = useState(text)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pinned, setPinned] = useState(moduleState.isPinned)
  const [projects, setProjects] = useState<Project[]>(moduleState.projects)
  const [selectedId, setSelectedId] = useState(moduleState.selectedProjectId)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)

  // Sync external text prop on every show (panel is persistent, useState(text) only runs once)
  useEffect(() => {
    setContent(text)
    setSaving(false)
    setSaved(false)
  }, [text])

  // Load projects on first mount
  useEffect(() => {
    if (projects.length === 0) {
      fetchProjects().then((list) => {
        setProjects(list)
        moduleState.projects = list
        if (!moduleState.selectedProjectId && list.length > 0) {
          moduleState.selectedProjectId = list[0].id
          setSelectedId(list[0].id)
        }
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = useCallback(async () => {
    if (!content.trim()) return
    setSaving(true)
    try {
      await sendMessage({
        kind: "capture",
        payload: {
          type: "text",
          content: content.trim(),
          title: title.trim() || undefined,
          source: {
            title: document.title,
            url: window.location.href,
            site: window.location.hostname
          },
          projectId: selectedId || undefined
        }
      })
      setSaved(true)
      setTimeout(onSaved, 800)
    } catch (e) {
      console.warn("[lime] capture failed:", e)
      setSaving(false)
    }
  }, [content, title, selectedId, onSaved])

  const togglePin = useCallback(() => {
    moduleState.isPinned = !pinned
    setPinned(!pinned)
  }, [pinned])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!pinned || !panelRef.current) return
    // Only record start position — do NOT capture pointer yet (would block clicks)
    dragStart.current = { x: e.clientX, y: e.clientY }
    moduleState.dragOffsetX = e.clientX - panelRef.current.getBoundingClientRect().left
    moduleState.dragOffsetY = e.clientY - panelRef.current.getBoundingClientRect().top
  }, [pinned])

  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    const handleMove = (e: PointerEvent) => {
      if (!moduleState.isDragging) {
        // Start drag only after noticeable movement (threshold: 4px)
        if (!dragStart.current || Math.abs(e.clientX - dragStart.current.x) < 4) return
        moduleState.isDragging = true
        el.setPointerCapture(e.pointerId)
      }
      const left = e.clientX - moduleState.dragOffsetX
      const top = e.clientY - moduleState.dragOffsetY
      el.style.left = `${Math.max(0, left)}px`
      el.style.top = `${Math.max(0, top)}px`
      moduleState.panelLeft = left
      moduleState.panelTop = top
    }
    const handleUp = () => {
      moduleState.isDragging = false
      dragStart.current = null
    }
    el.addEventListener("pointermove", handleMove)
    el.addEventListener("pointerup", handleUp)
    return () => {
      el.removeEventListener("pointermove", handleMove)
      el.removeEventListener("pointerup", handleUp)
    }
  }, [])

  // Position the panel (only when not pinned)
  useEffect(() => {
    if (pinned) return
    const el = panelRef.current
    if (!el) return

    const panelW = 320
    const panelH = el.offsetHeight || 300
    const viewW = window.innerWidth
    const viewH = window.innerHeight

    let left = rect.left
    let top = rect.bottom + 6

    if (top + panelH > viewH && rect.top > panelH) {
      top = rect.top - panelH - 6
    }
    if (left + panelW > viewW) {
      left = viewW - panelW - 12
    }
    if (left < 12) left = 12

    el.style.left = `${left}px`
    el.style.top = `${top}px`
    moduleState.panelLeft = left
    moduleState.panelTop = top
  }, [rect, pinned])

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
        className="lp-header"
        onPointerDown={handlePointerDown}
        style={{ cursor: pinned ? "grab" : "default" }}>
        <span className="lp-header-title">lime · 摘录</span>
        <select
          className="lp-select"
          value={selectedId}
          onChange={(e) => {
            setSelectedId(e.target.value)
            moduleState.selectedProjectId = e.target.value
          }}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="lp-header-actions">
          <button
            className="lp-btn"
            onClick={togglePin}
            title={pinned ? "取消固定" : "固定面板"}
            style={{
              transition: "transform 0.2s",
              transform: pinned ? "rotate(0deg)" : "rotate(45deg)"
            }}>
            📌
          </button>
          <button className="lp-btn" onClick={onClose} title="关闭">✕</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "8px 12px" }}>
        <input
          className="lp-title-input"
          placeholder="摘要（可选）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="lp-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
        />
      </div>

      {/* Footer */}
      <div className="lp-footer">
        <button className="lp-footer-btn lp-footer-cancel" onClick={onClose}>
          取消
        </button>
        <button
          className="lp-footer-btn lp-footer-save"
          disabled={saving || saved || !content.trim()}
          onClick={handleSave}
          style={{
            background: saved ? "#22c55e" : "#6366f1",
            opacity: saving || !content.trim() ? 0.6 : 1
          }}>
          {saving ? "保存中…" : saved ? "✓ 已保存" : "保存"}
        </button>
      </div>
    </div>
  )
}

// ---- Show/hide logic ----

let hideTimer: ReturnType<typeof setTimeout> | null = null
let prevSelection = ""

document.addEventListener("mouseup", (e) => {
  // Don't trigger for interactions inside the panel.
  // Note: use shadowHost.contains(), not shadowRoot.contains() —
  // Shadow DOM retargets e.target to the host element.
  if (shadowHost?.contains(e.target as Node)) return

  const tag = (e.target as HTMLElement)?.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return

  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    const sel = window.getSelection()
    const text = sel?.toString().trim()
    if (!text || text.length < 5 || text.length > 2000) {
      if (!moduleState.isPinned) hidePanel()
      return
    }
    // Same text and pinned → don't re-show (user might be editing)
    if (text === prevSelection && moduleState.isOpen && moduleState.isPinned) return
    prevSelection = text

    const range = sel!.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      if (!moduleState.isPinned) hidePanel()
      return
    }

    showPanel(text, rect)
  }, 300)
})

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (moduleState.isPinned) {
      moduleState.isPinned = false
      hidePanel()
    } else if (moduleState.isOpen) {
      hidePanel()
    }
  }
})

function showPanel(text: string, rect: DOMRect) {
  moduleState.isOpen = true
  // If the shadow host was removed from DOM (e.g. SPA navigation), reset and recreate
  if (shadowHost && !document.body.contains(shadowHost)) {
    panelRoot = null
    shadowHost = null
    shadowRoot = null
  }
  const host = ensureShadowHost()
  host.style.display = "block"
  panelRoot!.render(
    <FloatingPanel
      text={text}
      rect={{ top: rect.top, left: rect.left, bottom: rect.bottom }}
      onClose={() => {
        if (moduleState.isPinned) {
          moduleState.isPinned = false
        }
        hidePanel()
      }}
      onSaved={() => {
        if (moduleState.isPinned) {
          moduleState.isPinned = false
        }
        hidePanel()
      }}
    />
  )
}

function hidePanel() {
  moduleState.isOpen = false
  if (shadowHost) {
    shadowHost.style.display = "none"
  }
}
