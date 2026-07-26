import React, { useCallback, useEffect, useRef, useState } from "react"

import type { Project } from "../types"
import { sendMessage } from "../types/messages"

// Hardcoded palette — matches the options-page MUI theme. Kept out of MUI
// to avoid bundler/undefined-component issues in the content-script bundle.
const COLORS = {
  primary: "#6366f1",
  primaryDark: "#4f46e5",
  error: "#ef4444",
  success: "#22c55e",
  bgPaper: "#fff",
  bgDefault: "#f8fafc",
  textPrimary: "#1e293b",
  textSecondary: "#64748b"
}

export interface PanelPosition { left: number; top: number }
export interface PanelData { text: string; rect: DOMRect }

// ---- ErrorBoundary ----
class PanelErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.warn("[lime] panel render error:", error.message, info.componentStack)
  }
  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

// ---- Inline SVG icons ----
const IconPushPin = ({ rotated }: { rotated: boolean }) => (
  <svg viewBox="0 0 24 24" style={{ display: "block", width: 16, height: 16, transition: "transform 0.2s", fill: "currentColor", transform: rotated ? "rotate(45deg)" : "rotate(0deg)" }}>
    <path d="M14 4v5c0 1.12.37 2.16 1 3H9c.63-.84 1-1.88 1-3V4h4zm-3-2c-.55 0-1 .45-1 1v1h-1c-.55 0-1 .45-1 1s.45 1 1 1h6c.55 0 1-.45 1-1s-.45-1-1-1h-1V3c0-.55-.45-1-1-1h-2zm-4 4v1c0 1.5.5 2.8 1.3 3.7.5.6 1.1 1 1.7 1.3V15h-1c-.55 0-1 .45-1 1s.45 1 1 1h6c.55 0 1-.45 1-1s-.45-1-1-1h-1v-3c.6-.3 1.2-.7 1.7-1.3.8-.9 1.3-2.2 1.3-3.7V7H7z"/>
  </svg>
)

const IconClose = () => (
  <svg viewBox="0 0 24 24" style={{ display: "block", width: 16, height: 16, fill: "currentColor" }}>
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
  </svg>
)

// ---- Button style factory ----
function iconBtnStyle() {
  return {
    border: "none" as const, background: "none" as const, cursor: "pointer" as const,
    fontSize: 15, borderRadius: 8, padding: "4px 6px", lineHeight: 1 as const,
    display: "flex" as const, alignItems: "center" as const, justifyContent: "center" as const,
    color: "#475569", transition: "all 0.15s"
  }
}

export function FloatingPanel({
  data,
  pinned,
  position,
  projects,
  selectedProjectId,
  onClose,
  onSaved,
  onPinChange,
  onPositionChange,
  onProjectsChange,
  onSelectedProjectChange
}: {
  data: PanelData
  pinned: boolean
  position: PanelPosition
  projects: Project[]
  selectedProjectId: string
  onClose: () => void
  onSaved: () => void
  onPinChange: (pinned: boolean) => void
  onPositionChange: (pos: PanelPosition) => void
  onProjectsChange: (projects: Project[]) => void
  onSelectedProjectChange: (id: string) => void
}) {
  return (
    <PanelErrorBoundary>
      <FloatingPanelContent
        data={data}
        pinned={pinned}
        position={position}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onClose={onClose}
        onSaved={onSaved}
        onPinChange={onPinChange}
        onPositionChange={onPositionChange}
        onProjectsChange={onProjectsChange}
        onSelectedProjectChange={onSelectedProjectChange}
      />
    </PanelErrorBoundary>
  )
}

