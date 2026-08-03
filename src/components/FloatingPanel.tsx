import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react"

import type { PresetName, Project } from "../types"
import PanelForm from "./PanelForm"
import {
  IconBack,
  IconClose,
  IconGrip,
  IconPushPin,
  IconSidebar
} from "./panelIcons"
import type { PanelColors } from "./panelTheme"
import {
  PANEL_CSS,
  SANS_FONT,
  buildColors,
  cachedPreset,
  iconBtnStyle,
  rememberPreset
} from "./panelTheme"

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
  captureType,
  onClose,
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
  captureType: "text" | "image"
  onClose: () => void
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
        captureType={captureType}
        onClose={onClose}
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
  captureType,
  onClose,
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
  captureType: "text" | "image"
  onClose: () => void
  onPinChange: (pinned: boolean) => void
  onPositionChange: (pos: PanelPosition) => void
  onProjectsChange: (projects: Project[]) => void
  onSelectedProjectChange: (id: string) => void
  onDirtyChange?: (isDirty: boolean) => void
  onOpenSidebar?: () => void
  onBackToPanel?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  // ---- Theme: preset from storage + dark mode from prefers-color-scheme ----
  const [preset, setPreset] = useState<PresetName>(cachedPreset ?? "classic")
  const [dark, setDark] = useState<boolean>(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  )

  useEffect(() => {
    chrome.storage.sync.get("preset", (data) => {
      if (data.preset) {
        rememberPreset(data.preset as PresetName)
        setPreset(data.preset as PresetName)
      }
    })
    const onChange = (changes: {
      [key: string]: chrome.storage.StorageChange
    }) => {
      if (changes.preset) {
        rememberPreset(changes.preset.newValue as PresetName)
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

  // ---- Resize clamp ----
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
  }, [variant])

  // ---- Drag handle ----
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
  }, [onPositionChange, variant])

  // ---- Position: pinned → persisted; restore after a surface switch; else near selection ----
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

  const togglePin = useCallback(() => {
    onPinChange(!pinned)
  }, [onPinChange, pinned])

  // ---- Sidebar width drag (left edge of the right-fixed sidebar) ----
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

  const iconBtn = iconBtnStyle(colors)

  return (
    <div
      ref={ref}
      data-lime-panel="true"
      data-lime-sidebar={variant === "sidebar" ? "true" : undefined}
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
              height: "100vh",
              width,
              boxShadow: "-6px 0 20px rgba(0,0,0,0.06)",
              borderLeft: `2px solid ${colors.borderSidebar}`
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
          background: variant === "sidebar" ? colors.bgDefault : "transparent",
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

      <PanelForm
        colors={colors}
        dataText={data.text}
        title={title}
        setTitle={setTitle}
        content={content}
        setContent={setContent}
        imageDraft={imageDraft}
        setImageDraft={setImageDraft}
        captureType={captureType}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onProjectsChange={onProjectsChange}
        onSelectedProjectChange={onSelectedProjectChange}
        onClose={onClose}
      />
    </div>
  )
}

export default FloatingPanel
