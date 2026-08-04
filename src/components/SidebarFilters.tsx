import AddRoundedIcon from "@mui/icons-material/AddRounded"
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded"
import CloudDownloadRoundedIcon from "@mui/icons-material/CloudDownloadRounded"
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded"
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded"
import FileUploadRoundedIcon from "@mui/icons-material/FileUploadRounded"
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded"
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded"
import UnfoldLessRoundedIcon from "@mui/icons-material/UnfoldLessRounded"
import UnfoldMoreRoundedIcon from "@mui/icons-material/UnfoldMoreRounded"
import {
  Box,
  Button,
  Checkbox,
  Divider,
  Drawer,
  Stack,
  Typography
} from "@mui/material"
import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import type { SxProps, Theme } from "@mui/material"

import type { PdfFile, Project, TodoFilter, TodoStats } from "../types"
import type { PdfOutlineItem } from "./PdfView"
import type { SidebarTab } from "./NavRail"

interface SidebarFiltersProps {
  open: boolean
  width: number
  sidebarTab: SidebarTab
  projects: Project[]
  syncStatus: string
  recentDates: { key: string; label: string; count: number }[]
  reviewDateFilter: string | null
  todoStats: TodoStats
  todoFilter: TodoFilter
  pdfs: PdfFile[]
  countByPdf: Record<string, number>
  activePdfId: string | null
  pdfOutline: PdfOutlineItem[] | null
  onTodoFilterChange: (filter: TodoFilter) => void
  onOpenPdfClick: () => void
  onOpenPdf: (id: string) => void
  onOutlineClick: (item: PdfOutlineItem) => void
  children?: ReactNode
  onReviewDateClick: (dateKey: string | null) => void
  onWidthChange: (w: number) => void
  onNewProjectClick: () => void
  backupScope: "projects" | "pdfs"
  onBackupScopeChange: (scope: "projects" | "pdfs") => void
  onImportBackup: () => void
  onUploadSync: () => void
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
function OutlineTree({
  item,
  depth,
  onSelect,
  collapsedKeys,
  onToggleKey
}: {
  item: PdfOutlineItem
  depth: number
  onSelect: (item: PdfOutlineItem) => void
  collapsedKeys: Set<string>
  onToggleKey: (key: string) => void
}) {
  const key = item.title + item.dest
  const hasChildren = !!item.items?.length
  const collapsed = collapsedKeys.has(key)
  return (
    <>
      <Box
        onClick={() => onSelect(item)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.25,
          pl: 1 + depth * 1.25,
          pr: 1,
          py: 0.5,
          borderRadius: 1,
          cursor: "pointer",
          color: "text.secondary",
          "&:hover": { bgcolor: "action.hover", color: "text.primary" }
        }}>
        {hasChildren ? (
          <Box
            component="span"
            onClick={(e) => {
              e.stopPropagation()
              onToggleKey(key)
            }}
            sx={{
              display: "inline-flex",
              color: "text.disabled",
              cursor: "pointer",
              "&:hover": { color: "text.secondary" }
            }}>
            {collapsed ? (
              <ChevronRightRoundedIcon sx={{ fontSize: 14 }} />
            ) : (
              <ExpandMoreRoundedIcon sx={{ fontSize: 14 }} />
            )}
          </Box>
        ) : (
          <Box component="span" sx={{ width: 14 }} />
        )}
        <Typography
          variant="body2"
          sx={{
            fontSize: "0.8rem",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}>
          {item.title}
        </Typography>
      </Box>
      {!collapsed &&
        item.items?.map((child) => (
          <OutlineTree
            key={child.title + child.dest}
            item={child}
            depth={depth + 1}
            onSelect={onSelect}
            collapsedKeys={collapsedKeys}
            onToggleKey={onToggleKey}
          />
        ))}
    </>
  )
}

function Well({
  children,
  sx
}: {
  children: React.ReactNode
  sx?: SxProps<Theme>
}) {
  return (
    <Box
      sx={{
        bgcolor: "background.default",
        borderRadius: 1,
        border: "1px solid",
        borderColor: "divider",
        p: 0.75,
        ...sx
      }}>
      {children}
    </Box>
  )
}

function collectTocKeys(items: PdfOutlineItem[]): string[] {
  const keys: string[] = []
  const walk = (list: PdfOutlineItem[]) => {
    for (const item of list) {
      if (item.items?.length) {
        keys.push(item.title + item.dest)
        walk(item.items)
      }
    }
  }
  walk(items)
  return keys
}

/** PDF sidebar tab: TOC (with one-click collapse/expand) or the library. */
function PdfTab({
  activePdfId,
  pdfOutline,
  pdfs,
  countByPdf,
  onOutlineClick,
  onOpenPdfClick,
  onOpenPdf
}: {
  activePdfId: string | null
  pdfOutline: PdfOutlineItem[] | null
  pdfs: PdfFile[]
  countByPdf: Record<string, number>
  onOutlineClick: (item: PdfOutlineItem) => void
  onOpenPdfClick: () => void
  onOpenPdf: (id: string) => void
}) {
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set())
  const [showAll, setShowAll] = useState(false)
  const RECENT_TOTAL = 7
  const toggleKey = (key: string) =>
    setCollapsedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const ordered = [...pdfs].sort(
    (a, b) =>
      (b.lastOpened ?? 0) - (a.lastOpened ?? 0) || b.addedAt - a.addedAt
  )
  const visible = showAll ? ordered : ordered.slice(0, RECENT_TOTAL)
  const hiddenCount = ordered.length - visible.length

