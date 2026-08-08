import { nextSidebarAction } from "./nav"

describe("nextSidebarAction", () => {
  it("toggles when the clicked tab is already current", () => {
    expect(nextSidebarAction("projects", "projects")).toBe("toggle")
  })

  it("switches when the clicked tab differs from the current", () => {
    expect(nextSidebarAction("pdf", "projects")).toBe("switch")
    expect(nextSidebarAction("projects", "pdf")).toBe("switch")
  })
})
