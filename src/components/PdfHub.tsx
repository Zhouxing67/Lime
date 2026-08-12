import AddRoundedIcon from "@mui/icons-material/AddRounded"
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded"
import CheckRoundedIcon from "@mui/icons-material/CheckRounded"
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import EditRoundedIcon from "@mui/icons-material/EditRounded"
import DriveFileMoveRoundedIcon from "@mui/icons-material/DriveFileMoveRounded"
import FolderRoundedIcon from "@mui/icons-material/FolderRounded"
import LinkRoundedIcon from "@mui/icons-material/LinkRounded"
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded"
import {
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography
} from "@mui/material"
import { alpha, type Theme } from "@mui/material/styles"
import { useState } from "react"

import RenameDialog from "./RenameDialog"
import type { PdfFile } from "../types"
import EmptyState from "./EmptyState"
import { byRecency, relativeTime } from "../utils"
import DashedTile from "./DashedTile"


const UNCLASSIFIED = "__unclassified__"

interface PdfHubProps {
  pdfs: PdfFile[]
  countByPdf: Record<string, number>
  onOpenPdf: (id: string) => void
  onNewPdf: () => void
  onOpenUrl?: () => void
  onDeletePdf: (pdf: PdfFile) => void
  onRenamePdf?: (id: string, name: string) => void
  keyword?: string
  /** Read-only multi-select mode (backup view): click toggles selection. */
  selectable?: boolean
  selected?: (id: string) => boolean
  onToggleSelect?: (id: string) => void
  /** Topic layer (PDF view only — hidden in selectable/backup mode). */
  topics?: string[]
  onNewTopic?: (name: string) => void
  onRenameTopic?: (oldName: string, newName: string) => void
  onDeleteTopic?: (topic: string) => void
  onMovePdf?: (pdfId: string, topic: string | undefined) => void
}

