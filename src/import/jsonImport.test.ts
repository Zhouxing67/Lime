import JSZip from "jszip"

import { listProjects, searchItems } from "../database"
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
      images: ["https://img.example.com/a.png", "https://img.example.com/b.png"],
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
      projects: [{ id: "p1", name: "导入项目", createdAt: 1690000000000, lastOpened: 1695000000000 }]
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
    expect(imported.images).toEqual(["https://img.example.com/a.png", "https://img.example.com/b.png"])

    const projects = await listProjects()
    expect(projects).toHaveLength(1)
    expect(projects[0].lastOpened).toBe(1695000000000)
  })
})