  return (
    <Box sx={{ py: 1 }}>
      {activePdfId && pdfOutline && pdfOutline.length > 0 ? (
        <Well>
          <Box sx={{ display: "flex", alignItems: "center", mb: 0.5 }}>
            <SectionLabel>目录</SectionLabel>
            <Box sx={{ flex: 1 }} />
            <Box
              onClick={() =>
                collapsedKeys.size > 0
                  ? setCollapsedKeys(new Set())
                  : setCollapsedKeys(new Set(collectTocKeys(pdfOutline)))
              }
              title={collapsedKeys.size > 0 ? "全部展开" : "全部折叠"}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.25,
                fontSize: "0.68rem",
                color: "text.disabled",
                cursor: "pointer",
                px: 0.5,
                "&:hover": { color: "text.primary" }
              }}>
              {collapsedKeys.size > 0 ? (
                <UnfoldMoreRoundedIcon sx={{ fontSize: 15 }} />
              ) : (
                <UnfoldLessRoundedIcon sx={{ fontSize: 15 }} />
              )}
              {collapsedKeys.size > 0 ? "展开" : "折叠"}
            </Box>
          </Box>
          {pdfOutline.map((item) => (
            <OutlineTree
              key={item.title + item.dest}
              item={item}
              depth={0}
              onSelect={onOutlineClick}
              collapsedKeys={collapsedKeys}
              onToggleKey={toggleKey}
            />
          ))}
        </Well>
      ) : (
        <>
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
                  color: "text.secondary",
                  "&:hover": { bgcolor: "action.hover", color: "text.primary" }
                }}>
                <PictureAsPdfRoundedIcon
                  sx={{
                    fontSize: 15,
                    color: isPlaceholder ? "primary.main" : "text.disabled",
                    flexShrink: 0
                  }}
                />
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: "0.8rem",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1
                  }}>
                  {p.name}
                </Typography>
                {isPlaceholder && (
                  <Typography
                    variant="caption"
                    sx={{ fontSize: "0.62rem", color: "primary.main", flexShrink: 0 }}>
                    未同步
                  </Typography>
                )}
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: "0.66rem",
                    color: "text.disabled",
                    flexShrink: 0
                  }}>
                  {countByPdf[p.id] ?? 0}
                </Typography>
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
          </Well>
        </>
      )}
    </Box>
  )
}

export default function SidebarFilters({
  open,
  width,
  sidebarTab,
  projects,
  syncStatus,
  recentDates,
  reviewDateFilter,
  todoStats,
  todoFilter,
  pdfs,
  countByPdf,
  activePdfId,
  pdfOutline,
  onTodoFilterChange,
  onOpenPdfClick,
  onOpenPdf,
  onOutlineClick,
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
          transition: "width 0.2s ease",
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
                            color: active ? "text.primary" : "text.secondary",
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
                      backupScope === "projects" ? "text.primary" : "text.secondary",
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
                      backupScope === "pdfs" ? "text.primary" : "text.secondary",
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
              </Well>
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
              </Well>
            </Box>
          ) : sidebarTab === "pdf" ? (
            /* PDF tab: TOC when a PDF is open, otherwise the library */
            <PdfTab
              key={activePdfId ?? "none"}
              activePdfId={activePdfId}
              pdfOutline={pdfOutline}
              pdfs={pdfs}
              countByPdf={countByPdf}
              onOutlineClick={onOutlineClick}
              onOpenPdfClick={onOpenPdfClick}
              onOpenPdf={onOpenPdf}
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
