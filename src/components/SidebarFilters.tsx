import AddRoundedIcon from "@mui/icons-material/AddRounded"
import BackupRoundedIcon from "@mui/icons-material/BackupRounded"
import CloseRoundedIcon from "@mui/icons-material/CloseRounded"
import CloudDownloadRoundedIcon from "@mui/icons-material/CloudDownloadRounded"
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded"
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import EditRoundedIcon from "@mui/icons-material/EditRounded"
import FileDownloadRoundedIcon from "@mui/icons-material/FileDownloadRounded"
import FileUploadRoundedIcon from "@mui/icons-material/FileUploadRounded"
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded"
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded"
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material"
import { alpha } from "@mui/material/styles"
import { useCallback, useEffect, useRef, useState } from "react"

import type { Project } from "../types"

interface SidebarFiltersProps {
  open: boolean
  width: number
  projects: Project[]
  activeProjectId: string | null
  readingFilter: boolean
  dueCount: number
  sidebarTab: "projects" | "review" | "backup"
  backupSelectedIds: string[]
  syncStatus: string
  recentDates: { key: string; label: string; count: number }[]
  reviewDateFilter: string | null
  onReviewDateClick: (dateKey: string | null) => void
  onClose: () => void
  onOpenProject: (id: string) => void
  onRenameProject: (id: string, name: string) => void
  onUpdateNote: (id: string, note: string) => void
  onDeleteProject: (id: string) => void
  onWidthChange: (w: number) => void
  onToggleReadingFilter: () => void
  onSetSidebarTab: (tab: "projects" | "review" | "backup") => void
  onNewProjectClick: () => void
  onCloseProject: () => void
  onToggleBackup: (id: string) => void
  onToggleBackupAll: () => void
  onExportBackup: () => void
  onImportBackup: () => void
  onUploadSync: () => void
  onDownloadSync: () => void
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.75}>
      <Box
        sx={{
          width: 3,
          height: 14,
          borderRadius: 1,
          bgcolor: "primary.main",
          flexShrink: 0
        }}
      />
      <Typography variant="body2" sx={{ fontSize: "0.8rem", fontWeight: 600 }}>
        {children}
      </Typography>
    </Stack>
  )
}

