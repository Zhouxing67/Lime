import { computeItemHash, prettyUrl, sha256 } from "./index"

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
})
