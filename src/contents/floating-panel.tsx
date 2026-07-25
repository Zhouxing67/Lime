import type { PlasmoCSConfig } from "plasmo"
import { useCallback, useEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"

import type { Project } from "../types"
import { sendMessage } from "../types/messages"

export const config: PlasmoCSConfig = {
  matches: ["https://*/*", "http://*/*"],
  all_frames: false
}

// ---- Persistent state manager (avoids module-level / React state confusion) ----
interface PanelPosition { left: number; top: number }
interface PanelData { text: string; rect: DOMRect }

class PanelState {
  isPinned = false
  selectedProjectId = ""
  projects: Project[] = []
  position: PanelPosition = { left: 0, top: 0 }
  isOpen = false
}

const state = new PanelState()

// ---- Mount management ----
let panelRoot: ReturnType<typeof createRoot> | null = null
let mountEl: HTMLDivElement | null = null

function safeUnmount() {
  if (panelRoot) {
    try { panelRoot.unmount() } catch { /* already destroyed */ }
    panelRoot = null
  }
}

function ensureMount(): boolean {
  if (mountEl?.isConnected) return true
  // Memory-safe cleanup before recreating
  safeUnmount()
  mountEl?.remove()
  mountEl = document.createElement("div")
  mountEl.id = "lime-panel-mount"
  const shadow = mountEl.attachShadow({ mode: "open" })
  const style = document.createElement("style")
  style.textContent = `
    *{box-sizing:border-box;margin:0}
    .lp{position:fixed;z-index:2147483646;width:320px;background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(99,102,241,0.12),0 1px 3px rgba(0,0,0,0.06);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:#1e293b;overflow:hidden}
    .lh{display:flex;align-items:center;padding:8px 12px;background:#6366f1;gap:8px;min-height:38px}
    .lt{font-weight:600;font-size:12px;color:#fff;letter-spacing:0.04em;flex-shrink:0;text-transform:uppercase}
    .la{margin-left:auto}
    .lac{display:flex;align-items:center;gap:2px;background:rgba(255,255,255,0.92);border-radius:8px;padding:2px}
    .lb{border:none;background:none;cursor:pointer;font-size:15px;border-radius:6px;padding:4px 6px;line-height:1;display:flex;align-items:center;justify-content:center;color:#475569;transition:all 0.15s}
    .lb:hover{background:#eef2ff;color:#6366f1}
    .pin-svg{display:block;width:16px;height:16px;transition:transform 0.2s;fill:currentColor}
    .ls-wrap{position:relative;display:inline-flex;align-items:center}
    .ls{font-size:12px;border:none;border-radius:6px;padding:4px 24px 4px 8px;background:rgba(255,255,255,0.9);color:#1e293b;max-width:130px;cursor:pointer;font-weight:500;appearance:none;-webkit-appearance:none;text-overflow:ellipsis;overflow:hidden;white-space:nowrap}
    .ls:focus{outline:2px solid rgba(255,255,255,0.5)}
    .ls-arrow{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid #64748b;pointer-events:none}
    .lfi{width:100%;border:1.5px solid #e2e8f0;border-radius:8px;padding:8px 10px;font-size:13px;font-weight:500;font-family:inherit;color:#1e293b;outline:none;margin-bottom:8px;transition:border-color 0.15s,box-shadow 0.15s}
    .lfi:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,0.1)}
    .lfi::placeholder{color:#94a3b8;font-weight:400}
    .lta{width:100%;border:1.5px solid #e2e8f0;border-radius:8px;padding:8px 10px;font-size:13px;line-height:1.7;resize:vertical;font-family:inherit;color:#1e293b;outline:none;margin:0;transition:border-color 0.15s,box-shadow 0.15s;min-height:72px}
    .lta:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,0.1)}
    .lta::placeholder{color:#94a3b8}
    .lf{display:flex;justify-content:flex-end;gap:6px;padding:8px 12px 10px;align-items:center;background:#f8fafc;border-top:1px solid #f1f5f9}
    .lfb{border-radius:8px;padding:6px 16px;font-size:12px;cursor:pointer;border:none;font-weight:600;transition:all 0.15s}
    .lfc{background:#fff;color:#64748b;border:1px solid #e2e8f0}
    .lfc:hover{color:#334155;border-color:#cbd5e1}
    .lfs{background:#6366f1;color:#fff}
    .lfs:hover:not(:disabled){background:#4f46e5}
    .lfs:disabled{opacity:0.5;cursor:default}
    .lerr{font-size:11px;color:#ef4444}
  `
  shadow.appendChild(style)
  const reactRoot = document.createElement("div")
  shadow.appendChild(reactRoot)
  document.body.appendChild(mountEl)
  panelRoot = createRoot(reactRoot)
  return true
}

// ---- React component ----
function FloatingPanel({
  data,
  onClose,
  onSaved
}: {
  data: PanelData
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState(data.text)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pinned, setPinned] = useState(state.isPinned)
  const [projects, setProjects] = useState<Project[]>(state.projects)
  const [projId, setProjId] = useState(state.selectedProjectId)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [error, setError] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  // Sync content from new selection
  useEffect(() => { setContent(data.text); setSaving(false); setSaved(false); setError("") }, [data.text])

  // Load projects
  const load = useCallback(async () => {
    try {
      const list: Project[] = (await sendMessage({ kind: "list-projects" })) ?? []
      setProjects(list); state.projects = list
      if (!state.selectedProjectId && list.length > 0) {
        state.selectedProjectId = list[0].id; setProjId(list[0].id)
      }
    } catch { /* ignore */ }
  }, [])
  useEffect(() => { if (projects.length === 0) load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cross-tab project sync
  useEffect(() => {
    const h = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes._dbp) load()
    }
    chrome.storage.onChanged.addListener(h)
    return () => chrome.storage.onChanged.removeListener(h)
  }, [load])

  // Resize → re-clamp position
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

  // Drag: correct offset + document-level events
  const dragRef = useRef<{ ox: number; oy: number } | null>(null)
  const pd = useCallback((e: React.PointerEvent) => {
    if (!pinned || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    dragRef.current = { ox: e.clientX - r.left, oy: e.clientY - r.top }
    e.preventDefault()
  }, [pinned])

  useEffect(() => {
    const el = ref.current; if (!el) return
    let dragging = false
    const mv = (e: PointerEvent) => {
      const d = dragRef.current; if (!d) return
      if (!dragging) { dragging = true }
      el.style.left = `${Math.max(0, e.clientX - d.ox)}px`
      el.style.top = `${Math.max(0, e.clientY - d.oy)}px`
    }
    const up = () => { dragging = false; dragRef.current = null }
    // Bind to document so mouse-leave doesn't cause stuck drag
    document.addEventListener("pointermove", mv)
    document.addEventListener("pointerup", up)
    return () => { document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up) }
  }, [])

  // Position (unpinned only)
  useEffect(() => {
    if (pinned) return
    const el = ref.current; if (!el) return
    const pw = 320, ph = el.offsetHeight || 340
    const vw = window.innerWidth, vh = window.innerHeight
    let l = data.rect.left, t = data.rect.bottom + 6
    if (t + ph > vh && data.rect.top > ph) t = data.rect.top - ph - 6
    if (l + pw > vw) l = vw - pw - 12
    if (l < 12) l = 12
    el.style.left = `${l}px`; el.style.top = `${t}px`
    state.position = { left: l, top: t }
  }, [data.rect, pinned])

  const save = useCallback(async () => {
    if (!content.trim()) return
    setSaving(true); setError("")
    try {
      await sendMessage({
        kind: "capture",
        payload: {
          type: "text", content: content.trim(),
          title: title.trim() || undefined,
          source: { title: document.title, url: window.location.href, site: window.location.hostname },
          projectId: projId || undefined
        }
      })
      setSaved(true)
      setTimeout(onSaved, 800)
    } catch { setError("保存失败"); setSaving(false) }
  }, [content, title, projId, onSaved])

  const createProject = useCallback(async () => {
    if (!newName.trim()) return
    try {
      const res = await sendMessage<{ ok: boolean; id?: string; error?: string }>({ kind: "add-project", name: newName.trim() })
      if (res?.ok) {
        setNewName(""); setCreating(false); setError("")
        await load()
        setProjId(res.id); state.selectedProjectId = res.id
      } else { setError(res?.error ?? "创建失败") }
    } catch { setError("创建失败") }
  }, [newName, load])

  const togglePin = useCallback(() => { state.isPinned = !pinned; setPinned(!pinned) }, [pinned])

  return (
    <div ref={ref} className="lp" style={{ display: "block" }}>
      <div className="lh" onPointerDown={pd} style={{ cursor: pinned ? "grab" : "default" }}>
        <span className="lt">lime · 摘录</span>
        <span className="ls-wrap">
          <select className="ls" value={projId}
            onChange={(e) => { setProjId(e.target.value); state.selectedProjectId = e.target.value }}>
            {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
          </select>
          <span className="ls-arrow"></span>
        </span>
        <div className="la">
          <span className="lac">
            <button className="lb" onClick={() => setCreating(!creating)} title="新建项目" style={{ fontSize: 13 }}>＋</button>
            <button className="lb" onClick={togglePin} title={pinned ? "取消固定" : "固定面板"}>
              <svg className="pin-svg" viewBox="0 0 24 24" style={{ transform: pinned ? "rotate(45deg)" : "rotate(0deg)" }}>
                <path d="M14 4v5c0 1.12.37 2.16 1 3H9c.63-.84 1-1.88 1-3V4h4zm-3-2c-.55 0-1 .45-1 1v1h-1c-.55 0-1 .45-1 1s.45 1 1 1h6c.55 0 1-.45 1-1s-.45-1-1-1h-1V3c0-.55-.45-1-1-1h-2zm-4 4v1c0 1.5.5 2.8 1.3 3.7.5.6 1.1 1 1.7 1.3V15h-1c-.55 0-1 .45-1 1s.45 1 1 1h6c.55 0 1-.45 1-1s-.45-1-1-1h-1v-3c.6-.3 1.2-.7 1.7-1.3.8-.9 1.3-2.2 1.3-3.7V7H7z"/>
              </svg>
            </button>
            <button className="lb" onClick={onClose} title="关闭" style={{ fontSize: 13 }}>✕</button>
          </span>
        </div>
      </div>
      {creating && (
        <div style={{ display: "flex", gap: 4, padding: "0 12px 6px", flexWrap: "wrap" }}>
          <input style={{ flex: 1, minWidth: 140, border: "1px solid #ddd", borderRadius: 4, padding: "4px 8px", fontSize: 12, outline: "none" }}
            placeholder="项目名称…" value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createProject()} autoFocus />
          <button disabled={!newName.trim()} onClick={createProject}
            style={{ border: "none", background: "#6366f1", color: "#fff", borderRadius: 4, padding: "4px 10px", fontSize: 12, cursor: "pointer", opacity: !newName.trim() ? 0.5 : 1 }}>创建</button>
        </div>
      )}
      {error && <div style={{ padding: "0 12px 4px", fontSize: 11, color: "#ef4444" }}>{error}</div>}
      <div style={{ padding: "8px 12px" }}>
        <input className="lfi" placeholder="摘要（可选）" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="lta" value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
      </div>
      <div className="lf">
        {error && <span style={{ fontSize: 11, color: "#ef4444", marginRight: "auto" }}>{error}</span>}
        <button className="lfb lfc" onClick={onClose}>取消</button>
        <button className="lfb lfs" disabled={saving || saved || !content.trim()} onClick={save}
          style={{ background: saved ? "#22c55e" : "#6366f1", opacity: saving || !content.trim() ? 0.6 : 1 }}>
          {saving ? "保存中…" : saved ? "✓ 已保存" : "保存"}
        </button>
      </div>
    </div>
  )
}

// ---- Show/hide with position clamping ----
function clampInView(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  const maxL = window.innerWidth - 340, maxT = window.innerHeight - 60
  const l = Math.max(4, Math.min(r.left, maxL))
  const t = Math.max(4, Math.min(r.top, maxT))
  if (l !== r.left) el.style.left = `${l}px`
  if (t !== r.top) el.style.top = `${t}px`
}

let hideTimer: ReturnType<typeof setTimeout> | null = null
let prevSelection = ""

document.addEventListener("mouseup", (e) => {
  if (mountEl?.contains(e.target as Node)) return
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return

  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    const sel = window.getSelection()
    const text = sel?.toString().trim()
    if (!text || text.length < 5 || text.length > 2000) {
      if (!state.isPinned) hidePanel()
      return
    }
    if (text === prevSelection && state.isOpen && state.isPinned) return
    prevSelection = text
    const range = sel!.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) { if (!state.isPinned) hidePanel(); return }
    showPanel(text, rect)
  }, 300)
})

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (state.isPinned) { state.isPinned = false; hidePanel() }
    else if (state.isOpen) hidePanel()
  }
})

function showPanel(text: string, rect: DOMRect) {
  state.isOpen = true
  if (!ensureMount()) return
  mountEl!.style.display = "block"
  try {
    panelRoot!.render(
      <FloatingPanel
        data={{ text, rect }}
        onClose={() => { if (state.isPinned) state.isPinned = false; hidePanel() }}
        onSaved={() => { if (state.isPinned) state.isPinned = false; hidePanel() }}
      />
    )
  } catch {
    safeUnmount(); mountEl?.remove(); mountEl = null
    if (!ensureMount()) return
    mountEl!.style.display = "block"
    try {
      panelRoot!.render(
        <FloatingPanel
          data={{ text, rect }}
          onClose={() => { if (state.isPinned) state.isPinned = false; hidePanel() }}
          onSaved={() => { if (state.isPinned) state.isPinned = false; hidePanel() }}
        />
      )
    } catch (e2) { console.warn("[lime] panel render failed:", e2) }
  }
}

function hidePanel() {
  state.isOpen = false
  if (mountEl) mountEl.style.display = "none"
}
