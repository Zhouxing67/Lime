import type { PresetName } from "../types"

export interface PaletteColors {
  primary: { main: string; light: string; dark: string }
  secondary: { main: string; light: string; dark: string }
  error: { main: string; light: string }
}

export const palettes: Record<PresetName, PaletteColors> = {
  classic: {
    primary: { main: "#6b7785", light: "#8a96a3", dark: "#4a5563" },
    secondary: { main: "#9c8b7a", light: "#b5a598", dark: "#7d6f61" },
    error: { main: "#c9786e", light: "#d89a91" }
  },
  "indigo-crimson": {
    primary: { main: "#4f46e5", light: "#818cf8", dark: "#3730a3" },
    secondary: { main: "#ef4444", light: "#f87171", dark: "#b91c1c" },
    error: { main: "#dc2626", light: "#fca5a5" }
  },
  forest: {
    primary: { main: "#2d6a4f", light: "#52b788", dark: "#1b4332" },
    secondary: { main: "#52b788", light: "#74c69d", dark: "#2d6a4f" },
    error: { main: "#dc2626", light: "#fca5a5" }
  },
  terracotta: {
    primary: { main: "#c2410c", light: "#ea580c", dark: "#9a3412" },
    secondary: { main: "#a16207", light: "#ca8a04", dark: "#713f12" },
    error: { main: "#dc2626", light: "#fca5a5" }
  },
  navy: {
    primary: { main: "#3d5878", light: "#5a7698", dark: "#283e59" },
    secondary: { main: "#7a6b52", light: "#97897a", dark: "#5c4f39" },
    error: { main: "#c9786e", light: "#d89a91" }
  },
  purple: {
    primary: { main: "#6b5b8f", light: "#8b7ab0", dark: "#4c4068" },
    secondary: { main: "#a0685f", light: "#c0877e", dark: "#7c4b44" },
    error: { main: "#c9786e", light: "#d89a91" }
  }
}
