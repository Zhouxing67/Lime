import {
  base64ToBytes,
  bytesToBase64,
  appendMarkdownImage,
  buildMergedContent,
  cloneItem,
  computeDropIndex,
  computeItemHash,
  createItem,
  currentSourceMeta,
  dueLabel,
  dueStatus,
  extractMarkdownImages,
  isTodoComplete,
  markdownCompletedCount,
  markdownTaskCount,
  markdownTasks,
  prettyUrl,
  removeMarkdownImage,
  sha256,
  toggleMarkdownTask
} from "./index"

describe("utils", () => {
  describe("sha256", () => {
    it("should generate consistent SHA-256 hash for the same input", async () => {
      const input = "test string"
      const hash1 = await sha256(input)
      const hash2 = await sha256(input)

      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(64) // SHA-256 produces 64 hex characters
    })

    it("should generate different hashes for different inputs", async () => {
      const hash1 = await sha256("input1")
      const hash2 = await sha256("input2")

      expect(hash1).not.toBe(hash2)
    })

    it("should handle empty strings", async () => {
      const hash = await sha256("")
      expect(hash).toHaveLength(64)
    })

    it("should handle Unicode characters", async () => {
      const hash = await sha256("你好世界 🌍")
      expect(hash).toHaveLength(64)
    })

    it("should produce the correct SHA-256 hash", async () => {
      // Known SHA-256 hash for "hello"
      const hash = await sha256("hello")
      expect(hash).toBe(
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
      )
    })
  })

  describe("computeItemHash", () => {
    it("should combine content and URL in hash", async () => {
      const content = "test content"
      const url = "https://example.com/page"

      const hash = await computeItemHash(content, url)

      expect(hash).toHaveLength(64)
      // Verify it's the same as hashing "url|content"
      const expectedHash = await sha256(`${url}|${content}`)
      expect(hash).toBe(expectedHash)
    })

    it("should generate different hashes for different URLs with same content", async () => {
      const content = "same content"
      const hash1 = await computeItemHash(content, "https://site1.com")
      const hash2 = await computeItemHash(content, "https://site2.com")

      expect(hash1).not.toBe(hash2)
    })

    it("should generate different hashes for same URL with different content", async () => {
      const url = "https://example.com"
      const hash1 = await computeItemHash("content1", url)
      const hash2 = await computeItemHash("content2", url)

      expect(hash1).not.toBe(hash2)
    })

    it("should ignore undefined images argument (backward compatible)", async () => {
      const content = "hello"
      const url = "https://example.com"
      const withoutImages = await computeItemHash(content, url)
      const withUndefined = await computeItemHash(content, url, undefined)

      expect(withUndefined).toBe(withoutImages)
    })

    it("should generate different hashes when images differ", async () => {
      const content = "same content"
      const url = "https://example.com"
      const hash1 = await computeItemHash(content, url, [
        "https://img.example.com/a.png"
      ])
      const hash2 = await computeItemHash(content, url, [
        "https://img.example.com/b.png"
      ])

      expect(hash1).not.toBe(hash2)
    })

    it("should treat empty images array same as no images", async () => {
      const content = "same content"
      const url = "https://example.com"
      const noImages = await computeItemHash(content, url)
      const emptyImages = await computeItemHash(content, url, [])

      expect(emptyImages).toBe(noImages)
    })
  })

  describe("prettyUrl", () => {
    it("should extract hostname from simple URL", () => {
      const result = prettyUrl("https://example.com")
      expect(result).toBe("example.com")
    })

    it("should include short path when present", () => {
      const result = prettyUrl("https://example.com/path")
      expect(result).toBe("example.com/path")
    })

    it("should exclude trailing slash", () => {
      const result = prettyUrl("https://example.com/")
      expect(result).toBe("example.com")
    })

    it("should truncate long paths with ellipsis", () => {
      const longPath =
        "/very/long/path/that/exceeds/the/limit/of/thirty-two/characters"
      const result = prettyUrl(`https://example.com${longPath}`)

      expect(result).toContain("example.com")
      expect(result).toContain("…")
      expect(result.length).toBeLessThan(50)
    })

    it("should handle exactly 32 character path without truncation", () => {
      const path32 = "/1234567890123456789012345678901" // 32 chars including /
      const result = prettyUrl(`https://example.com${path32}`)

      expect(result).toBe(`example.com${path32}`)
      expect(result).not.toContain("…")
    })

    it("should handle invalid URLs gracefully", () => {
      const invalid = "not a url"
      const result = prettyUrl(invalid)
      expect(result).toBe(invalid)
    })

    it("should handle URLs with query parameters", () => {
      const result = prettyUrl("https://example.com/page?foo=bar&baz=qux")
      expect(result).toContain("example.com")
      expect(result).toContain("/page")
    })

    it("should handle URLs with hash fragments", () => {
      const result = prettyUrl("https://example.com/page#section")
      expect(result).toContain("example.com")
      expect(result).toContain("/page")
    })

    it("should handle subdomains", () => {
      const result = prettyUrl("https://blog.example.com/post")
      expect(result).toBe("blog.example.com/post")
    })
  })

  describe("computeDropIndex", () => {
    const cards = [
      { id: "a", order: 0 },
      { id: "b", order: 1 },
      { id: "c", order: 2 },
      { id: "d", order: 3 }
    ]

    it("drops before the target", () => {
      expect(computeDropIndex(cards, "d", "b", "before")).toBe(1)
    })

    it("drops after the target", () => {
      expect(computeDropIndex(cards, "d", "b", "after")).toBe(2)
    })

    it("drops before the first card", () => {
      expect(computeDropIndex(cards, "c", "a", "before")).toBe(0)
    })

    it("drops after the last card", () => {
      expect(computeDropIndex(cards, "a", "d", "after")).toBe(3)
    })

    it("excludes the dragged card from the list", () => {
      // dragging b after d, with b removed: [a, c, d] -> d at index 2, after = 3
      expect(computeDropIndex(cards, "b", "d", "after")).toBe(3)
    })

    it("sorts cards by order before computing", () => {
      const unordered = [
        { id: "x", order: 5 },
        { id: "y", order: 1 },
        { id: "z", order: 3 }
      ]
      // sorted: y(1), z(3), x(5); drag x before z -> index 1
      expect(computeDropIndex(unordered, "x", "z", "before")).toBe(1)
    })
  })

  describe("markdown images", () => {
    it("extracts image URLs from content", () => {
      const content =
        "第一段\n\n![封面](https://a.com/1.png)\n\n第二段 ![b](https://a.com/2.png)"
      expect(extractMarkdownImages(content)).toEqual([
        "https://a.com/1.png",
        "https://a.com/2.png"
      ])
    })

    it("deduplicates repeated URLs", () => {
      expect(
        extractMarkdownImages("![a](https://x/1.png) ![b](https://x/1.png)")
      ).toEqual(["https://x/1.png"])
    })

    it("returns an empty list when there are no images", () => {
      expect(extractMarkdownImages("纯文本没有图片")).toEqual([])
    })

    it("skips malformed tokens", () => {
      expect(extractMarkdownImages("![no close] (https://x/1.png)")).toEqual([])
    })

    it("removes a specific image token", () => {
      const content = "文 ![a](https://x/1.png) ![b](https://x/2.png) 尾"
      expect(removeMarkdownImage(content, "https://x/1.png")).toBe(
        "文  ![b](https://x/2.png) 尾"
      )
    })

    it("appends an image token without duplicating", () => {
      const content = "正文"
      expect(appendMarkdownImage(content, "https://x/1.png")).toBe(
        "正文\n\n![图片](https://x/1.png)\n"
      )
      const twice = appendMarkdownImage(
        appendMarkdownImage(content, "https://x/1.png"),
        "https://x/1.png"
      )
      expect(extractMarkdownImages(twice)).toEqual(["https://x/1.png"])
    })
  })

  describe("markdown task lists", () => {
    const content = "- [ ] 任务A\n- [x] 任务B\n* [ ] 任务C\n普通行"

    it("parses task lines in document order", () => {
      expect(markdownTasks(content).map((t) => t.checked)).toEqual([
        false,
        true,
        false
      ])
      expect(markdownTaskCount(content)).toBe(3)
      expect(markdownCompletedCount(content)).toBe(1)
    })

    it("toggles a task by index", () => {
      const toggled = toggleMarkdownTask(content, 0)
      expect(toggled).toContain("- [x] 任务A")
      expect(toggled).toContain("- [x] 任务B")
      const reverted = toggleMarkdownTask(toggled, 0)
      expect(reverted).toContain("- [ ] 任务A")
    })

    it("ignores non-task lines when indexing", () => {
      expect(toggleMarkdownTask(content, 2)).toContain("* [x] 任务C")
    })

    it("is complete only when at least one task and all checked", () => {
      expect(isTodoComplete("- [x] a\n- [x] b")).toBe(true)
      expect(isTodoComplete("- [x] a\n- [ ] b")).toBe(false)
      expect(isTodoComplete("")).toBe(false)
      expect(isTodoComplete("纯文本")).toBe(false)
    })

    it("returns unchanged content for an out-of-range index", () => {
      expect(toggleMarkdownTask(content, 99)).toBe(content)
    })
  })

  describe("dueStatus", () => {
    const today = "2026-08-02"

    it("returns none for missing due date", () => {
      expect(dueStatus(undefined, today)).toBe("none")
    })

    it("flags a past day as overdue", () => {
      expect(dueStatus("2026-08-01", today)).toBe("overdue")
    })

    it("flags the same day as today", () => {
      expect(dueStatus("2026-08-02", today)).toBe("today")
    })

    it("flags the next day as tomorrow", () => {
      expect(dueStatus("2026-08-03", today)).toBe("tomorrow")
    })

    it("flags later days as future", () => {
      expect(dueStatus("2026-08-10", today)).toBe("future")
    })

    it("handles month/year boundaries", () => {
      expect(dueStatus("2026-08-03", "2026-08-31")).toBe("overdue")
      expect(dueStatus("2026-09-01", "2026-08-31")).toBe("tomorrow")
      expect(dueStatus("2027-01-01", "2026-12-31")).toBe("tomorrow")
    })
  })

  describe("dueLabel", () => {
    const today = "2026-08-02"

    it("renders human labels", () => {
      expect(dueLabel("2026-08-02", today)).toBe("今天")
      expect(dueLabel("2026-08-03", today)).toBe("明天")
      expect(dueLabel("2026-08-01", today)).toBe("已过期 1 天")
      expect(dueLabel("2026-07-30", today)).toBe("已过期 3 天")
      expect(dueLabel("2026-08-10", today)).toBe("8月10日")
      expect(dueLabel(undefined, today)).toBe("")
    })
  })

  describe("buildMergedContent", () => {
    const items = [
      { title: "标题A", content: "内容A" },
      { title: undefined, content: "内容B" }
    ]

    it("joins with a rule separator and keeps titles as headings", () => {
      expect(buildMergedContent(items, "rule")).toBe(
        "## 标题A\n内容A\n\n---\n\n内容B"
      )
    })

    it("joins with an ordered list", () => {
      expect(buildMergedContent(items, "ordered")).toBe(
        "1. **标题A**：内容A\n2. 内容B"
      )
    })

    it("joins with an unordered list", () => {
      expect(buildMergedContent(items, "unordered")).toBe(
        "- **标题A**：内容A\n- 内容B"
      )
    })

    it("joins with no separator", () => {
      expect(buildMergedContent(items, "none")).toBe(
        "## 标题A\n内容A\n\n内容B"
      )
    })
  })
})

