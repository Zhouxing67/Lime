import { dayKey, getRecentItems, rateSrs } from "../hooks/useSrs"
import type {
  Item,
  PdfAnnotation,
  PdfFile,
  Project,
  ReviewEntry,
  SearchQuery
} from "../types"
import {
  addAnnotation,
  createTextAnnotationCard,
  deleteAnnotationWithCard,
  deletePdfCard,
  getItemsByPdf,
  addItem,
  addPdf,
  addProject,
  addReview,
  bulkReplace,
  deleteAnnotation,
  deleteItem,
  deleteItems,
  deletePdf,
  deleteProject,
  ensureItemOrder,
  getAllReviews,
  getAnnotation,
  getAnnotationsByPdf,
  getDueReviews,
  getPdf,
  getProjectByName,
  listPdfs,
  listProjects,
  searchItems,
  updateItem,
  updateReviewSrs
} from "./index"

// Helper to create a test item
const createTestItem = (overrides: Partial<Item> = {}): Item => ({
  id: `item-${Date.now()}-${Math.random()}`,
  type: "text",
  content: "Test content",
  source: {
    title: "Test Page",
    url: "https://example.com/test",
    site: "example.com"
  },
  createdAt: Date.now(),
  ...overrides
})

describe("database", () => {
  beforeEach(() => {
    // Clear IndexedDB before each test
    indexedDB = new IDBFactory()
  })

  describe("addItem", () => {
    it("should add an item to the database", async () => {
      const item = createTestItem()
      await addItem(item)

      const items = await searchItems({})
      expect(items).toHaveLength(1)
      expect(items[0].id).toBe(item.id)
      expect(items[0].content).toBe(item.content)
    })

    it("should auto-generate sourceSite from URL if not provided", async () => {
      const item = createTestItem({
        source: {
          title: "Test",
          url: "https://blog.example.com/post"
        }
      })
      await addItem(item)

      const items = await searchItems({})
      expect(items[0].sourceSite).toBe("blog.example.com")
    })

    it("should auto-generate hash if not provided", async () => {
      const item = createTestItem()
      delete item.hash
      await addItem(item)

      const items = await searchItems({})
      expect(items[0].hash).toBeDefined()
      expect(items[0].hash).toHaveLength(64)
    })

    it("should prevent duplicate items with same hash and URL", async () => {
      const item = createTestItem({ hash: "test-hash-123" })
      await addItem(item)
      await addItem(item) // Try to add duplicate

      const items = await searchItems({})
      expect(items).toHaveLength(1) // Should only have one item
    })

    it("should allow items with same hash but different URL", async () => {
      const item1 = createTestItem({
        hash: "same-hash",
        source: { title: "Page 1", url: "https://site1.com" }
      })
      const item2 = createTestItem({
        hash: "same-hash",
        source: { title: "Page 2", url: "https://site2.com" }
      })

      await addItem(item1)
      await addItem(item2)

      const items = await searchItems({})
      expect(items).toHaveLength(2)
    })

    it("should treat different images as different items even with same content and source", async () => {
      const base = {
        content: "mixed content text",
        source: {
          title: "Mixed",
          url: "https://example.com/mixed",
          site: "example.com"
        }
      }
      await addItem(
        createTestItem({ ...base, images: ["https://img.example.com/a.png"] })
      )
      await addItem(
        createTestItem({ ...base, images: ["https://img.example.com/b.png"] })
      )

      const items = await searchItems({})
      expect(items).toHaveLength(2)
    })

    it("should dedupe mixed cards when content and images match", async () => {
      const base = {
        content: "mixed card dedup",
        source: {
          title: "Mixed",
          url: "https://example.com/mixed-dedup",
          site: "example.com"
        }
      }
      const images = [
        "https://img.example.com/a.png",
        "https://img.example.com/b.png"
      ]
      await addItem(createTestItem({ ...base, images }))
      await addItem(createTestItem({ ...base, images }))

      const items = await searchItems({})
      expect(items).toHaveLength(1)
    })
  })

  describe("ensureItemOrder", () => {
    it("appends to the section's end and to the unclassified scope separately", async () => {
      const mk = (
        id: string,
        content: string,
        sectionId?: string,
        order?: number
      ): Item =>
        createTestItem({
          id,
          content,
          ...(sectionId ? { sectionId } : {}),
          ...(order !== undefined ? { order } : {})
        })
      await addItem(mk("o1", "a", "s1", 0))
      await addItem(mk("o2", "b", "s1", 2))
      await addItem(mk("o3", "c", undefined, 5))

      const placed = await ensureItemOrder(mk("o4", "d", "s1"))
      expect(placed.order).toBe(3)
      const placedUnc = await ensureItemOrder(mk("o5", "e"))
      expect(placedUnc.order).toBe(6)
      // Explicit order is respected.
      const explicit = await ensureItemOrder(mk("o6", "f", "s1", 9))
      expect(explicit.order).toBe(9)
    })

    it("addItem auto-assigns order to a card without one", async () => {
      await addItem(createTestItem({ id: "ao1", content: "a", sectionId: "s1", order: 0 }))
      const ok = await addItem(
        createTestItem({ id: "ao2", content: "b", sectionId: "s1" })
      )
      expect(ok).toBe(true)
      const items = await searchItems({})
      const placed = items.find((i) => i.id === "ao2")
      expect(placed?.order).toBe(1)
    })
  })

  describe("searchItems", () => {
    beforeEach(async () => {
      // Set up test data
      await addItem(
        createTestItem({
          id: "text1",
          type: "text",
          content: "Hello world",
          source: {
            title: "Page 1",
            url: "https://example.com/1",
            site: "example.com"
          },
          createdAt: 1000
        })
      )
      await addItem(
        createTestItem({
          id: "image1",
          type: "image",
          content: "data:image/png;base64,xyz",
          source: {
            title: "Page 2",
            url: "https://test.com/2",
            site: "test.com"
          },
          createdAt: 2000
        })
      )
      await addItem(
        createTestItem({
          id: "text2",
          type: "text",
          content: "Goodbye world",
          source: {
            title: "Another Page",
            url: "https://example.com/3",
            site: "example.com"
          },
          createdAt: 3000,
          projectId: "proj1"
        })
      )
    })

    it("should filter by type", async () => {
      const results = await searchItems({ type: "text" })
      expect(results).toHaveLength(2)
      expect(results.every((item) => item.type === "text")).toBe(true)
    })

    it("should filter by site", async () => {
      const results = await searchItems({ site: "example.com" })
      expect(results).toHaveLength(2)
      expect(results.every((item) => item.sourceSite === "example.com")).toBe(
        true
      )
    })

    it("should filter by keyword in content", async () => {
      const results = await searchItems({ keyword: "hello" })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe("text1")
    })

    it("should filter by keyword in title", async () => {
      const results = await searchItems({ keyword: "another" })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe("text2")
    })

    it("should be case-insensitive for keyword search", async () => {
      const results = await searchItems({ keyword: "HELLO" })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe("text1")
    })

    it("should filter by date range (from)", async () => {
      const results = await searchItems({ from: 2000 })
      expect(results).toHaveLength(2)
      expect(results.every((item) => item.createdAt >= 2000)).toBe(true)
    })

    it("should filter by date range (to)", async () => {
      const results = await searchItems({ to: 2001 })
      expect(results).toHaveLength(2)
      expect(results.every((item) => item.createdAt < 2001)).toBe(true)
    })

    it("should filter by projectId", async () => {
      const results = await searchItems({ projectId: "proj1" })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe("text2")
    })

    it("should combine multiple filters", async () => {
      const results = await searchItems({
        type: "text",
        site: "example.com",
        keyword: "world"
      })
      expect(results).toHaveLength(2)
    })

    it("should return all items when query is empty", async () => {
      const results = await searchItems({})
      expect(results).toHaveLength(3)
    })

    it("should return items in reverse chronological order", async () => {
      const results = await searchItems({})
      expect(results[0].id).toBe("text2")
      expect(results[1].id).toBe("image1")
      expect(results[2].id).toBe("text1")
    })
  })

  describe("updateItem", () => {
    it("should update an existing item", async () => {
      const item = createTestItem({ content: "Original content" })
      await addItem(item)

      const updatedItem = { ...item, content: "Updated content" }
      await updateItem(updatedItem)

      const items = await searchItems({})
      expect(items).toHaveLength(1)
      expect(items[0].content).toBe("Updated content")
    })
  })

  describe("deleteItem", () => {
    it("should remove an item from the database", async () => {
      const item = createTestItem()
      await addItem(item)

      let items = await searchItems({})
      expect(items).toHaveLength(1)

      await deleteItem(item.id)

      items = await searchItems({})
      expect(items).toHaveLength(0)
    })

    it("should not throw error when deleting non-existent item", async () => {
      await expect(deleteItem("non-existent-id")).resolves.not.toThrow()
    })
  })

  describe("deleteItems", () => {
    it("should delete multiple items in a single transaction", async () => {
      const item1: Item = {
        id: "batch1",
        type: "text",
        content: "batch test A",
        source: { title: "Page A", url: "https://example.com/a" },
        createdAt: 100
      }
      const item2: Item = {
        id: "batch2",
        type: "text",
        content: "batch test B",
        source: { title: "Page B", url: "https://example.com/b" },
        createdAt: 200
      }
      await addItem(item1)
      await addItem(item2)

      // Confirm both exist
      const before = await searchItems({})
      expect(before.find((i) => i.id === "batch1")).toBeTruthy()
      expect(before.find((i) => i.id === "batch2")).toBeTruthy()

      // Batch delete
      await deleteItems(["batch1", "batch2"])

      const after = await searchItems({})
      expect(after.find((i) => i.id === "batch1")).toBeFalsy()
      expect(after.find((i) => i.id === "batch2")).toBeFalsy()
    })
  })

  const createTestReview = (
    id: string,
    itemId: string,
    projectId = "",
    srs?: Partial<ReviewEntry["srs"]>
  ): ReviewEntry => {
    const now = Date.now()
    const dueDate = srs?.dueDate ?? now
    return {
      id,
      itemId,
      projectId,
      status: "active",
      dueDate,
      addedAt: now,
      srs: {
        dueDate,
        interval: 0,
        easeFactor: 2.5,
        reviewCount: 0,
        lastReviewDate: 0,
        ...srs
      }
    }
  }

  describe("project CRUD", () => {
    const createProject = (
      name: string,
      overrides: Partial<Project> = {}
    ): Project => ({
      id: `proj-${name}`,
      name,
      createdAt: Date.now(),
      ...overrides
    })

    it("should add a project", async () => {
      const project = createProject("Test Project")
      await addProject(project)
      const projects = await listProjects()
      expect(projects).toHaveLength(1)
      expect(projects[0].name).toBe("Test Project")
    })

    it("should reject duplicate project names", async () => {
      const project = createProject("Unique Project")
      await addProject(project)
      await expect(addProject(createProject("Unique Project"))).rejects.toThrow(
        "项目已存在"
      )
    })

    it("should delete project and its items atomically", async () => {
      const project = createProject("To Delete")
      await addProject(project)
      await addItem(createTestItem({ id: "p-item", projectId: project.id }))
      await addReview(createTestReview("review-1", "p-item", project.id))

      await deleteProject(project.id)

      const projects = await listProjects()
      expect(projects).toHaveLength(0)
      const items = await searchItems({ projectId: project.id })
      expect(items).toHaveLength(0)
      const reviews = await getAllReviews()
      expect(reviews).toHaveLength(0)
    })

    it("getProjectByName should find existing project", async () => {
      const project = createProject("Find Me")
      await addProject(project)
      const found = await getProjectByName("Find Me")
      expect(found?.id).toBe(project.id)
    })
  })

  describe("review lifecycle", () => {
    it("addReview + getDueReviews should return only currently due active cards", async () => {
      await addReview(
        createTestReview("r1", "item1", "", { dueDate: Date.now() - 1000 })
      )
      await addReview(
        createTestReview("r2", "item2", "", {
          dueDate: Date.now() + 86400000,
          interval: 1
        })
      )

      const due = await getDueReviews()
      expect(due).toHaveLength(1)
      expect(due[0].itemId).toBe("item1")
    })

    it("updateReviewSrs should promote mastered when interval reaches max", async () => {
      await addReview(createTestReview("r3", "item3"))
      const srs = rateSrs(
        {
          dueDate: Date.now(),
          interval: 0,
          easeFactor: 2.5,
          reviewCount: 0,
          lastReviewDate: 0
        },
        4
      )
      // Rating 认识 (4) repeatedly to push interval to 365 (×1.6 growth).
      let current = srs
      for (let i = 0; i < 20; i++) {
        current = rateSrs(current, 4)
      }
      expect(current.interval).toBe(365)

      await updateReviewSrs("item3", current)

      const due = await getDueReviews()
      expect(due).toHaveLength(0)
      const all = await getAllReviews()
      expect(all[0].status).toBe("mastered")
    })

    it("mastered cards are not auto-reviewed but demote via rating or re-review (A1)", async () => {
      const DAY = 86400000
      await addReview(createTestReview("m1", "itemM1"))
      const mastered = {
        dueDate: Date.now() + 365 * DAY,
        interval: 365,
        easeFactor: 2.5,
        reviewCount: 10,
        lastReviewDate: Date.now()
      }
      // Promote to mastered.
      await updateReviewSrs("itemM1", mastered)
      expect((await getAllReviews())[0].status).toBe("mastered")
      // Not in the due queue even when overdue (no auto re-verification).
      await updateReviewSrs("itemM1", { ...mastered, dueDate: Date.now() - DAY })
      expect(await getDueReviews()).toHaveLength(0)

      // Manual re-review: reset interval → demotes to active + due now.
      await updateReviewSrs("itemM1", {
        ...mastered,
        interval: 1,
        dueDate: Date.now()
      })
      expect((await getAllReviews())[0].status).toBe("active")
      expect(await getDueReviews()).toHaveLength(1)
    })

    it("模糊 on a mastered card demotes back to active (A1)", async () => {
      const DAY = 86400000
      await addReview(createTestReview("m2", "itemM2"))
      await updateReviewSrs("itemM2", {
        dueDate: Date.now() + 365 * DAY,
        interval: 365,
        easeFactor: 2.5,
        reviewCount: 10,
        lastReviewDate: Date.now()
      })
      // 模糊 keeps the interval capped at 365 but must still demote.
      const vague = rateSrs(
        {
          dueDate: Date.now() + 365 * DAY,
          interval: 365,
          easeFactor: 2.5,
          reviewCount: 10,
          lastReviewDate: Date.now()
        },
        2
      )
      expect(vague.interval).toBe(365)
      await updateReviewSrs("itemM2", vague)
      expect((await getAllReviews())[0].status).toBe("active")
    })

    it("updateReviewSrs should keep active card due today when rated <3", async () => {
      await addReview(createTestReview("r4", "item4"))
      const srs = rateSrs(
        {
          dueDate: Date.now(),
          interval: 0,
          easeFactor: 2.5,
          reviewCount: 0,
          lastReviewDate: 0
        },
        1
      )
      expect(srs.interval).toBe(1)

      await updateReviewSrs("item4", srs)

      const due = await getDueReviews()
      expect(due).toHaveLength(1)
      expect(due[0].itemId).toBe("item4")
    })

    it("rateSrs gives differentiated first-review intervals (3 levels)", () => {
      const fresh = () => ({
        dueDate: Date.now(),
        interval: 0,
        easeFactor: 2.5,
        reviewCount: 0,
        lastReviewDate: 0
      })
      // 模糊 first → 1 day; 认识 first → 2 days.
      expect(rateSrs(fresh(), 2).interval).toBe(1)
      expect(rateSrs(fresh(), 3).interval).toBe(2)
      expect(rateSrs(fresh(), 4).interval).toBe(2) // legacy 4 = 认识
      // 不认识 resets interval to 1 → a later 认识 grows from there.
      expect(rateSrs(rateSrs(fresh(), 1), 3).interval).toBe(2)
    })

    it("rateSrs slow-growth curve: 模糊 ×1.3, 认识 ×1.6", () => {
      const fresh = () => ({
        dueDate: Date.now(),
        interval: 0,
        easeFactor: 2.5,
        reviewCount: 0,
        lastReviewDate: 0
      })
      // 模糊: 1 → 2 → 3 → 4 → 5
      let s = rateSrs(fresh(), 2)
      const vague = [s.interval]
      for (let i = 0; i < 4; i++) {
        s = rateSrs(s, 2)
        vague.push(s.interval)
      }
      expect(vague).toEqual([1, 2, 3, 4, 5])
      // 认识: 2 → 3 → 5 → 8 → 13
      s = rateSrs(fresh(), 3)
      const know = [s.interval]
      for (let i = 0; i < 4; i++) {
        s = rateSrs(s, 3)
        know.push(s.interval)
      }
      expect(know).toEqual([2, 3, 5, 8, 13])
    })
  })

  describe("bulkReplace", () => {
    it("should upsert remote and delete missing local atomically", async () => {
      const project: Project = { id: "p1", name: "P1", createdAt: 1000 }
      await addProject(project)
      await addItem(createTestItem({ id: "i1", projectId: "p1" }))
      await addReview(createTestReview("rv1", "i1", "p1"))

      const remoteItem = createTestItem({ id: "i2", projectId: "p2" })
      const remoteProject: Project = { id: "p2", name: "P2", createdAt: 2000 }
      const remoteReview = createTestReview("rv2", "i2", "p2")

      await bulkReplace(
        [remoteItem],
        [remoteProject],
        [remoteReview],
        await searchItems({}),
        await listProjects(),
        await getAllReviews()
      )

      const items = await searchItems({})
      expect(items).toHaveLength(1)
      expect(items[0].id).toBe("i2")

      const projects = await listProjects()
      expect(projects).toHaveLength(1)
      expect(projects[0].id).toBe("p2")

      const reviews = await getAllReviews()
      expect(reviews).toHaveLength(1)
      expect(reviews[0].itemId).toBe("i2")
    })

    it("should replace local review with same itemId instead of hitting unique index", async () => {
      await addItem(createTestItem({ id: "i1", projectId: "p1" }))
      await addReview(createTestReview("local-rv", "i1", "p1"))

      const remoteReview = createTestReview("remote-rv", "i1", "p1")

      await bulkReplace([], [], [remoteReview], [], [], await getAllReviews())

      const reviews = await getAllReviews()
      expect(reviews).toHaveLength(1)
      expect(reviews[0].id).toBe("remote-rv")
      expect(reviews[0].itemId).toBe("i1")
    })
  })

  describe("getRecentItems", () => {
    it("groups a card under every day it was reviewed (not just the latest)", async () => {
      const yesterday = Date.now() - 86400000
      const today = Date.now()
      const i1: Item = createTestItem({ id: "g1" })
      const i2: Item = createTestItem({ id: "g2" })
      await addItem(i1)
      await addItem(i2)

      // g1 reviewed yesterday AND today → must appear in both groups.
      await addReview(
        createTestReview("gr1", "g1", "", {
          lastReviewDate: today,
          reviewHistory: [
            { date: yesterday, rating: 2 },
            { date: today, rating: 3 }
          ]
        })
      )
      // g2 reviewed today only.
      await addReview(
        createTestReview("gr2", "g2", "", {
          lastReviewDate: today,
          reviewHistory: [{ date: today, rating: 3 }]
        })
      )

      const groups = await getRecentItems([i1, i2], 3)
      expect(groups).toHaveLength(2)
      const todayGroup = groups.find((g) => g.date === dayKey(today))
      const yesterdayGroup = groups.find((g) => g.date === dayKey(yesterday))
      expect(todayGroup?.items.map((i) => i.id).sort()).toEqual(["g1", "g2"])
      expect(yesterdayGroup?.items.map((i) => i.id)).toEqual(["g1"])
    })
  })
})

