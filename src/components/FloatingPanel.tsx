import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react"

import { palettes } from "../theme/palettes"
import type { PresetName } from "../types"
import type { Project } from "../types"
import { sendMessage } from "../types/messages"
import {
  appendMarkdownImage,
  extractMarkdownImages,
  removeMarkdownImage
} from "../utils"

const SANS_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Helvetica Neue', Arial, sans-serif"

interface PanelColors {
  primary: string
  primaryHover: string
  error: string
  success: string
  bgDefault: string
  bgPaper: string
  bgHover: string
  textPrimary: string
  textSecondary: string
  textDisabled: string
  divider: string
  borderStrong: string
  shadow: string
}

function buildColors(preset: PresetName, dark: boolean): PanelColors {
  const p = palettes[preset]
  return {
    primary: p.primary.main,
    primaryHover: dark ? p.primary.light : p.primary.dark,
    error: dark ? "#ef5350" : "#dc2626",
    success: "#22c55e",
    bgDefault: dark ? "#1a1a1a" : "#faf9f7",
    bgPaper: dark ? "#252525" : "#ffffff",
    bgHover: dark ? "rgba(232,230,227,0.06)" : "rgba(45,52,54,0.04)",
    textPrimary: dark ? "#e8e6e3" : "#2d3436",
    textSecondary: dark ? "rgba(232,230,227,0.65)" : "rgba(45,52,54,0.65)",
    textDisabled: dark ? "rgba(232,230,227,0.38)" : "rgba(45,52,54,0.38)",
    divider: dark ? "rgba(232,230,227,0.12)" : "rgba(45,52,54,0.08)",
    borderStrong: dark ? "rgba(232,230,227,0.2)" : "rgba(45,52,54,0.14)",
    shadow: dark
      ? "0 8px 24px rgba(0,0,0,0.5)"
      : "0 8px 24px rgba(45,52,54,0.1)"
  }
}

// Cache last-seen preset so repeat opens don't flash the classic palette.
let cachedPreset: PresetName | null = null

export interface PanelPosition {
  left: number
  top: number
}
export interface PanelData {
  text: string
  rect: DOMRect
}

// ---- ErrorBoundary ----
export class PanelErrorBoundary extends React.Component<
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
    console.warn(
      "[lime] panel render error:",
      error.message,
      info.componentStack
    )
  }
  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

// ---- Inline SVG icons ----
const IconGrip = () => (
  <svg
    viewBox="0 0 24 24"
    style={{ display: "block", width: 14, height: 14, fill: "currentColor" }}>
    <path d="M7 5h2v2H7zm0 6h2v2H7zm0 6h2v2H7zm4-12h2v2h-2zm0 6h2v2h-2zm0 6h2v2h-2z" />
  </svg>
)