export default function SidebarFilters({
  open,
  width,
  projects,
  activeProjectId,
  readingFilter,
  dueCount,
  sidebarTab,
  backupSelectedIds,
  syncStatus,
  recentDates,
  reviewDateFilter,
  onReviewDateClick,
  onClose,
  onOpenProject,
  onRenameProject,
  onUpdateNote,
  onDeleteProject,
  onWidthChange,
  onToggleReadingFilter,
  onSetSidebarTab,
  onNewProjectClick,
  onCloseProject,
  onToggleBackup,
  onToggleBackupAll,
  onExportBackup,
  onImportBackup,
  onUploadSync,
  onDownloadSync
}: SidebarFiltersProps) {
  const dragRef = useRef<() => void>(null)

  useEffect(() => {
    return () => dragRef.current?.()
  }, [])

  return (
    <>
      <style>{`@keyframes sidebarFadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
      <Drawer
        variant="persistent"
        anchor="left"
        open={open}
        sx={{
          width: open ? width : 0,
          transition: "none",
          position: "relative",
          "& .MuiDrawer-paper": {
            width,
            boxSizing: "border-box",
            bgcolor: "background.paper",
            borderRight: "1px solid",
            borderColor: "divider",
            overflowX: "hidden"
          }
        }}>
        <Box
          sx={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: 4,
            cursor: "col-resize",
            zIndex: 1200,
            "&:hover": { bgcolor: "primary.main", opacity: 0.5 },
            bgcolor: "transparent",
            transition: "background-color 0.15s"
          }}
          onMouseDown={(e) => {
            e.preventDefault()
            const startX = e.clientX
            const startW = width
            const onMove = (ev: MouseEvent) => {
              const w = startW + ev.clientX - startX
              onWidthChange(Math.max(200, Math.min(500, w)))
            }
            const onUp = () => {
              document.removeEventListener("mousemove", onMove)
              document.removeEventListener("mouseup", onUp)
            }
            document.addEventListener("mousemove", onMove)
            document.addEventListener("mouseup", onUp)
            // Store in ref so useEffect cleanup can remove them on unmount
            dragRef.current = () => {
              document.removeEventListener("mousemove", onMove)
              document.removeEventListener("mouseup", onUp)
            }
          }}
        />
        <Stack spacing={1.5} sx={{ p: 2, pt: 2.5 }}>
          {/* Row 1: title */}
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between">
            <Typography
              sx={{
                fontWeight: 500,
                letterSpacing: "0.04em",
                fontSize: "1rem",
                color: "text.primary"
              }}>
              lime
            </Typography>
            <IconButton size="small" onClick={onClose}>
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>

          {/* Row 2: navigation icons — 📂 left, 📚 centered, 💾 right */}
          <Box
            sx={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}>
            <Tooltip title="项目管理">
              <IconButton
                size="small"
                onClick={() => onSetSidebarTab("projects")}
                sx={(theme) => ({
                  color:
                    sidebarTab === "projects"
                      ? "primary.main"
                      : "text.secondary",
                  bgcolor:
                    sidebarTab === "projects"
                      ? alpha(theme.palette.primary.main, 0.08)
                      : "transparent",
                  borderRadius: 1,
                  p: 0.75,
                  "&:hover": {
                    color: "primary.main",
                    bgcolor: alpha(theme.palette.primary.main, 0.08)
                  }
                })}>
                <FolderOpenRoundedIcon sx={{ fontSize: 22 }} />
              </IconButton>
            </Tooltip>
            <Box
              sx={{
                position: "absolute",
                left: "50%",
                transform: "translateX(-50%)"
              }}>
              <Tooltip title="间隔复习">
                <IconButton
                  size="small"
                  onClick={() => onSetSidebarTab("review")}
                  sx={(theme) => ({
                    color:
                      sidebarTab === "review"
                        ? "primary.main"
                        : "text.secondary",
                    bgcolor:
                      sidebarTab === "review"
                        ? alpha(theme.palette.primary.main, 0.08)
                        : "transparent",
                    borderRadius: 1,
                    p: 0.75,
                    "&:hover": {
                      color: "primary.main",
                      bgcolor: alpha(theme.palette.primary.main, 0.08)
                    }
                  })}>
                  <Badge
                    badgeContent={dueCount}
                    color="error"
                    invisible={dueCount === 0}
                    sx={{
                      "& .MuiBadge-badge": {
                        fontSize: "0.6rem",
                        height: 16,
                        minWidth: 16,
                        right: -6,
                        top: 0
                      }
                    }}>
                    <SchoolRoundedIcon sx={{ fontSize: 22 }} />
                  </Badge>
                </IconButton>
              </Tooltip>
            </Box>
            <Tooltip title="备份与同步">
              <IconButton
                size="small"
                onClick={() => onSetSidebarTab("backup")}
                sx={(theme) => ({
                  color:
                    sidebarTab === "backup" ? "primary.main" : "text.secondary",
                  bgcolor:
                    sidebarTab === "backup"
                      ? alpha(theme.palette.primary.main, 0.08)
                      : "transparent",
                  borderRadius: 1,
                  p: 0.75,
                  "&:hover": {
                    color: "primary.main",
                    bgcolor: alpha(theme.palette.primary.main, 0.08)
                  }
                })}>
                <BackupRoundedIcon sx={{ fontSize: 22 }} />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Thin divider */}
          <Divider sx={{ mx: 0.5 }} />

          {sidebarTab === "review" ? (
            /* Review tab content */
            <Stack spacing={1.5}>
              {recentDates.length > 0 && (
                <Box>
                  <SectionLabel>近期回顾</SectionLabel>
                  <Stack spacing={0.5}>
                    {recentDates.map((item) => (
                      <Button
                        key={item.key}
                        size="small"
                        variant={
                          reviewDateFilter === item.key
                            ? "contained"
                            : "outlined"
                        }
                        fullWidth
                        onClick={() =>
                          onReviewDateClick(
                            reviewDateFilter === item.key ? null : item.key
                          )
                        }
                        sx={{
                          borderRadius: 1,
                          fontSize: "0.75rem",
                          justifyContent: "flex-start"
                        }}>
                        {item.label} · {item.count} 张
                      </Button>
                    ))}
                  </Stack>
                </Box>
              )}
            </Stack>
          ) : sidebarTab === "backup" ? (
            /* Backup & Sync tab content */
            <Box sx={{ py: 1 }}>
              <Box sx={{ px: 1, mb: 1 }}>
                <SectionLabel>本地备份</SectionLabel>
              </Box>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={
                      backupSelectedIds.length === projects.length &&
                      projects.length > 0
                    }
                    indeterminate={
                      backupSelectedIds.length > 0 &&
                      backupSelectedIds.length < projects.length
                    }
                    onChange={onToggleBackupAll}
                  />
                }
                label={
                  <Typography variant="body2" sx={{ fontSize: "0.8rem" }}>
                    全选（{projects.length} 个项目）
                  </Typography>
                }
                sx={{ mx: 0, width: "100%", px: 1 }}
              />
              <Box sx={{ maxHeight: 180, overflowY: "auto", px: 1, mb: 1.5 }}>
                {projects.map((p) => (
                  <FormControlLabel
                    key={p.id}
                    control={
                      <Checkbox
                        size="small"
                        checked={backupSelectedIds.includes(p.id)}
                        onChange={() => onToggleBackup(p.id)}
                      />
                    }
                    label={
                      <Typography
                        variant="body2"
                        noWrap
                        sx={{ fontSize: "0.8rem" }}>
                        {p.name}
                      </Typography>
                    }
                    sx={{ mx: 0, width: "100%" }}
                  />
                ))}
              </Box>
              <Stack direction="row" spacing={1} sx={{ px: 1, mb: 2 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<FileDownloadRoundedIcon />}
                  disabled={backupSelectedIds.length === 0}
                  onClick={onExportBackup}
                  fullWidth>
                  导出备份
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<FileUploadRoundedIcon />}
                  onClick={onImportBackup}
                  fullWidth>
                  导入备份
                </Button>
              </Stack>

              <Divider sx={{ mx: 1 }} />

              <Box sx={{ px: 1, my: 1.5 }}>
                <SectionLabel>坚果云同步</SectionLabel>
              </Box>
              <Typography
                variant="caption"
                sx={{
                  px: 1,
                  display: "block",
                  color: "text.secondary",
                  mb: 1
                }}>
                {syncStatus || "未同步"}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ px: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<CloudUploadRoundedIcon />}
                  onClick={onUploadSync}
                  fullWidth>
                  上传
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<CloudDownloadRoundedIcon />}
                  onClick={onDownloadSync}
                  fullWidth>
                  下载
                </Button>
              </Stack>
            </Box>
          ) : (
            /* Project tab content */
            <Box>
              <Box sx={{ px: 1.5, pt: 1.5, pb: 0.5 }}>
                <SectionLabel>项目管理</SectionLabel>
              </Box>
              {projects.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  active={activeProjectId === p.id}
                  onOpen={() => onOpenProject(p.id)}
                  onRename={(name) => onRenameProject(p.id, name)}
                  onUpdateNote={(note) => onUpdateNote(p.id, note)}
                  onDelete={() => onDeleteProject(p.id)}
                  onCloseProject={onCloseProject}
                />
              ))}
              {projects.length === 0 && (
                <Box sx={{ px: 1.5, py: 1 }}>
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary" }}>
                    暂无项目
                  </Typography>
                </Box>
              )}
              {/* "+" tab — always last */}
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                onClick={onNewProjectClick}
                sx={{
                  px: 1.5,
                  py: 0.5,
                  cursor: "pointer",
                  "&:hover": {
                    bgcolor: "action.hover",
                    "& .new-project-icon": { color: "primary.main" }
                  }
                }}>
                <AddRoundedIcon
                  className="new-project-icon"
                  sx={{
                    fontSize: 16,
                    color: "text.secondary",
                    transition: "color 0.15s"
                  }}
                />
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: "0.8rem",
                    color: "text.secondary",
                    flex: 1
                  }}>
                  新建项目
                </Typography>
              </Stack>

              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{
                  px: 1.5,
                  py: 0.75,
                  borderTop: "1px solid",
                  borderColor: "divider",
                  cursor: "pointer",
                  bgcolor: readingFilter ? "action.selected" : "transparent",
                  "&:hover": { bgcolor: "action.hover" }
                }}
                onClick={onToggleReadingFilter}>
                <Box
                  sx={{
                    width: 3,
                    height: 14,
                    borderRadius: 1,
                    bgcolor: readingFilter ? "primary.main" : "text.disabled",
                    flexShrink: 0
                  }}
                />
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: readingFilter ? "primary.main" : "text.secondary"
                  }}>
                  稍后阅读
                </Typography>
              </Stack>
            </Box>
          )}
        </Stack>
      </Drawer>
    </>
  )
}

interface ProjectRowProps {
  project: Project
  active: boolean
  onOpen: () => void
  onRename: (name: string) => void
  onUpdateNote: (note: string) => void
  onDelete: () => void
  onCloseProject: () => void
}

function ProjectRow({
  project,
  active,
  onOpen,
  onRename,
  onUpdateNote,
  onDelete,
  onCloseProject
}: ProjectRowProps) {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(project.name)
  const [draftNote, setDraftNote] = useState(project.note ?? "")
  const [confirming, setConfirming] = useState(false)

  const commitRename = () => {
    const trimmed = draftName.trim()
    if (trimmed && trimmed !== project.name) onRename(trimmed)
    else setDraftName(project.name)
    setEditing(false)
  }

  if (editing) {
    return (
      <Box sx={{ px: 1.5, py: 1, bgcolor: "action.selected" }}>
        <TextField
          autoFocus
          fullWidth
          size="small"
          label="项目名称"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename()
            if (e.key === "Escape") {
              setDraftName(project.name)
              setEditing(false)
            }
          }}
          sx={{ mb: 1 }}
        />
        <TextField
          fullWidth
          size="small"
          multiline
          minRows={2}
          label="备注"
          placeholder="可选"
          value={draftNote}
          onChange={(e) => setDraftNote(e.target.value)}
          sx={{ mb: 1 }}
        />
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button
            size="small"
            onClick={() => {
              setEditing(false)
              setDraftName(project.name)
              setDraftNote(project.note ?? "")
            }}>
            取消
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={() => {
              commitRename()
              if (draftNote !== (project.note ?? ""))
                onUpdateNote(draftNote.trim())
            }}>
            保存
          </Button>
        </Stack>
      </Box>
    )
  }

  if (confirming) {
    return (
      <Box
        sx={{
          px: 1.5,
          py: 1,
          bgcolor: "action.selected",
          "&:hover": { bgcolor: "action.selected" }
        }}>
        <Typography variant="caption" sx={{ display: "block", mb: 1 }}>
          删除「{project.name}」？该项目的所有卡片也将一并删除。
        </Typography>
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button size="small" onClick={() => setConfirming(false)}>
            取消
          </Button>
          <Button
            size="small"
            color="error"
            variant="contained"
            onClick={() => {
              setConfirming(false)
              onDelete()
            }}>
            删除
          </Button>
        </Stack>
      </Box>
    )
  }

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={(theme) => ({
        pl: 1.5,
        pr: 1.5,
        py: 0.5,
        cursor: "pointer",
        borderLeft: "3px solid",
        borderColor: active ? "primary.main" : "transparent",
        bgcolor: active
          ? alpha(theme.palette.primary.main, 0.05)
          : "transparent",
        "&:hover": {
          bgcolor: active
            ? alpha(theme.palette.primary.main, 0.05)
            : "action.hover"
        }
      })}
      onClick={active ? undefined : onOpen}>
      <FolderOpenRoundedIcon
        sx={{
          fontSize: 16,
          color: active ? "primary.main" : "text.secondary"
        }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="body2"
          noWrap
          sx={{
            fontSize: "0.8rem",
            fontWeight: active ? 600 : 400,
            color: active ? "primary.main" : "text.primary"
          }}>
          {project.name}
        </Typography>
        {project.note && (
          <Typography
            variant="caption"
            noWrap
            sx={{
              color: "text.secondary",
              display: "block",
              fontSize: "0.65rem"
            }}>
            {project.note}
          </Typography>
        )}
      </Box>
      {active ? (
        <Tooltip title="关闭项目">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation()
              onCloseProject()
            }}
            sx={{
              color: "text.secondary",
              opacity: 0.8,
              "&:hover": { opacity: 1 }
            }}>
            <CloseRoundedIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      ) : (
        <Box
          sx={{
            display: "flex",
            gap: 0.25,
            opacity: 0.6,
            "&:hover": { opacity: 1 }
          }}
          onClick={(e) => e.stopPropagation()}>
          <IconButton
            size="small"
            onClick={() => {
              setDraftName(project.name)
              setDraftNote(project.note ?? "")
              setEditing(true)
            }}>
            <EditRoundedIcon sx={{ fontSize: 14 }} />
          </IconButton>
          <IconButton size="small" onClick={() => setConfirming(true)}>
            <DeleteOutlineRoundedIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
      )}
    </Stack>
  )
}