function FloatingPanelContent({
  data,
  pinned,
  position,
  projects,
  selectedProjectId,
  onClose,
  onSaved,
  onPinChange,
  onPositionChange,
  onProjectsChange,
  onSelectedProjectChange
}: {
  data: PanelData
  pinned: boolean
  position: PanelPosition
  projects: Project[]
  selectedProjectId: string
  onClose: () => void
  onSaved: () => void
  onPinChange: (pinned: boolean) => void
  onPositionChange: (pos: PanelPosition) => void
  onProjectsChange: (projects: Project[]) => void
  onSelectedProjectChange: (id: string) => void
}) {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState(data.text)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [error, setError] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  const primary = COLORS.primary
  const errColor = COLORS.error
  const success = COLORS.success
  const bgPaper = COLORS.bgPaper
  const bgDefault = COLORS.bgDefault
  const txtPrimary = COLORS.textPrimary
  const txtSecondary = COLORS.textSecondary

  // Sync content from new selection
  useEffect(() => { setContent(data.text); setSaving(false); setSaved(false); setError("") }, [data.text])

  // Load projects
  const load = useCallback(async () => {
    try {
      const list: Project[] = (await sendMessage({ kind: "list-projects" })) ?? []
      onProjectsChange(list)
      const valid = list.find((p) => p.id === selectedProjectId)
      if (valid) {
        onSelectedProjectChange(selectedProjectId)
      } else if (list.length > 0) {
        onSelectedProjectChange(list[0].id)
      } else {
        onSelectedProjectChange("")
      }
    } catch (err) {
      console.warn("[lime] load projects failed:", err)
    }
  }, [onProjectsChange, onSelectedProjectChange, selectedProjectId])
  useEffect(() => { load() }, [load])

  // Resize clamp
  useEffect(() => {
    const onResize = () => {
      if (!ref.current || !ref.current.isConnected) return
      const r = ref.current.getBoundingClientRect()
      const maxL = window.innerWidth - 340, maxT = window.innerHeight - 60
      const l = Math.max(4, Math.min(r.left, maxL))
      const t = Math.max(4, Math.min(r.top, maxT))
      if (l !== r.left || t !== r.top) { ref.current.style.left = `${l}px`; ref.current.style.top = `${t}px` }
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // Drag handle
  const dragRef = useRef<{ ox: number; oy: number } | null>(null)
  const handleRef = useRef<HTMLSpanElement | null>(null)
  const wasPinnedRef = useRef(false)
  const pd = useCallback((e: React.PointerEvent) => {
    if (!ref.current || !handleRef.current) return
    if (!pinned) onPinChange(true)
    const r = ref.current.getBoundingClientRect()
    dragRef.current = { ox: e.clientX - r.left, oy: e.clientY - r.top }
    handleRef.current.style.cursor = "grabbing"
    e.preventDefault()
  }, [pinned, onPinChange])

  useEffect(() => {
    const el = ref.current; if (!el) return
    let dragging = false
    const mv = (e: PointerEvent) => {
      const d = dragRef.current; if (!d) return
      if (!dragging) { dragging = true }
      const left = Math.max(0, e.clientX - d.ox)
      const top = Math.max(0, e.clientY - d.oy)
      el.style.left = `${left}px`
      el.style.top = `${top}px`
      onPositionChange({ left, top })
    }
    const up = () => {
      dragging = false
      dragRef.current = null
      if (handleRef.current) handleRef.current.style.cursor = "grab"
    }
    document.addEventListener("pointermove", mv)
    document.addEventListener("pointerup", up)
    return () => { document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up) }
  }, [onPositionChange])

  // Position: if pinned, restore persisted position; otherwise position near selection
  useEffect(() => {
    const el = ref.current; if (!el) return
    if (pinned) {
      el.style.left = `${position.left}px`
      el.style.top = `${position.top}px`
      wasPinnedRef.current = true
      return
    }
    // Just unpinned: keep current position until the user selects new text or closes the panel
    if (wasPinnedRef.current) {
      wasPinnedRef.current = false
      return
    }
    const pw = 320, ph = el.offsetHeight || 340
    const vw = window.innerWidth, vh = window.innerHeight
    let l = data.rect.left, t = data.rect.bottom + 6
    if (t + ph > vh && data.rect.top > ph) t = data.rect.top - ph - 6
    if (l + pw > vw) l = vw - pw - 12
    if (l < 12) l = 12
    el.style.left = `${l}px`; el.style.top = `${t}px`
    onPositionChange({ left: l, top: t })
  }, [data.rect, pinned, position, onPositionChange])

  const save = useCallback(async () => {
    if (!content.trim()) return
    setSaving(true); setError("")
    try {
      const res = await sendMessage<{ ok: boolean; saved?: boolean }>({
        kind: "capture",
        payload: {
          type: "text", content: content.trim(),
          title: title.trim() || undefined,
          source: { title: document.title, url: window.location.href, site: window.location.hostname },
          projectId: selectedProjectId || undefined
        }
      })
      if (res?.saved === false) {
        setError("内容重复，已跳过")
        setSaving(false)
        return
      }
      setSaved(true)
      // Keep the panel open after save; only the explicit close button closes it.
      setTimeout(() => { setSaved(false); setSaving(false); setContent(""); setTitle("") }, 1200)
    } catch (err) {
      console.warn("[lime] save failed:", err)
      setError("保存失败")
      setSaving(false)
    }
  }, [content, title, selectedProjectId, onSaved])

  const createProject = useCallback(async () => {
    if (!newName.trim()) return
    setError("")
    try {
      const res = await sendMessage<{ ok: boolean; id?: string; error?: string }>({ kind: "add-project", name: newName.trim() })
      if (res?.ok) {
        setNewName(""); setCreating(false)
        await load()
      } else {
        setError(res?.error ?? "项目名称已存在")
      }
    } catch (err) {
      console.warn("[lime] create project failed:", err)
      setError("创建失败")
    }
  }, [newName, load])

  const togglePin = useCallback(() => { onPinChange(!pinned) }, [onPinChange, pinned])

  const iconBtn = iconBtnStyle()

  return (
    <div ref={ref} data-lime-panel="true" style={{
      position: "fixed", zIndex: 2147483646, width: 320, overflow: "hidden",
      display: "block", background: bgPaper, borderRadius: 8,
      boxShadow: "0 8px 32px rgba(99,102,241,0.12),0 1px 3px rgba(0,0,0,0.06)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSize: 13, color: txtPrimary,
      boxSizing: "border-box"
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", padding: "8px 12px",
        background: primary, gap: 8, minHeight: 38
      }}>
        <span
          ref={handleRef}
          onPointerDown={pd}
          title={pinned ? "拖拽移动" : "拖拽以固定位置"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            cursor: "grab",
            padding: "0 4px",
            marginLeft: -4,
            opacity: 1
          }}>
          <svg viewBox="0 0 24 24" style={{ display: "block", width: 14, height: 14, fill: "rgba(255,255,255,0.9)" }}>
            <path d="M7 5h2v2H7zm0 6h2v2H7zm0 6h2v2H7zm4-12h2v2h-2zm0 6h2v2h-2zm0 6h2v2h-2z" />
          </svg>
        </span>
        <span style={{ fontWeight: 600, fontSize: 12, color: "#fff", letterSpacing: "0.04em", flexShrink: 0, textTransform: "uppercase" }}>
          lime · 摘录
        </span>
        <span style={{ position: "relative", display: "inline-flex", alignItems: "center", flex: "1 1 auto", minWidth: 0 }}>
          <select value={selectedProjectId} onChange={(e) => onSelectedProjectChange(e.target.value)}
            style={{
              fontSize: 12, border: "none", borderRadius: 8, padding: "4px 24px 4px 8px",
              background: "rgba(255,255,255,0.9)", color: txtPrimary,
              width: "100%", maxWidth: "100%", cursor: "pointer", fontWeight: 500,
              appearance: "none", WebkitAppearance: "none",
              textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap",
              outline: "none"
            }}>
            {projects.length === 0 && <option value="" disabled>加载中…</option>}
            {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
          </select>
          <span style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: "5px solid #64748b", pointerEvents: "none" }} />
        </span>
        <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 2, background: "rgba(255,255,255,0.92)", borderRadius: 8, padding: 2 }}>
          <button type="button" style={iconBtn} onClick={() => setCreating(!creating)} title="新建项目">＋</button>
          <button type="button" style={iconBtn} onClick={togglePin} title={pinned ? "取消固定" : "固定面板"}><IconPushPin rotated={pinned} /></button>
          <button type="button" style={iconBtn} onClick={onClose} title="关闭"><IconClose /></button>
        </span>
      </div>

      {/* Create project */}
      {creating && (
        <div style={{ display: "flex", gap: 4, padding: "0 12px 6px", flexWrap: "wrap" }}>
          <input placeholder="项目名称…" value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createProject()} autoFocus
            style={{ flex: "1 1 auto", minWidth: 0, border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "4px 8px", fontSize: 12, outline: "none" }} />
          <button type="button" disabled={!newName.trim()} onClick={createProject}
            style={{ border: "none", background: primary, color: "#fff", borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer", opacity: !newName.trim() ? 0.5 : 1, flexShrink: 0 }}>
            创建
          </button>
        </div>
      )}

      {/* Error */}
      {error && <div style={{ padding: "0 12px 4px", fontSize: 11, color: errColor }}>{error}</div>}

      {/* Inputs */}
      <div style={{ padding: "8px 12px" }}>
        <input placeholder="摘要（可选）" value={title} onChange={(e) => setTitle(e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px",
            fontSize: 13, fontWeight: 500, outline: "none", marginBottom: 8
          }} />
        <textarea placeholder="输入内容…" value={content} onChange={(e) => setContent(e.target.value)} rows={4}
          style={{
            width: "100%", boxSizing: "border-box", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px",
            fontSize: 13, lineHeight: 1.7, resize: "vertical", outline: "none", fontFamily: "inherit"
          }} />
      </div>

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, padding: "8px 12px 10px", alignItems: "center", background: bgDefault, borderTop: "1px solid #f1f5f9" }}>
        {error && <span style={{ fontSize: 11, color: errColor, marginRight: "auto" }}>{error}</span>}
        <button type="button" onClick={onClose}
          style={{ borderRadius: 8, padding: "6px 16px", fontSize: 12, cursor: "pointer", fontWeight: 600, background: bgPaper, color: txtSecondary, border: "1px solid #e2e8f0" }}>
          取消
        </button>
        <button type="button" disabled={saving || saved || !content.trim()} onClick={save}
          style={{ borderRadius: 8, padding: "6px 16px", fontSize: 12, cursor: "pointer", fontWeight: 600, border: "none", color: "#fff", background: saved ? success : primary, opacity: saving || !content.trim() ? 0.5 : 1 }}>
          {saving ? "保存中…" : saved ? "✓ 已保存" : "保存"}
        </button>
      </div>
    </div>
  )
}

export default FloatingPanel
