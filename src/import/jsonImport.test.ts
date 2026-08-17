import JSZip from "jszip"

import {
  addPdf,
  createTextAnnotationCard,
  getAllProjectCards,
  getAllReadLater,
  getAllReviews,
  getAllTodos,
  getAnnotation,
  getPdf,
  getPdfCards,
  listProjects,
  searchProjectCards
} from "../database"
import type {
  PdfAnnotation,
  PdfFile,
  ProjectCard,
  ReadLater,
  ReviewEntry,
  TodoCard
} from "../types"
import { createReadLater, sha256Bytes } from "../utils"
import { toJsonZip } from "../utils/zip"
import { importFromZip, parseExport } from "./jsonImport"

async function packZip(payload: unknown): Promise<File> {
  const zip = new JSZip()
  zip.file("export.json", JSON.stringify(payload, null, 2))
  const blob = await zip.generateAsync({ type: "blob" })
  return new File([blob], "test.zip", { type: "application/zip" })
}

async function packZipWithPdfs(
  payload: unknown,
  pdfs: Record<string, Blob>
): Promise<File> {
  const zip = new JSZip()
  zip.file("export.json", JSON.stringify(payload, null, 2))
  for (const [id, bytes] of Object.entries(pdfs)) {
    zip.file(`pdfs/${id}.pdf`, bytes)
  }
  const blob = await zip.generateAsync({ type: "blob" })
  return new File([blob], "test.zip", { type: "application/zip" })
}

