import type { Item, Project, ReviewEntry, SearchQuery } from '../types'
import { rateSrs } from '../hooks/useSrs'
import {
  addItem,
  addProject,
  addReview,
  bulkReplace,
  deleteItem,
  deleteItems,
  deleteProject,
  getAllReviews,
  getDueReviews,
  getProjectByName,
  listProjects,
  searchItems,
  updateItem,
  updateReviewSrs
} from './index'

// Helper to create a test item
const createTestItem = (overrides: Partial<Item> = {}): Item => ({
  id: `item-${Date.now()}-${Math.random()}`,
  type: 'text',
  content: 'Test content',
  source: {
    title: 'Test Page',
    url: 'https://example.com/test',
    site: 'example.com'
  },
  createdAt: Date.now(),
  ...overrides
})

describe('database', () => {
  beforeEach(() => {
    // Clear IndexedDB before each test
    indexedDB = new IDBFactory()
  })

  describe('addItem', () => {
    it('should add an item to the database', async () => {
      const item = createTestItem()
      await addItem(item)

      const items = await searchItems({})
      expect(items).toHaveLength(1)
      expect(items[0].id).toBe(item.id)
      expect(items[0].content).toBe(item.content)
    })

    it('should auto-generate sourceSite from URL if not provided', async () => {
      const item = createTestItem({
        source: {
          title: 'Test',
          url: 'https://blog.example.com/post'
        }
      })
      await addItem(item)

      const items = await searchItems({})
      expect(items[0].sourceSite).toBe('blog.example.com')
    })

    it('should auto-generate hash if not provided', async () => {
      const item = createTestItem()
      delete item.hash
      await addItem(item)

      const items = await searchItems({})
      expect(items[0].hash).toBeDefined()
      expect(items[0].hash).toHaveLength(64)
    })

    it('should prevent duplicate items with same hash and URL', async () => {
      const item = createTestItem({ hash: 'test-hash-123' })
      await addItem(item)
      await addItem(item) // Try to add duplicate

      const items = await searchItems({})
      expect(items).toHaveLength(1) // Should only have one item
    })

    it('should allow items with same hash but different URL', async () => {
      const item1 = createTestItem({
        hash: 'same-hash',
        source: { title: 'Page 1', url: 'https://site1.com' }
      })
      const item2 = createTestItem({
        hash: 'same-hash',
        source: { title: 'Page 2', url: 'https://site2.com' }
      })

      await addItem(item1)
      await addItem(item2)

      const items = await searchItems({})
      expect(items).toHaveLength(2)
    })

    it('should treat different images as different items even with same content and source', async () => {
      const base = {
        content: 'mixed content text',
        source: { title: 'Mixed', url: 'https://example.com/mixed', site: 'example.com' }
      }
      await addItem(createTestItem({ ...base, images: ['https://img.example.com/a.png'] }))
      await addItem(createTestItem({ ...base, images: ['https://img.example.com/b.png'] }))

      const items = await searchItems({})
      expect(items).toHaveLength(2)
    })

    it('should dedupe mixed cards when content and images match', async () => {
      const base = {
        content: 'mixed card dedup',
        source: { title: 'Mixed', url: 'https://example.com/mixed-dedup', site: 'example.com' }
      }
      const images = ['https://img.example.com/a.png', 'https://img.example.com/b.png']
      await addItem(createTestItem({ ...base, images }))
      await addItem(createTestItem({ ...base, images }))

      const items = await searchItems({})
      expect(items).toHaveLength(1)
    })
  })

  describe('searchItems', () => {
    beforeEach(async () => {
      // Set up test data
      await addItem(createTestItem({
        id: 'text1',
        type: 'text',
        content: 'Hello world',
        source: { title: 'Page 1', url: 'https://example.com/1', site: 'example.com' },
        createdAt: 1000
      }))
      await addItem(createTestItem({
        id: 'image1',
        type: 'image',
        content: 'data:image/png;base64,xyz',
        source: { title: 'Page 2', url: 'https://test.com/2', site: 'test.com' },
        createdAt: 2000
      }))
      await addItem(createTestItem({
        id: 'text2',
        type: 'text',
        content: 'Goodbye world',
        source: { title: 'Another Page', url: 'https://example.com/3', site: 'example.com' },
        createdAt: 3000,
        projectId: 'proj1'
      }))
    })

    it('should filter by type', async () => {
      const results = await searchItems({ type: 'text' })
      expect(results).toHaveLength(2)
      expect(results.every(item => item.type === 'text')).toBe(true)
    })

    it('should filter by site', async () => {
      const results = await searchItems({ site: 'example.com' })
      expect(results).toHaveLength(2)
      expect(results.every(item => item.sourceSite === 'example.com')).toBe(true)
    })

    it('should filter by keyword in content', async () => {
      const results = await searchItems({ keyword: 'hello' })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('text1')
    })

    it('should filter by keyword in title', async () => {
      const results = await searchItems({ keyword: 'another' })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('text2')
    })

    it('should be case-insensitive for keyword search', async () => {
      const results = await searchItems({ keyword: 'HELLO' })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('text1')
    })

    it('should filter by date range (from)', async () => {
      const results = await searchItems({ from: 2000 })
      expect(results).toHaveLength(2)
      expect(results.every(item => item.createdAt >= 2000)).toBe(true)
    })

    it('should filter by date range (to)', async () => {
      const results = await searchItems({ to: 2001 })
      expect(results).toHaveLength(2)
      expect(results.every(item => item.createdAt < 2001)).toBe(true)
    })

    it('should filter by projectId', async () => {
      const results = await searchItems({ projectId: 'proj1' })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('text2')
    })

    it('should combine multiple filters', async () => {
      const results = await searchItems({
        type: 'text',
        site: 'example.com',
        keyword: 'world'
      })
      expect(results).toHaveLength(2)
    })

    it('should return all items when query is empty', async () => {
      const results = await searchItems({})
      expect(results).toHaveLength(3)
    })

    it('should return items in reverse chronological order', async () => {
      const results = await searchItems({})
      expect(results[0].id).toBe('text2')
      expect(results[1].id).toBe('image1')
      expect(results[2].id).toBe('text1')
    })
  })

  describe('updateItem', () => {
    it('should update an existing item', async () => {
      const item = createTestItem({ content: 'Original content' })
      await addItem(item)

      const updatedItem = { ...item, content: 'Updated content' }
      await updateItem(updatedItem)

      const items = await searchItems({})
      expect(items).toHaveLength(1)
      expect(items[0].content).toBe('Updated content')
    })
  })

  describe('deleteItem', () => {
    it('should remove an item from the database', async () => {
      const item = createTestItem()
      await addItem(item)

      let items = await searchItems({})
      expect(items).toHaveLength(1)

      await deleteItem(item.id)

      items = await searchItems({})
      expect(items).toHaveLength(0)
    })

    it('should not throw error when deleting non-existent item', async () => {
      await expect(deleteItem('non-existent-id')).resolves.not.toThrow()
    })
  })

  describe("deleteItems", () => {
    it("should delete multiple items in a single transaction", async () => {
      const item1: Item = {
        id: "batch1", type: "text", content: "batch test A",
        source: { title: "Page A", url: "https://example.com/a" }, createdAt: 100
      }
      const item2: Item = {
        id: "batch2", type: "text", content: "batch test B",
        source: { title: "Page B", url: "https://example.com/b" }, createdAt: 200
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
    const createProject = (name: string, overrides: Partial<Project> = {}): Project => ({
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
      await expect(addProject(createProject("Unique Project"))).rejects.toThrow("项目已存在")
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
      await addReview(createTestReview("r1", "item1", "", { dueDate: Date.now() - 1000 }))
      await addReview(createTestReview("r2", "item2", "", { dueDate: Date.now() + 86400000, interval: 1 }))

      const due = await getDueReviews()
      expect(due).toHaveLength(1)
      expect(due[0].itemId).toBe("item1")
    })

    it("updateReviewSrs should promote mastered when interval reaches max", async () => {
      await addReview(createTestReview("r3", "item3"))
      const srs = rateSrs(
        { dueDate: Date.now(), interval: 0, easeFactor: 2.5, reviewCount: 0, lastReviewDate: 0 },
        4
      )
      // Rating 4 several times to push interval to 365
      let current = srs
      for (let i = 0; i < 10; i++) {
        current = rateSrs(current, 4)
      }
      expect(current.interval).toBe(365)

      await updateReviewSrs("item3", current)

      const due = await getDueReviews()
      expect(due).toHaveLength(0)
      const all = await getAllReviews()
      expect(all[0].status).toBe("mastered")
    })

    it("updateReviewSrs should keep active card due today when rated <3", async () => {
      await addReview(createTestReview("r4", "item4"))
      const srs = rateSrs(
        { dueDate: Date.now(), interval: 0, easeFactor: 2.5, reviewCount: 0, lastReviewDate: 0 },
        1
      )
      expect(srs.interval).toBe(1)

      await updateReviewSrs("item4", srs)

      const due = await getDueReviews()
      expect(due).toHaveLength(1)
      expect(due[0].itemId).toBe("item4")
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

})
