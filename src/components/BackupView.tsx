import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded"
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded"

import type { PdfMetaLite } from "../database"
import type { Project } from "../types"
import EmptyState from "./EmptyState"
import PdfHub from "./PdfHub"
import ProjectHub from "./ProjectHub"

interface BackupViewProps {
  scope: "projects" | "pdfs"
  projects: Project[]
  pdfs: PdfMetaLite[]
  countByProject: Record<string, number>
  countByPdf: Record<string, number>
  keyword: string
  selectedIds: string[]
  onToggleSelect: (id: string) => void
}

/** Backup main area: read-only multi-select tiles (filtered by keyword). */
export default function BackupView({
  scope,
  projects,
  pdfs,
  countByProject,
  countByPdf,
  keyword,
  selectedIds,
  onToggleSelect
}: BackupViewProps) {
  const normalizedKeyword = keyword.trim().toLowerCase()
  const filteredCount =
    scope === "projects"
      ? projects.filter(
          (project) =>
            !normalizedKeyword ||
            project.name.toLowerCase().includes(normalizedKeyword) ||
            (project.note ?? "").toLowerCase().includes(normalizedKeyword)
        ).length
      : pdfs.filter(
          (pdf) =>
            !normalizedKeyword ||
            pdf.name.toLowerCase().includes(normalizedKeyword)
        ).length

  if (filteredCount === 0) {
    return (
      <EmptyState
        icon={
          scope === "projects" ? (
            <FolderOpenRoundedIcon className="empty-icon" />
          ) : (
            <PictureAsPdfRoundedIcon className="empty-icon" />
          )
        }
        title={
          normalizedKeyword
            ? "没有匹配的结果"
            : `没有可备份的${scope === "projects" ? "项目" : "PDF"}`
        }
        subtitle={
          normalizedKeyword
            ? "试试其他关键词"
            : `先去${scope === "projects" ? "项目" : "PDF"}视图创建一些`
        }
      />
    )
  }

  return scope === "projects" ? (
    <ProjectHub
      projects={projects}
      countByProject={countByProject}
      keyword={keyword}
      selectable
      selected={(id) => selectedIds.includes(id)}
      onToggleSelect={onToggleSelect}
      onOpenProject={() => {}}
      onNewProject={() => {}}
      onDeleteProject={() => {}}
    />
  ) : (
    <PdfHub
      pdfs={pdfs}
      countByPdf={countByPdf}
      keyword={keyword}
      selectable
      selected={(id) => selectedIds.includes(id)}
      onToggleSelect={onToggleSelect}
      onOpenPdf={() => {}}
      onNewPdf={() => {}}
      onDeletePdf={() => {}}
    />
  )
}
