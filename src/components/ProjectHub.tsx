import AddRoundedIcon from "@mui/icons-material/AddRounded"
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded"
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded"
import { Box, Button, Paper, Stack, Typography } from "@mui/material"

import type { Project } from "../types"
import EmptyState from "./EmptyState"

interface ProjectHubProps {
  projects: Project[]
  countByProject: Record<string, number>
  keyword: string
  onOpenProject: (id: string) => void
  onNewProject: () => void
}

export default function ProjectHub({
  projects,
  countByProject,
  keyword,
  onOpenProject,
  onNewProject
}: ProjectHubProps) {
  const filtered = projects
    .filter((p) => {
      if (!keyword.trim()) return true
      const k = keyword.trim().toLowerCase()
      return (
        p.name.toLowerCase().includes(k) ||
        (p.note ?? "").toLowerCase().includes(k)
      )
    })
    .sort(
      (a, b) =>
        (b.lastOpened ?? 0) - (a.lastOpened ?? 0) || b.createdAt - a.createdAt
    )

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={
          <FolderOpenRoundedIcon
            className="empty-icon"
            sx={{ fontSize: 80, mb: 3 }}
          />
        }
        title="还没有项目"
        subtitle="新建一个项目，开始整理你的摘录"
        action={
          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={onNewProject}
            sx={{ borderRadius: 1 }}>
            新建项目
          </Button>
        }
      />
    )
  }

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 1.5
      }}>
      {filtered.map((p) => (
        <Paper
          key={p.id}
          elevation={0}
          onClick={() => onOpenProject(p.id)}
          sx={(theme) => ({
            p: 2,
            borderRadius: 1,
            border: "1px solid",
            borderColor: "divider",
            cursor: "pointer",
            transition: "all 0.2s",
            "&:hover": {
              boxShadow: theme.custom.cardShadowHover,
              transform: "translateY(-1px)",
              borderColor: theme.custom.borderStrong
            }
          })}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <FolderOpenRoundedIcon
              sx={{ fontSize: 18, color: "primary.main", flexShrink: 0 }}
            />
            <Typography
              variant="body2"
              noWrap
              sx={{ fontWeight: 600, fontSize: "0.9rem" }}>
              {p.name}
            </Typography>
          </Stack>
          {p.note && (
            <Typography
              variant="caption"
              noWrap
              sx={{
                color: "text.secondary",
                display: "block",
                mb: 1,
                fontSize: "0.75rem"
              }}>
              {p.note}
            </Typography>
          )}
          <Typography
            variant="caption"
            sx={{ color: "text.disabled", fontSize: "0.75rem" }}>
            {countByProject[p.id] ?? 0} 张卡片
          </Typography>
        </Paper>
      ))}

      {/* New project tile */}
      <Paper
        elevation={0}
        onClick={onNewProject}
        sx={{
          p: 2,
          borderRadius: 1,
          border: "1px dashed",
          borderColor: "divider",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0.5,
          minHeight: 96,
          color: "text.secondary",
          transition: "all 0.2s",
          "&:hover": {
            borderColor: "primary.main",
            color: "primary.main"
          }
        }}>
        <AddRoundedIcon />
        <Typography variant="body2" sx={{ fontSize: "0.8rem" }}>
          新建项目
        </Typography>
      </Paper>

      {keyword && filtered.length === 0 && (
        <Box sx={{ gridColumn: "1 / -1" }}>
          <EmptyState
            icon={
              <SearchOffRoundedIcon
                className="empty-icon"
                sx={{ fontSize: 80, mb: 3 }}
              />
            }
            title="没有匹配的项目"
            subtitle="试试其他关键词"
          />
        </Box>
      )}
    </Box>
  )
}
