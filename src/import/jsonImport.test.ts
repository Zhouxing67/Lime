import JSZip from "jszip"

import { getAllReviews, listProjects, searchItems } from "../database"
import { importFromZip } from "./jsonImport"

async function packZip(payload: unknown): Promise<File> {
  const zip = new JSZip()
  zip.file("export.json", JSON.stringify(payload, null, 2))
  const blob = await zip.generateAsync({ type: "blob" })
  return new File([blob], "test.zip", { type: "application/zip" })
}

describe("jsonImport", () => {
  beforeEach(() => {
    indexedDB = new IDBFactory()
  })

  it("preserves title, read, order, updatedAt, and images on import", async () => {
    const item = {
      id: "preserve-id",
      type: "text" as const,
      title: "我的摘要",
      content: "正文内容",
      read: true,
      order: 2,
      updatedAt: 1700000000000,
      images: [
        "https://img.example.com/a.png",
        "https://img.example.com/b.png"
      ],
      source: {
        title: "Page",
        url: "https://example.com/p",
        site: "example.com"
      },
      createdAt: 1690000000000,
      projectId: "p1"
    }
    const data = {
      items: [item],
      projects: [
        {
          id: "p1",
          name: "导入项目",
          createdAt: 1690000000000,
          lastOpened: 1695000000000
        }
      ]
    }
    const file = await packZip(data)

    // projects will be auto-created on import; we don't pass projectIds
    // so the item lands with projectId="" and is skipped per existing logic.
    // To actually land the item, pass the project's id explicitly.
    const result = await importFromZip(file, ["p1"])

    expect(result.errors).toHaveLength(0)
    expect(result.imported).toBe(1)

    const items = await searchItems({})
    expect(items).toHaveLength(1)
    const imported = items[0]
    expect(imported.title).toBe("我的摘要")
    expect(imported.read).toBe(true)
    expect(imported.order).toBe(2)
    expect(imported.updatedAt).toBe(1700000000000)
    expect(imported.images).toEqual([
      "https://img.example.com/a.png",
      "https://img.example.com/b.png"
    ])

    const projects = await listProjects()
    expect(projects).toHaveLength(1)
    expect(projects[0].lastOpened).toBe(1695000000000)
  })

  it("preserves project.sections and item.sectionId on import", async () => {
    const sections = [
      {
        id: "s1",
        parentId: null,
        title: "第一章",
        order: 0,
        level: 1 as const
      },
      {
        id: "s2",
        parentId: "s1",
        title: "1.1 小节",
        order: 0,
        level: 2 as const
      },
      { id: "s3", parentId: null, title: "第二章", order: 1, level: 1 as const }
    ]
    const item = {
      id: "sec-item",
      type: "text" as const,
      title: "带章节的卡",
      content: "内容",
      sectionId: "s2",
      order: 0,
      source: { title: "P", url: "https://example.com/x", site: "example.com" },
      createdAt: 1690000000000,
      projectId: "p2"
    }
    const data = {
      items: [item],
      projects: [
        { id: "p2", name: "章节项目", createdAt: 1690000000000, sections }
      ]
    }
    const file = await packZip(data)

    const result = await importFromZip(file, ["p2"])
    expect(result.errors).toHaveLength(0)
    expect(result.imported).toBe(1)

    const items = await searchItems({})
    expect(items).toHaveLength(1)
    expect(items[0].sectionId).toBe("s2")

    const projects = await listProjects()
    expect(projects).toHaveLength(1)
    expect(projects[0].sections).toBeDefined()
    expect(projects[0].sections?.map((s) => s.id).sort()).toEqual([
      "s1",
      "s2",
      "s3"
    ])
    const s2 = projects[0].sections?.find((s) => s.id === "s2")
    expect(s2?.parentId).toBe("s1")
    expect(s2?.level).toBe(2)
  })

  it("imports reviews for valid items and drops orphans (A2)", async () => {
    const item = {
      id: "rv-item",
      type: "text" as const,
      title: "标题",
      content: "正文",
      source: { url: "https://example.com/x" },
      createdAt: 1690000000000,
      projectId: "p1"
    }
    const data = {
      items: [item],
      projects: [{ id: "p1", name: "项目", createdAt: 1690000000000 }],
      reviews: [
        {
          id: "rv1",
          itemId: "rv-item",
          projectId: "p1",
          status: "active",
          dueDate: 1700000000000,
          addedAt: 1690000000000,
          srs: {
            dueDate: 1700000000000,
            interval: 3,
            easeFactor: 2.5,
            reviewCount: 1,
            lastReviewDate: 1690000000000,
            reviewHistory: [{ date: 1690000000000, rating: 3 }]
          }
        },
        {
          id: "rv-orphan",
          itemId: "no-such-item",
          projectId: "p1",
          status: "active",
          dueDate: 1700000000000,
          addedAt: 1690000000000,
          srs: {
            dueDate: 1700000000000,
            interval: 1,
            easeFactor: 2.5,
            reviewCount: 1,
            lastReviewDate: 1690000000000
          }
        }
      ]
    }
    const file = await packZip(data)
    const result = await importFromZip(file, ["p1"])

    expect(result.errors).toHaveLength(0)
    const reviews = await getAllReviews()
    expect(reviews).toHaveLength(1)
    expect(reviews[0].itemId).toBe("rv-item")
    expect(reviews[0].srs.interval).toBe(3)
  })
})
