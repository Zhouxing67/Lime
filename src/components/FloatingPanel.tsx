import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react"

import type { PresetName, Project } from "../types"
import PanelForm from "./PanelForm"
import { IconClose } from "./panelIcons"
import type { PanelColors } from "./panelTheme"
import {
  PANEL_CSS,
  SANS_FONT,
  buildColors,
  cachedPreset,
  iconBtnStyle,
  rememberPreset
} from "./panelTheme"

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

/** The right-docked capture sidebar (the sole capture surface — the floating
 *  panel was removed). Editorial style: paper body + hairline dividers + a
 *  quiet header, resizable width. */
export function FloatingPanelContent({
  data,
  width,
  onWidthChange,
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
  onProjectsChange,
  onSelectedProjectChange,
  onDirtyChange,
  onCaptureRegion
}: {
  data: PanelData
  width: number
  onWidthChange: (w: number) => void
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
  onProjectsChange: (projects: Project[]) => void
  onSelectedProjectChange: (id: string) => void
  onDirtyChange?: (isDirty: boolean) => void
  onCaptureRegion: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  // ---- Theme: preset from storage + dark mode from prefers-color-scheme ----
  const [preset, setPreset] = useState<PresetName>(cachedPreset ?? "indigo-crimson")
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

  // ---- Sidebar width drag (left edge) ----
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null)
  const startSidebarResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      resizeRef.current = { startX: e.clientX, startW: width }
      const mv = (ev: PointerEvent) => {
        const d = resizeRef.current
        if (!d) return
        onWidthChange(Math.max(300, Math.min(520, d.startW - (ev.clientX - d.startX))))
      }
      const up = () => {
        resizeRef.current = null
        document.removeEventListener("pointermove", mv)
        document.removeEventListener("pointerup", up)
      }
      document.addEventListener("pointermove", mv)
      document.addEventListener("pointerup", up)
    },
    [width, onWidthChange]
  )

  const iconBtn = iconBtnStyle(colors)

  return (
    <div
      ref={ref}
      data-lime-panel="true"
      data-lime-sidebar="true"
      style={{
        position: "fixed",
        right: 0,
        top: 0,
        zIndex: 2147483646,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width,
        boxSizing: "border-box",
        background: colors.bgPaper,
        fontFamily: SANS_FONT,
        fontSize: 13,
        color: colors.textPrimary,
        // Docked, not a floating card: a hairline left border + a faint edge
        // shadow only (was a heavy 2px border + a large drop shadow).
        borderLeft: `1px solid ${colors.divider}`,
        boxShadow: "-4px 0 12px rgba(45,52,54,0.04)",
        "--lime-primary": colors.primary,
        "--lime-bg-hover": colors.bgHover,
        "--lime-text-secondary": colors.textSecondary
      } as unknown as React.CSSProperties}>
      <style>{PANEL_CSS}</style>

      {/* Width handle (left edge) */}
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

      {/* Header: wordmark + close only (panel management — no business ops) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          minHeight: 44,
          flexShrink: 0,
          background: colors.bgDefault,
          borderBottom: `1px solid ${colors.divider}`
        }}>
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
        <button
          type="button"
          className="lime-icon-btn"
          style={iconBtn}
          onClick={onClose}
          title="关闭">
          <IconClose />
        </button>
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
        onDirtyChange={onDirtyChange}
        onCaptureRegion={onCaptureRegion}
        onClose={onClose}
      />
    </div>
  )
}