const IconPushPin = ({ rotated }: { rotated: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    style={{
      display: "block",
      width: 16,
      height: 16,
      transition: "transform 0.2s",
      fill: "currentColor",
      transform: rotated ? "rotate(45deg)" : "rotate(0deg)"
    }}>
    <path d="M14 4v5c0 1.12.37 2.16 1 3H9c.63-.84 1-1.88 1-3V4h4zm-3-2c-.55 0-1 .45-1 1v1h-1c-.55 0-1 .45-1 1s.45 1 1 1h6c.55 0 1-.45 1-1s-.45-1-1-1h-1V3c0-.55-.45-1-1-1h-2zm-4 4v1c0 1.5.5 2.8 1.3 3.7.5.6 1.1 1 1.7 1.3V15h-1c-.55 0-1 .45-1 1s.45 1 1 1h6c.55 0 1-.45 1-1s-.45-1-1-1h-1v-3c.6-.3 1.2-.7 1.7-1.3.8-.9 1.3-2.2 1.3-3.7V7H7z" />
  </svg>
)

const IconClose = () => (
  <svg
    viewBox="0 0 24 24"
    style={{ display: "block", width: 16, height: 16, fill: "currentColor" }}>
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
)

const IconPlus = () => (
  <svg
    viewBox="0 0 24 24"
    style={{ display: "block", width: 14, height: 14, fill: "currentColor" }}>
    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z" />
  </svg>
)

const IconSidebar = () => (
  <svg
    viewBox="0 0 24 24"
    style={{ display: "block", width: 16, height: 16, fill: "currentColor" }}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4V4z" />
  </svg>
)

const IconBack = () => (
  <svg
    viewBox="0 0 24 24"
    style={{ display: "block", width: 16, height: 16, fill: "currentColor" }}>
    <path d="M15.41 16.59 10.83 12l4.58-4.59L14 6l-6 6 6 6z" />
  </svg>
)

const PANEL_CSS = `
@keyframes limePanelIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
[data-lime-panel] { animation: limePanelIn 0.18s ease-out; }
[data-lime-panel] .lime-icon-btn:hover { background: var(--lime-bg-hover); color: var(--lime-primary); }
[data-lime-panel] .lime-input:focus { border-color: var(--lime-primary) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--lime-primary) 16%, transparent); }
[data-lime-panel] .lime-input::placeholder { color: var(--lime-text-secondary); }
`

function iconBtnStyle(colors: PanelColors): React.CSSProperties {
  return {
    border: "none",
    background: "none",
    cursor: "pointer",
    fontSize: 15,
    borderRadius: 8,
    padding: "4px 6px",
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: colors.textSecondary,
    transition: "all 0.15s"
  }
}

function inputStyle(colors: PanelColors): React.CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${colors.borderStrong}`,
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 13,
    color: colors.textPrimary,
    background: colors.bgPaper,
    outline: "none",
    fontFamily: "inherit"
  }
}

export function FloatingPanel({
  data,
  pinned,
  position,
  restorePosition,
  projects,
  selectedProjectId,
  title,
  setTitle,
  content,
  setContent,
  imageDraft,
  setImageDraft,
  onClose,
  onSaved,
  onPinChange,
  onPositionChange,
  onProjectsChange,
  onSelectedProjectChange,
  onDirtyChange,
  onOpenSidebar
}: {
  data: PanelData
  pinned: boolean
  position: PanelPosition
  restorePosition?: boolean
  projects: Project[]
  selectedProjectId: string
  title: string
  setTitle: (v: string) => void
  content: string
  setContent: React.Dispatch<React.SetStateAction<string>>
  imageDraft: string
  setImageDraft: (v: string) => void
  onClose: () => void
  onSaved: () => void
  onPinChange: (pinned: boolean) => void
  onPositionChange: (pos: PanelPosition) => void
  onProjectsChange: (projects: Project[]) => void
  onSelectedProjectChange: (id: string) => void
  onDirtyChange?: (isDirty: boolean) => void
  onOpenSidebar: () => void
}) {
  return (
    <PanelErrorBoundary>
      <FloatingPanelContent
        variant="float"
        data={data}
        pinned={pinned}
        position={position}
        restorePosition={restorePosition}
        projects={projects}
        selectedProjectId={selectedProjectId}
        title={title}
        setTitle={setTitle}
        content={content}
        setContent={setContent}
        imageDraft={imageDraft}
        setImageDraft={setImageDraft}
        onClose={onClose}
        onSaved={onSaved}
        onPinChange={onPinChange}
        onPositionChange={onPositionChange}
        onProjectsChange={onProjectsChange}
        onSelectedProjectChange={onSelectedProjectChange}
        onDirtyChange={onDirtyChange}
        onOpenSidebar={onOpenSidebar}
      />
    </PanelErrorBoundary>
  )
}

export function FloatingPanelContent({
  data,
  variant = "float",
  width = 360,
  onWidthChange,
  pinned,
  position,
  restorePosition,
  projects,
  selectedProjectId,
  title,
  setTitle,
  content,
  setContent,
  imageDraft,
  setImageDraft,
  onClose,
  onSaved,
  onPinChange,
  onPositionChange,
  onProjectsChange,
  onSelectedProjectChange,
  onDirtyChange,
  onOpenSidebar,
  onBackToPanel
}: {
  data: PanelData
  variant?: "float" | "sidebar"
  width?: number
  onWidthChange?: (w: number) => void
  pinned: boolean
  position: PanelPosition
  restorePosition?: boolean
  projects: Project[]
  selectedProjectId: string
  title: string
  setTitle: (v: string) => void
  content: string
  setContent: React.Dispatch<React.SetStateAction<string>>
  imageDraft: string
  setImageDraft: (v: string) => void
  onClose: () => void
  onSaved: () => void
  onPinChange: (pinned: boolean) => void
  onPositionChange: (pos: PanelPosition) => void
  onProjectsChange: (projects: Project[]) => void
  onSelectedProjectChange: (id: string) => void
  onDirtyChange?: (isDirty: boolean) => void
  onOpenSidebar?: () => void
  onBackToPanel?: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [error, setError] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  // ---- Theme: preset from storage + dark mode from prefers-color-scheme ----
  const [preset, setPreset] = useState<PresetName>(cachedPreset ?? "classic")
  const [dark, setDark] = useState<boolean>(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  )

  useEffect(() => {
    chrome.storage.sync.get("preset", (data) => {
      if (data.preset) {
        cachedPreset = data.preset as PresetName
        setPreset(data.preset as PresetName)
      }
    })
    const onChange = (changes: {
      [key: string]: chrome.storage.StorageChange
    }) => {
      if (changes.preset) {
        cachedPreset = changes.preset.newValue as PresetName
        setPreset(changes.preset.newValue as PresetName)
      }
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => setDark(mq.matches)
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  const colors = useMemo(() => buildColors(preset, dark), [preset, dark])

  // ---- Report whether the panel holds a draft (blocks auto-fill) ----
  useEffect(() => {
    onDirtyChange?.(Boolean(content.trim()))
  }, [content, onDirtyChange])

  // Sync content from new selection
  useEffect(() => {
    setSaving(false)
    setSaved(false)
    setError("")
  }, [data.text])

  // Load projects
  const load = useCallback(async () => {
    try {
      const list: Project[] =
        (await sendMessage({ kind: "list-projects" })) ?? []
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
  useEffect(() => {
    load()
  }, [load])

  // Resize clamp
  useEffect(() => {
    if (variant !== "float") return
    const onResize = () => {
      if (!ref.current || !ref.current.isConnected) return
      const r = ref.current.getBoundingClientRect()
      const maxL = window.innerWidth - 340,
        maxT = window.innerHeight - 60
      const l = Math.max(4, Math.min(r.left, maxL))
      const t = Math.max(4, Math.min(r.top, maxT))
      if (l !== r.left || t !== r.top) {
        ref.current.style.left = `${l}px`
        ref.current.style.top = `${t}px`
      }
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // Drag handle
  const dragRef = useRef<{ ox: number; oy: number } | null>(null)
  const handleRef = useRef<HTMLSpanElement | null>(null)
  const wasPinnedRef = useRef(false)
  const pd = useCallback(
    (e: React.PointerEvent) => {
      if (!ref.current || !handleRef.current) return
      if (!pinned) onPinChange(true)
      const r = ref.current.getBoundingClientRect()
      dragRef.current = { ox: e.clientX - r.left, oy: e.clientY - r.top }
      handleRef.current.style.cursor = "grabbing"
      e.preventDefault()
    },
    [pinned, onPinChange]
  )

  useEffect(() => {
    const el = ref.current
    if (!el || variant !== "float") return
    let dragging = false
    const mv = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      if (!dragging) {
        dragging = true
      }
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
    return () => {
      document.removeEventListener("pointermove", mv)
      document.removeEventListener("pointerup", up)
    }
  }, [onPositionChange])

  // Position: if pinned, restore persisted position; otherwise position near selection
  const restoredOnceRef = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el || variant !== "float") return
    if (pinned) {
      el.style.left = `${position.left}px`
      el.style.top = `${position.top}px`
      wasPinnedRef.current = true
      return
    }
    if (wasPinnedRef.current) {
      wasPinnedRef.current = false
      return
    }
    // Re-opening after a surface switch — keep the last position (once).
    if (restorePosition && !restoredOnceRef.current) {
      restoredOnceRef.current = true
      if (position.left > 0 || position.top > 0) {
        el.style.left = `${position.left}px`
        el.style.top = `${position.top}px`
        return
      }
    }
    const pw = 320,
      ph = el.offsetHeight || 340
    const vw = window.innerWidth,
      vh = window.innerHeight
    let l = data.rect.left,
      t = data.rect.bottom + 6
    if (t + ph > vh && data.rect.top > ph) t = data.rect.top - ph - 6
    if (l + pw > vw) l = vw - pw - 12
    if (l < 12) l = 12
    el.style.left = `${l}px`
    el.style.top = `${t}px`
    onPositionChange({ left: l, top: t })
  }, [data.rect, pinned, position, restorePosition, variant, onPositionChange])

  const save = useCallback(async () => {
    if (!content.trim()) return
    setSaving(true)
    setError("")
    try {
      const res = await sendMessage<{ ok: boolean; saved?: boolean }>({
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
      setTimeout(() => {
        setSaved(false)
        setSaving(false)
        setContent("")
        setTitle("")
        setImageDraft("")
      }, 1200)
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
      const res = await sendMessage<{
        ok: boolean
        id?: string
        error?: string
      }>({ kind: "add-project", name: newName.trim() })
      if (res?.ok) {
        setNewName("")
        setCreating(false)
        await load()
      } else {
        setError(res?.error ?? "项目名称已存在")
      }
    } catch (err) {
      console.warn("[lime] create project failed:", err)
      setError("创建失败")
    }
  }, [newName, load])

  const togglePin = useCallback(() => {
    onPinChange(!pinned)
  }, [onPinChange, pinned])

  const iconBtn = iconBtnStyle(colors)

  // Images live inside the content as Markdown tokens.
  const panelImages = extractMarkdownImages(content)
  const addImage = useCallback(
    (url: string) => {
      const trimmed = url.trim()
      if (!trimmed || panelImages.includes(trimmed)) return
      setContent((prev) => appendMarkdownImage(prev, trimmed))
    },
    [panelImages]
  )
  const removeImage = useCallback((url: string) => {
    setContent((prev) => removeMarkdownImage(prev, url))
  }, [])

  // Sidebar width drag (left edge of the right-fixed sidebar).
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null)
  const startSidebarResize = useCallback(
    (e: React.PointerEvent) => {
      if (variant !== "sidebar") return
      e.preventDefault()
      resizeRef.current = { startX: e.clientX, startW: width }
      const mv = (ev: PointerEvent) => {
        const d = resizeRef.current
        if (!d) return
        onWidthChange?.(
          Math.max(300, Math.min(520, d.startW - (ev.clientX - d.startX)))
        )
      }
      const up = () => {
        resizeRef.current = null
        document.removeEventListener("pointermove", mv)
        document.removeEventListener("pointerup", up)
      }
      document.addEventListener("pointermove", mv)
      document.addEventListener("pointerup", up)
    },
    [variant, width, onWidthChange]
  )

  return (
    <div
      ref={ref}
      data-lime-panel="true"
      style={{
        position: "fixed",
        zIndex: 2147483646,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        background: colors.bgPaper,
        borderRadius: variant === "float" ? 10 : 0,
        fontFamily: SANS_FONT,
        fontSize: 13,
        color: colors.textPrimary,
        boxSizing: "border-box",
        ...(variant === "float"
          ? { width: 320, boxShadow: colors.shadow }
          : {
              right: 0,
              top: 0,
              bottom: 0,
              width,
              boxShadow: "none",
              borderLeft: `1px solid ${colors.divider}`
            }),
        "--lime-primary": colors.primary,
        "--lime-bg-hover": colors.bgHover,
        "--lime-text-secondary": colors.textSecondary
      } as unknown as React.CSSProperties}>
      <style>{PANEL_CSS}</style>

      {/* Sidebar width handle (left edge) */}
      {variant === "sidebar" && (
        <span
          onPointerDown={startSidebarResize}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            cursor: "col-resize",
            zIndex: 1,
            touchAction: "none"
          }}
        />
      )}

      {/* Header: panel description + operations only */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          minHeight: 40,
          flexShrink: 0,
          borderBottom: `1px solid ${colors.divider}`
        }}>
        {variant === "float" && (
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
              color: colors.textSecondary
            }}>
            <IconGrip />
          </span>
        )}
        <span
          style={{
            fontWeight: 600,
            fontSize: 12,
            letterSpacing: "0.08em",
            color: colors.textPrimary,
            flexShrink: 0,
            textTransform: "uppercase"
          }}>
          lime · 摘录
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
          {variant === "float" ? (
            <>
              <button
                type="button"
                className="lime-icon-btn"
                style={iconBtn}
                onClick={onOpenSidebar}
                title="移入右侧栏">
                <IconSidebar />
              </button>
              <button
                type="button"
                className="lime-icon-btn"
                style={iconBtn}
                onClick={togglePin}
                title={pinned ? "取消固定" : "固定面板"}>
                <IconPushPin rotated={pinned} />
              </button>
            </>
          ) : (
            <button
              type="button"
              className="lime-icon-btn"
              style={iconBtn}
              onClick={onBackToPanel}
              title="回到浮动面板">
              <IconBack />
            </button>
          )}
          <button
            type="button"
            className="lime-icon-btn"
            style={iconBtn}
            onClick={onClose}
            title="关闭">
            <IconClose />
          </button>
        </span>
      </div>

      {/* Business row: project selection + create */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px",
          borderBottom: `1px solid ${colors.divider}`
        }}>
        <span
          style={{
            fontSize: 11,
            color: colors.textSecondary,
            flexShrink: 0,
            letterSpacing: "0.03em"
          }}>
          保存到
        </span>
        <span
          style={{
            position: "relative",
            flex: 1,
            minWidth: 0,
            display: "inline-flex",
            alignItems: "center"
          }}>
          <select
            className="lime-input"
            value={selectedProjectId}
            onChange={(e) => onSelectedProjectChange(e.target.value)}
            style={{
              ...inputStyle(colors),
              padding: "5px 24px 5px 8px",
              cursor: "pointer",
              fontWeight: 500,
              appearance: "none",
              WebkitAppearance: "none",
              textOverflow: "ellipsis",
              overflow: "hidden",
              whiteSpace: "nowrap"
            }}>
            {projects.length === 0 && (
              <option value="" disabled>
                加载中…
              </option>
            )}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              width: 0,
              height: 0,
              borderLeft: "4px solid transparent",
              borderRight: "4px solid transparent",
              borderTop: `5px solid ${colors.textSecondary}`,
              pointerEvents: "none"
            }}
          />
        </span>
        <button
          type="button"
          className="lime-icon-btn"
          style={iconBtn}
          onClick={() => setCreating(!creating)}
          title="新建项目">
          <IconPlus />
        </button>
      </div>

      {/* Create project */}
      {creating && (
        <div style={{ display: "flex", gap: 4, padding: "8px 12px 0" }}>
          <input
            className="lime-input"
            placeholder="项目名称…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createProject()}
            autoFocus
            style={inputStyle(colors)}
          />
          <button
            type="button"
            disabled={!newName.trim()}
            onClick={createProject}
            style={{
              border: "none",
              background: colors.primary,
              color: "#fff",
              borderRadius: 8,
              padding: "4px 10px",
              fontSize: 12,
              cursor: "pointer",
              opacity: !newName.trim() ? 0.5 : 1,
              flexShrink: 0
            }}>
            创建
          </button>
        </div>
      )}

      {/* Inputs */}
      <div style={{ padding: "8px 12px 4px" }}>
        <input
          className="lime-input"
          placeholder="摘要（可选）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ ...inputStyle(colors), fontWeight: 500, marginBottom: 8 }}
        />
        <textarea
          className="lime-input"
          placeholder="输入内容…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          style={{ ...inputStyle(colors), lineHeight: 1.7, resize: "vertical" }}
        />

        {/* Image URL input — plain DOM, no MUI (content-script bundle) */}
        <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
          <input
            className="lime-input"
            placeholder="图片 URL（可选，回车插入）"
            value={imageDraft}
            onChange={(e) => setImageDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                addImage(imageDraft)
                setImageDraft("")
              }
            }}
            style={{ ...inputStyle(colors), padding: "6px 10px", fontSize: 12 }}
          />
          <button
            type="button"
            disabled={!imageDraft.trim()}
            onClick={() => {
              addImage(imageDraft)
              setImageDraft("")
            }}
            style={{
              border: "none",
              borderRadius: 8,
              padding: "0 10px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              background: imageDraft.trim() ? colors.primary : colors.bgHover,
              color: imageDraft.trim() ? "#fff" : colors.textDisabled,
              flexShrink: 0
            }}>
            ＋
          </button>
        </div>
        {panelImages.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(48px, 1fr))",
              gap: 4,
              marginTop: 6
            }}>
            {panelImages.map((url) => (
              <div
                key={url}
                style={{
                  position: "relative",
                  borderRadius: 6,
                  overflow: "hidden",
                  aspectRatio: "1 / 1",
                  background: colors.bgHover
                }}>
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block"
                  }}
                />
                <button
                  type="button"
                  onClick={() => removeImage(url)}
                  style={{
                    position: "absolute",
                    top: 2,
                    right: 2,
                    border: "none",
                    background: "rgba(0,0,0,0.5)",
                    color: "#fff",
                    borderRadius: "50%",
                    width: 16,
                    height: 16,
                    fontSize: 10,
                    lineHeight: 1,
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px 10px",
          background: colors.bgDefault,
          borderTop: `1px solid ${colors.divider}`,
          marginTop: "auto"
        }}>
        {error && (
          <span
            style={{ fontSize: 11, color: colors.error, marginRight: "auto" }}>
            {error}
          </span>
        )}
        {!error && <span style={{ flex: 1 }} />}
        <button
          type="button"
          onClick={onClose}
          style={{
            borderRadius: 8,
            padding: "6px 16px",
            fontSize: 12,
            cursor: "pointer",
            fontWeight: 600,
            background: colors.bgPaper,
            color: colors.textSecondary,
            border: `1px solid ${colors.borderStrong}`
          }}>
          取消
        </button>
        <button
          type="button"
          disabled={saving || saved || !content.trim()}
          onClick={save}
          style={{
            borderRadius: 8,
            padding: "6px 16px",
            fontSize: 12,
            cursor: "pointer",
            fontWeight: 600,
            border: "none",
            color: "#fff",
            background: saved ? colors.success : colors.primary,
            opacity: saving || !content.trim() ? 0.5 : 1
          }}>
          {saving ? "保存中…" : saved ? "✓ 已保存" : "保存"}
        </button>
      </div>
    </div>
  )
}

export default FloatingPanel