describe("jsonImport (v5 format)", () => {
  beforeEach(() => {
    indexedDB = new IDBFactory()
  })

  it("rejects a v6 sync payload with a 'use sync' message instead of importing it (R2)", async () => {
    const res = parseExport(
      JSON.stringify({
        version: 6,
        deviceInfo: { name: "x" },
        contentHash: "abc",
        projectCards: [],
        pdfCards: [],
        todos: [],
        projects: [],
        reviews: [],
        pdfs: [],
        pdfAnnotations: [],
        images: { "card-1": "sha123" }
      })
    )
    expect("error" in res).toBe(true)
    expect("error" in res && res.error).toContain("同步")
  })

  it("preserves title, order, updatedAt, and images on import", async () => {
    const card = {
      id: "preserve-id",
      type: "text" as const,
      title: "我的摘要",
      content: "正文内容",
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
      version: 5,
      projectCards: [card],
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

    // projects will be auto-created on import; we pass projectIds so the card
    // lands in the imported project.
    const result = await importFromZip(file, ["p1"])

    expect(result.errors).toHaveLength(0)
    expect(result.imported).toBe(1)

    const cards = await searchProjectCards({})
    expect(cards).toHaveLength(1)
    const imported = cards[0]
    expect(imported.title).toBe("我的摘要")
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

  it("preserves project.sections and card.sectionId on import", async () => {
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
    const card = {
      id: "sec-card",
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
      version: 5,
      projectCards: [card],
      projects: [
        { id: "p2", name: "章节项目", createdAt: 1690000000000, sections }
      ]
    }
    const file = await packZip(data)

    const result = await importFromZip(file, ["p2"])
    expect(result.errors).toHaveLength(0)
    expect(result.imported).toBe(1)

    const cards = await searchProjectCards({})
    expect(cards).toHaveLength(1)
    expect(cards[0].sectionId).toBe("s2")

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

  it("imports reviews for valid cards and drops orphans (A2)", async () => {
    const card = {
      id: "rv-card",
      type: "text" as const,
      title: "标题",
      content: "正文",
      source: { url: "https://example.com/x" },
      createdAt: 1690000000000,
      projectId: "p1"
    }
    const data = {
      version: 5,
      projectCards: [card],
      projects: [{ id: "p1", name: "项目", createdAt: 1690000000000 }],
      reviews: [
        {
          id: "rv1",
          itemId: "rv-card",
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
          itemId: "no-such-card",
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
    expect(reviews[0].itemId).toBe("rv-card")
    expect(reviews[0].srs.interval).toBe(3)
  })

  it("round-trips a full-featured card + project + review through export→import (new fields survive)", async () => {
    const card = {
      id: "rt-1",
      type: "text",
      title: "标题",
      content: "正文",
      image: "data:image/png;base64,AAAA",
      sectionId: "sec-1",
      images: ["https://img.example.com/a.png"],
      order: 7,
      updatedAt: 1700000000000,
      source: {
        title: "P",
        url: "https://example.com/p",
        site: "example.com"
      },
      createdAt: 1690000000000,
      projectId: "p1",
      comment: "备注内容",
      // A field not in the ProjectCard type today — must survive the round-trip
      // ("一次修改，一直有效"): export spreads, import spreads + validates.
      futureField: "survives"
    } as unknown as ProjectCard

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

    const blob = await toJsonZip([card], [], [], [project], [review])
    const file = new File([blob], "backup.zip", { type: "application/zip" })
    const result = await importFromZip(file, ["p1"])

    expect(result.errors).toHaveLength(0)
    expect(result.imported).toBe(1)

    const cards = await searchProjectCards({})
    const imported = cards[0]
    expect(imported.title).toBe("标题")
    expect(imported.sectionId).toBe("sec-1")
    expect(imported.images).toEqual(["https://img.example.com/a.png"])
    expect(imported.order).toBe(7)
    expect(imported.comment).toBe("备注内容")
    expect(imported.image).toBe("data:image/png;base64,AAAA")
    expect((imported as unknown as Record<string, unknown>).futureField).toBe(
      "survives"
    )

    const projects = await listProjects()
    expect(projects[0].lastOpened).toBe(1695000000000)

    const reviews = await getAllReviews()
    expect(reviews).toHaveLength(1)
    expect(reviews[0].srs.interval).toBe(3)
  })

  it("imports a source-less 自建卡片", async () => {
    const card: ProjectCard = {
      id: "local-card",
      type: "text",
      title: "本地笔记",
      content: "正文",
      createdAt: 1,
      projectId: "p-import"
    }
    const project = { id: "p-import", name: "P", createdAt: 1, sections: [] }
    const data = { version: 5, projectCards: [card], projects: [project] }
    const file = await packZip(data)
    const result = await importFromZip(file)
    expect(result.imported).toBe(1)
    expect(
      (await searchProjectCards({})).some((c) => c.id === "local-card")
    ).toBe(true)
  })
})

describe("legacy zip import (old monolithic items array)", () => {
  beforeEach(() => {
    indexedDB = new IDBFactory()
  })

  it("splits placed items into pdfCard + placement, remaps their reviews, and imports todos", async () => {
    const data = {
      items: [
        {
          id: "todo-1",
          type: "todo",
          title: "任务",
          content: "- [ ] 写代码",
          dueDate: "2026-08-05",
          createdAt: 1
        },
        {
          id: "plain-1",
          type: "text",
          title: "普通卡",
          content: "正文",
          createdAt: 1,
          projectId: "p1",
          source: { title: "P", url: "https://example.com/a" }
        },
        {
          id: "placed-1",
          type: "text",
          title: "放置卡",
          content: "摘录",
          createdAt: 1,
          projectId: "p1",
          pdfRef: { pdfId: "pdf-1", page: 2, annotationId: "ann-1" },
          pdfRefPdfId: "pdf-1",
          pdfOrder: 2000000
        }
      ],
      projects: [{ id: "p1", name: "旧项目", createdAt: 1 }],
      reviews: [
        {
          id: "rv-1",
          itemId: "placed-1",
          projectId: "p1",
          status: "active",
          dueDate: 1700000000000,
          addedAt: 1,
          srs: {
            dueDate: 1700000000000,
            interval: 2,
            easeFactor: 2.5,
            reviewCount: 1,
            lastReviewDate: 1
          }
        }
      ],
      // legacy annotations carried itemId (not cardId); the placed card's type
      // is looked up from here by annotationId.
      pdfAnnotations: [
        {
          id: "ann-1",
          pdfId: "pdf-1",
          page: 2,
          kind: "text",
          type: "underline",
          startOffset: 0,
          endOffset: 1,
          text: "x",
          itemId: "placed-1",
          createdAt: 1
        }
      ]
    }
    const file = await packZip(data)
    const result = await importFromZip(file, ["p1"])
    expect(result.errors).toHaveLength(0)

    // todos land in the todos store
    const todos: TodoCard[] = await getAllTodos()
    expect(todos).toHaveLength(1)
    expect(todos[0].id).toBe("todo-1")
    expect(todos[0].dueDate).toBe("2026-08-05")

    // the placed item became a pdfCard (old id kept) + a placement (new uuid)
    const cards = await searchProjectCards({})
    const plain = cards.find((c) => c.id === "plain-1")
    expect(plain?.title).toBe("普通卡")
    const placement = cards.find((c) => c.pdfCardId)
    expect(placement).toBeDefined()
    expect(placement?.title).toBe("放置卡")
    expect(placement?.content).toBe("")
    expect(placement?.projectId).toBeTruthy()

    const pdfCards = await getPdfCards("pdf-1")
    expect(pdfCards).toHaveLength(1)
    expect(pdfCards[0].id).toBe("placed-1")
    // annotation type resolved from the exported pdfAnnotations array
    expect(pdfCards[0].type).toBe("underline")
    expect(pdfCards[0].projectCardId).toBe(placement!.id)

    // the review of the placed card remapped onto its placement
    const reviews = await getAllReviews()
    expect(reviews).toHaveLength(1)
    expect(reviews[0].itemId).toBe(placement!.id)
    expect(reviews[0].srs.interval).toBe(2)
  })

  it("remaps legacy uuid pdf ids to the content-hash id (annotations + cards)", async () => {
    const uuid = "legacy-uuid-pdf"
    const bytes = new Blob(["legacy"], { type: "application/pdf" })
    const ann = {
      id: "legacy-ann",
      pdfId: uuid,
      page: 1,
      kind: "text",
      type: "highlight",
      startOffset: 0,
      endOffset: 1,
      text: "x",
      itemId: "legacy-card",
      createdAt: 1
    } as unknown as PdfAnnotation
    // a card referencing the legacy uuid pdf id (pdf-only — no projectId)
    const card = {
      id: "legacy-card",
      type: "text",
      content: "x",
      createdAt: 1,
      pdfRef: { pdfId: uuid, page: 1, annotationId: "legacy-ann" },
      pdfRefPdfId: uuid
    }
    const data = {
      items: [card],
      pdfs: [{ id: uuid, name: "old.pdf", pageCount: 0, addedAt: 1 }],
      pdfAnnotations: [ann]
    }
    const file = await packZipWithPdfs(data, { [uuid]: bytes })
    await importFromZip(file)

    // the imported pdf got the content-hash id
    const actualId = await sha256Bytes(bytes)
    const restored = await getPdf(actualId)
    expect(restored?.name).toBe("old.pdf")
    expect(await getPdf(uuid)).toBeUndefined()
    // the annotation + card were remapped onto it; itemId → cardId
    const importedAnn = await getAnnotation("legacy-ann")
    expect(importedAnn?.pdfId).toBe(actualId)
    expect(importedAnn?.cardId).toBe("legacy-card")
    const cards = await getPdfCards(actualId)
    expect(cards).toHaveLength(1)
    expect(cards[0].id).toBe("legacy-card")
  })
})

describe("pdf backup round-trip", () => {
  beforeEach(() => {
    indexedDB = new IDBFactory()
  })

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
    const blob = await toJsonZip(
      [],
      [card],
      [],
      [],
      [],
      [{ ...pdf, id: pdfId }],
      [annotation]
    )
    await importFromZip(blob as File)

    const restored = await getPdf(pdfId)
    expect(restored?.name).toBe("paper.pdf")
    expect(restored?.bytes).toBeTruthy()
    expect((await getAnnotation(annotation.id))?.text).toBe("备份测试")
    const cards = await getPdfCards(pdfId)
    expect(cards).toHaveLength(1)
    expect(cards[0].id).toBe(card.id)
  })

  it("survives export → import (topic + pageCount + lastOpened)", async () => {
    const pdf: PdfFile = {
      id: "topic-pdf",
      name: "paper.pdf",
      bytes: new Blob(["t"], { type: "application/pdf" }),
      pageCount: 5,
      addedAt: 123,
      lastOpened: 456,
      topic: "深度学习"
    }
    const blob = await toJsonZip([], [], [], [], [], [pdf], [])
    await importFromZip(blob as File)
    // addPdf recomputes the content-hash id, so look the restored file up by it.
    const actualId = await sha256Bytes(pdf.bytes)
    const restored = await getPdf(actualId)
    expect(restored?.topic).toBe("深度学习")
    expect(restored?.pageCount).toBe(5)
    expect(restored?.lastOpened).toBe(456)
  })

  it("round-trips read-later through export → import (toJsonZip 9th arg)", async () => {
    const web: ReadLater = createReadLater({
      title: "稍后阅读文章",
      url: "https://example.com/article"
    })
    const pdfItem: ReadLater = createReadLater({
      title: "稍后阅读PDF",
      pdfId: "pdf-rl"
    })
    const blob = await toJsonZip([], [], [], [], [], [], [], [web, pdfItem])
    await importFromZip(blob as File)

    const restored = await getAllReadLater()
    expect(restored).toHaveLength(2)
    expect(restored.find((r) => r.id === web.id)?.title).toBe("稍后阅读文章")
    expect(restored.find((r) => r.id === pdfItem.id)?.pdfId).toBe("pdf-rl")
  })
})

describe("draft three-link round-trip", () => {
  beforeEach(() => {
    indexedDB = new IDBFactory()
  })

  it("a draft (isDraft + draftOf) survives export → import", async () => {
    const original = {
      id: "orig-1",
      type: "text" as const,
      title: "原卡",
      content: "正文",
      projectId: "p1",
      createdAt: 1690000000000
    }
    const draft = {
      id: "draft-1",
      type: "text" as const,
      isDraft: true,
      draftOf: "orig-1",
      title: "草稿标题",
      content: "草稿内容",
      projectId: "p1",
      createdAt: 1690000000000
    }
    const project = {
      id: "p1",
      name: "草稿项目",
      createdAt: 1690000000000
    }
    const blob = await toJsonZip([original, draft], [], [], [project], [])

    const file = new File([blob], "draft-export.zip", {
      type: "application/zip"
    })
    const result = await importFromZip(file)
    expect(result.imported).toBe(2)

    const { getAllProjectCards } = await import("../database/index")
    const imported = await getAllProjectCards()
    const importedDraft = imported.find((c: { id: string }) => c.id === "draft-1")
    expect(importedDraft).toBeDefined()
    expect(importedDraft.isDraft).toBe(true)
    expect(importedDraft.draftOf).toBe("orig-1")
    expect(importedDraft.title).toBe("草稿标题")
  })

  it("drops placements whose annotation isn't in the payload (A8 — no dead placed cards)", async () => {
    // A projects-scope backup exported BEFORE the annotations were carried:
    // placement + pdfCard present, annotation absent.
    const payload = {
      version: 5,
      projectCards: [
        {
          id: "plc-1",
          type: "text" as const,
          title: "放置卡",
          content: "",
          order: 1,
          projectId: "proj-a",
          pdfCardId: "pcard-1",
          createdAt: 1,
          updatedAt: 1
        }
      ],
      pdfCards: [
        {
          id: "pcard-1",
          pdfId: "pdf-a",
          page: 1,
          kind: "text",
          type: "highlight",
          annotationId: "ann-1",
          content: "",
          pdfOrder: 1000001,
          createdAt: 1,
          updatedAt: 1
        }
      ],
      projects: [{ id: "proj-a", name: "项目A", createdAt: 1 }],
      todos: [],
      reviews: []
    }
    const file = await packZip(payload)
    const result = await importFromZip(file)
    // The placement is skipped (its annotation can't be restored) — only the
    // project + pdfCard import (PDF-only).
    const cards = await getAllProjectCards()
    expect(cards.find((c: { id: string }) => c.id === "plc-1")).toBeUndefined()
    const pdfCards = await getPdfCards("pdf-a")
    expect(pdfCards.find((c) => c.id === "pcard-1")?.projectCardId).toBeUndefined()
    expect(result.skipped).toBeGreaterThanOrEqual(1)
  })

  it("restores placements whose annotation IS in the payload", async () => {
    const payload = {
      version: 5,
      projectCards: [
        {
          id: "plc-2",
          type: "text" as const,
          title: "放置卡2",
          content: "",
          order: 1,
          projectId: "proj-b",
          pdfCardId: "pcard-2",
          createdAt: 1,
          updatedAt: 1
        }
      ],
      pdfCards: [
        {
          id: "pcard-2",
          pdfId: "pdf-b",
          page: 1,
          kind: "text",
          type: "highlight",
          annotationId: "ann-2",
          content: "",
          projectCardId: "plc-2",
          pdfOrder: 1000002,
          createdAt: 1,
          updatedAt: 1
        }
      ],
      pdfAnnotations: [
        {
          id: "ann-2",
          pdfId: "pdf-b",
          page: 1,
          kind: "text",
          type: "highlight",
          text: "引文",
          cardId: "pcard-2",
          rects: [],
          store: {
            id: "ann-2",
            pageNumber: 1,
            type: 1,
            konvaClientRect: { x: 0, y: 0, width: 10, height: 10 }
          },
          createdAt: 1,
          updatedAt: 1
        }
      ],
      projects: [{ id: "proj-b", name: "项目B", createdAt: 1 }],
      todos: [],
      reviews: []
    }
    const file = await packZip(payload)
    await importFromZip(file)
    const cards = await getAllProjectCards()
    const placement = cards.find((c: { id: string }) => c.id === "plc-2")
    expect(placement).toBeDefined()
    expect(placement.pdfCardId).toBe("pcard-2")
    const pdfCards = await getPdfCards("pdf-b")
    expect(pdfCards.find((c) => c.id === "pcard-2")?.projectCardId).toBe("plc-2")
    // F1: the placed card's QUOTE (the linked annotation) must import even
    // though its pdf isn't in the payload — a projects-scope restore without
    // this renders the placement empty.
    const restoredAnn = await getAnnotation("ann-2")
    expect(restoredAnn).toBeDefined()
    expect(restoredAnn?.text).toBe("引文")
    expect(restoredAnn?.cardId).toBe("pcard-2")
  })
})
