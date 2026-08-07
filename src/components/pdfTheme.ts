import type { PdfMark } from "../types"

// Low-saturation annotation colors (align with the app's RATING_META family).
export const MARK_COLOR: Record<PdfMark, string> = {
  highlight: "rgba(183,149,91,0.26)",
  underline: "#6f9476",
  wavy: "#b2705a",
  strike: "rgba(45,52,54,0.45)",
  frame: "rgba(99,102,241,0.35)",
  "free-highlight": "rgba(183,149,91,0.22)",
  freehand: "rgba(99,102,241,0.55)",
  freetext: "rgba(45,52,54,0.4)"
}

export const MARK_LABEL: Record<string, string> = {
  highlight: "高亮",
  underline: "下划线",
  wavy: "波浪线",
  strike: "删除线",
  frame: "框选",
  "free-highlight": "自由高亮",
  freehand: "自由画笔",
  freetext: "文本框"
}

/** Solid (non-translucent) accent used for the toolbar's mark indicators. */
export const MARK_DOT: Record<string, string> = {
  highlight: "rgba(183,149,91,0.6)",
  underline: "#6f9476",
  wavy: "#b2705a",
  strike: "rgba(45,52,54,0.5)",
  frame: "rgba(99,102,241,0.5)",
  "free-highlight": "rgba(183,149,91,0.55)",
  freehand: "rgba(99,102,241,0.6)",
  freetext: "rgba(45,52,54,0.55)"
}

/** Solid block for the card's order chip — a readable bg + fg pair per mark
 *  (the rectangle wraps the "#N" text instead of a separate dot/bar). */
export const MARK_BLOCK: Record<string, { bg: string; fg: string }> = {
  highlight: { bg: "rgba(183,149,91,0.55)", fg: "rgba(0,0,0,0.78)" },
  underline: { bg: "#6f9476", fg: "#fff" },
  wavy: { bg: "#b2705a", fg: "#fff" },
  strike: { bg: "rgba(45,52,54,0.62)", fg: "#fff" },
  frame: { bg: "rgba(99,102,241,0.6)", fg: "#fff" },
  "free-highlight": { bg: "rgba(183,149,91,0.55)", fg: "rgba(0,0,0,0.78)" },
  freehand: { bg: "rgba(99,102,241,0.6)", fg: "#fff" },
  freetext: { bg: "rgba(45,52,54,0.62)", fg: "#fff" }
}