describe("pdf stores", () => {
  it("adds, reads, lists, and deletes a PDF", async () => {
    const pdf: PdfFile = {
      id: "pdf-1",
      name: "paper.pdf",
      bytes: new Blob(["x"]),
      pageCount: 3,
      addedAt: 1000
    }
    await addPdf(pdf)
    expect((await getPdf("pdf-1"))?.name).toBe("paper.pdf")
    expect(await listPdfs()).toHaveLength(1)
    await deletePdf("pdf-1")
    expect(await getPdf("pdf-1")).toBeUndefined()
  })

  it("stores annotations keyed by pdfId, sorted by page", async () => {
    const a1: PdfAnnotation = {
      id: "a1",
      pdfId: "pdf-1",
      page: 1,
      kind: "text",
      type: "highlight",
      startOffset: 0,
      endOffset: 5,
      text: "hi",
      createdAt: 1
    }
    const a2: PdfAnnotation = {
      id: "a2",
      pdfId: "pdf-1",
      page: 2,
      kind: "region",
      type: "frame",
      rects: [{ x: 0, y: 0, w: 10, h: 10 }],
      createdAt: 2
    }
    await addAnnotation(a1)
    await addAnnotation(a2)
    const list = await getAnnotationsByPdf("pdf-1")
    expect(list).toHaveLength(2)
    expect(list[0].page).toBe(1)
    await deleteAnnotation("a1")
    expect(await getAnnotation("a1")).toBeUndefined()
    expect(await getAnnotationsByPdf("pdf-1")).toHaveLength(1)
  })
})

