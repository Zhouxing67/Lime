import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded"
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded"
import { Box } from "@mui/material"

import type { PdfFile, Project } from "../types"
import EmptyState from "./EmptyState"
import PdfHub from "./PdfHub"
import ProjectHub from "./ProjectHub"

interface BackupViewProps {
  scope: "projects" | "pdfs"
  projects: Project[]
  pdfs: PdfFile[]
  countByProject: Record<string, number>
  countByPdf: Record<string, number>
  keyword: string
  /** The current scope's selected ids (projects or pdfs). */
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
  const filteredCount =
    scope === "projects"
      ? projects.filter((p) =>
          keyword.trim()
            ? p.name.toLowerCase().includes(keyword.trim().toLowerCase()) ||
              (p.note ?? "").toLowerCase().includes(keyword.trim().toLowerCase())
            : true
        ).length
      : pdfs.filter((p) =>
          keyword.trim()
            ? p.name.toLowerCase().includes(keyword.trim().toLowerCase())
            : true
        ).length

  if (filteredCount === 0) {
    return (
      <EmptyState
        icon={
          scope === "projects" ? (
            <FolderOpenRoundedIcon
              className="empty-icon"
            />
          ) : (
            <PictureAsPdfRoundedIcon
              className="empty-icon"
            />
          )
        }
        title={
          keyword.trim()
            ? "没有匹配的结果"
            : `没有可备份的${scope === "projects" ? "项目" : "PDF"}`
        }
        subtitle={
          keyword.trim()
            ? "试试其他关键词"
            : `先去${scope === "projects" ? "项目" : "PDF"}视图创建一些`
        }
      />
    )
  }

  return (
    <Box sx={{ py: 3 }}>
      {scope === "projects" ? (
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
      )}
    </Box>
  )
}
