import { createTheme, type PaletteMode } from "@mui/material/styles"

import { palettes } from "./palettes"
import type { PresetName } from "../types"

const SANS_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Helvetica Neue', Arial, sans-serif"

const SERIF_FONT =
  "'Times New Roman', 'LXGW WenKai', 'Noto Serif SC', 'Songti SC', 'STSong', Georgia, serif"

declare module "@mui/material/styles" {
  interface Theme {
    custom: {
      serif: string
      sans: string
      surface2: string
      borderStrong: string
      cardShadow: string
      cardShadowHover: string
      focusRing: string
      avatarPalette: string[]
    }
  }
  interface ThemeOptions {
    custom?: {
      serif?: string
      sans?: string
      surface2?: string
      borderStrong?: string
      cardShadow?: string
      cardShadowHover?: string
      focusRing?: string
      avatarPalette?: string[]
    }
  }
}

export { palettes } from "./palettes"

export const createAppTheme = (
  mode: PaletteMode,
  preset: PresetName = "indigo-crimson"
) => {
  const p = palettes[preset]
  const isLight = mode === "light"

  return createTheme({
    custom: {
      serif: SERIF_FONT,
      sans: SANS_FONT,
      surface2: isLight ? "#f7f5f1" : "#202020",
      borderStrong: isLight
        ? "rgba(45, 52, 54, 0.14)"
        : "rgba(232, 230, 227, 0.2)",
      cardShadow: isLight
        ? "0 1px 2px rgba(45, 52, 54, 0.04), 0 2px 6px rgba(45, 52, 54, 0.05)"
        : "0 1px 2px rgba(0, 0, 0, 0.4)",
      cardShadowHover: isLight
        ? "0 2px 4px rgba(45, 52, 54, 0.06), 0 8px 20px rgba(45, 52, 54, 0.1)"
        : "0 2px 6px rgba(0, 0, 0, 0.45), 0 10px 24px rgba(0, 0, 0, 0.5)",
      focusRing: `0 0 0 2px ${p.primary.main}`,
      avatarPalette: isLight
        ? ["#5b7f9e", "#7a8f5f", "#9a6b5f", "#7a6b9e", "#5f8f8f", "#8f7a5f", "#5f7a9e", "#9e6b7a"]
        : ["#6f93b5", "#8fa876", "#b18474", "#9182b5", "#76a6a6", "#a69174", "#7691b5", "#b58291"]
    },
    palette: {
      mode,
      background:
        mode === "light"
          ? { default: "#faf9f7", paper: "#ffffff" }
          : { default: "#1a1a1a", paper: "#252525" },
      primary: p.primary,
      secondary: p.secondary,
      text:
        mode === "light"
          ? {
              primary: "#2d3436",
              secondary: "rgba(45, 52, 54, 0.65)",
              disabled: "rgba(45, 52, 54, 0.38)"
            }
          : {
              primary: "#e8e6e3",
              secondary: "rgba(232, 230, 227, 0.65)",
              disabled: "rgba(232, 230, 227, 0.38)"
            },
      divider:
        mode === "light"
          ? "rgba(45, 52, 54, 0.08)"
          : "rgba(232, 230, 227, 0.12)",
      error: p.error
    },
    shape: { borderRadius: 8 },
    typography: {
      fontFamily: SANS_FONT,
      h4: { fontWeight: 600, letterSpacing: "0.01em", fontFamily: SERIF_FONT },
      h5: { fontWeight: 600, letterSpacing: "0.01em", fontFamily: SERIF_FONT },
      h6: { fontWeight: 600, letterSpacing: "0.01em", fontFamily: SERIF_FONT },
      body1: { lineHeight: 1.7, letterSpacing: "0.005em" },
      body2: { lineHeight: 1.6, letterSpacing: "0.005em" },
      caption: { letterSpacing: "0.02em" }
    },
    shadows:
      mode === "light"
        ? [
            "none",
            "0 1px 3px rgba(45, 52, 54, 0.04)",
            "0 2px 6px rgba(45, 52, 54, 0.06)",
            "0 3px 12px rgba(45, 52, 54, 0.08)",
            "0 4px 16px rgba(45, 52, 54, 0.1)",
            "0 6px 20px rgba(45, 52, 54, 0.12)",
            "0 8px 24px rgba(45, 52, 54, 0.14)",
            "0 12px 28px rgba(45, 52, 54, 0.16)",
            "0 16px 32px rgba(45, 52, 54, 0.18)",
            "0 20px 36px rgba(45, 52, 54, 0.2)",
            "0 24px 40px rgba(45, 52, 54, 0.22)",
            "0 28px 44px rgba(45, 52, 54, 0.24)",
            "0 32px 48px rgba(45, 52, 54, 0.26)",
            "0 36px 52px rgba(45, 52, 54, 0.28)",
            "0 40px 56px rgba(45, 52, 54, 0.3)",
            "0 44px 60px rgba(45, 52, 54, 0.32)",
            "0 48px 64px rgba(45, 52, 54, 0.34)",
            "0 52px 68px rgba(45, 52, 54, 0.36)",
            "0 56px 72px rgba(45, 52, 54, 0.38)",
            "0 60px 76px rgba(45, 52, 54, 0.4)",
            "0 64px 80px rgba(45, 52, 54, 0.42)",
            "0 68px 84px rgba(45, 52, 54, 0.44)",
            "0 72px 88px rgba(45, 52, 54, 0.46)",
            "0 76px 92px rgba(45, 52, 54, 0.48)",
            "0 80px 96px rgba(45, 52, 54, 0.5)"
          ]
        : [
            "none",
            "0 1px 3px rgba(0, 0, 0, 0.3)",
            "0 2px 6px rgba(0, 0, 0, 0.35)",
            "0 3px 12px rgba(0, 0, 0, 0.4)",
            "0 4px 16px rgba(0, 0, 0, 0.45)",
            "0 6px 20px rgba(0, 0, 0, 0.5)",
            "0 8px 24px rgba(0, 0, 0, 0.55)",
            "0 12px 28px rgba(0, 0, 0, 0.6)",
            "0 16px 32px rgba(0, 0, 0, 0.65)",
            "0 20px 36px rgba(0, 0, 0, 0.7)",
            "0 24px 40px rgba(0, 0, 0, 0.75)",
            "0 28px 44px rgba(0, 0, 0, 0.8)",
            "0 32px 48px rgba(0, 0, 0, 0.85)",
            "0 36px 52px rgba(0, 0, 0, 0.9)",
            "0 40px 56px rgba(0, 0, 0, 0.95)",
            "0 44px 60px rgba(0, 0, 0, 1)",
            "0 48px 64px rgba(0, 0, 0, 1)",
            "0 52px 68px rgba(0, 0, 0, 1)",
            "0 56px 72px rgba(0, 0, 0, 1)",
            "0 60px 76px rgba(0, 0, 0, 1)",
            "0 64px 80px rgba(0, 0, 0, 1)",
            "0 68px 84px rgba(0, 0, 0, 1)",
            "0 72px 88px rgba(0, 0, 0, 1)",
            "0 76px 92px rgba(0, 0, 0, 1)",
            "0 80px 96px rgba(0, 0, 0, 1)"
          ],
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: "none",
            fontWeight: 400,
            letterSpacing: "0.03em"
          },
          outlined:
            mode === "light"
              ? {
                  borderColor: "rgba(45, 52, 54, 0.15)",
                  "&:hover": {
                    borderColor: "rgba(45, 52, 54, 0.3)",
                    backgroundColor: "rgba(45, 52, 54, 0.02)"
                  }
                }
              : {
                  borderColor: "rgba(232, 230, 227, 0.2)",
                  "&:hover": {
                    borderColor: "rgba(232, 230, 227, 0.4)",
                    backgroundColor: "rgba(232, 230, 227, 0.08)"
                  }
                }
        }
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: "none" },
          outlined: {
            borderColor:
              mode === "light"
                ? "rgba(45, 52, 54, 0.08)"
                : "rgba(232, 230, 227, 0.12)"
          }
        }
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            transition: "all 0.2s",
            "&:hover": {
              backgroundColor:
                mode === "light"
                  ? "rgba(45, 52, 54, 0.04)"
                  : "rgba(232, 230, 227, 0.08)"
            }
          }
        }
      },
      MuiChip: {
        styleOverrides: {
          root: {
            transition: "all 0.2s"
          }
        }
      }
    }
  })
}
