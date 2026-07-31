import { useCallback, useEffect, useState } from "react"

import {
  addProject,
  deleteSection as dbDeleteSection,
  deleteProject,
  getProjectByName,
  listProjects,
  updateProject
} from "../database"
import type { Project, Section } from "../types"

interface UseProjectsArgs {
  onSearch: (projectId?: string | null) => void
  onActivate: (id: string) => void
  onDeactivate: (id?: string) => void
}

interface UseProjectsResult {
  projects: Project[]
  newProjectName: string
  projectError: string | null
  loadProjects: () => Promise<Project[]>
  setNewProjectName: (v: string) => void
  setProjectError: (v: string | null) => void
  handleCreateProject: () => Promise<void>
  handleRenameProject: (id: string, name: string) => Promise<void>
  handleUpdateNote: (id: string, note: string) => Promise<void>
  handleDeleteProject: (id: string) => Promise<void>
  handleAddSection: (
    projectId: string,
    title: string,
    parentId: string | null
  ) => Promise<void>
  handleRenameSection: (
    projectId: string,
    sectionId: string,
    title: string
  ) => Promise<void>
  handleDeleteSection: (projectId: string, sectionId: string) => Promise<void>
  handleMoveSection: (
    projectId: string,
    sectionId: string,
    parentId: string | null,
    order: number
  ) => Promise<void>
}

/**
 * Encapsulates project CRUD + list state. `onSearch` / `onActivate` /
 * `onDeactivate` are injected so the hook stays decoupled from the
 * item-loading and active-project state in the page.
 */
export function useProjects({
  onSearch,
  onActivate,
  onDeactivate
}: UseProjectsArgs): UseProjectsResult {
  const [projects, setProjects] = useState<Project[]>([])
  const [newProjectName, setNewProjectName] = useState("")
  const [projectError, setProjectError] = useState<string | null>(null)

  const loadProjects = useCallback(async () => {
    const list = await listProjects()
    setProjects(list)
    return list
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const handleCreateProject = useCallback(async () => {
    const name = newProjectName.trim()
    if (!name) {
      setProjectError("项目名不能为空")
      return
    }
    const existing = await getProjectByName(name)
    if (existing) {
      setProjectError("项目名已存在，请换一个")
      return
    }
    const project: Project = {
      id: crypto.randomUUID(),
      name,
      createdAt: Date.now()
    }
    await addProject(project)
    await loadProjects()
    setNewProjectName("")
    setProjectError(null)
    onActivate(project.id)
  }, [newProjectName, loadProjects, onActivate])

  const handleRenameProject = useCallback(
    async (id: string, name: string) => {
      const proj = projects.find((p) => p.id === id)
      if (!proj) return
      if (projects.some((p) => p.id !== id && p.name === name)) {
        setProjectError("项目名已存在，请换一个")
        return
      }
      await updateProject({ ...proj, name })
      await loadProjects()
    },
    [projects, loadProjects]
  )

  const handleUpdateNote = useCallback(
    async (id: string, note: string) => {
      const proj = projects.find((p) => p.id === id)
      if (!proj) return
      await updateProject({ ...proj, note: note || undefined })
      await loadProjects()
    },
    [projects, loadProjects]
  )

  const handleDeleteProject = useCallback(
    async (id: string) => {
      await deleteProject(id)
      await loadProjects()
      onDeactivate(id)
    },
    [loadProjects, onDeactivate]
  )

  const handleAddSection = useCallback(
    async (projectId: string, title: string, parentId: string | null) => {
      const proj = projects.find((p) => p.id === projectId)
      if (!proj) return
      const level: Section["level"] = parentId === null ? 1 : 2
      if (level === 2) {
        const parent = (proj.sections ?? []).find((s) => s.id === parentId)
        if (!parent || parent.level !== 1) return
      }
      const siblings = (proj.sections ?? []).filter(
        (s) => s.parentId === parentId
      )
      const maxOrder =
        siblings.length > 0 ? Math.max(...siblings.map((s) => s.order)) : -1
      const section: Section = {
        id: crypto.randomUUID(),
        parentId,
        title: title.trim() || "新章节",
        order: maxOrder + 1,
        level
      }
      const updated: Project = {
        ...proj,
        sections: [...(proj.sections ?? []), section]
      }
      await updateProject(updated)
      await loadProjects()
    },
    [projects, loadProjects]
  )

  const handleRenameSection = useCallback(
    async (projectId: string, sectionId: string, title: string) => {
      const proj = projects.find((p) => p.id === projectId)
      if (!proj || !proj.sections) return
      const sections = proj.sections.map((s) =>
        s.id === sectionId ? { ...s, title: title.trim() || s.title } : s
      )
      await updateProject({ ...proj, sections })
      await loadProjects()
    },
    [projects, loadProjects]
  )

  const handleDeleteSection = useCallback(
    async (projectId: string, sectionId: string) => {
      await dbDeleteSection(projectId, sectionId)
      await loadProjects()
    },
    [loadProjects]
  )

  const handleMoveSection = useCallback(
    async (
      projectId: string,
      sectionId: string,
      parentId: string | null,
      order: number
    ) => {
      const proj = projects.find((p) => p.id === projectId)
      if (!proj || !proj.sections) return
      const target = proj.sections.find((s) => s.id === sectionId)
      if (!target) return
      const level: Section["level"] = parentId === null ? 1 : 2
      if (level === 2) {
        const parent = proj.sections.find((s) => s.id === parentId)
        if (!parent || parent.level !== 1) return
      }
      const newSections = proj.sections
        .map((s) => (s.id === sectionId ? { ...s, parentId, level, order } : s))
        .sort((a, b) =>
          (a.parentId ?? "") === (b.parentId ?? "") ? a.order - b.order : 0
        )
      await updateProject({ ...proj, sections: newSections })
      await loadProjects()
    },
    [projects, loadProjects]
  )

  return {
    projects,
    newProjectName,
    projectError,
    loadProjects,
    setNewProjectName,
    setProjectError,
    handleCreateProject,
    handleRenameProject,
    handleUpdateNote,
    handleDeleteProject,
    handleAddSection,
    handleRenameSection,
    handleDeleteSection,
    handleMoveSection
  }
}
