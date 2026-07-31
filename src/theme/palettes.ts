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
  }
}
