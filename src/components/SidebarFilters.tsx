import AddRoundedIcon from "@mui/icons-material/AddRounded"
import CloudDownloadRoundedIcon from "@mui/icons-material/CloudDownloadRounded"
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded"
import FileUploadRoundedIcon from "@mui/icons-material/FileUploadRounded"
import LinkRoundedIcon from "@mui/icons-material/LinkRounded"
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded"
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import EditRoundedIcon from "@mui/icons-material/EditRounded"
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded"
import {
  Box,
  Button,
  IconButton,
  DialogContentText,
  Divider,
  Drawer,
  Stack,
  Typography
} from "@mui/material"
import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"

import RenameDialog from "./RenameDialog"
import type { PdfFile, TodoFilter, TodoStats } from "../types"
import type { SidebarTab } from "./NavRail"
import { RECENT_TOTAL as RECENT_TOTAL_SHARED } from "../constants"
import DialogShell from "./DialogShell"
import Well from "./Well"
import { byRecency } from "../utils"

interface SidebarFiltersProps {
  open: boolean
  width: number
  sidebarTab: SidebarTab
  syncStatus: string
  recentDates: { key: string; label: string; count: number }[]
  reviewDateFilter: string | null
  todoStats: TodoStats
  todoFilter: TodoFilter
  pdfs: PdfFile[]
  countByPdf: Record<string, number>
  activePdfId: string | null
  onTodoFilterChange: (filter: TodoFilter) => void
  onOpenPdfClick: () => void
  onOpenPdf: (id: string) => void
  onOpenUrl?: () => void
  onRenamePdf?: (id: string, name: string) => void
  onDeletePdf?: (pdf: PdfFile) => void
  children?: ReactNode
  onReviewDateClick: (dateKey: string | null) => void
  onWidthChange: (w: number) => void
  onNewProjectClick: () => void
  backupScope: "projects" | "pdfs"
  onBackupScopeChange: (scope: "projects" | "pdfs") => void
  onImportBackup: () => void
  onUploadSync: (force: boolean) => void
  onDownloadSync: () => void
}

