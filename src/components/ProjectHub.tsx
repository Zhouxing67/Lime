import AddRoundedIcon from "@mui/icons-material/AddRounded"
import CheckRoundedIcon from "@mui/icons-material/CheckRounded"
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded"
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded"
import { Box, Button, IconButton, Paper, Stack, Typography } from "@mui/material"
import { alpha } from "@mui/material/styles"

import type { Project } from "../types"
import EmptyState from "./EmptyState"

interface ProjectHubProps {
  projects: Project[]
  countByProject: Record<string, number>
  keyword: string
  onOpenProject: (id: string) => void
  onNewProject: () => void
  onDeleteProject: (id: string) => void
  /** Read-only multi-select mode (backup view): click toggles selection. */
  selectable?: boolean
  selected?: (id: string) => boolean
  onToggleSelect?: (id: string) => void
}

// Deterministic soft hue per project name (works on light + dark surfaces).
const AVATAR_COLORS = [
  "#5b7f9e",
  "#7a8f5f",
  "#9e7a5b",
  "#8a6ba8",
  "#a8686b",
  "#5f9e8f",
  "#b28a4e",
  "#6b86a8"
]

function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function relativeTime(ts?: number): string {
  if (!ts) return ""
  const diff = Date.now() - ts
  const day = 86400000
  if (diff < day) return "今天"
  if (diff < 2 * day) return "昨天"
  return `${Math.floor(diff / day)} 天前`
}

export default function ProjectHub({
  projects,
  countByProject,
  keyword,
  onOpenProject,
  onNewProject,
  onDeleteProject,
  selectable,
  selected,
  onToggleSelect
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
        title={selectable ? "没有可备份的项目" : "还没有项目"}
        subtitle={
          selectable ? "本地没有项目，先去项目视图新建一个" : "新建一个项目，开始整理你的摘录"
        }
        action={
          !selectable ? (
            <Button
              variant="contained"
              startIcon={<AddRoundedIcon />}
              onClick={onNewProject}
              sx={{ borderRadius: 1 }}>
              新建项目
            </Button>
          ) : undefined
        }
      />
    )
  }

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: 1.5
      }}>
      {!selectable && (
        <Paper
          elevation={0}
          onClick={onNewProject}
          sx={(theme) => ({
            p: 2,
            borderRadius: 1,
            border: "1.5px dashed",
            borderColor: theme.custom.borderStrong,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 1,
            minHeight: 104,
            color: "text.secondary",
            cursor: "pointer",
            transition: "all 0.2s",
            "&:hover": {
              borderColor: "primary.main",
              color: "primary.main",
              boxShadow: theme.custom.cardShadowHover
            }
          })}>
          <AddRoundedIcon sx={{ fontSize: 26 }} />
          <Typography variant="body2" sx={{ fontSize: "0.85rem" }}>
            新建项目
          </Typography>
        </Paper>
      )}
      {filtered.map((p) => {
        const isSelected = selectable ? selected?.(p.id) ?? false : false
        return (
        <Paper
          key={p.id}
          elevation={0}
          onClick={() => (selectable ? onToggleSelect?.(p.id) : onOpenProject(p.id))}
          sx={(theme) => ({
            p: 2,
            borderRadius: 1,
            border: "1px solid",
            borderColor: selectable
              ? "primary.main"
              : isSelected
                ? "primary.main"
                : "divider",
            cursor: "pointer",
            position: "relative",
            // Align with ItemCard's selectMode look: uniform primary tint in
            // selectable mode, paper background otherwise (never transparent).
            bgcolor: selectable
              ? alpha(theme.palette.primary.main, 0.04)
              : isSelected
                ? alpha(theme.palette.primary.main, 0.04)
                : "background.paper",
            transition: "all 0.2s",
            "&:hover": {
              boxShadow: theme.custom.cardShadowHover,
              transform: "translateY(-1px)",
              borderColor: selectable
                ? "primary.main"
                : theme.custom.borderStrong,
              ".hub-delete": { opacity: 1 }
            }
          })}>
          {selectable && isSelected && (
            <CheckRoundedIcon
              sx={{
                position: "absolute",
                top: 4,
                right: 4,
                fontSize: 16,
                color: "primary.main"
              }}
            />
          )}
          {!selectable && (
          <IconButton
            className="hub-delete"
            size="small"
            onClick={(e) => {
              e.stopPropagation()
              onDeleteProject(p.id)
            }}
            sx={{
              position: "absolute",
              top: 4,
              right: 4,
              p: 0.5,
              opacity: 0,
              color: "text.disabled",
              transition: "opacity 0.15s",
              "&:hover": { color: "error.main", bgcolor: "transparent" }
            }}>
            <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
          </IconButton>
          )}

          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                bgcolor: avatarColor(p.name),
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.95rem",
                fontWeight: 600,
                flexShrink: 0,
                fontFamily: (t) => t.custom.serif
              }}>
              {p.name.slice(0, 1)}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="body2"
                noWrap
                sx={{
                  fontWeight: 600,
                  fontSize: "0.95rem",
                  fontFamily: (t) => t.custom.serif
                }}>
                {p.name}
              </Typography>
              {p.note && (
                <Typography
                  variant="caption"
                  noWrap
                  sx={{
                    color: "text.secondary",
                    display: "block",
                    fontSize: "0.72rem"
                  }}>
                  {p.note}
                </Typography>
              )}
            </Box>
          </Stack>
          <Box
            sx={{
              mt: 1.5,
              pt: 1.25,
              borderTop: "1px solid",
              borderColor: "divider",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1
            }}>
            <Typography
              variant="caption"
              sx={{ color: "text.disabled", fontSize: "0.75rem" }}>
              {countByProject[p.id] ?? 0} 张卡片
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: "text.disabled", fontSize: "0.7rem" }}>
              {relativeTime(p.lastOpened)}
            </Typography>
          </Box>
        </Paper>
        )
      })}
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