describe("createItem / cloneItem / currentSourceMeta", () => {
  it("createItem builds a fresh item with optional fields, no order", () => {
    const item = createItem({
      type: "text",
      title: "t",
      content: "c",
      projectId: "p",
      sectionId: "s",
      images: ["a"],
      dueDate: "2026-08-05"
    })
    expect(item.id).toBeTruthy()
    expect(item.type).toBe("text")
    expect(item.sectionId).toBe("s")
    expect(item.images).toEqual(["a"])
    expect(item.dueDate).toBe("2026-08-05")
    // Order is intentionally left for the DB layer to auto-assign.
    expect(item.order).toBeUndefined()
  })

  it("createItem omits empty optional fields", () => {
    const item = createItem({ type: "image", content: "https://x/y.png" })
    expect(item.images).toBeUndefined()
    expect(item.sectionId).toBeUndefined()
    expect(item.dueDate).toBeUndefined()
  })

  it("cloneItem drops project-scoped sectionId/order and retargets the project", () => {
    const src = {
      ...createItem({ type: "text", content: "x", sectionId: "old-sec" }),
      order: 5
    }
    const clone = cloneItem(src, "target")
    expect(clone.projectId).toBe("target")
    expect(clone.id).not.toBe(src.id)
    expect(clone.sectionId).toBeUndefined()
    expect(clone.order).toBeUndefined()
    expect(clone.content).toBe("x")
  })

  it("currentSourceMeta reads the page metadata", () => {
    document.title = "Test Page"
    const meta = currentSourceMeta()
    expect(meta.title).toBe("Test Page")
    expect(meta.site).toBe(window.location.hostname)
  })
})

describe("base64 (chunked)", () => {
  it("round-trips binary data including multi-chunk payloads", () => {
    const bytes = new Uint8Array(100000)
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7 + 3) % 256
    const b64 = bytesToBase64(bytes)
    const back = base64ToBytes(b64)
    expect(back).toEqual(bytes)
  })

  it("handles empty input", () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe("")
    expect(base64ToBytes("")).toEqual(new Uint8Array(0))
  })
})
