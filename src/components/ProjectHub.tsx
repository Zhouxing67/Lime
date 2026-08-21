import AddRoundedIcon from "@mui/icons-material/AddRounded"
import CheckRoundedIcon from "@mui/icons-material/CheckRounded"
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import EditRoundedIcon from "@mui/icons-material/EditRounded"
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded"
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded"
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded"
import {
  Box,
  Button,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography
} from "@mui/material"
import { alpha } from "@mui/material/styles"
import { useState } from "react"

import type { Project } from "../types"
import { avatarColor, byRecency, relativeTime } from "../utils"
import DashedTile from "./DashedTile"
import EmptyState from "./EmptyState"
import { HUB_TILE_HEIGHT, hubTileGridColumns } from "./hubTileStyles"
import RenameDialog from "./RenameDialog"

interface ProjectHubProps {
  projects: Project[]
  countByProject: Record<string, number>
  keyword: string
  onOpenProject: (id: string) => void
  onNewProject: () => void
  onDeleteProject: (id: string) => void
  onRenameProject?: (id: string, name: string) => void
  /** Read-only multi-select mode (backup view): click toggles selection. */
  selectable?: boolean
  selected?: (id: string) => boolean
  onToggleSelect?: (id: string) => void
}

// Deterministic soft hue per project name — the palette comes from the theme's
// custom.avatarPalette token (light/dark aware), not hardcoded hex.

export default function ProjectHub({
  projects,
  countByProject,
  keyword,
  onOpenProject,
  onNewProject,
  onDeleteProject,
  onRenameProject,
  selectable,
  selected,
  onToggleSelect
}: ProjectHubProps) {
  const [renameTarget, setRenameTarget] = useState<{
    id: string
    name: string
  } | null>(null)
  const filtered = projects
    .filter((p) => {
      if (!keyword.trim()) return true
      const k = keyword.trim().toLowerCase()
      return (
        p.name.toLowerCase().includes(k) ||
        (p.note ?? "").toLowerCase().includes(k)
      )
    })
    .sort((a, b) => {
      const systemRank =
        Number(b.systemKind === "vocabulary") -
        Number(a.systemKind === "vocabulary")
      if (systemRank !== 0) return systemRank
      return byRecency(
        (p: Project) => p.lastOpened,
        (left, right) => right.createdAt - left.createdAt
      )(a, b)
    })

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={<FolderOpenRoundedIcon className="empty-icon" />}
        title={selectable ? "没有可备份的项目" : "还没有项目"}
        subtitle={
          selectable
            ? "本地没有项目，先去项目视图新建一个"
            : "新建一个项目，开始整理你的摘录"
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
    <>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: hubTileGridColumns,
          gap: 1.5
        }}>
        {!selectable && (
          <DashedTile
            icon={<AddRoundedIcon sx={{ fontSize: 26 }} />}
            label="新建项目"
            onClick={onNewProject}
            height={HUB_TILE_HEIGHT}
          />
        )}
        {filtered.map((p) => {
          const isSelected = selectable ? selected?.(p.id) ?? false : false
          const isVocabulary = p.systemKind === "vocabulary"
          return (
            <Paper
              key={p.id}
              elevation={0}
              onClick={() =>
                selectable ? onToggleSelect?.(p.id) : onOpenProject(p.id)
              }
              sx={(theme) => ({
                p: 2,
                height: HUB_TILE_HEIGHT,
                borderRadius: 1,
                border: "1px solid",
                borderColor: isSelected
                  ? "primary.main"
                  : selectable
                    ? "divider"
                    : isVocabulary
                      ? alpha(theme.palette.primary.main, 0.2)
                      : "divider",
                cursor: "pointer",
                position: "relative",
                boxShadow: theme.custom.cardShadow,
                bgcolor: isSelected
                  ? alpha(theme.palette.primary.main, 0.04)
                    : isVocabulary
                      ? alpha(theme.palette.primary.main, 0.035)
                      : "background.paper",
                transition: "all 0.2s",
                "&:hover": {
                  boxShadow: theme.custom.cardShadowHover,
                  transform: "translateY(-1px)",
                  borderColor: isSelected
                    ? "primary.main"
                    : theme.custom.borderStrong,
                  ".hub-delete, .hub-rename": { opacity: 1 }
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
              {!selectable && !isVocabulary && onRenameProject && (
                <Tooltip title="重命名">
                  <IconButton
                    className="hub-rename"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      setRenameTarget({ id: p.id, name: p.name })
                    }}
                    sx={{
                      position: "absolute",
                      top: 4,
                      right: 26,
                      p: 0.5,
                      opacity: 0,
                      color: "text.disabled",
                      transition: "opacity 0.15s",
                      "&:hover": {
                        color: "primary.main",
                        bgcolor: "transparent"
                      }
                    }}>
                    <EditRoundedIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
              {!selectable && !isVocabulary && (
                <IconButton
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
                    // Destructive actions stay visible (设计基线), not hover-revealed.
                    opacity: 0.6,
                    color: "text.disabled",
                    transition: "opacity 0.15s",
                    "&:hover": {
                      opacity: 1,
                      color: "error.main",
                      bgcolor: "transparent"
                    }
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
                    bgcolor: (t) => avatarColor(t.custom.avatarPalette, p.name),
                    color: (t) =>
                      t.palette.getContrastText(
                        avatarColor(t.custom.avatarPalette, p.name)
                      ),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    flexShrink: 0,
                    fontFamily: (t) => t.custom.serif
                  }}>
                  {isVocabulary ? (
                    <MenuBookRoundedIcon sx={{ fontSize: 18 }} />
                  ) : (
                    p.name.slice(0, 1)
                  )}
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
              icon={<SearchOffRoundedIcon className="empty-icon" />}
              title="没有匹配的项目"
              subtitle="试试其他关键词"
            />
          </Box>
        )}
      </Box>
      <RenameDialog
        open={Boolean(renameTarget)}
        title="重命名项目"
        label="项目名称"
        value={renameTarget?.name ?? ""}
        onClose={() => setRenameTarget(null)}
        onConfirm={(name) => {
          if (name && renameTarget && name !== renameTarget.name)
            onRenameProject?.(renameTarget.id, name)
        }}
      />
    </>
  )
}
