import type { PdfMark } from "../types"

// Low-saturation annotation colors (align with the app's RATING_META family).
export const MARK_COLOR: Record<PdfMark, string> = {
  highlight: "rgba(183,149,91,0.26)",
  underline: "#6f9476",
  wavy: "#b2705a",
  strike: "rgba(45,52,54,0.45)",
  frame: "rgba(99,102,241,0.35)"
}

export const MARK_LABEL: Record<string, string> = {
  highlight: "高亮",
  underline: "下划线",
  wavy: "波浪线",
  strike: "删除线",
  frame: "框选"
}

/** Solid (non-translucent) accent used for the toolbar's mark indicators. */
export const MARK_DOT: Record<string, string> = {
  highlight: "rgba(183,149,91,0.6)",
  underline: "#6f9476",
  wavy: "#b2705a",
  strike: "rgba(45,52,54,0.5)",
  frame: "rgba(99,102,241,0.5)"
}
