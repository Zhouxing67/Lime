import { dayKey, getRecentItems, rateSrs } from "../hooks/useSrs"
import { sha256Bytes, createReadLater } from "../utils"
import type {
  PdfAnnotation,
  PdfFile,
  Project,
  ProjectCard,
  ReadLater,
  ReviewEntry,
  TodoCard
} from "../types"
import {
  addAnnotation,
  updateAnnotationImage,
  addPdf,
  updatePdfTopic,
  applyPdfSync,
  createRegionAnnotationCard,
  createTextAnnotationCard,
  deleteAnnotationWithCard,
  deletePdfCards,
  getAllAnnotations,
  getProjectCardById,
  getPdfCards,
  addProjectCard,
  createTextCard,
  addTodo,
  addProject,
  addReview,
  bulkReplace,
  deleteAnnotation,
  deleteProjectCard,
  deleteProjectCards,
  deletePdf,
  deleteProject,
  ensureOrder,
  getAllReviews,
  getAllTodos,
  getAnnotation,
  getAnnotationsByPdf,
  getDueReviews,
  getAllProjectCards,
  getPdf,
  getProjectByName,
  listPdfs,
  listProjects,
  placePdfCard,
  placePdfCards,
  saveAnnotationFromStore,
  unplacePdfCard,
  unplacePdfCards,
  searchProjectCards,
  saveDraftCard,
  promoteDraft,
  touchPdf,
  updatePdfLastPage,
  updatePdfAiContext,
  updateProjectCard,
  updateReviewSrs,
  getReviewByItemId,
  addReadLater,
  updateReadLater,
  deleteReadLater,
  getAllReadLater,
  getReadLaterByPdfId,
  getActiveReadLaterCount,
  addVocabularyEntry,
  deleteVocabularyTranslation,
  deleteVocabularyEntry,
  getAllVocabularyCards,
  getVocabularyCardByPdf,
  normalizeVocabularyTerm,
  moveVocabularyTranslation,
  updateVocabularyTranslation,
  DB_VERSION
} from "./index"

// Helper to create a test project card (projectId is REQUIRED — defaults to "p1")
const createTestProjectCard = (
  overrides: Partial<ProjectCard> = {}
): ProjectCard => ({
  id: `card-${Date.now()}-${Math.random()}`,
  type: "text",
  content: "Test content",
  source: {
    title: "Test Page",
    url: "https://example.com/test",
    site: "example.com"
  },
  projectId: "p1",
  createdAt: Date.now(),
  ...overrides
})

// Helper to create a test todo card
const createTestTodoCard = (overrides: Partial<TodoCard> = {}): TodoCard => ({
  id: `todo-${Date.now()}-${Math.random()}`,
  content: "- [ ] test task",
  createdAt: Date.now(),
  ...overrides
})

beforeEach(() => {
  // Clear IndexedDB before each test
  indexedDB = new IDBFactory()
})

