import AddRoundedIcon from "@mui/icons-material/AddRounded"
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded"
import CloudDownloadRoundedIcon from "@mui/icons-material/CloudDownloadRounded"
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded"
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import DriveFileMoveRoundedIcon from "@mui/icons-material/DriveFileMoveRounded"
import EditRoundedIcon from "@mui/icons-material/EditRounded"
import FolderRoundedIcon from "@mui/icons-material/FolderRounded"
import LinkRoundedIcon from "@mui/icons-material/LinkRounded"
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded"
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded"
import {
  Box,
  Button,
  DialogContentText,
  Divider,
  Drawer,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Typography
} from "@mui/material"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"

import { RECENT_TOTAL as RECENT_TOTAL_SHARED } from "../constants"
import type { PdfMetaLite } from "../database"
import type { ReadLaterFilter, TodoTab } from "../hooks/useTodoView"
import type { ReadLater, TodoFilter, TodoStats } from "../types"
import { byRecency } from "../utils"
import DialogShell from "./DialogShell"
import type { SidebarTab } from "./NavRail"
import RenameDialog from "./RenameDialog"
import Well from "./Well"

interface SidebarFiltersProps {
  open: boolean
  width: number
  sidebarTab: SidebarTab
  syncStatus: string
  recentDates: { key: string; label: string; count: number }[]
  reviewDateFilter: string | null
  todoStats: TodoStats
  todoFilter: TodoFilter
  todoTab: TodoTab
  readLaterFilter: ReadLaterFilter
  activeReadLater: ReadLater[]
  doneReadLater: ReadLater[]
  pdfs: PdfMetaLite[]
  countByPdf: Record<string, number>
  activePdfId: string | null
  onTodoFilterChange: (filter: TodoFilter) => void
  onReadLaterFilterChange: (filter: ReadLaterFilter) => void
  onOpenPdfClick: () => void
  onOpenPdf: (id: string) => void
  onOpenUrl?: () => void
  onRenamePdf?: (id: string, name: string) => void
  onDeletePdf?: (pdf: PdfMetaLite) => void
  topics?: string[]
  onNewTopic?: (name: string) => void
  onRenameTopic?: (oldName: string, name: string) => void
  onDeleteTopic?: (topic: string) => void
  onMovePdf?: (pdfId: string, topic: string | undefined) => void
  children?: ReactNode
  onReviewDateClick: (dateKey: string | null) => void
  onWidthChange: (w: number) => void
  onNewProjectClick: () => void
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
  onDeletePdf,
  topics = [],
  onNewTopic,
  onRenameTopic,
  onDeleteTopic,
  onMovePdf
}: {
  activePdfId: string | null
  pdfs: PdfMetaLite[]
  countByPdf: Record<string, number>
  onOpenPdfClick: () => void
  onOpenPdf: (id: string) => void
  onOpenUrl?: () => void
  onRenamePdf?: (id: string, name: string) => void
  onDeletePdf?: (pdf: PdfMetaLite) => void
  topics?: string[]
  onNewTopic?: (name: string) => void
  onRenameTopic?: (oldName: string, name: string) => void
  onDeleteTopic?: (topic: string) => void
  onMovePdf?: (pdfId: string, topic: string | undefined) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const [pdfRename, setPdfRename] = useState<{
    id: string
    name: string
  } | null>(null)
  // 最近 / 主题 free toggle (persisted like the other _ui prefs).
  const [view, setView] = useState<"recent" | "topics">("recent")
  const [topicOpen, setTopicOpen] = useState<Record<string, boolean>>({})
  const [topicRename, setTopicRename] = useState<string | null>(null)
  const [topicCreate, setTopicCreate] = useState(false)
  const [moveMenu, setMoveMenu] = useState<{
    pdfId: string
    anchor: HTMLElement | null
  } | null>(null)
  const RECENT_TOTAL = RECENT_TOTAL_SHARED

  useEffect(() => {
    chrome.storage.local.get("_uiPdfSidebarView", (data) => {
      const v = data._uiPdfSidebarView
      if (v === "recent" || v === "topics") setView(v)
    })
  }, [])
  const switchView = useCallback((v: "recent" | "topics") => {
    setView(v)
    chrome.storage.local.set({ _uiPdfSidebarView: v })
  }, [])

  // Active PDF pins to the top (like the project tree's active project).
  const byLastOpened = byRecency<PdfMetaLite>(
    (p) => p.lastOpened,
    (a, b) => b.addedAt - a.addedAt
  )
  const ordered = useMemo(
    () =>
      [...pdfs].sort((a, b) => {
        if (a.id === activePdfId) return -1
        if (b.id === activePdfId) return 1
        return byLastOpened(a, b)
      }),
    [pdfs, activePdfId, byLastOpened]
  )
  // Topic view grouping: pdfs by topic + the 未分类 bucket.
  const { groups, unclassified } = useMemo(() => {
    const g = new Map<string, PdfMetaLite[]>()
    const u: PdfMetaLite[] = []
    for (const p of ordered) {
      if (p.topic) {
        const arr = g.get(p.topic) ?? []
        arr.push(p)
        g.set(p.topic, arr)
      } else {
        u.push(p)
      }
    }
    return { groups: g, unclassified: u }
  }, [ordered])

  const toggleTopic = useCallback((t: string) => {
    setTopicOpen((o) => ({ ...o, [t]: !o[t] }))
  }, [])

  // Shared PDF row (recent + topic views).
  const renderPdfRow = (p: PdfMetaLite, allowMove?: boolean) => {
    const isPlaceholder = !p.hasBytes
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
            fontSize: 16,
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
        {allowMove && onMovePdf && (
          <IconButton
            size="small"
            title="移动到主题"
            onClick={(e) => {
              e.stopPropagation()
              setMoveMenu({ pdfId: p.id, anchor: e.currentTarget })
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
            <DriveFileMoveRoundedIcon sx={{ fontSize: 14 }} />
          </IconButton>
        )}
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
  }

  const renderTopicHeader = (t: string, count: number) => {
    const open = topicOpen[t]
    return (
      <Box
        key={t}
        onClick={() => toggleTopic(t)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 1,
          py: 0.5,
          borderRadius: 1,
          cursor: "pointer",
          color: "text.secondary",
          "&:hover": { bgcolor: "action.hover", "& .topic-ops": { opacity: 1 } }
        }}>
        <ChevronRightRoundedIcon
          sx={{
            fontSize: 15,
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform 0.15s",
            flexShrink: 0
          }}
        />
        <Typography
          sx={{
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "text.primary",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}>
          {t}
        </Typography>
        <Typography
          sx={{ fontSize: "0.65rem", color: "text.disabled", flexShrink: 0 }}>
          {count}
        </Typography>
        <Box
          className="topic-ops"
          sx={{
            display: "flex",
            opacity: 0,
            transition: "opacity 0.15s",
            flexShrink: 0
          }}>
          {onRenameTopic && (
            <IconButton
              size="small"
              title="重命名主题"
              onClick={(e) => {
                e.stopPropagation()
                setTopicRename(t)
              }}
              sx={{
                p: 0.25,
                color: "text.disabled",
                "&:hover": { color: "primary.main", bgcolor: "transparent" }
              }}>
              <EditRoundedIcon sx={{ fontSize: 14 }} />
            </IconButton>
          )}
          {onDeleteTopic && (
            <IconButton
              size="small"
              title="删除主题"
              onClick={(e) => {
                e.stopPropagation()
                onDeleteTopic(t)
              }}
              sx={{
                p: 0.25,
                color: "text.disabled",
                "&:hover": { color: "error.main", bgcolor: "transparent" }
              }}>
              <DeleteOutlineRoundedIcon sx={{ fontSize: 14 }} />
            </IconButton>
          )}
        </Box>
      </Box>
    )
  }

  const visible = showAll ? ordered : ordered.slice(0, RECENT_TOTAL)
  const hiddenCount = ordered.length - visible.length

  return (
    <>
      <Box sx={{ py: 1 }}>
        {/* 最近 / 主题 toggle */}
        <Box
          sx={{
            display: "flex",
            gap: 0.5,
            mb: 1,
            p: 0.25,
            bgcolor: "action.hover",
            borderRadius: 1
          }}>
          {(["recent", "topics"] as const).map((v) => (
            <Box
              key={v}
              onClick={() => switchView(v)}
              sx={{
                flex: 1,
                textAlign: "center",
                py: 0.5,
                borderRadius: 1,
                fontSize: "0.75rem",
                cursor: "pointer",
                bgcolor: view === v ? "background.paper" : "transparent",
                color: view === v ? "primary.main" : "text.secondary",
                fontWeight: view === v ? 600 : 400
              }}>
              {v === "recent" ? "最近" : "主题"}
            </Box>
          ))}
        </Box>
        {view === "recent" ? (
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
            {visible.map((p) => renderPdfRow(p))}
          </Well>
        ) : (
          <Well>
            <Box sx={{ display: "flex", alignItems: "center", mb: 0.5 }}>
              <SectionLabel>主题</SectionLabel>
              <Box sx={{ flex: 1 }} />
              {onNewTopic && (
                <IconButton
                  size="small"
                  title="新建主题"
                  onClick={() => setTopicCreate(true)}
                  sx={{
                    p: 0.25,
                    color: "text.disabled",
                    "&:hover": { color: "primary.main", bgcolor: "transparent" }
                  }}>
                  <AddRoundedIcon sx={{ fontSize: 15 }} />
                </IconButton>
              )}
            </Box>
            {[...groups.entries()].map(([t, ps]) => (
              <Box key={t}>
                {renderTopicHeader(t, ps.length)}
                {topicOpen[t] && (
                  <Box sx={{ pl: 0.5 }}>
                    {ps.map((p) => renderPdfRow(p, true))}
                  </Box>
                )}
              </Box>
            ))}
            {unclassified.length > 0 && (
              <Box>
                {renderTopicHeader("未分类", unclassified.length)}
                {topicOpen["未分类"] && (
                  <Box sx={{ pl: 0.5 }}>
                    {unclassified.map((p) => renderPdfRow(p, true))}
                  </Box>
                )}
              </Box>
            )}
            {ordered.length === 0 && (
              <Typography
                variant="caption"
                sx={{
                  color: "text.disabled",
                  display: "block",
                  px: 1,
                  py: 0.5
                }}>
                还没有 PDF
              </Typography>
            )}
          </Well>
        )}
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
        {/* 移动到主题 menu */}
        {onMovePdf && (
          <Menu
            anchorEl={moveMenu?.anchor}
            open={Boolean(moveMenu)}
            onClose={() => setMoveMenu(null)}
            slotProps={{
              paper: { sx: { py: 0.5, borderRadius: 1, minWidth: 160 } }
            }}>
            <Typography
              sx={{
                fontSize: "0.68rem",
                color: "text.disabled",
                px: 1.5,
                pt: 0.5,
                pb: 0.25
              }}>
              移动到主题
            </Typography>
            <MenuItem
              onClick={() => {
                if (moveMenu) onMovePdf(moveMenu.pdfId, undefined)
                setMoveMenu(null)
              }}
              sx={{ fontSize: "0.8rem", gap: 1 }}>
              <FolderRoundedIcon sx={{ fontSize: 15 }} />
              未分类
            </MenuItem>
            {topics.map((t) => (
              <MenuItem
                key={t}
                onClick={() => {
                  if (moveMenu) onMovePdf(moveMenu.pdfId, t)
                  setMoveMenu(null)
                }}
                sx={{ fontSize: "0.8rem", gap: 1 }}>
                <FolderRoundedIcon sx={{ fontSize: 15 }} />
                {t}
              </MenuItem>
            ))}
          </Menu>
        )}
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
      {topicRename && (
        <RenameDialog
          open
          title="重命名主题"
          label="主题名称"
          value={topicRename}
          onClose={() => setTopicRename(null)}
          onConfirm={(name) => {
            if (name && name !== topicRename) onRenameTopic?.(topicRename, name)
          }}
        />
      )}
      {topicCreate && (
        <RenameDialog
          open
          title="新建主题"
          label="主题名称"
          value=""
          onClose={() => setTopicCreate(false)}
          onConfirm={(name) => {
            if (name) onNewTopic?.(name)
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
  todoTab,
  readLaterFilter,
  activeReadLater,
  doneReadLater,
  pdfs,
  countByPdf,
  activePdfId,
  onTodoFilterChange,
  onReadLaterFilterChange,
  onOpenPdfClick,
  onOpenPdf,
  onOpenUrl,
  onRenamePdf,
  onDeletePdf,
  topics,
  onNewTopic,
  onRenameTopic,
  onDeleteTopic,
  onMovePdf,
  children,
  onReviewDateClick,
  onWidthChange,
  onNewProjectClick,
  onUploadSync,
  onDownloadSync
}: SidebarFiltersProps) {
  const [forceConfirmOpen, setForceConfirmOpen] = useState(false)
  const [syncMenuAnchor, setSyncMenuAnchor] = useState<HTMLElement | null>(null)
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
                            sx={{
                              fontSize: "0.68rem",
                              color: "text.disabled"
                            }}>
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
                  variant="text"
                  startIcon={<MoreHorizRoundedIcon sx={{ fontSize: 16 }} />}
                  onClick={(event) => setSyncMenuAnchor(event.currentTarget)}
                  fullWidth
                  sx={{ mt: 1 }}>
                  更多操作
                </Button>
                <Menu
                  anchorEl={syncMenuAnchor}
                  open={Boolean(syncMenuAnchor)}
                  onClose={() => setSyncMenuAnchor(null)}
                  slotProps={{ paper: { sx: { py: 0.5, borderRadius: 1 } } }}>
                  <MenuItem
                    onClick={() => {
                      setSyncMenuAnchor(null)
                      setForceConfirmOpen(true)
                    }}
                    sx={{ color: "error.main", fontSize: "0.8rem" }}>
                    强制覆盖云端数据…
                  </MenuItem>
                </Menu>
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
            /* Todo tab: the filter follows the sub-view (待办项 → todo filters;
             * 稍后读 → 进行中/已读), with counts. */
            <Box sx={{ py: 1 }}>
              <Well>
                <Box sx={{ mb: 0.5 }}>
                  <SectionLabel>
                    {todoTab === "readLater" ? "稍后读" : "待办项"}
                  </SectionLabel>
                </Box>
                {todoTab === "readLater"
                  ? (
                      [
                        ["active", "进行中", activeReadLater.length],
                        ["done", "已读", doneReadLater.length]
                      ] as [ReadLaterFilter, string, number][]
                    ).map(([key, label, count]) => (
                      <Box
                        key={key}
                        onClick={() => onReadLaterFilterChange(key)}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          px: 1,
                          py: 0.5,
                          borderRadius: 1,
                          cursor: "pointer",
                          bgcolor:
                            readLaterFilter === key
                              ? "action.selected"
                              : "transparent",
                          color:
                            readLaterFilter === key
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
                              readLaterFilter === key
                                ? "primary.main"
                                : "text.disabled"
                          }}>
                          {count}
                        </Typography>
                      </Box>
                    ))
                  : (
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
                            todoFilter === key
                              ? "action.selected"
                              : "transparent",
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
              topics={topics}
              onNewTopic={onNewTopic}
              onRenameTopic={onRenameTopic}
              onDeleteTopic={onDeleteTopic}
              onMovePdf={onMovePdf}
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