const TAB_TITLES: Record<SidebarTab, string> = {
  projects: "项目",
  review: "复习",
  backup: "备份与同步",
  todo: "待办",
  pdf: "PDF 阅读"
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

/** Recursive PDF outline (TOC) tree — collapse is controlled from above so a
 *  single "全部折叠/展开" toggle works across the whole tree. */
/** PDF sidebar tab: TOC (with one-click collapse/expand) or the library. */
function PdfTab({
  activePdfId,
  pdfs,
  countByPdf,
  onOpenPdfClick,
  onOpenPdf,
  onOpenUrl,
  onRenamePdf,
  onDeletePdf
}: {
  activePdfId: string | null
  pdfs: PdfFile[]
  countByPdf: Record<string, number>
  onOpenPdfClick: () => void
  onOpenPdf: (id: string) => void
  onOpenUrl?: () => void
  onRenamePdf?: (id: string, name: string) => void
  onDeletePdf?: (pdf: PdfFile) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const [pdfRename, setPdfRename] = useState<{
    id: string
    name: string
  } | null>(null)
  const RECENT_TOTAL = RECENT_TOTAL_SHARED
  // Active PDF pins to the top (like the project tree's active project).
  const byLastOpened = byRecency<PdfFile>(
    (p) => p.lastOpened,
    (a, b) => b.addedAt - a.addedAt
  )
  const ordered = [...pdfs].sort((a, b) => {
    if (a.id === activePdfId) return -1
    if (b.id === activePdfId) return 1
    return byLastOpened(a, b)
  })
  const visible = showAll ? ordered : ordered.slice(0, RECENT_TOTAL)
  const hiddenCount = ordered.length - visible.length

  return (
    <>
    <Box sx={{ py: 1 }}>
<Well>
            <Box sx={{ display: "flex", alignItems: "center", mb: 0.5 }}>
              <SectionLabel>最近</SectionLabel>
              <Box sx={{ flex: 1 }} />
              {hiddenCount > 0 && (
                <Box
                  onClick={() => setShowAll((s) => !s)}
                  sx={{
                    fontSize: "0.68rem",
                    color: "text.disabled",
                    cursor: "pointer",
                    px: 0.5,
                    "&:hover": { color: "text.primary" }
                  }}>
                  {showAll ? "收起" : `全部 PDF (${ordered.length})`}
                </Box>
              )}
            </Box>
            {visible.map((p) => {
              const isPlaceholder = !p.bytes
              const isActive = p.id === activePdfId
              return (
              <Box
                key={p.id}
                onClick={() => (isPlaceholder ? onOpenPdfClick() : onOpenPdf(p.id))}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  cursor: "pointer",
                  bgcolor: isActive ? "action.selected" : "transparent",
                  color: isActive ? "text.primary" : "text.secondary",
                  "&:hover": { bgcolor: "action.hover", color: "text.primary" },
                  "&:hover .pdf-rename": { opacity: 1 }
                }}>
                <PictureAsPdfRoundedIcon
                  sx={{
                    fontSize: 15,
                    color: isActive
                      ? "primary.main"
                      : isPlaceholder
                        ? "primary.main"
                        : "text.disabled",
                    flexShrink: 0
                  }}
                />
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: "0.8rem",
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "primary.main" : "inherit",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1
                  }}>
                  {p.name}
                </Typography>
                {onRenamePdf && (
                  <IconButton
                    size="small"
                    title="重命名"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPdfRename({ id: p.id, name: p.name })
                    }}
                    className="pdf-rename"
                    sx={{
                      p: 0.25,
                      color: "text.disabled",
                      opacity: 0,
                      flexShrink: 0,
                      transition: "opacity 0.15s",
                      "&:hover": { color: "primary.main", bgcolor: "transparent" }
                    }}>
                    <EditRoundedIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                )}
                {isPlaceholder && (
                  <Typography
                    variant="caption"
                    sx={{ fontSize: "0.62rem", color: "primary.main", flexShrink: 0 }}>
                    未同步
                  </Typography>
                )}
                {onDeletePdf && (
                  <IconButton
                    size="small"
                    title="删除 PDF"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeletePdf(p)
                    }}
                    className="pdf-rename"
                    sx={{
                      p: 0.25,
                      color: "text.disabled",
                      opacity: 0,
                      flexShrink: 0,
                      transition: "opacity 0.15s",
                      "&:hover": { color: "error.main", bgcolor: "transparent" }
                    }}>
                    <DeleteOutlineRoundedIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                )}
              </Box>
              )
            })}
          </Well>
          {/* bottom: 打开 PDF (same row style as 新建项目) */}
          <Well sx={{ p: 0, mt: 0.5, overflow: "hidden" }}>
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              onClick={onOpenPdfClick}
              sx={{
                px: 1.5,
                py: 0.75,
                cursor: "pointer",
                "&:hover": {
                  bgcolor: "action.hover",
                  "& .pdf-open-icon": { color: "primary.main" }
                }
              }}>
              <AddRoundedIcon
                className="pdf-open-icon"
                sx={{
                  fontSize: 16,
                  color: "text.secondary",
                  transition: "color 0.15s"
                }}
              />
              <Typography
                variant="body2"
                sx={{ fontSize: "0.8rem", color: "text.secondary", flex: 1 }}>
                打开 PDF
              </Typography>
            </Stack>
            {onOpenUrl && (
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                onClick={onOpenUrl}
                sx={{
                  px: 1.5,
                  py: 0.75,
                  borderTop: "1px solid",
                  borderColor: "divider",
                  cursor: "pointer",
                  "&:hover": {
                    bgcolor: "action.hover",
                    "& .pdf-open-icon": { color: "primary.main" }
                  }
                }}>
                <LinkRoundedIcon
                  className="pdf-open-icon"
                  sx={{
                    fontSize: 16,
                    color: "text.secondary",
                    transition: "color 0.15s"
                  }}
                />
                <Typography
                  variant="body2"
                  sx={{ fontSize: "0.8rem", color: "text.secondary", flex: 1 }}>
                  从 URL 打开
                </Typography>
              </Stack>
            )}
          </Well>
        </Box>
      {pdfRename && (
        <RenameDialog
          open
          title="重命名 PDF"
          label="PDF 名称"
          value={pdfRename.name}
          onClose={() => setPdfRename(null)}
          onConfirm={(name) => {
            if (name && name !== pdfRename.name)
              onRenamePdf?.(pdfRename.id, name)
          }}
        />
      )}
    </>
  )
}