describe("database", () => {
  describe("addProjectCard", () => {
    it("should add a project card to the database", async () => {
      const card = createTestProjectCard()
      await addProjectCard(card)

      const cards = await searchProjectCards({})
      expect(cards).toHaveLength(1)
      expect(cards[0].id).toBe(card.id)
      expect(cards[0].content).toBe(card.content)
    })

    it("should auto-generate sourceSite from URL if not provided", async () => {
      const card = createTestProjectCard({
        source: {
          title: "Test",
          url: "https://blog.example.com/post"
        }
      })
      await addProjectCard(card)

      const cards = await searchProjectCards({})
      expect(cards[0].sourceSite).toBe("blog.example.com")
    })

    it("should auto-generate hash if not provided", async () => {
      const card = createTestProjectCard()
      delete card.hash
      await addProjectCard(card)

      const cards = await searchProjectCards({})
      expect(cards[0].hash).toBeDefined()
      expect(cards[0].hash).toHaveLength(64)
    })

    it("should prevent duplicate cards with same hash and URL", async () => {
      const card = createTestProjectCard({ hash: "test-hash-123" })
      await addProjectCard(card)
      await addProjectCard(card) // Try to add duplicate

      const cards = await searchProjectCards({})
      expect(cards).toHaveLength(1) // Should only have one card
    })

    it("should allow cards with same hash but different URL", async () => {
      const card1 = createTestProjectCard({
        hash: "same-hash",
        source: { title: "Page 1", url: "https://site1.com" }
      })
      const card2 = createTestProjectCard({
        hash: "same-hash",
        source: { title: "Page 2", url: "https://site2.com" }
      })

      await addProjectCard(card1)
      await addProjectCard(card2)

      const cards = await searchProjectCards({})
      expect(cards).toHaveLength(2)
    })

    it("should treat different images as different cards even with same content and source", async () => {
      const base = {
        content: "mixed content text",
        source: {
          title: "Mixed",
          url: "https://example.com/mixed",
          site: "example.com"
        }
      }
      await addProjectCard(
        createTestProjectCard({ ...base, images: ["https://img.example.com/a.png"] })
      )
      await addProjectCard(
        createTestProjectCard({ ...base, images: ["https://img.example.com/b.png"] })
      )

      const cards = await searchProjectCards({})
      expect(cards).toHaveLength(2)
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
      await addProjectCard(createTestProjectCard({ ...base, images }))
      await addProjectCard(createTestProjectCard({ ...base, images }))

      const cards = await searchProjectCards({})
      expect(cards).toHaveLength(1)
    })
  })

  describe("ensureOrder", () => {
    it("appends to the section's end and to the unclassified scope separately", async () => {
      const mk = (
        id: string,
        content: string,
        sectionId?: string,
        order?: number
      ): ProjectCard =>
        createTestProjectCard({
          id,
          content,
          projectId: "proj",
          ...(sectionId ? { sectionId } : {}),
          ...(order !== undefined ? { order } : {})
        })
      await addProjectCard(mk("o1", "a", "s1", 0))
      await addProjectCard(mk("o2", "b", "s1", 2))
      await addProjectCard(mk("o3", "c", undefined, 5))
      // A todo (separate store — no projectId) must NOT inflate the
      // unclassified project order space.
      await addTodo(createTestTodoCard({ id: "o3b", content: "c2" }))

      const placed = await ensureOrder(mk("o4", "d", "s1"))
      expect(placed.order).toBe(3)
      const placedUnc = await ensureOrder(mk("o5", "e"))
      expect(placedUnc.order).toBe(6)
      // Explicit order is respected.
      const explicit = await ensureOrder(mk("o6", "f", "s1", 9))
      expect(explicit.order).toBe(9)
    })

    it("addProjectCard auto-assigns order to a card without one", async () => {
      await addProjectCard(createTestProjectCard({ id: "ao1", content: "a", sectionId: "s1", order: 0 }))
      const ok = await addProjectCard(
        createTestProjectCard({ id: "ao2", content: "b", sectionId: "s1" })
      )
      expect(ok).toBe(true)
      const cards = await searchProjectCards({})
      const placed = cards.find((c) => c.id === "ao2")
      expect(placed?.order).toBe(1)
    })
  })

  describe("searchProjectCards", () => {
    beforeEach(async () => {
      // Set up test data
      await addProjectCard(
        createTestProjectCard({
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
      await addProjectCard(
        createTestProjectCard({
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
      await addProjectCard(
        createTestProjectCard({
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
      const results = await searchProjectCards({ type: "text" })
      expect(results).toHaveLength(2)
      expect(results.every((card) => card.type === "text")).toBe(true)
    })

    it("should filter by site", async () => {
      const results = await searchProjectCards({ site: "example.com" })
      expect(results).toHaveLength(2)
      expect(results.every((card) => card.sourceSite === "example.com")).toBe(
        true
      )
    })

    it("should filter by keyword in content", async () => {
      const results = await searchProjectCards({ keyword: "hello" })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe("text1")
    })

    it("should filter by keyword in title", async () => {
      const results = await searchProjectCards({ keyword: "another" })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe("text2")
    })

    it("should be case-insensitive for keyword search", async () => {
      const results = await searchProjectCards({ keyword: "HELLO" })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe("text1")
    })

    it("should filter by date range (from)", async () => {
      const results = await searchProjectCards({ from: 2000 })
      expect(results).toHaveLength(2)
      expect(results.every((card) => card.createdAt >= 2000)).toBe(true)
    })

    it("should filter by date range (to)", async () => {
      const results = await searchProjectCards({ to: 2001 })
      expect(results).toHaveLength(2)
      expect(results.every((card) => card.createdAt < 2001)).toBe(true)
    })

    it("should filter by projectId", async () => {
      const results = await searchProjectCards({ projectId: "proj1" })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe("text2")
    })

    it("should combine multiple filters", async () => {
      const results = await searchProjectCards({
        type: "text",
        site: "example.com",
        keyword: "world"
      })
      expect(results).toHaveLength(2)
    })

    it("should return all cards when query is empty", async () => {
      const results = await searchProjectCards({})
      expect(results).toHaveLength(3)
    })

    it("should return cards in reverse chronological order", async () => {
      const results = await searchProjectCards({})
      expect(results[0].id).toBe("text2")
      expect(results[1].id).toBe("image1")
      expect(results[2].id).toBe("text1")
    })
  })

  describe("updateProjectCard", () => {
    it("should update an existing card", async () => {
      const card = createTestProjectCard({ content: "Original content" })
      await addProjectCard(card)

      const updatedCard = { ...card, content: "Updated content" }
      await updateProjectCard(updatedCard)

      const cards = await searchProjectCards({})
      expect(cards).toHaveLength(1)
      expect(cards[0].content).toBe("Updated content")
    })
  })

  describe("deleteProjectCard", () => {
    it("should remove a card from the database", async () => {
      const card = createTestProjectCard()
      await addProjectCard(card)

      let cards = await searchProjectCards({})
      expect(cards).toHaveLength(1)

      await deleteProjectCard(card.id)

      cards = await searchProjectCards({})
      expect(cards).toHaveLength(0)
    })

    it("should not throw error when deleting non-existent card", async () => {
      await expect(deleteProjectCard("non-existent-id")).resolves.not.toThrow()
    })
  })

  describe("deleteProjectCards", () => {
    it("should delete multiple cards in a single transaction", async () => {
      const card1: ProjectCard = {
        id: "batch1",
        type: "text",
        content: "batch test A",
        source: { title: "Page A", url: "https://example.com/a" },
        projectId: "p1",
        createdAt: 100
      }
      const card2: ProjectCard = {
        id: "batch2",
        type: "text",
        content: "batch test B",
        source: { title: "Page B", url: "https://example.com/b" },
        projectId: "p1",
        createdAt: 200
      }
      await addProjectCard(card1)
      await addProjectCard(card2)

      // Confirm both exist
      const before = await searchProjectCards({})
      expect(before.find((c) => c.id === "batch1")).toBeTruthy()
      expect(before.find((c) => c.id === "batch2")).toBeTruthy()

      // Batch delete
      await deleteProjectCards(["batch1", "batch2"])

      const after = await searchProjectCards({})
      expect(after.find((c) => c.id === "batch1")).toBeFalsy()
      expect(after.find((c) => c.id === "batch2")).toBeFalsy()
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

    it("should delete project and its cards atomically", async () => {
      const project = createProject("To Delete")
      await addProject(project)
      await addProjectCard(createTestProjectCard({ id: "p-item", projectId: project.id }))
      await addReview(createTestReview("review-1", "p-item", project.id))

      await deleteProject(project.id)

      const projects = await listProjects()
      expect(projects).toHaveLength(0)
      const cards = await searchProjectCards({ projectId: project.id })
      expect(cards).toHaveLength(0)
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
      await addProjectCard(createTestProjectCard({ id: "i1", projectId: "p1" }))
      await addReview(createTestReview("rv1", "i1", "p1"))

      const remoteCard = createTestProjectCard({ id: "i2", projectId: "p2" })
      const remoteProject: Project = { id: "p2", name: "P2", createdAt: 2000 }
      const remoteReview = createTestReview("rv2", "i2", "p2")

      await bulkReplace(
        [remoteCard],
        [],
        [],
        [remoteProject],
        [remoteReview],
        await searchProjectCards({}),
        await getPdfCards(""),
        await getAllTodos(),
        await listProjects(),
        await getAllReviews()
      )

      const cards = await searchProjectCards({})
      expect(cards).toHaveLength(1)
      expect(cards[0].id).toBe("i2")

      const projects = await listProjects()
      expect(projects).toHaveLength(1)
      expect(projects[0].id).toBe("p2")

      const reviews = await getAllReviews()
      expect(reviews).toHaveLength(1)
      expect(reviews[0].itemId).toBe("i2")
    })

    it("should replace local review with same itemId instead of hitting unique index", async () => {
      await addProjectCard(createTestProjectCard({ id: "i1", projectId: "p1" }))
      await addReview(createTestReview("local-rv", "i1", "p1"))

      const remoteReview = createTestReview("remote-rv", "i1", "p1")

      await bulkReplace(
        [],
        [],
        [],
        [],
        [remoteReview],
        [],
        [],
        [],
        [],
        await getAllReviews()
      )

      const reviews = await getAllReviews()
      expect(reviews).toHaveLength(1)
      expect(reviews[0].id).toBe("remote-rv")
      expect(reviews[0].itemId).toBe("i1")
    })

    it("readLater: dedups two remote records sharing a pdfId (keeps the first)", async () => {
      const rl1 = createReadLater({ title: "A", pdfId: "pdf-X" })
      const rl2 = createReadLater({ title: "B", pdfId: "pdf-X" })
      await bulkReplace([], [], [], [], [], [], [], [], [], [], [rl1, rl2], [])

      const all = await getAllReadLater()
      expect(all).toHaveLength(1)
      expect(all[0].id).toBe(rl1.id)
      expect(all[0].title).toBe("A")
    })

    it("readLater: deletes local-not-remote", async () => {
      const local = createReadLater({ title: "local", pdfId: "pdf-L" })
      await addReadLater(local)
      const remote = createReadLater({ title: "remote", pdfId: "pdf-R" })
      await bulkReplace([], [], [], [], [], [], [], [], [], [], [remote], [local])

      const all = await getAllReadLater()
      expect(all).toHaveLength(1)
      expect(all[0].id).toBe(remote.id)
    })

    it("readLater: cross-device conflict (same pdfId, different ids) keeps remote without ConstraintError", async () => {
      // Device A read-later'd pdf-X as a1; device B has its own b1 for the
      // same pdf. B downloads A's payload → put(a1) must clear local b1 first
      // (unique byPdfId index) or the whole tx aborts.
      const localB = createReadLater({ title: "B", pdfId: "pdf-X" })
      await addReadLater(localB)
      const remoteA = createReadLater({ title: "A", pdfId: "pdf-X" })

      await expect(
        bulkReplace([], [], [], [], [], [], [], [], [], [], [remoteA], [localB])
      ).resolves.not.toThrow()

      const all = await getAllReadLater()
      expect(all).toHaveLength(1)
      expect(all[0].id).toBe(remoteA.id)
      expect(all[0].title).toBe("A")
    })

    it("readLater: skipped-duplicate edge — kept remote clears the local record holding its pdfId", async () => {
      // Remote carries two records for pdf-X (rl1 kept, rl2 skipped). Local b1
      // holds pdf-X. The kept rl1's pre-delete must clear b1 even though b1
      // "matches" the skipped duplicate.
      const localB = createReadLater({ title: "B", pdfId: "pdf-X" })
      await addReadLater(localB)
      const rl1 = createReadLater({ title: "A", pdfId: "pdf-X" })
      const rl2 = createReadLater({ title: "C", pdfId: "pdf-X" })

      await bulkReplace([], [], [], [], [], [], [], [], [], [], [rl1, rl2], [localB])

      const all = await getAllReadLater()
      expect(all).toHaveLength(1)
      expect(all[0].id).toBe(rl1.id)
    })
  })

  describe("getRecentItems", () => {
    it("groups a card under every day it was reviewed (not just the latest)", async () => {
      const yesterday = Date.now() - 86400000
      const today = Date.now()
      const c1: ProjectCard = createTestProjectCard({ id: "g1" })
      const c2: ProjectCard = createTestProjectCard({ id: "g2" })
      await addProjectCard(c1)
      await addProjectCard(c2)

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

      const reviews = await getAllReviews()
      const groups = getRecentItems([c1, c2], reviews, 3)
      expect(groups).toHaveLength(2)
      const todayGroup = groups.find((g) => g.date === dayKey(today))
      const yesterdayGroup = groups.find((g) => g.date === dayKey(yesterday))
      expect(todayGroup?.items.map((c) => c.id).sort()).toEqual(["g1", "g2"])
      expect(yesterdayGroup?.items.map((c) => c.id)).toEqual(["g1"])
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
    const id = await addPdf(pdf)
    expect((await getPdf(id))?.name).toBe("paper.pdf")
    expect(await listPdfs()).toHaveLength(1)
    await deletePdf(id)
    expect(await getPdf(id)).toBeUndefined()
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
    expect(card.annotationId).toBe(annotation.id)
    expect(card.page).toBe(3)
    expect(card.pdfId).toBe("pdf-a")
    expect(annotation.cardId).toBe(card.id)
    expect(annotation.kind).toBe("text")
    expect(annotation.text).toBe("关键段落")

    const cards = await getPdfCards("pdf-a")
    expect(cards).toHaveLength(1)
    expect(cards[0].id).toBe(card.id)
    expect(await getPdfCards("pdf-other")).toHaveLength(0)
  })

  it("concurrent saveAnnotationFromStore on the same annotation creates ONE card (A5)", async () => {
    const input = {
      pdfId: "pdf-race",
      store: {
        id: "ann-race",
        pageNumber: 1,
        type: 1,
        konvaClientRect: { x: 10, y: 20, width: 30, height: 40 },
        contentsObj: { selectedText: "并发竞态" }
      },
      pos: { x: 10, y: 20 }
    }
    const [a, b] = await Promise.all([
      saveAnnotationFromStore(input),
      saveAnnotationFromStore(input)
    ])
    expect(a.id).toBe("ann-race")
    expect(a.cardId).toBe(b.cardId)
    const cards = await getPdfCards("pdf-race")
    expect(cards).toHaveLength(1)
    expect(cards[0].annotationId).toBe("ann-race")
    const anns = await getAllAnnotations()
    expect(anns.filter((x) => x.id === "ann-race")).toHaveLength(1)
  })

  it("type switch on saveAnnotationFromStore propagates to the pdfCard (B5)", async () => {
    const { card } = await createTextAnnotationCard({
      pdfId: "pdf-type",
      page: 1,
      type: "highlight",
      text: "类型切换",
      startOffset: 0,
      endOffset: 4
    })
    expect(card.type).toBe("highlight")
    // Re-save the same annotation as an underline (engine type 3 → mark).
    await saveAnnotationFromStore({
      pdfId: "pdf-type",
      store: {
        id: card.annotationId,
        pageNumber: 1,
        type: 3,
        konvaClientRect: { x: 0, y: 0, width: 10, height: 10 },
        contentsObj: { selectedText: "类型切换" }
      },
      pos: { x: 0, y: 0 }
    })
    const pdfCards = await getPdfCards("pdf-type")
    expect(pdfCards[0].id).toBe(card.id)
    expect(pdfCards[0].type).toBe("underline")
  })

  it("deletes annotation + card together (both directions)", async () => {
    const { annotation } = await createTextAnnotationCard({
      pdfId: "pdf-b",
      page: 1,
      type: "underline",
      text: "x",
      startOffset: 0,
      endOffset: 1
    })
    // delete via annotation
    await deleteAnnotationWithCard(annotation.id)
    expect(await getPdfCards("pdf-b")).toHaveLength(0)
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
    await deletePdfCards([c2])
    expect(await getPdfCards("pdf-c")).toHaveLength(0)
    expect(await getAnnotation(a2.id)).toBeUndefined()
  })
})

describe("pdf region annotations (框选)", () => {
  it("creates a frame annotation + compact card atomically (no image)", async () => {
    const { card, annotation } = await createRegionAnnotationCard({
      pdfId: "pdf-region",
      page: 2,
      rects: [{ x: 0.1, y: 0.2, w: 0.5, h: 0.3 }]
    })
    expect(card.kind).toBe("region")
    expect(card.content).toBeUndefined()
    expect(card.pdfId).toBe("pdf-region")
    expect(annotation.kind).toBe("region")
    expect(annotation.type).toBe("frame")
    expect(annotation.rects?.[0]).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.3 })
    expect(annotation.cardId).toBe(card.id)

    const cards = await getPdfCards("pdf-region")
    expect(cards).toHaveLength(1)
    expect(cards[0].kind).toBe("region")
  })
})

describe("pdf delete cascade + lastOpened", () => {
  it("touchPdf updates lastOpened", async () => {
    const id = await addPdf({
      id: "pdf-t",
      name: "a.pdf",
      bytes: new Blob(["x"]),
      pageCount: 1,
      addedAt: 1000
    })
    await touchPdf(id)
    const pdf = await getPdf(id)
    expect(pdf?.lastOpened).toBeGreaterThanOrEqual(1000)
  })

  it("deletePdf removes the pdf, its annotations and its cards", async () => {
    const pdfId = await addPdf({
      id: "pdf-del",
      name: "del.pdf",
      bytes: new Blob(["y"]),
      pageCount: 1,
      addedAt: 1
    })
    const { card } = await createTextAnnotationCard({
      pdfId,
      page: 1,
      type: "highlight",
      text: "x",
      startOffset: 0,
      endOffset: 1
    })
    await deletePdf(pdfId)
    expect(await getPdf(pdfId)).toBeUndefined()
    expect(await getPdfCards(pdfId)).toHaveLength(0)
    expect(await getAnnotation(card.annotationId)).toBeUndefined()
  })

  it("deletePdf also removes the read-later card bound to the PDF", async () => {
    const pdfId = await addPdf({
      id: "pdf-del-rl",
      name: "del-rl.pdf",
      bytes: new Blob(["y"]),
      pageCount: 1,
      addedAt: 1
    })
    const rl = createReadLater({ title: "del-rl.pdf", pdfId })
    expect(await addReadLater(rl)).toBe(true)
    await deletePdf(pdfId)
    expect(await getPdf(pdfId)).toBeUndefined()
    expect(await getReadLaterByPdfId(pdfId)).toBeUndefined()
  })
})

describe("pdf content-hash id + notes-only sync", () => {
  it("addPdf computes a content-hash id and dedups identical files", async () => {
    const bytes = new Blob(["same-content"], { type: "application/pdf" })
    const id1 = await addPdf({ id: "x", name: "a.pdf", bytes, pageCount: 1, addedAt: 1 })
    const id2 = await addPdf({ id: "y", name: "b.pdf", bytes, pageCount: 1, addedAt: 2 })
    expect(id1).toBe(id2)
    expect(id1).toHaveLength(64)
    const list = await listPdfs()
    expect(list.filter((p) => p.id === id1)).toHaveLength(1)
  })

  it("a placeholder is filled when the matching file opens, and real bytes are never clobbered by a placeholder", async () => {
    const bytes = new Blob(["paper"], { type: "application/pdf" })
    // learn the content-hash id from the real file first
    const realId = await addPdf({ id: "r", name: "p.pdf", bytes, pageCount: 0, addedAt: 1 })
    // a later synced placeholder with the same id must NOT clobber the file
    await addPdf({ id: realId, name: "p.pdf", bytes: null, pageCount: 0, addedAt: 2 })
    expect((await getPdf(realId))?.bytes).toBeTruthy()
    // reverse: placeholder first, then the file opens → fills it
    await deletePdf(realId)
    await addPdf({ id: realId, name: "p.pdf", bytes: null, pageCount: 0, addedAt: 3 })
    expect((await getPdf(realId))?.bytes).toBeNull()
    await addPdf({ id: "whatever", name: "p.pdf", bytes, pageCount: 0, addedAt: 4 })
    expect((await getPdf(realId))?.bytes).toBeTruthy()
  })

  it("applyPdfSync upserts annotations and deletes local-not-in-remote", async () => {
    const remoteAnn: PdfAnnotation = {
      id: "ra1", pdfId: "pdf-s", page: 1, kind: "text", type: "highlight",
      startOffset: 0, endOffset: 1, text: "x", createdAt: 1
    }
    const localAnn: PdfAnnotation = {
      id: "la1", pdfId: "pdf-s", page: 1, kind: "text", type: "underline",
      startOffset: 0, endOffset: 1, text: "y", createdAt: 2
    }
    await addAnnotation(localAnn)
    await applyPdfSync([{ id: "pdf-s", name: "s.pdf", pageCount: 1, addedAt: 1 }], [remoteAnn], [localAnn])
    expect((await getAnnotation("ra1"))?.text).toBe("x")
    expect(await getAnnotation("la1")).toBeUndefined()
    expect((await getPdf("pdf-s"))?.bytes).toBeNull()
  })

  it("applyPdfSync creates the missing pdfCard for a remote annotation (1:1 guard)", async () => {
    const remoteAnn: PdfAnnotation = {
      id: "ra-no-card", pdfId: "pdf-1to1", page: 2, kind: "text", type: "highlight",
      pos: { x: 0.3, y: 0.4 }, text: "x", createdAt: 1, updatedAt: 1
    }
    await applyPdfSync(
      [{ id: "pdf-1to1", name: "a.pdf", pageCount: 3, addedAt: 1 }],
      [remoteAnn],
      []
    )
    const cards = await getPdfCards("pdf-1to1")
    const card = cards.find((c) => c.annotationId === "ra-no-card")
    expect(card).toBeDefined()
    expect(card?.type).toBe("highlight")
    expect(card?.page).toBe(2)
  })

  it("stores an AI interpretation in the newly-created PDF card comment", async () => {
    await saveAnnotationFromStore({
      pdfId: "pdf-ai-note",
      store: {
        id: "ann-ai-note",
        pageNumber: 2,
        type: 1,
        konvaClientRect: { x: 10, y: 20, width: 30, height: 10 },
        contentsObj: { selectedText: "需要解释的原文" }
      },
      pos: { x: 0.2, y: 0.3 },
      comment: "这是 AI 生成的解读"
    })
    const cards = await getPdfCards("pdf-ai-note")
    expect(cards).toHaveLength(1)
    expect(cards[0].comment).toBe("这是 AI 生成的解读")
  })

  it("stores the last visible page", async () => {
    const id = await addPdf({
      id: "pdf-progress",
      name: "progress.pdf",
      bytes: new Blob(["progress"]),
      pageCount: 12,
      addedAt: 1
    })
    await updatePdfLastPage(id, 7)
    expect((await getPdf(id))?.lastPage).toBe(7)
  })

  it("stores and clears the PDF AI context", async () => {
    const id = await addPdf({
      id: "pdf-ai-context",
      name: "ai.pdf",
      bytes: new Blob(["ai-context"]),
      pageCount: 2,
      addedAt: 1
    })
    await updatePdfAiContext(id, "  用中文解释关键概念  ")
    expect((await getPdf(id))?.aiContext).toBe("用中文解释关键概念")
    await updatePdfAiContext(id, undefined)
    expect((await getPdf(id))?.aiContext).toBeUndefined()
  })

  it("applyPdfSync cascades removed annotations to pdfCards, placements, and reviews", async () => {
    await addProject({ id: "proj-sync-del", name: "SYNC-DEL", createdAt: 1 })
    const { annotation, card } = await createTextAnnotationCard({
      pdfId: "pdf-sync-del",
      page: 1,
      type: "highlight",
      startOffset: 0,
      endOffset: 4,
      text: "gone"
    })
    await placePdfCards([card.id], "proj-sync-del")
    const placed = (await getPdfCards("pdf-sync-del"))[0]
    await addReview({
      id: "rev-sync-del",
      itemId: placed.projectCardId!,
      projectId: "proj-sync-del",
      status: "active",
      dueDate: Date.now(),
      addedAt: Date.now(),
      srs: { dueDate: Date.now(), interval: 0, easeFactor: 2.5, reviewCount: 0, lastReviewDate: 0 }
    })

    await applyPdfSync(
      [{ id: "pdf-sync-del", name: "sync.pdf", pageCount: 1, addedAt: 1 }],
      [],
      [annotation]
    )

    expect(await getAnnotation(annotation.id)).toBeUndefined()
    expect(await getPdfCards("pdf-sync-del")).toHaveLength(0)
    expect(await getProjectCardById(placed.projectCardId!)).toBeUndefined()
    expect(await getReviewByItemId(placed.projectCardId!)).toBeUndefined()
  })
})

describe("PDF vocabulary cards", () => {
  it("keeps one card and one normalized term per PDF while appending translations", async () => {
    const first = await addVocabularyEntry({
      pdfId: "pdf-vocab",
      page: 1,
      term: "  Semantic   Drift ",
      translation: "语义漂移",
      rects: [{ x: 0.1, y: 0.2, w: 0.2, h: 0.03 }]
    })
    const second = await addVocabularyEntry({
      pdfId: "pdf-vocab",
      page: 2,
      term: "semantic drift",
      translation: "含义逐渐变化",
      rects: [{ x: 0.2, y: 0.3, w: 0.2, h: 0.03 }]
    })

    expect(normalizeVocabularyTerm(" Semantic   Drift ")).toBe("semantic drift")
    expect(second.card.id).toBe(first.card.id)
    expect(second.card.entries).toHaveLength(1)
    expect(second.entry.translations.map((item) => item.text)).toEqual([
      "语义漂移",
      "含义逐渐变化"
    ])
    expect(second.entry.occurrences).toHaveLength(2)
    expect(await getAllVocabularyCards()).toHaveLength(1)

    const projects = await listProjects()
    const vocabularyProject = projects.find(
      (project) => project.systemKind === "vocabulary"
    )
    expect(vocabularyProject?.name).toBe("生词")
    const placement = await getProjectCardById(second.card.projectCardId)
    expect(placement?.pdfVocabularyCardId).toBe(second.card.id)
  })

  it("removes the aggregate card and placement after its final entry", async () => {
    const added = await addVocabularyEntry({
      pdfId: "pdf-vocab-delete",
      page: 1,
      term: "derive",
      translation: "推导",
      rects: [{ x: 0.1, y: 0.2, w: 0.1, h: 0.03 }]
    })
    await deleteVocabularyEntry(added.card.id, added.entry.id)
    expect(await getVocabularyCardByPdf("pdf-vocab-delete")).toBeUndefined()
    expect(await getProjectCardById(added.card.projectCardId)).toBeUndefined()
  })

  it("edits, reorders and deletes individual translations", async () => {
    const first = await addVocabularyEntry({
      pdfId: "pdf-vocab-manage",
      page: 1,
      term: "robust",
      translation: "稳健的",
      rects: []
    })
    const second = await addVocabularyEntry({
      pdfId: "pdf-vocab-manage",
      page: 1,
      term: "robust",
      translation: "强健的",
      rects: []
    })
    const [translationA, translationB] = second.entry.translations

    await updateVocabularyTranslation(
      first.card.id,
      first.entry.id,
      translationA.id,
      "鲁棒的"
    )
    await moveVocabularyTranslation(
      first.card.id,
      first.entry.id,
      translationB.id,
      -1
    )
    let card = await getVocabularyCardByPdf("pdf-vocab-manage")
    expect(card?.entries[0].translations.map((item) => item.text)).toEqual([
      "强健的",
      "鲁棒的"
    ])

    await deleteVocabularyTranslation(
      first.card.id,
      first.entry.id,
      translationB.id
    )
    card = await getVocabularyCardByPdf("pdf-vocab-manage")
    expect(card?.entries[0].translations.map((item) => item.text)).toEqual([
      "鲁棒的"
    ])
    await expect(
      deleteVocabularyTranslation(
        first.card.id,
        first.entry.id,
        translationA.id
      )
    ).rejects.toThrow("至少保留一个翻译")
  })
})

describe("updatePdfTopic", () => {
  it("sets / clears a PDF's topic", async () => {
    const pdf = { id: "t-pdf", name: "a.pdf", bytes: new Blob(["x"]), pageCount: 1, addedAt: 1 }
    const id = await addPdf(pdf)
    await updatePdfTopic(id, "深度学习")
    expect((await getPdf(id))?.topic).toBe("深度学习")
    await updatePdfTopic(id, undefined)
    expect((await getPdf(id))?.topic).toBeUndefined()
  })
})

describe("addPdf placeholder topic preservation", () => {
  it("keeps the topic when a synced placeholder is filled with real bytes", async () => {
    const bytes = new Blob(["fill-topic"], { type: "application/pdf" })
    const id = await sha256Bytes(bytes)
    // Synced placeholder first (metadata with topic, no bytes).
    await addPdf({ id, name: "p.pdf", bytes: null, pageCount: 3, addedAt: 1, topic: "Math" })
    // Then the real file is opened locally (no topic in the record).
    await addPdf({ id: "any", name: "p.pdf", bytes, pageCount: 3, addedAt: 1 })
    expect((await getPdf(id))?.topic).toBe("Math")
    expect((await getPdf(id))?.bytes).not.toBeNull()
  })
})

describe("placePdfCard / unplacePdfCard", () => {
  it("places into 未分类 + unplaces back to PDF-only", async () => {
    await addProject({
      id: "proj-pl",
      name: "PL",
      createdAt: Date.now()
    })
    const proj = (await getProjectByName("PL"))!
    const { card } = await createTextAnnotationCard({
      pdfId: "p1",
      page: 3,
      type: "highlight",
      startOffset: 0,
      endOffset: 5,
      text: "hello"
    })
    await placePdfCard(card.id, proj.id)
    const placed = await getPdfCards("p1")
    expect(placed).toHaveLength(1)
    expect(placed[0].projectCardId).toBeDefined()
    const placements = await searchProjectCards({ projectId: proj.id })
    expect(placements).toHaveLength(1)
    expect(placements[0].pdfCardId).toBe(card.id)
    expect(placements[0].sectionId).toBeUndefined()
    expect(placements[0].order).toBeGreaterThanOrEqual(0)
    await unplacePdfCard(card.id)
    const unplaced = await getPdfCards("p1")
    expect(unplaced[0].projectCardId).toBeUndefined()
    expect(unplaced[0].pdfId).toBe("p1")
    expect(await searchProjectCards({ projectId: proj.id })).toHaveLength(0)
  })
})

describe("deleteProject preserves PDF-sourced cards", () => {
  it("unplaces (keeps) a placed PDF card when its project is deleted", async () => {
    await addProject({ id: "proj-d", name: "D", createdAt: 1 })
    const { card } = await createTextAnnotationCard({
      pdfId: "p1",
      page: 2,
      type: "underline",
      startOffset: 0,
      endOffset: 3,
      text: "abc"
    })
    await placePdfCard(card.id, "proj-d")
    await deleteProject("proj-d")
    const kept = await getPdfCards("p1")
    expect(kept).toHaveLength(1)
    expect(kept[0].projectCardId).toBeUndefined()
    expect(kept[0].pdfId).toBe("p1")
    expect(await searchProjectCards({ projectId: "proj-d" })).toHaveLength(0)
  })
})

describe("placePdfCards / unplacePdfCards (batch)", () => {
  it("places + unplaces multiple cards in one call, assigning sequential orders", async () => {
    await addProject({ id: "proj-b", name: "B", createdAt: 1 })
    const c1 = await createTextAnnotationCard({
      pdfId: "p1",
      page: 1,
      type: "highlight",
      startOffset: 0,
      endOffset: 2,
      text: "ab"
    })
    const c2 = await createTextAnnotationCard({
      pdfId: "p1",
      page: 1,
      type: "underline",
      startOffset: 2,
      endOffset: 4,
      text: "cd"
    })
    await placePdfCards([c1.card.id, c2.card.id], "proj-b")
    const placed = await searchProjectCards({ projectId: "proj-b" })
    expect(placed).toHaveLength(2)
    const placed1 = placed.find((p) => p.pdfCardId === c1.card.id)!
    const placed2 = placed.find((p) => p.pdfCardId === c2.card.id)!
    expect(placed1.projectId).toBe("proj-b")
    expect(placed2.projectId).toBe("proj-b")
    expect(placed1.order).toBeGreaterThanOrEqual(0)
    expect(placed2.order).toBe(placed1.order! + 1)
    await unplacePdfCards([c1.card.id, c2.card.id])
    expect(await searchProjectCards({ projectId: "proj-b" })).toHaveLength(0)
    const after = await getPdfCards("p1")
    expect(after.every((pc) => pc.projectCardId === undefined)).toBe(true)
  })
})

describe("PDF delete cascades reviews (no orphans)", () => {
  it("deletePdfCards removes the placement's review too", async () => {
    await addProject({ id: "proj-or1", name: "OR1", createdAt: 1 })
    const c = await createTextAnnotationCard({
      pdfId: "p-or1",
      page: 1,
      type: "highlight",
      startOffset: 0,
      endOffset: 1,
      text: "x"
    })
    await placePdfCards([c.card.id], "proj-or1")
    const placed = (await getPdfCards("p-or1"))[0]
    await addReview({
      id: "rev-or1",
      itemId: placed.projectCardId!,
      projectId: "proj-or1",
      status: "active",
      dueDate: Date.now(),
      addedAt: Date.now(),
      srs: { dueDate: Date.now(), interval: 0, easeFactor: 2.5, reviewCount: 0, lastReviewDate: 0 }
    })
    await deletePdfCards([placed])
    expect(await getReviewByItemId(placed.projectCardId!)).toBeUndefined()
  })
})

describe("unplace clears the card's review (only project cards are reviewable)", () => {
  it("移出项目 drops the review alongside the projectId", async () => {
    await addProject({ id: "proj-u1", name: "U1", createdAt: 1 })
    const c = await createTextAnnotationCard({
      pdfId: "p-u1",
      page: 1,
      type: "highlight",
      startOffset: 0,
      endOffset: 1,
      text: "y"
    })
    await placePdfCards([c.card.id], "proj-u1")
    const placed = (await getPdfCards("p-u1"))[0]
    await addReview({
      id: "rev-u1",
      itemId: placed.projectCardId!,
      projectId: "proj-u1",
      status: "active",
      dueDate: Date.now(),
      addedAt: Date.now(),
      srs: { dueDate: Date.now(), interval: 0, easeFactor: 2.5, reviewCount: 0, lastReviewDate: 0 }
    })
    await unplacePdfCards([c.card.id])
    expect(await getProjectCardById(placed.projectCardId!)).toBeUndefined()
    expect(await getReviewByItemId(placed.projectCardId!)).toBeUndefined()
  })
})

describe("v12 migration: items → three typed stores", () => {
  const openRaw = (version: number) =>
    new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open("pickquote-db", version)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(req.result)
    })

  it("v12 → v13 with items still present (partial migration) never aborts", async () => {
    // A v12 DB whose v12 data-migration never completed: items is still there
    // alongside the three typed stores. Upgrading must NOT abort — the re-run
    // of the split must tolerate the pre-existing stores + any bad item.
    const legacy = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open("pickquote-db", 12)
      req.onupgradeneeded = () => {
        const d = req.result
        const items = d.createObjectStore("items", { keyPath: "id" })
        items.createIndex("type", "type")
        items.createIndex("projectId", "projectId")
        d.createObjectStore("projectCards", { keyPath: "id" }).createIndex(
          "projectId",
          "projectId"
        )
        d.createObjectStore("todos", { keyPath: "id" }).createIndex(
          "dueDate",
          "dueDate"
        )
        d.createObjectStore("pdfCards", { keyPath: "id" }).createIndex(
          "pdfId",
          "pdfId"
        )
        d.createObjectStore("projects", { keyPath: "id" }).createIndex(
          "name",
          "name",
          { unique: true }
        )
        const revs = d.createObjectStore("reviews", { keyPath: "id" })
        revs.createIndex("itemId", "itemId", { unique: true })
        revs.createIndex("dueDate", "dueDate")
        d.createObjectStore("pdfs", { keyPath: "id" }).createIndex(
          "addedAt",
          "addedAt"
        )
        d.createObjectStore("pdfAnnotations", { keyPath: "id" }).createIndex(
          "pdfId",
          "pdfId"
        )
        const tx = req.transaction as IDBTransaction
        // The already-typed stores carry data from the earlier partial run…
        tx.objectStore("projectCards").put({
          id: "already-placed",
          projectId: "p1",
          order: 1,
          content: "",
          type: "placed",
          pdfCardId: "already-pdfcard",
          createdAt: 1
        })
        tx.objectStore("pdfCards").put({
          id: "already-pdfcard",
          pdfId: "pdf-x",
          page: 1,
          kind: "region",
          type: "frame",
          annotationId: "ann-x",
          pdfOrder: 1000000,
          projectCardId: "already-placed",
          createdAt: 1
        })
        tx.objectStore("projects").put({
          id: "p1",
          name: "P",
          createdAt: 1,
          lastOpened: 1,
          order: 0
        })
        tx.objectStore("pdfAnnotations").put({
          id: "ann-x",
          pdfId: "pdf-x",
          page: 1,
          kind: "region",
          type: "frame",
          cardId: "already-pdfcard",
          createdAt: 1
        })
        // …and items still holds its records (one well-formed, one malformed).
        tx.objectStore("items").put({
          id: "todo-legacy",
          type: "todo",
          content: "- [ ] x",
          createdAt: 1
        })
        tx.objectStore("items").put({
          id: "broken-item",
          type: "text",
          pdfRef: { pdfId: "pdf-x", page: 1, annotationId: "ann-missing" },
          createdAt: 1
        })
      }
      req.onsuccess = () => resolve(req.result)
    })
    legacy.close()

    // Any DB call now opens at DB_VERSION (13) — must not abort.
    await getPdf("pdf-x")
    const cards = await getPdfCards("pdf-x")
    expect(cards.map((c) => c.id)).toContain("already-pdfcard")
    expect((await getAllTodos()).map((t) => t.id)).toContain("todo-legacy")

    const upgraded = await openRaw(DB_VERSION)
    const names = Array.from(upgraded.objectStoreNames)
    expect(names).toContain("projectCards")
    expect(names).not.toContain("items")
    upgraded.close()
  })

  it("v12 → v13 upgrade preserves ALL existing data (regression: no data loss)", async () => {
    // Build a REAL v12 DB (the current schema minus the v13 index drops) and
    // seed one record of every kind — the v12→v13 migration must keep them.
    const legacy = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open("pickquote-db", 12)
      req.onupgradeneeded = () => {
        const d = req.result
        const pc = d.createObjectStore("projectCards", { keyPath: "id" })
        pc.createIndex("projectId", "projectId")
        pc.createIndex("hash", "hash")
        pc.createIndex("pdfCardId", "pdfCardId")
        pc.createIndex("type", "type")
        pc.createIndex("createdAt", "createdAt")
        pc.createIndex("sourceSite", "sourceSite")
        d.createObjectStore("todos", { keyPath: "id" }).createIndex(
          "dueDate",
          "dueDate"
        )
        const pd = d.createObjectStore("pdfCards", { keyPath: "id" })
        pd.createIndex("pdfId", "pdfId")
        pd.createIndex("annotationId", "annotationId")
        pd.createIndex("projectCardId", "projectCardId")
        d.createObjectStore("projects", { keyPath: "id" }).createIndex(
          "name",
          "name",
          { unique: true }
        )
        const rs = d.createObjectStore("reviews", { keyPath: "id" })
        rs.createIndex("itemId", "itemId", { unique: true })
        rs.createIndex("projectId", "projectId")
        rs.createIndex("status", "status")
        rs.createIndex("dueDate", "dueDate")
        d.createObjectStore("pdfs", { keyPath: "id" }).createIndex(
          "addedAt",
          "addedAt"
        )
        d.createObjectStore("pdfAnnotations", { keyPath: "id" }).createIndex(
          "pdfId",
          "pdfId"
        )
        const tx = req.transaction as IDBTransaction
        tx.objectStore("projects").put({
          id: "p1",
          name: "项目A",
          createdAt: 1,
          lastOpened: 1,
          order: 0
        })
        tx.objectStore("projectCards").put({
          id: "card-1",
          projectId: "p1",
          sectionId: undefined,
          order: 1,
          content: "文本卡内容",
          type: "text",
          createdAt: 1
        })
        tx.objectStore("todos").put({
          id: "todo-1",
          content: "- [ ] 待办",
          createdAt: 1
        })
        tx.objectStore("reviews").put({
          id: "rev-1",
          itemId: "card-1",
          projectId: "p1",
          srs: {
            dueDate: 1,
            interval: 1,
            easeFactor: 2.5,
            reviewCount: 1,
            lastReviewDate: 1
          },
          status: "active",
          dueDate: 1,
          addedAt: 1
        })
        tx.objectStore("pdfs").put({
          id: "pdf-1",
          name: "doc.pdf",
          bytes: new Blob(["%PDF-fake"], { type: "application/pdf" }),
          pageCount: 1,
          addedAt: 1
        })
        tx.objectStore("pdfAnnotations").put({
          id: "ann-1",
          pdfId: "pdf-1",
          page: 1,
          kind: "region",
          type: "frame",
          rects: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }],
          cardId: "pdfcard-1",
          store: { id: "ann-1", konvaString: "{}" },
          createdAt: 1
        })
        tx.objectStore("pdfCards").put({
          id: "pdfcard-1",
          pdfId: "pdf-1",
          page: 1,
          kind: "region",
          type: "frame",
          annotationId: "ann-1",
          pdfOrder: 1000000,
          projectCardId: "placed-1",
          createdAt: 1
        })
        tx.objectStore("projectCards").put({
          id: "placed-1",
          projectId: "p1",
          sectionId: undefined,
          order: 2,
          content: "",
          type: "placed",
          pdfCardId: "pdfcard-1",
          createdAt: 1
        })
      }
      req.onsuccess = () => resolve(req.result)
    })
    legacy.close()

    // A real DB call opens at DB_VERSION (13) — the migration runs.
    const pdf = await getPdf("pdf-1")
    expect(pdf?.name).toBe("doc.pdf")
    expect(pdf?.bytes).not.toBeNull()
    expect((await getAnnotation("ann-1"))?.cardId).toBe("pdfcard-1")
    expect((await getPdfCards("pdf-1")).map((c) => c.id)).toContain("pdfcard-1")
    expect((await getAllTodos()).map((t) => t.id)).toContain("todo-1")
    const projects = await listProjects()
    expect(projects.map((p) => p.id)).toContain("p1")
    const cards = await searchProjectCards({ projectId: "p1" })
    expect(cards.map((c) => c.id)).toEqual(
      expect.arrayContaining(["card-1", "placed-1"])
    )
    expect((await getAllReviews()).length).toBeGreaterThan(0)

    // The upgrade must NOT have re-created the legacy items store.
    const upgraded = await openRaw(DB_VERSION)
    expect(Array.from(upgraded.objectStoreNames)).not.toContain("items")
    upgraded.close()
  })

  it("splits todos / pdf-only / placed / plain cards + remaps reviews + mutual refs", async () => {
    // Build a legacy v11 DB with the items store + seed four card kinds.
    const legacy = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open("pickquote-db", 11)
      req.onupgradeneeded = () => {
        const d = req.result
        const items = d.createObjectStore("items", { keyPath: "id" })
        items.createIndex("type", "type")
        items.createIndex("projectId", "projectId")
        items.createIndex("pdfRefPdfId", "pdfRefPdfId")
        const anns = d.createObjectStore("pdfAnnotations", { keyPath: "id" })
        anns.createIndex("pdfId", "pdfId")
        const revs = d.createObjectStore("reviews", { keyPath: "id" })
        revs.createIndex("itemId", "itemId", { unique: true })
        revs.createIndex("dueDate", "dueDate")
        const annId = "ann-1"
        const tx = req.transaction as IDBTransaction
        tx.objectStore("items").put({
          id: "todo-1",
          type: "todo",
          content: "- [ ] a",
          createdAt: 1
        })
        tx.objectStore("items").put({
          id: "plain-1",
          type: "text",
          content: "hello",
          projectId: "p1",
          createdAt: 2
        })
        tx.objectStore("items").put({
          id: "pdfonly-1",
          type: "text",
          content: "quote-only",
          projectId: undefined,
          pdfRef: { pdfId: "pdf-1", page: 2, annotationId: annId },
          pdfRefPdfId: "pdf-1",
          pdfOrder: 2000005,
          createdAt: 3
        })
        tx.objectStore("items").put({
          id: "placed-1",
          type: "text",
          content: "quote-placed",
          projectId: "p1",
          pdfRef: { pdfId: "pdf-1", page: 3, annotationId: annId },
          pdfRefPdfId: "pdf-1",
          pdfOrder: 3000001,
          comment: "备注",
          createdAt: 4
        })
        tx.objectStore("pdfAnnotations").put({
          id: annId,
          pdfId: "pdf-1",
          page: 2,
          kind: "text",
          type: "highlight",
          itemId: "placed-1",
          text: "quote-placed",
          createdAt: 4
        })
        tx.objectStore("reviews").put({
          id: "rev-2",
          itemId: "pdfonly-1",
          projectId: "",
          srs: {
            dueDate: 1,
            interval: 0,
            easeFactor: 2.5,
            reviewCount: 0,
            lastReviewDate: 0
          },
          status: "active",
          dueDate: 1,
          addedAt: 3
        })
        tx.objectStore("reviews").put({
          id: "rev-1",
          itemId: "placed-1",
          projectId: "p1",
          srs: {
            dueDate: 1,
            interval: 0,
            easeFactor: 2.5,
            reviewCount: 0,
            lastReviewDate: 0
          },
          status: "active",
          dueDate: 1,
          addedAt: 4
        })
      }
      req.onsuccess = () => resolve(req.result)
    })
    legacy.close()

    // Open at the current version — the migration converts + drops the items
    // store.
    await addTodo({
      id: "t0",
      content: "- [ ] x",
      createdAt: 0
    })

    // Todos store.
    const todos = await getAllTodos()
    expect(todos.map((t) => t.id)).toContain("todo-1")

    // Plain card → projectCards.
    const cards = await searchProjectCards({ projectId: "p1" })
    const plain = cards.find((c) => c.id === "plain-1")
    expect(plain?.content).toBe("hello")

    // pdf-only → pdfCards with no placement.
    const pdfCards = await getPdfCards("pdf-1")
    const pdfOnly = pdfCards.find((c) => c.id === "pdfonly-1")
    expect(pdfOnly?.pdfOrder).toBe(2000005)
    expect(pdfOnly?.projectCardId).toBeUndefined()

    // placed → pdfCard + a placement with mutual refs.
    const placed = pdfCards.find((c) => c.id === "placed-1")
    expect(placed?.projectCardId).toBeDefined()
    const placement = cards.find((c) => c.id === placed!.projectCardId)
    expect(placement?.projectId).toBe("p1")
    expect(placement?.pdfCardId).toBe(placed!.id)
    // The placement carries no content (reference model).
    expect(placement?.content).toBe("")

    // The review remapped to the placement id.
    const review = await getReviewByItemId(placed!.projectCardId!)
    expect(review?.id).toBe("rev-1")
    // A legacy pdf-only card's review is a phantom (only project cards
    // review) — the migration drops it.
    expect(await getReviewByItemId("pdfonly-1")).toBeUndefined()

    // The old items store is gone; the annotation's itemId → cardId.
    const db = await openRaw(DB_VERSION)
    const names = Array.from(db.objectStoreNames)
    expect(names).not.toContain("items")
    expect(names).toContain("projectCards")
    expect(names).toContain("pdfCards")
    expect(names).toContain("todos")
    // v13: the dead indexes were dropped.
    const indexNames = (s: string) =>
      Array.from(db.transaction(s).objectStore(s).indexNames)
    expect(indexNames("pdfs")).not.toContain("addedAt")
    expect(indexNames("pdfCards")).not.toContain("annotationId")
    expect(indexNames("pdfCards")).not.toContain("projectCardId")
    expect(indexNames("projectCards")).not.toContain("pdfCardId")
    const anns = await getAnnotationsByPdf("pdf-1")
    const ann = anns.find((a) => a.id === "ann-1")
    expect(ann?.cardId).toBe("placed-1")
    db.close()
  })
})

describe("searchProjectCards resolves placed cards' PDF quotes", () => {
  it("keyword matches the linked pdfCard content even though the placement has none", async () => {
    const { card: pdfCard } = await createTextAnnotationCard({
      pdfId: "p-search",
      page: 1,
      type: "highlight",
      text: "A UNIQUE QUOTE fragment",
      startOffset: 0,
      endOffset: 10
    })
    await addProject({ id: "proj-search", name: "S", createdAt: 1 })
    await placePdfCards([pdfCard.id], "proj-search")
    const placed = (await getPdfCards("p-search"))[0]
    expect(placed.projectCardId).toBeDefined()
    const hits = await searchProjectCards({
      keyword: "UNIQUE QUOTE",
      projectId: "proj-search"
    })
    expect(hits.map((c) => c.id)).toContain(placed.projectCardId)
  })

  it("updateProjectCard strips content from a placement even when the caller passes it (A7)", async () => {
    const { card: pdfCard } = await createTextAnnotationCard({
      pdfId: "p-strip",
      page: 1,
      type: "highlight",
      text: "strip me",
      startOffset: 0,
      endOffset: 4
    })
    await addProject({ id: "proj-strip", name: "S2", createdAt: 1 })
    await placePdfCards([pdfCard.id], "proj-strip")
    const placed = (await getPdfCards("p-strip"))[0]
    const placement = await getProjectCardById(placed.projectCardId!)
    expect(placement?.content).toBe("")

    // A stray caller writing content onto the placement must not persist it.
    await updateProjectCard({
      ...placement!,
      content: "should not persist",
      title: placement!.title
    })
    const after = await getProjectCardById(placed.projectCardId!)
    expect(after?.content).toBe("")
  })
})

describe("broadcast write detection", () => {
  const storageSet = chrome.storage.local.set as jest.Mock

  it("skips the broadcast when a guarded write no-ops (missing annotation)", async () => {
    storageSet.mockClear()
    await updateAnnotationImage("missing-ann", "data:image/png;base64,AAAA")
    expect(storageSet.mock.calls.some((c) => "_dbpdf" in c[0])).toBe(false)
  })

  it("broadcasts when a write actually changes data", async () => {
    const { annotation } = await createTextAnnotationCard({
      pdfId: "pdf-bc2",
      page: 1,
      type: "highlight",
      text: "x",
      startOffset: 0,
      endOffset: 1
    })
    storageSet.mockClear()
    await updateAnnotationImage(annotation.id, "data:image/png;base64,AAAA")
    expect(storageSet).toHaveBeenCalledWith({ _dbpdf: expect.any(Number) })
  })
})

describe("todos broadcast `_dbt`", () => {
  const storageSet = chrome.storage.local.set as jest.Mock

  it("a todo write broadcasts the todo stamp, not the card stamp", async () => {
    storageSet.mockClear()
    await addTodo(createTestTodoCard({ id: "todo-bc" }))
    expect(storageSet.mock.calls.some((c) => "_dbt" in c[0])).toBe(true)
    expect(storageSet.mock.calls.some((c) => "_dbi" in c[0])).toBe(false)
  })
})

describe("draft CRUD (isDraft / draftOf)", () => {
  async function makeProject(name: string): Promise<string> {
    const project: Project = {
      id: crypto.randomUUID(),
      name,
      createdAt: Date.now()
    }
    await addProject(project)
    return project.id
  }

  it("saves a create draft, promotes it into a real card, and clears the draft", async () => {
    const projectId = await makeProject("草稿项目")
    await saveDraftCard({
      type: "text",
      title: "",
      content: "草稿内容",
      projectId
    })
    const all = await getAllProjectCards()
    const draft = all.find((c) => c.isDraft)
    expect(draft).toBeDefined()
    expect(draft?.draftOf).toBeUndefined()
    expect(draft?.content).toBe("草稿内容")

    await promoteDraft(draft!.id)
    const after = await getAllProjectCards()
    const promoted = after.find((c) => !c.isDraft && c.content === "草稿内容")
    expect(promoted).toBeDefined()
    expect(after.some((c) => c.isDraft)).toBe(false)
  })

  it("edit draft overwrites the original on promote (id/order preserved) and cascades on delete", async () => {
    const projectId = await makeProject("编辑草稿项目")
    const original = await createTextCardSafe(projectId)
    await saveDraftCard({
      draftOf: original.id,
      type: "text",
      title: "新标题",
      content: "新正文",
      projectId
    })
    const all = await getAllProjectCards()
    const draft = all.find((c) => c.isDraft && c.draftOf === original.id)
    expect(draft).toBeDefined()

    await promoteDraft(draft!.id)
    const after = await getAllProjectCards()
    const updated = after.find((c) => c.id === original.id)
    expect(updated?.title).toBe("新标题")
    expect(updated?.content).toBe("新正文")
    expect(after.some((c) => c.isDraft)).toBe(false)

    // cascade: a new draft is deleted when its original is deleted
    await saveDraftCard({
      draftOf: original.id,
      type: "text",
      title: "",
      content: "x",
      projectId
    })
    await deleteProjectCard(original.id)
    const final = await getAllProjectCards()
    expect(final.some((c) => c.isDraft && c.draftOf === original.id)).toBe(false)
  })
})

async function createTextCardSafe(projectId: string) {
  const card: ProjectCard = {
    id: crypto.randomUUID(),
    type: "text",
    title: "原标题",
    content: "原正文",
    projectId,
    createdAt: Date.now()
  }
  await addProjectCard(card, { skipDedup: true })
  return card
}

describe("draft create-promote dedup", () => {
  it("promoting a draft that duplicates an existing card skips the insert (no dup, no orphan draft)", async () => {
    const project: Project = {
      id: crypto.randomUUID(),
      name: "去重项目",
      createdAt: Date.now()
    }
    await addProject(project)
    // existing card with the same content
    await createTextCard({
      title: "标题",
      content: "相同内容",
      projectId: project.id
    })
    // a create-draft with the same content
    await saveDraftCard({
      type: "text",
      title: "标题",
      content: "相同内容",
      projectId: project.id
    })
    const all = await getAllProjectCards()
    const draft = all.find((c) => c.isDraft)
    expect(draft).toBeDefined()

    await promoteDraft(draft!.id)
    const after = await getAllProjectCards()
    const cards = after.filter((c) => c.content === "相同内容" && !c.isDraft)
    expect(cards).toHaveLength(1) // dedup — no duplicate card
    expect(after.some((c) => c.isDraft)).toBe(false)
  })
})

describe("readLater CRUD", () => {
  const make = (overrides: Partial<ReadLater> = {}): ReadLater =>
    createReadLater({
      title: "稍后阅读",
      url: "https://example.com/article",
      ...overrides
    })

  it("adds, reads, updates, and deletes a read-later record", async () => {
    const item = make()
    expect(await addReadLater(item)).toBe(true)
    expect(await getAllReadLater()).toHaveLength(1)
    expect((await getAllReadLater())[0].status).toBe("unread")

    const updated = { ...item, status: "done" as const, notes: "读完了" }
    expect(await updateReadLater(updated)).toBe(true)
    expect((await getAllReadLater())[0].status).toBe("done")
    expect((await getAllReadLater())[0].notes).toBe("读完了")

    await deleteReadLater(item.id)
    expect(await getAllReadLater()).toHaveLength(0)
  })

  it("enforces the PDF one-card rule: a second record with the same pdfId is rejected", async () => {
    const a = make({ pdfId: "pdf-1" })
    const b = make({ pdfId: "pdf-1" })
    expect(await addReadLater(a)).toBe(true)
    expect(await addReadLater(b)).toBe(false)
    expect(await getAllReadLater()).toHaveLength(1)
    expect(await getReadLaterByPdfId("pdf-1")).toBeDefined()
  })

  it("allows web items (no pdfId) to coexist freely", async () => {
    expect(await addReadLater(make({ url: "https://a.com" }))).toBe(true)
    expect(await addReadLater(make({ url: "https://b.com" }))).toBe(true)
    expect(await getAllReadLater()).toHaveLength(2)
  })

  it("updateReadLater rejects a pdfId collision with another record", async () => {
    const a = make({ pdfId: "pdf-a" })
    const b = make({ pdfId: "pdf-b" })
    await addReadLater(a)
    await addReadLater(b)
    // b tries to take over a's pdfId → rejected.
    expect(await updateReadLater({ ...b, pdfId: "pdf-a" })).toBe(false)
    // a can keep its own pdfId.
    expect(await updateReadLater({ ...a, status: "reading" })).toBe(true)
  })

  it("getActiveReadLaterCount counts only non-done records (badge)", async () => {
    const a = make({ url: "https://a.com" })
    const b = make({ url: "https://b.com" })
    const c = make({ url: "https://c.com" })
    await addReadLater(a) // unread
    await addReadLater(b) // reading
    await addReadLater(c)
    await updateReadLater({ ...c, status: "done" })
    expect(await getActiveReadLaterCount()).toBe(2)
  })

  it("a DONE read-later for a PDF coexists with a new active card (re-add after reading)", async () => {
    const first = make({ pdfId: "pdf-reread" })
    expect(await addReadLater(first)).toBe(true)
    expect(await updateReadLater({ ...first, status: "done" })).toBe(true)
    // The PDF's done card stays archived; a NEW active card may be added.
    const second = make({ title: "重新阅读", pdfId: "pdf-reread" })
    expect(await addReadLater(second)).toBe(true)
    const list = await getAllReadLater()
    expect(list).toHaveLength(2)
    const done = list.find((r) => r.id === first.id)
    expect(done?.status).toBe("done")
    expect(list.find((r) => r.id === second.id)?.status).toBe("unread")
    // The active card is the one returned for the pdfId.
    expect((await getReadLaterByPdfId("pdf-reread"))?.id).toBe(second.id)
  })

  it("an ACTIVE read-later for a PDF still blocks a second card", async () => {
    const a = make({ pdfId: "pdf-active" })
    await addReadLater(a)
    expect(await addReadLater(make({ pdfId: "pdf-active" }))).toBe(false)
  })
})

describe("v14/v15 migration: readLater store", () => {
  const openRaw = (version: number) =>
    new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open("pickquote-db", version)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(req.result)
    })

  it("v13 → v15 creates the readLater store (non-unique byPdfId) and preserves all data", async () => {
    // Build a REAL v13 DB (the current schema minus the readLater store) and
    // seed one record of every kind — the v13→v14 migration must keep them.
    const legacy = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open("pickquote-db", 13)
      req.onupgradeneeded = () => {
        const d = req.result
        const pc = d.createObjectStore("projectCards", { keyPath: "id" })
        pc.createIndex("projectId", "projectId")
        pc.createIndex("hash", "hash")
        pc.createIndex("type", "type")
        pc.createIndex("createdAt", "createdAt")
        pc.createIndex("sourceSite", "sourceSite")
        d.createObjectStore("todos", { keyPath: "id" }).createIndex(
          "dueDate",
          "dueDate"
        )
        const pd = d.createObjectStore("pdfCards", { keyPath: "id" })
        pd.createIndex("pdfId", "pdfId")
        d.createObjectStore("projects", { keyPath: "id" }).createIndex(
          "name",
          "name",
          { unique: true }
        )
        const rs = d.createObjectStore("reviews", { keyPath: "id" })
        rs.createIndex("itemId", "itemId", { unique: true })
        rs.createIndex("dueDate", "dueDate")
        d.createObjectStore("pdfs", { keyPath: "id" })
        d.createObjectStore("pdfAnnotations", { keyPath: "id" }).createIndex(
          "pdfId",
          "pdfId"
        )
        const tx = req.transaction as IDBTransaction
        tx.objectStore("projects").put({
          id: "p1",
          name: "项目A",
          createdAt: 1
        })
        tx.objectStore("projectCards").put({
          id: "card-1",
          projectId: "p1",
          content: "文本卡内容",
          type: "text",
          createdAt: 1
        })
        tx.objectStore("todos").put({
          id: "todo-1",
          content: "- [ ] 待办",
          createdAt: 1
        })
        tx.objectStore("reviews").put({
          id: "rev-1",
          itemId: "card-1",
          projectId: "p1",
          srs: {
            dueDate: 1,
            interval: 1,
            easeFactor: 2.5,
            reviewCount: 1,
            lastReviewDate: 1
          },
          status: "active",
          dueDate: 1,
          addedAt: 1
        })
        tx.objectStore("pdfs").put({
          id: "pdf-1",
          name: "doc.pdf",
          bytes: new Blob(["%PDF-fake"], { type: "application/pdf" }),
          pageCount: 1,
          addedAt: 1
        })
        tx.objectStore("pdfAnnotations").put({
          id: "ann-1",
          pdfId: "pdf-1",
          page: 1,
          kind: "region",
          type: "frame",
          rects: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }],
          createdAt: 1
        })
        tx.objectStore("pdfCards").put({
          id: "pdfcard-1",
          pdfId: "pdf-1",
          page: 1,
          kind: "region",
          type: "frame",
          annotationId: "ann-1",
          pdfOrder: 1000000,
          createdAt: 1
        })
      }
      req.onsuccess = () => resolve(req.result)
    })
    legacy.close()

    // A real DB call opens at DB_VERSION (15) — the migration runs.
    expect((await getPdf("pdf-1"))?.name).toBe("doc.pdf")
    expect((await getAllTodos()).map((t) => t.id)).toContain("todo-1")
    expect((await listProjects()).map((p) => p.id)).toContain("p1")
    expect((await getAllReviews()).length).toBeGreaterThan(0)
    expect((await getPdfCards("pdf-1")).map((c) => c.id)).toContain("pdfcard-1")

    // The readLater store now exists, usable, and its byPdfId index is
    // NON-unique (v15: done cards may coexist per PDF).
    const upgraded = await openRaw(DB_VERSION)
    expect(Array.from(upgraded.objectStoreNames)).toContain("readLater")
    const rlStore = upgraded.transaction("readLater").objectStore("readLater")
    expect(Array.from(rlStore.indexNames)).toContain("byPdfId")
    expect(rlStore.index("byPdfId").unique).toBe(false)
    upgraded.close()

    // A read-later record written after the upgrade persists.
    const item = createReadLater({ title: "x", pdfId: "pdf-1" })
    expect(await addReadLater(item)).toBe(true)
    expect(await getReadLaterByPdfId("pdf-1")).toBeDefined()
  })

  it("v14 → v15 relaxes the unique byPdfId index: done cards coexist with a new active card", async () => {
    // Build a REAL v14 DB: readLater store with a UNIQUE byPdfId index + one
    // active record for pdf-X.
    const legacy = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open("pickquote-db", 14)
      req.onupgradeneeded = () => {
        const d = req.result
        d.createObjectStore("readLater", { keyPath: "id" }).createIndex(
          "byPdfId",
          "pdfId",
          { unique: true }
        )
        const tx = req.transaction as IDBTransaction
        tx.objectStore("readLater").put({
          id: "rl-1",
          title: "读它",
          pdfId: "pdf-X",
          status: "unread",
          addedAt: 1
        })
      }
      req.onsuccess = () => resolve(req.result)
    })
    legacy.close()

    // Trigger the app's migration (openDb) with a real DB call.
    expect((await getAllReadLater()).map((r) => r.id)).toContain("rl-1")

    // Opening at DB_VERSION (15) rebuilds the index non-unique.
    const upgraded = await openRaw(DB_VERSION)
    expect(upgraded.transaction("readLater").objectStore("readLater").index("byPdfId").unique).toBe(false)
    upgraded.close()

    // After the migration, a done card + a new active card for pdf-X coexist.
    const existing = (await getAllReadLater())[0]
    expect(await updateReadLater({ ...existing, status: "done" })).toBe(true)
    expect(await addReadLater(createReadLater({ title: "再读", pdfId: "pdf-X" }))).toBe(true)
    expect(await getAllReadLater()).toHaveLength(2)
    // An active card still blocks a second active one.
    expect(await addReadLater(createReadLater({ title: "第三个", pdfId: "pdf-X" }))).toBe(false)
  })
})
