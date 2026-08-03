import React from "react"

import { palettes } from "../theme/palettes"
import type { PresetName } from "../types"

export const SANS_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Helvetica Neue', Arial, sans-serif"

export interface PanelColors {
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
  borderSidebar: string
  shadow: string
}

export function buildColors(preset: PresetName, dark: boolean): PanelColors {
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
    borderSidebar: dark ? "rgba(232,230,227,0.4)" : "rgba(45,52,54,0.3)",
    shadow: dark
      ? "0 8px 24px rgba(0,0,0,0.5)"
      : "0 8px 24px rgba(45,52,54,0.1)"
  }
}

// Cache last-seen preset so repeat opens don't flash the classic palette.
export let cachedPreset: PresetName | null = null
export function rememberPreset(preset: PresetName) {
  cachedPreset = preset
}

export const PANEL_CSS = `
@keyframes limePanelIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes limeSidebarIn { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: none; } }
[data-lime-panel]:not([data-lime-sidebar]) { animation: limePanelIn 0.18s ease-out; }
[data-lime-sidebar] { animation: limeSidebarIn 0.22s cubic-bezier(0.2, 0.8, 0.2, 1); }
[data-lime-panel] .lime-icon-btn:hover { background: var(--lime-bg-hover); color: var(--lime-primary); }
[data-lime-panel] .lime-input:focus { border-color: var(--lime-primary) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--lime-primary) 16%, transparent); }
[data-lime-panel] .lime-input::placeholder { color: var(--lime-text-secondary); }
`

export function iconBtnStyle(colors: PanelColors): React.CSSProperties {
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

export function inputStyle(colors: PanelColors): React.CSSProperties {
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
