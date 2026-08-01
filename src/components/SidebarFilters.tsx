import AddRoundedIcon from "@mui/icons-material/AddRounded"
import CloudDownloadRoundedIcon from "@mui/icons-material/CloudDownloadRounded"
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded"
import FileDownloadRoundedIcon from "@mui/icons-material/FileDownloadRounded"
import FileUploadRoundedIcon from "@mui/icons-material/FileUploadRounded"
import {
  Box,
  Button,
  Checkbox,
  Divider,
  Drawer,
  FormControlLabel,
  Stack,
  Typography
} from "@mui/material"
import { useEffect, useRef } from "react"
import type { ReactNode } from "react"

import type { Project, TodoFilter, TodoStats } from "../types"
import type { SidebarTab } from "./NavRail"

interface SidebarFiltersProps {
  open: boolean
  width: number
  sidebarTab: SidebarTab
  projects: Project[]
  readingFilter: boolean
  backupSelectedIds: string[]
  syncStatus: string
  recentDates: { key: string; label: string; count: number }[]
  reviewDateFilter: string | null
  todoStats: TodoStats
  todoFilter: TodoFilter
  onTodoFilterChange: (filter: TodoFilter) => void
  children?: ReactNode
  onReviewDateClick: (dateKey: string | null) => void
  onWidthChange: (w: number) => void
  onToggleReadingFilter: () => void
  onNewProjectClick: () => void
  onToggleBackup: (id: string) => void
  onToggleBackupAll: () => void
  onExportBackup: () => void
  onImportBackup: () => void
  onUploadSync: () => void
  onDownloadSync: () => void
}

const TAB_TITLES: Record<SidebarTab, string> = {
  projects: "项目",
  review: "复习",
  backup: "备份与同步",
  todo: "待办"
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
  sidebarTab,
  projects,
  readingFilter,
  backupSelectedIds,
  syncStatus,
  recentDates,
  reviewDateFilter,
  todoStats,
  todoFilter,
  onTodoFilterChange,
  children,
  onReviewDateClick,
  onWidthChange,
  onToggleReadingFilter,
  onNewProjectClick,
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
            dragRef.current = () => {
              document.removeEventListener("mousemove", onMove)
              document.removeEventListener("mouseup", onUp)
            }
          }}
        />
        <Stack spacing={1.5} sx={{ p: 2, pt: 2.5 }}>
          {/* Top: current view title */}
          <SectionLabel>{TAB_TITLES[sidebarTab]}</SectionLabel>

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
          ) : sidebarTab === "todo" ? (
            /* Todo tab: filter groups with counts */
            <Box>
              <SectionLabel>待办</SectionLabel>
              <Box sx={{ mt: 0.5 }}>
                {(
                  [
                    ["all", "全部", todoStats.total],
                    ["incomplete", "未完成", todoStats.incomplete],
                    ["completed", "已完成", todoStats.completed],
                    ["overdue", "已过期", todoStats.overdue],
                    ["today", "今天到期", todoStats.today]
                  ] as [TodoFilter, string, number][]
                ).map(([key, label, count]) => (
                  <Box
                    key={key}
                    onClick={() => onTodoFilterChange(key)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      px: 1.5,
                      py: 0.5,
                      borderRadius: 1,
                      cursor: "pointer",
                      bgcolor:
                        todoFilter === key ? "action.selected" : "transparent",
                      color:
                        todoFilter === key
                          ? "text.primary"
                          : "text.secondary",
                      "&:hover": { bgcolor: "action.hover" }
                    }}>
                    <Typography variant="body2" sx={{ fontSize: "0.8rem" }}>
                      {label}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: "0.7rem",
                        color:
                          todoFilter === key
                            ? "primary.main"
                            : "text.disabled"
                      }}>
                      {count}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          ) : (
            /* Project tab content: tree + actions */
            <>
              {children}

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
            </>
          )}
        </Stack>
      </Drawer>
    </>
  )
}
