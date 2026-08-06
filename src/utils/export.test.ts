import type { PdfCard, Project, ProjectCard } from "../types"
import { buildProjectMarkdown, buildScopeData } from "./export"

const proj: Project = {
  id: "p1",
  name: "项目",
  createdAt: 1000,
  sections: [
    { id: "l1", parentId: null, title: "一级", order: 0, level: 1 },
    { id: "l2", parentId: "l1", title: "二级", order: 0, level: 2 }
  ]
}

function card(over: Partial<ProjectCard>): ProjectCard {
  return {
    id: "c1",
    type: "text",
    content: "内容",
    projectId: "p1",
    createdAt: 1000,
    source: { title: "", url: "https://example.com/a" },
    ...over
  }
}

describe("buildScopeData + buildProjectMarkdown", () => {
  it("renders proportional heading levels across the project", () => {
    const cards: ProjectCard[] = [
      card({ id: "c-l2", sectionId: "l2", title: "二级卡", content: "A" }),
      card({ id: "c-l1", sectionId: "l1", title: "一级卡", content: "B" }),
      card({ id: "c-none", title: "无章节卡" })
    ]
    const data = buildScopeData(proj, cards, null)
    expect(data.rootTitle).toBe("项目")
    const { markdown } = buildProjectMarkdown(data)

    expect(markdown).toContain("# 项目")
    expect(markdown).toContain("## 一级")
    expect(markdown).toContain("### 二级")
    expect(markdown).toContain("#### 二级卡")
    expect(markdown).toContain("### 一级卡")
    expect(markdown).toContain("## 无章节卡")
  })

  it("renders a single L2 section with breadcrumb root", () => {
    const cards: ProjectCard[] = [
      card({ id: "c-l2", sectionId: "l2", title: "卡" })
    ]
    const data = buildScopeData(proj, cards, "l2")
    expect(data.rootTitle).toBe("项目 / 一级 / 二级")
    expect(data.groups).toHaveLength(0)
    const { markdown } = buildProjectMarkdown(data)
    expect(markdown).toContain("# 项目 / 一级 / 二级")
    expect(markdown).toContain("## 卡")
  })

  it("renders a single L1 section with its L2 children", () => {
    const cards: ProjectCard[] = [
      card({ id: "c-l1", sectionId: "l1", title: "一级卡" }),
      card({ id: "c-l2", sectionId: "l2", title: "二级卡" })
    ]
    const data = buildScopeData(proj, cards, "l1")
    expect(data.rootTitle).toBe("项目 / 一级")
    const { markdown } = buildProjectMarkdown(data)
    expect(markdown).toContain("## 二级")
    expect(markdown).toContain("## 一级卡")
    expect(markdown).toContain("### 二级卡")
  })

  it("turns content headings into bold but not fenced-code `#` lines", () => {
    const cards: ProjectCard[] = [
      card({
        title: "卡",
        content: "# 大标题\n\n## 小标题\n\n```\n# not a heading\n```\n\n正文"
      })
    ]
    const { markdown } = buildProjectMarkdown(buildScopeData(proj, cards, null))
    expect(markdown).toContain("**大标题**")
    expect(markdown).toContain("**小标题**")
    expect(markdown).toContain("# not a heading")
    expect(markdown).not.toContain("## 大标题")
  })

  it("embeds URL images and skips data-URL images with a count", () => {
    const cards: ProjectCard[] = [
      card({
        type: "image",
        content: "https://img.example.com/a.png",
        title: "图"
      }),
      card({
        type: "image",
        content: "data:image/png;base64,AAAA",
        title: "内嵌"
      })
    ]
    const { markdown, skippedImages } = buildProjectMarkdown(
      buildScopeData(proj, cards, null)
    )
    expect(markdown).toContain("![图片](https://img.example.com/a.png)")
    expect(markdown).not.toContain("data:image")
    expect(skippedImages).toBe(1)
  })

  it("includes a source footer and separates cards as new paragraphs", () => {
    const cards: ProjectCard[] = [
      card({
        title: "卡",
        content: "正文",
        source: { title: "来源页", url: "https://x.com/y" }
      })
    ]
    const { markdown } = buildProjectMarkdown(buildScopeData(proj, cards, null))
    expect(markdown).toContain("> 来源：[来源页](https://x.com/y)")
    expect(markdown).not.toContain("---")
  })

  it("appends legacy card.images that are not already in content", () => {
    const cards: ProjectCard[] = [
      card({
        title: "卡",
        content: "![已有](https://img.example.com/in.png) 正文",
        images: [
          "https://img.example.com/in.png",
          "https://img.example.com/old.png"
        ]
      })
    ]
    const { markdown, skippedImages } = buildProjectMarkdown(
      buildScopeData(proj, cards, null)
    )
    expect(markdown).toContain("![图片](https://img.example.com/old.png)")
    expect(markdown).not.toContain("![图片](https://img.example.com/in.png)")
    expect(skippedImages).toBe(0)
  })

  it("resolves a placed card's quote from its linked pdfCard", () => {
    const pdfCard: PdfCard = {
      id: "pc-1",
      pdfId: "pdf-1",
      page: 3,
      kind: "text",
      type: "highlight",
      annotationId: "a-1",
      content: "原文摘录",
      pdfOrder: 3000000,
      createdAt: 1000
    }
    const cards: ProjectCard[] = [
      card({ id: "placed", title: "放置卡", content: "", pdfCardId: "pc-1" })
    ]
    const { markdown, skippedImages } = buildProjectMarkdown(
      buildScopeData(proj, cards, null, [pdfCard])
    )
    expect(markdown).toContain("## 放置卡")
    expect(markdown).toContain("原文摘录")
    expect(skippedImages).toBe(0)
  })

  it("falls back to the whole project for a stale section id", () => {
    const cards: ProjectCard[] = [
      card({ id: "c-l1", sectionId: "l1", title: "一级卡" })
    ]
    const data = buildScopeData(proj, cards, "deleted-section")
    expect(data.rootTitle).toBe("项目")
    const { markdown } = buildProjectMarkdown(data)
    expect(markdown).toContain("## 一级")
    expect(markdown).toContain("### 一级卡")
  })
})
