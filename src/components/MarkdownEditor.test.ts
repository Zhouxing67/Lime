import { insertMarkdownSyntax } from "../utils/markdownEditor"

describe("insertMarkdownSyntax", () => {
  it("wraps the selection for bold / italic / formula", () => {
    const r = insertMarkdownSyntax("hello world", 6, 11, "bold")
    expect(r.text).toBe("hello **world**")
    expect(r.cursor).toBe(15)
  })

  it("prefixes the selection line for heading / lists / quote", () => {
    expect(insertMarkdownSyntax("hello", 0, 5, "ulist").text).toBe("- hello")
    expect(insertMarkdownSyntax("hello", 0, 5, "quote").text).toBe("> hello")
    expect(insertMarkdownSyntax("hello", 0, 5, "heading").text).toBe("## hello")
  })

  it("prefixes every non-empty line of a multiline selection", () => {
    const r = insertMarkdownSyntax("a\nb", 0, 3, "ulist")
    expect(r.text).toBe("- a\n- b")
  })

  it("wraps an empty selection as a placeholder with the cursor inside", () => {
    const r = insertMarkdownSyntax("hello", 5, 5, "bold")
    expect(r.text).toBe("hello****")
    expect(r.cursor).toBe(7)
  })

  it("inserts a table template at the cursor", () => {
    const r = insertMarkdownSyntax("ab", 1, 1, "table")
    expect(r.text).toContain("| 列1 | 列2 |")
  })
})
