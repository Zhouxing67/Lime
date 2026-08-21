import FileDownloadRoundedIcon from "@mui/icons-material/FileDownloadRounded"
import FileUploadRoundedIcon from "@mui/icons-material/FileUploadRounded"
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded"
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded"
import { Box, Button, Stack } from "@mui/material"

import type { PdfMetaLite } from "../database"
import type { Project } from "../types"
import BatchToolbar from "./BatchToolbar"
import EmptyState from "./EmptyState"
import FilterChips from "./FilterChips"
import PdfHub from "./PdfHub"
import ProjectHub from "./ProjectHub"

interface BackupViewProps {
  scope: "projects" | "pdfs"
  projects: Project[]
  pdfs: PdfMetaLite[]
  countByProject: Record<string, number>
  countByPdf: Record<string, number>
  keyword: string
  onKeywordChange: (keyword: string) => void
  /** The current scope's selected ids (projects or pdfs). */
  selectedIds: string[]
  visibleIds: string[]
  onScopeChange: (scope: "projects" | "pdfs") => void
  onImportBackup: () => void
  onSelectAll: () => void
  onExportBackup: () => void
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
  onKeywordChange,
  selectedIds,
  visibleIds,
  onScopeChange,
  onImportBackup,
  onSelectAll,
  onExportBackup,
  onToggleSelect
}: BackupViewProps) {
  const filteredCount =
    scope === "projects"
      ? projects.filter((p) =>
          keyword.trim()
            ? p.name.toLowerCase().includes(keyword.trim().toLowerCase()) ||
              (p.note ?? "")
                .toLowerCase()
                .includes(keyword.trim().toLowerCase())
            : true
        ).length
      : pdfs.filter((p) =>
          keyword.trim()
            ? p.name.toLowerCase().includes(keyword.trim().toLowerCase())
            : true
        ).length

  const toolbar = (
    <FilterChips
      keyword={keyword}
      onKeywordChange={onKeywordChange}
      placeholder={scope === "projects" ? "搜索项目…" : "搜索 PDF…"}
      leading={
        <Stack direction="row" spacing={0.5}>
          <Button
            size="small"
            variant="text"
            color={scope === "projects" ? "primary" : "inherit"}
            startIcon={<FolderOpenRoundedIcon sx={{ fontSize: 16 }} />}
            sx={{
              bgcolor: scope === "projects" ? "action.selected" : undefined
            }}
            onClick={() => onScopeChange("projects")}>
            项目
          </Button>
          <Button
            size="small"
            variant="text"
            color={scope === "pdfs" ? "primary" : "inherit"}
            startIcon={<PictureAsPdfRoundedIcon sx={{ fontSize: 16 }} />}
            sx={{ bgcolor: scope === "pdfs" ? "action.selected" : undefined }}
            onClick={() => onScopeChange("pdfs")}>
            PDF
          </Button>
        </Stack>
      }>
      <BatchToolbar
        selectedCount={selectedIds.length}
        totalCount={filteredCount}
        allSelected={
          visibleIds.length > 0 &&
          visibleIds.every((id) => selectedIds.includes(id))
        }
        countLabel={scope === "projects" ? "个项目" : "个 PDF"}
        selectAllLabel={keyword.trim() ? "全选当前结果" : "全选"}
        selectAllIndeterminate={
          visibleIds.some((id) => selectedIds.includes(id)) &&
          !visibleIds.every((id) => selectedIds.includes(id))
        }
        onSelectAll={onSelectAll}
        actions={[
          {
            label: "导入",
            icon: <FileUploadRoundedIcon sx={{ fontSize: 16, mr: 0.5 }} />,
            onClick: onImportBackup,
            variant: "text"
          },
          {
            label: "导出备份",
            icon: <FileDownloadRoundedIcon sx={{ fontSize: 16, mr: 0.5 }} />,
            onClick: onExportBackup,
            disabled: selectedIds.length === 0,
            variant: "contained"
          }
        ]}
      />
    </FilterChips>
  )

  if (filteredCount === 0) {
    return (
      <Box>
        {toolbar}
        <Box sx={{ pt: 3 }}>
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
      </Box>
    )
  }

  return (
    <Box>
      {toolbar}
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
    </Box>
  )
}
