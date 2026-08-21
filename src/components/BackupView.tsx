import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded"
import FileUploadRoundedIcon from "@mui/icons-material/FileUploadRounded"
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded"
import { Box, Button, Stack, Typography } from "@mui/material"

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
  /** The current scope's selected ids (projects or pdfs). */
  selectedIds: string[]
  onScopeChange: (scope: "projects" | "pdfs") => void
  onImportBackup: () => void
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
  onScopeChange,
  onImportBackup,
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

  const header = (
    <>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems={{ xs: "stretch", sm: "center" }}
        justifyContent="space-between"
        spacing={2}
        sx={{ px: 3, mb: 2.5 }}>
        <Box>
          <Typography variant="h6" sx={{ fontSize: "1rem", fontWeight: 600 }}>
            本地备份
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            选择要导出的项目或 PDF，也可以从备份文件恢复数据
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={<FileUploadRoundedIcon sx={{ fontSize: 16 }} />}
          onClick={onImportBackup}>
          导入备份
        </Button>
      </Stack>
      <Stack direction="row" spacing={0.5} sx={{ px: 3, mb: 2 }}>
        <Button
          size="small"
          variant={scope === "projects" ? "contained" : "text"}
          startIcon={<FolderOpenRoundedIcon sx={{ fontSize: 16 }} />}
          onClick={() => onScopeChange("projects")}>
          项目
        </Button>
        <Button
          size="small"
          variant={scope === "pdfs" ? "contained" : "text"}
          startIcon={<PictureAsPdfRoundedIcon sx={{ fontSize: 16 }} />}
          onClick={() => onScopeChange("pdfs")}>
          PDF
        </Button>
      </Stack>
    </>
  )

  if (filteredCount === 0) {
    return (
      <Box sx={{ py: 3 }}>
        {header}
        <EmptyState
          icon={
            scope === "projects" ? (
              <FolderOpenRoundedIcon className="empty-icon" />
            ) : (
              <PictureAsPdfRoundedIcon className="empty-icon" />
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
      </Box>
    )
  }

  return (
    <Box sx={{ py: 3 }}>
      {header}
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