export default function PdfHub({
  pdfs,
  countByPdf,
  onOpenPdf,
  onNewPdf,
  onOpenUrl,
  onDeletePdf,
  onRenamePdf,
  keyword = "",
  selectable,
  selected,
  onToggleSelect,
  topics = [],
  onNewTopic,
  onRenameTopic,
  onDeleteTopic,
  onMovePdf
}: PdfHubProps) {
  const [topicView, setTopicView] = useState<"topics" | "all" | string>(
    "topics"
  )
  const [newTopicOpen, setNewTopicOpen] = useState(false)
  const [newTopicName, setNewTopicName] = useState("")
  const [topicRename, setTopicRename] = useState<string | null>(null)
  const [pdfRename, setPdfRename] = useState<{
    id: string
    name: string
  } | null>(null)
  const [moveMenu, setMoveMenu] = useState<{
    pdfId: string
    anchor: HTMLElement
  } | null>(null)

  const topicCounts = new Map<string, number>()
  let unclassified = 0
  for (const p of pdfs) {
    if (p.topic) topicCounts.set(p.topic, (topicCounts.get(p.topic) ?? 0) + 1)
    else unclassified++
  }

  const shownPdfs = [...pdfs]
    .sort(
      byRecency(
        (p) => p.lastOpened,
        (a, b) => b.addedAt - a.addedAt
      )
    )
    .filter((p) => {
      if (keyword.trim()) {
        if (!p.name.toLowerCase().includes(keyword.trim().toLowerCase()))
          return false
      }
      // Backup (selectable) mode shows ALL PDFs — the topic layer is a PDF-view
      // navigation only and its topicView ("topics") would filter everything out.
      if (selectable) return true
      if (topicView === "all") return true
      if (topicView === UNCLASSIFIED) return !p.topic
      if (typeof topicView === "string") return p.topic === topicView
      return true
    })

  // ---- empty states ----
  if (pdfs.length === 0) {
    return (
      <EmptyState
        icon={
          <PictureAsPdfRoundedIcon className="empty-icon" />
        }
        title={selectable ? "没有可备份的 PDF" : "还没有 PDF"}
        subtitle={
          selectable
            ? "本地没有 PDF，先去 PDF 视图打开一个"
            : "打开一个本地 PDF，开始批注与摘录"
        }
        action={
          !selectable ? (
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                startIcon={<AddRoundedIcon />}
                onClick={onNewPdf}
                sx={{ borderRadius: 1 }}>
                打开 PDF
              </Button>
              {onOpenUrl && (
                <Button
                  variant="outlined"
                  startIcon={<LinkRoundedIcon />}
                  onClick={onOpenUrl}
                  sx={{ borderRadius: 1 }}>
                  从 URL 打开
                </Button>
              )}
            </Stack>
          ) : undefined
        }
      />
    )
  }

  // ---- topic tile layer (PDF view only) ----
  if (!selectable && topicView === "topics") {
    const tileSx = (theme: Theme) => ({
      p: 2,
      borderRadius: 1,
      border: "1px solid",
      borderColor: "divider",
      bgcolor: "background.paper",
      cursor: "pointer",
      minHeight: 104,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 0.75,
      position: "relative",
      transition: "all 0.2s",
      boxShadow: theme.custom.cardShadow,
      "&:hover": {
        boxShadow: theme.custom.cardShadowHover,
        transform: "translateY(-1px)",
        borderColor: theme.custom.borderStrong,
        ".topic-ops": { opacity: 1 }
      }
    })
    return (
      <>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 1.5
        }}>
        <Paper elevation={0} onClick={() => setTopicView("all")} sx={tileSx}>
          <Box sx={{ color: "text.secondary" }}>
            <PictureAsPdfRoundedIcon sx={{ fontSize: 26 }} />
          </Box>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              fontSize: "0.95rem",
              fontFamily: (t: Theme) => t.custom.serif
            }}>
            全部 PDF
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {pdfs.length} 篇
          </Typography>
        </Paper>

        {topics.map((t) => (
          <Paper
            key={t}
            elevation={0}
            onClick={(e) => {
              // The rename/delete ops icons are inside the tile — their own
              // stopPropagation normally suffices, but a robust guard keeps a
              // click on the ops from ALSO entering the topic.
              if ((e.target as HTMLElement).closest(".topic-ops")) return
              setTopicView(t)
            }}
            sx={tileSx}>
              <>
                <Box sx={{ color: "text.secondary" }}>
                  <FolderRoundedIcon sx={{ fontSize: 26 }} />
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    fontSize: "0.95rem",
                    fontFamily: (t: Theme) => t.custom.serif
                  }}>
                  {t}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {topicCounts.get(t) ?? 0} 篇
                </Typography>
                <Box
                  className="topic-ops"
                  sx={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    display: "flex",
                    opacity: 0,
                    transition: "opacity 0.15s"
                  }}>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      setTopicRename(t)
                    }}
                    sx={{ p: 0.5, color: "text.disabled" }}>
                    <EditRoundedIcon sx={{ fontSize: 15 }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteTopic?.(t)
                    }}
                    sx={{ p: 0.5, color: "text.disabled" }}>
                    <DeleteOutlineRoundedIcon sx={{ fontSize: 15 }} />
                  </IconButton>
                </Box>
              </>
          </Paper>
        ))}

        <Paper
          elevation={0}
          onClick={() => setTopicView(UNCLASSIFIED)}
          sx={tileSx}>
          <Box sx={{ color: "text.secondary" }}>
            <FolderRoundedIcon sx={{ fontSize: 26 }} />
          </Box>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              fontSize: "0.95rem",
              fontFamily: (t: Theme) => t.custom.serif
            }}>
            未分类
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {unclassified} 篇
          </Typography>
        </Paper>

        {newTopicOpen ? (
          <Paper elevation={0} sx={tileSx} onClick={(e) => e.stopPropagation()}>
            <TextField
              autoFocus
              size="small"
              placeholder="主题名称"
              value={newTopicName}
              onChange={(e) => setNewTopicName(e.target.value)}
              onBlur={() => {
                const name = newTopicName.trim()
                if (name) onNewTopic?.(name)
                setNewTopicName("")
                setNewTopicOpen(false)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const name = newTopicName.trim()
                  if (name) onNewTopic?.(name)
                  setNewTopicName("")
                  setNewTopicOpen(false)
                }
                if (e.key === "Escape") {
                  setNewTopicName("")
                  setNewTopicOpen(false)
                }
              }}
              sx={{ "& .MuiInputBase-input": { fontSize: "0.85rem" } }}
            />
          </Paper>
        ) : (
          <DashedTile
            icon={<AddRoundedIcon sx={{ fontSize: 26 }} />}
            label="新建主题"
            onClick={() => setNewTopicOpen(true)}
          />
        )}
      </Box>
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
      {pdfRename && (
        <RenameDialog
          open
          title="重命名 PDF"
          label="PDF 名称"
          value={pdfRename.name}
          onClose={() => setPdfRename(null)}
          onConfirm={(name) => {
            if (name && name !== pdfRename.name) onRenamePdf?.(pdfRename.id, name)
          }}
        />
      )}
    </>
  )
  }

  // ---- PDF grid (all / a topic / 未分类) ----
  return (
    <Box>
      {!selectable && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ mb: 2 }}>
          <Button
            size="small"
            startIcon={<ArrowBackRoundedIcon sx={{ fontSize: 16 }} />}
            onClick={() => setTopicView("topics")}
            sx={{
              borderRadius: 1,
              fontSize: "0.75rem",
              color: "text.secondary",
              textTransform: "none"
            }}>
            全部主题
          </Button>
          <Typography
            sx={{
              fontWeight: 600,
              fontSize: "1.05rem",
              fontFamily: (t: Theme) => t.custom.serif
            }}>
            {topicView === "all"
              ? "全部 PDF"
              : topicView === UNCLASSIFIED
                ? "未分类"
                : topicView}
          </Typography>
        </Stack>
      )}
      {!selectable &&
      shownPdfs.length === 0 &&
      topicView !== "all" &&
      topicView !== "topics" ? (
        <EmptyState
          icon={<PictureAsPdfRoundedIcon />}
          iconSize={56}
          title="此主题下暂无 PDF"
          action={
            <Button
              size="small"
              variant="contained"
              onClick={() => setTopicView("topics")}
              sx={{ borderRadius: 1, fontSize: "0.75rem", textTransform: "none" }}>
              返回全部主题
            </Button>
          }
        />
      ) : (
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 1.5
        }}>
        {!selectable && (
          <>
            <DashedTile
              icon={<AddRoundedIcon sx={{ fontSize: 26 }} />}
              label="打开 PDF"
              onClick={onNewPdf}
            />
            {onOpenUrl && (
              <DashedTile
                icon={<LinkRoundedIcon sx={{ fontSize: 26 }} />}
                label="从 URL 打开"
                onClick={onOpenUrl}
              />
            )}
          </>
        )}
        {shownPdfs.map((p) => {
          const isSelected = selectable ? selected?.(p.id) ?? false : false
          const isPlaceholder = !p.bytes
          return (
            <Paper
              key={p.id}
              elevation={0}
              onClick={() => {
                if (selectable) return onToggleSelect?.(p.id)
                // A synced placeholder has no local file — open the picker to match.
                if (isPlaceholder) return onNewPdf()
                return onOpenPdf(p.id)
              }}
              sx={(theme) => ({
                p: 2,
                borderRadius: 1,
                border: isPlaceholder ? "1.5px dashed" : "1px solid",
                borderColor: selectable
                  ? "primary.main"
                  : isPlaceholder
                    ? theme.custom.borderStrong
                    : isSelected
                      ? "primary.main"
                      : "divider",
                cursor: "pointer",
                position: "relative",
                boxShadow: theme.custom.cardShadow,
                bgcolor: selectable
                  ? alpha(theme.palette.primary.main, 0.04)
                  : isSelected
                    ? alpha(theme.palette.primary.main, 0.04)
                    : "background.paper",
                transition: "all 0.2s ease",
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
                <>
                  <IconButton
                    className="hub-delete"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeletePdf(p)
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
                  <IconButton
                    className="hub-delete"
                    size="small"
                    title="重命名"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPdfRename({ id: p.id, name: p.name })
                    }}
                    sx={{
                      position: "absolute",
                      top: 4,
                      right: 50,
                      p: 0.5,
                      opacity: 0,
                      color: "text.disabled",
                      transition: "opacity 0.15s",
                      "&:hover": { color: "primary.main", bgcolor: "transparent" }
                    }}>
                    <EditRoundedIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                  <IconButton
                    className="hub-delete"
                    size="small"
                    title="移动到主题"
                    onClick={(e) => {
                      e.stopPropagation()
                      setMoveMenu({ pdfId: p.id, anchor: e.currentTarget })
                    }}
                    sx={{
                      position: "absolute",
                      top: 4,
                      right: 26,
                      p: 0.5,
                      opacity: 0,
                      color: "text.disabled",
                      transition: "opacity 0.15s",
                      "&:hover": { color: "primary.main", bgcolor: "transparent" }
                    }}>
                    <DriveFileMoveRoundedIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </>
              )}
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 1,
                    bgcolor: (t) => t.custom.surface2,
                    color: "text.secondary",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0
                  }}>
                  <PictureAsPdfRoundedIcon sx={{ fontSize: 20 }} />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{
                      fontWeight: 600,
                      fontSize: "0.95rem",
                      fontFamily: (t: Theme) => t.custom.serif
                    }}>
                    {p.name}
                  </Typography>
                </Box>
               </Stack>
             </Paper>
           )
         })}
       </Box>
      )}
      {!selectable && (
        <Menu
          anchorEl={moveMenu?.anchor}
          open={Boolean(moveMenu)}
          onClose={() => setMoveMenu(null)}
          slotProps={{ paper: { sx: { py: 0.5, borderRadius: 1, minWidth: 160 } } }}>
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
              if (moveMenu) onMovePdf?.(moveMenu.pdfId, undefined)
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
                if (moveMenu) onMovePdf?.(moveMenu.pdfId, t)
                setMoveMenu(null)
              }}
              sx={{ fontSize: "0.8rem", gap: 1 }}>
              <FolderRoundedIcon sx={{ fontSize: 15 }} />
              {t}
            </MenuItem>
          ))}
        </Menu>
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
      {pdfRename && (
        <RenameDialog
          open
          title="重命名 PDF"
          label="PDF 名称"
          value={pdfRename.name}
          onClose={() => setPdfRename(null)}
          onConfirm={(name) => {
            if (name && name !== pdfRename.name) onRenamePdf?.(pdfRename.id, name)
          }}
        />
      )}
    </Box>
  )
}