export default function SidebarFilters({
  open,
  width,
  sidebarTab,
  syncStatus,
  recentDates,
  reviewDateFilter,
  todoStats,
  todoFilter,
  pdfs,
  countByPdf,
  activePdfId,
  onTodoFilterChange,
  onOpenPdfClick,
  onOpenPdf,
  onOpenUrl,
  onRenamePdf,
  onDeletePdf,
  children,
  onReviewDateClick,
  onWidthChange,
  onNewProjectClick,
  backupScope,
  onBackupScopeChange,
  onImportBackup,
  onUploadSync,
  onDownloadSync
}: SidebarFiltersProps) {
  const [forceConfirmOpen, setForceConfirmOpen] = useState(false)
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
          position: "relative",
          overflow: "hidden",
          "& .MuiDrawer-paper": {
            position: "relative",
            width,
            boxSizing: "border-box",
            bgcolor: "background.paper",
            borderRight: "1px solid",
            borderColor: "divider",
            overflowX: "hidden",
            overflowY: "auto",
            height: "100vh"
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
            "&:hover": { bgcolor: "primary.light" },
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
        <Stack spacing={1.5} sx={{ p: 2, pt: 2.75 }}>
          {/* Top: current view title */}
          <SectionLabel>{TAB_TITLES[sidebarTab]}</SectionLabel>

          <Divider sx={{ mx: 1 }} />

          {sidebarTab === "review" ? (
            /* Review tab content */
            <Stack spacing={1.5}>
              {recentDates.length > 0 && (
                <Well>
                  <SectionLabel>近期回顾</SectionLabel>
                  <Stack spacing={0.5} sx={{ mt: 1 }}>
                    {recentDates.map((item) => {
                      const active = reviewDateFilter === item.key
                      return (
                        <Box
                          key={item.key}
                          onClick={() =>
                            onReviewDateClick(active ? null : item.key)
                          }
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 1,
                            px: 1,
                            py: 0.5,
                            borderRadius: 1,
                            cursor: "pointer",
                            bgcolor: active ? "action.selected" : "transparent",
                            color: active ? "primary.main" : "text.secondary",
                            "&:hover": { bgcolor: "action.hover" }
                          }}>
                          <Typography
                            variant="body2"
                            noWrap
                            sx={{ fontSize: "0.8rem" }}>
                            {item.label}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ fontSize: "0.68rem", color: "text.disabled" }}>
                            {item.count} 张
                          </Typography>
                        </Box>
                      )
                    })}
                  </Stack>
                </Well>
              )}
            </Stack>
          ) : sidebarTab === "backup" ? (
            /* Backup & Sync tab content */
            <Box sx={{ py: 1 }}>
              <Well>
                <Box sx={{ mb: 0.5 }}>
                  <SectionLabel>本地备份</SectionLabel>
                </Box>
                <Box
                  onClick={() => onBackupScopeChange("projects")}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    px: 1,
                    py: 0.5,
                    borderRadius: 1,
                    cursor: "pointer",
                    bgcolor:
                      backupScope === "projects" ? "action.selected" : "transparent",
                    color:
                      backupScope === "projects" ? "primary.main" : "text.secondary",
                    "&:hover": { bgcolor: "action.hover" }
                  }}>
                  <FolderOpenRoundedIcon sx={{ fontSize: 16 }} />
                  <Typography variant="body2" sx={{ fontSize: "0.8rem", flex: 1 }}>
                    项目
                  </Typography>
                </Box>
                <Box
                  onClick={() => onBackupScopeChange("pdfs")}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    px: 1,
                    py: 0.5,
                    borderRadius: 1,
                    cursor: "pointer",
                    bgcolor:
                      backupScope === "pdfs" ? "action.selected" : "transparent",
                    color:
                      backupScope === "pdfs" ? "primary.main" : "text.secondary",
                    "&:hover": { bgcolor: "action.hover" }
                  }}>
                  <PictureAsPdfRoundedIcon sx={{ fontSize: 16 }} />
                  <Typography variant="body2" sx={{ fontSize: "0.8rem", flex: 1 }}>
                    PDF
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<FileUploadRoundedIcon />}
                  onClick={onImportBackup}
                  fullWidth
                  sx={{ mt: 1 }}>
                  导入备份
                </Button>
              </Well>

              <Box sx={{ height: 1.5 }} />

              <Well>
                <Box sx={{ mb: 1 }}>
                  <SectionLabel>坚果云同步</SectionLabel>
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    color: "text.secondary",
                    mb: 1
                  }}>
                  {syncStatus || "未同步"}
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<CloudUploadRoundedIcon />}
                    onClick={() => onUploadSync(false)}
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
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<CloudUploadRoundedIcon />}
                  onClick={() => setForceConfirmOpen(true)}
                  fullWidth
                  sx={{ mt: 1 }}>
                  强制上传
                </Button>
              </Well>

              <DialogShell
                open={forceConfirmOpen}
                onClose={() => setForceConfirmOpen(false)}
                title="强制上传"
                maxWidth="xs"
                confirmLabel="确认上传"
                confirmColor="error"
                onConfirm={() => {
                  setForceConfirmOpen(false)
                  onUploadSync(true)
                }}>
                <DialogContentText>
                  本操作会强制覆盖云端数据，确认执行？
                </DialogContentText>
              </DialogShell>
            </Box>
          ) : sidebarTab === "todo" ? (
            /* Todo tab: filter groups with counts */
            <Box sx={{ py: 1 }}>
              <Well>
                <Box sx={{ mb: 0.5 }}>
                  <SectionLabel>待办</SectionLabel>
                </Box>
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
                      px: 1,
                      py: 0.5,
                      borderRadius: 1,
                      cursor: "pointer",
                      bgcolor:
                        todoFilter === key ? "action.selected" : "transparent",
                      color:
                        todoFilter === key
                          ? "primary.main"
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
              </Well>
            </Box>
          ) : sidebarTab === "pdf" ? (
            /* PDF tab: the library (TOC moved to the reader panel) */
            <PdfTab
              key={activePdfId ?? "none"}
              activePdfId={activePdfId}
              pdfs={pdfs}
              countByPdf={countByPdf}
              onOpenPdfClick={onOpenPdfClick}
              onOpenPdf={onOpenPdf}
              onOpenUrl={onOpenUrl}
              onRenamePdf={onRenamePdf}
              onDeletePdf={onDeletePdf}
            />
          ) : (
            /* Project tab content: tree + actions */
            <>
              {children}

              <Well sx={{ p: 0, mt: 0.5, overflow: "hidden" }}>
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  onClick={onNewProjectClick}
                  sx={{
                    px: 1.5,
                    py: 0.75,
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
              </Well>
            </>
          )}
        </Stack>
      </Drawer>
    </>
  )
}