describe("pdf annotations ↔ cards", () => {
  it("creates a text annotation + card atomically, links them 1:1", async () => {
    const { card, annotation } = await createTextAnnotationCard({
      pdfId: "pdf-a",
      page: 3,
      type: "highlight",
      text: "关键段落",
      startOffset: 10,
      endOffset: 20,
      title: "摘要"
    })
    expect(card.pdfRef?.annotationId).toBe(annotation.id)
    expect(card.pdfRef?.page).toBe(3)
    expect(card.pdfRefPdfId).toBe("pdf-a")
    expect(annotation.itemId).toBe(card.id)
    expect(annotation.kind).toBe("text")
    expect(annotation.text).toBe("关键段落")

    const items = await getItemsByPdf("pdf-a")
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe(card.id)
    expect(await getItemsByPdf("pdf-other")).toHaveLength(0)
  })

  it("deletes annotation + card together (both directions)", async () => {
    const { card, annotation } = await createTextAnnotationCard({
      pdfId: "pdf-b",
      page: 1,
      type: "underline",
      text: "x",
      startOffset: 0,
      endOffset: 1
    })
    // delete via annotation
    await deleteAnnotationWithCard(annotation.id)
    expect(await getItemsByPdf("pdf-b")).toHaveLength(0)
    expect(await getAnnotation(annotation.id)).toBeUndefined()

    // delete via card
    const { card: c2, annotation: a2 } = await createTextAnnotationCard({
      pdfId: "pdf-c",
      page: 1,
      type: "highlight",
      text: "y",
      startOffset: 0,
      endOffset: 1
    })
    await deletePdfCard(c2)
    expect(await getItemsByPdf("pdf-c")).toHaveLength(0)
    expect(await getAnnotation(a2.id)).toBeUndefined()
  })
})
