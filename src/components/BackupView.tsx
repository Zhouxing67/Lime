import { Box, Button, Container, Typography } from "@mui/material"

import type { PdfFile, Project } from "../types"
import PdfHub from "./PdfHub"
import ProjectHub from "./ProjectHub"

interface BackupViewProps {
  scope: "projects" | "pdfs"
  projects: Project[]
  pdfs: PdfFile[]
  countByProject: Record<string, number>
  countByPdf: Record<string, number>
  /** The current scope's selected ids (projects or pdfs). */
  selectedIds: string[]
  onToggleSelect: (id: string) => void
  onSelectAll: () => void
  onExport: () => void
}

/** Backup main area: top action bar + read-only multi-select tiles. */
export default function BackupView({
  scope,
  projects,
  pdfs,
  countByProject,
  countByPdf,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onExport
}: BackupViewProps) {
  const total = scope === "projects" ? projects.length : pdfs.length
  const allSelected = total > 0 && selectedIds.length === total
  return (
    <>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2,
          py: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper"
        }}>
        <Button
          size="small"
          onClick={onSelectAll}
          disabled={total === 0}
          sx={{ borderRadius: 1 }}>
          {allSelected ? "取消全选" : `全选（${total}）`}
        </Button>
        <Typography
          variant="body2"
          sx={{ fontSize: "0.8rem", color: "text.secondary" }}>
          已选 {selectedIds.length}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          variant="contained"
          disabled={selectedIds.length === 0}
          onClick={onExport}
          sx={{ borderRadius: 1 }}>
          导出备份
        </Button>
      </Box>
      <Container sx={{ py: 3 }} maxWidth="xl">
        {scope === "projects" ? (
          <ProjectHub
            projects={projects}
            countByProject={countByProject}
            keyword=""
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
            selectable
            selected={(id) => selectedIds.includes(id)}
            onToggleSelect={onToggleSelect}
            onOpenPdf={() => {}}
            onNewPdf={() => {}}
            onDeletePdf={() => {}}
          />
        )}
      </Container>
    </>
  )
}
