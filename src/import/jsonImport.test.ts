import JSZip from "jszip"

import {
  addPdf,
  createTextAnnotationCard,
  getAllReviews,
  getAnnotation,
  getItemsByPdf,
  getPdf,
  listProjects,
  searchItems
} from "../database"
import type { Item, PdfAnnotation, PdfFile, ReviewEntry } from "../types"
import { sha256Bytes } from "../utils"
import { toJsonZip } from "../utils/zip"
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

  it("round-trips a full-featured card + project + review through export→import (new fields survive)", async () => {
    const item = {
      id: "rt-1",
      type: "text",
      title: "标题",
      content: "正文",
      sectionId: "sec-1",
      images: ["https://img.example.com/a.png"],
      dueDate: "2026-08-05",
      order: 7,
      read: false,
      updatedAt: 1700000000000,
      source: {
        title: "P",
        url: "https://example.com/p",
        site: "example.com"
      },
      createdAt: 1690000000000,
      projectId: "p1",
      // A field not in the Item type today — must survive the round-trip
      // ("一次修改，一直有效"): export spreads, import spreads + validates.
      futureField: "survives"
    } as unknown as Item

    const project = {
      id: "p1",
      name: "RT 项目",
      createdAt: 1690000000000,
      lastOpened: 1695000000000,
      note: "备注"
    }

    const review: ReviewEntry = {
      id: "rv-rt",
      itemId: "rt-1",
      projectId: "p1",
      status: "active",
      dueDate: Date.now(),
      addedAt: Date.now(),
      srs: {
        dueDate: Date.now(),
        interval: 3,
        easeFactor: 2.3,
        reviewCount: 1,
        lastReviewDate: Date.now(),
        reviewHistory: [{ date: Date.now(), rating: 3 }]
      }
    }

    const blob = await toJsonZip([item], [project], [review])
    const file = new File([blob], "backup.zip", { type: "application/zip" })
    const result = await importFromZip(file, ["p1"])

    expect(result.errors).toHaveLength(0)
    expect(result.imported).toBe(1)

    const items = await searchItems({})
    const imported = items[0]
    expect(imported.title).toBe("标题")
    expect(imported.sectionId).toBe("sec-1")
    expect(imported.images).toEqual(["https://img.example.com/a.png"])
    expect(imported.dueDate).toBe("2026-08-05")
    expect(imported.order).toBe(7)
    expect(imported.read).toBe(false)
    expect((imported as unknown as Record<string, unknown>).futureField).toBe(
      "survives"
    )

    const projects = await listProjects()
    expect(projects[0].lastOpened).toBe(1695000000000)

    const reviews = await getAllReviews()
    expect(reviews).toHaveLength(1)
    expect(reviews[0].srs.interval).toBe(3)
  })
})

describe("pdf backup round-trip", () => {
  it("exports + imports PDFs, annotations and their cards", async () => {
    const bytes = new Blob(["pdf-bytes"], { type: "application/pdf" })
    const pdf: PdfFile = {
      id: "tmp",
      name: "paper.pdf",
      bytes,
      pageCount: 0,
      addedAt: 100
    }
    const pdfId = await addPdf(pdf)
    const { card, annotation } = await createTextAnnotationCard({
      pdfId,
      page: 1,
      type: "highlight",
      text: "备份测试",
      startOffset: 0,
      endOffset: 4
    })
    const blob = await toJsonZip([card], [], [], [{ ...pdf, id: pdfId }], [annotation])
    await importFromZip(blob as File)

    const restored = await getPdf(pdfId)
    expect(restored?.name).toBe("paper.pdf")
    expect(restored?.bytes).toBeTruthy()
    expect((await getAnnotation(annotation.id))?.text).toBe("备份测试")
    const cards = await getItemsByPdf(pdfId)
    expect(cards).toHaveLength(1)
    expect(cards[0].id).toBe(card.id)
  })
})

describe("import remap + source-less cards", () => {
  it("remaps legacy uuid pdf ids to the content-hash id (annotations + cards)", async () => {
    const uuid = "legacy-uuid-pdf"
    const bytes = new Blob(["legacy"], { type: "application/pdf" })
    const pdf: PdfFile = { id: uuid, name: "old.pdf", bytes, pageCount: 0, addedAt: 1 }
    const ann: PdfAnnotation = {
      id: "legacy-ann", pdfId: uuid, page: 1, kind: "text", type: "highlight",
      startOffset: 0, endOffset: 1, text: "x", createdAt: 1
    }
    // a card referencing the legacy uuid pdf id
    const card: Item = {
      id: "legacy-card", type: "text", content: "x", createdAt: 1, projectId: undefined,
      pdfRef: { pdfId: uuid, page: 1, annotationId: "legacy-ann" },
      pdfRefPdfId: uuid
    }
    const blob = await toJsonZip([card], [], [], [pdf], [ann])
    await importFromZip(blob as File)

    // the imported pdf got the content-hash id
    const actualId = await sha256Bytes(bytes)
    const restored = await getPdf(actualId)
    expect(restored?.name).toBe("old.pdf")
    expect(await getPdf(uuid)).toBeUndefined()
    // the annotation + card were remapped onto it
    expect((await getAnnotation("legacy-ann"))?.pdfId).toBe(actualId)
    const cards = await getItemsByPdf(actualId)
    expect(cards).toHaveLength(1)
    expect(cards[0].id).toBe("legacy-card")
  })

  it("imports a source-less 自建卡片", async () => {
    const card: Item = {
      id: "local-card", type: "text", title: "本地笔记", content: "正文",
      createdAt: 1, projectId: "p-import"
    }
    const project = { id: "p-import", name: "P", createdAt: 1, sections: [] }
    const blob = await toJsonZip([card], [project])
    const result = await importFromZip(blob as File)
    expect(result.imported).toBe(1)
    expect((await searchItems({})).some((i) => i.id === "local-card")).toBe(true)
  })
})
