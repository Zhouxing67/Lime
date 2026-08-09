export type MarkdownTool =
  | "bold"
  | "italic"
  | "heading"
  | "ulist"
  | "olist"
  | "quote"
  | "code"
  | "link"
  | "image"
  | "table"
  | "formula"

/** Insert markdown syntax around/at the selection. Pure + unit-testable. */
export function insertMarkdownSyntax(
  text: string,
  selStart: number,
  selEnd: number,
  tool: MarkdownTool
): { text: string; cursor: number } {
  const head = text.slice(0, selStart)
  const tail = text.slice(selEnd)
  const sel = text.slice(selStart, selEnd)
  const prefixLines = (prefix: string) =>
    head +
    sel
      .split("\n")
      .map((l) => (l.length ? `${prefix}${l}` : l))
      .join("\n") +
    tail

  const wrap = (open: string, close: string, cursorShift: number) =>
    !sel
      ? { text: `${head}${open}${close}${tail}`, cursor: selStart + open.length }
      : { text: `${head}${open}${sel}${close}${tail}`, cursor: selEnd + cursorShift }

  switch (tool) {
    case "bold":
      return wrap("**", "**", 4)
    case "italic":
      return wrap("*", "*", 2)
    case "formula":
      return wrap("$", "$", 2)
    case "code":
      return wrap("`", "`", 2)
    case "link":
      return wrap("[", "](url)", 5)
    case "image":
      return wrap("![", "](url)", 5)
    case "heading":
      return { text: prefixLines("## "), cursor: selEnd + 3 }
    case "ulist":
      return { text: prefixLines("- "), cursor: selEnd + 2 }
    case "olist":
      return { text: prefixLines("1. "), cursor: selEnd + 3 }
    case "quote":
      return { text: prefixLines("> "), cursor: selEnd + 2 }
    case "table": {
      const table = "\n| 列1 | 列2 |\n| --- | --- |\n| 内容 | 内容 |\n"
      return { text: head + table + tail, cursor: selStart + table.length - 1 }
    }
  }
}
