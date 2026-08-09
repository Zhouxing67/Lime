import type { MarkdownTool } from "./markdownEditor"

/** The markdown toolbar structure — pure data (the icons live in the
 *  MarkdownToolbar component). Groups spread left/center/right in the toolbar. */
export const TOOL_GROUPS: { tools: MarkdownTool[] }[] = [
  { tools: ["bold", "italic", "heading"] },
  { tools: ["ulist", "olist", "quote"] },
  { tools: ["link", "image", "table", "formula", "code"] }
]

export const TOOL_LABELS: Record<MarkdownTool, string> = {
  bold: "加粗",
  italic: "斜体",
  heading: "标题",
  ulist: "无序列表",
  olist: "有序列表",
  quote: "引用",
  code: "代码",
  link: "链接",
  image: "图片",
  table: "表格",
  formula: "公式"
}
