import AddRoundedIcon from "@mui/icons-material/AddRounded"
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded"
import BookmarkRoundedIcon from "@mui/icons-material/BookmarkRounded"
import BookmarkBorderRoundedIcon from "@mui/icons-material/BookmarkBorderRounded"
import CheckRoundedIcon from "@mui/icons-material/CheckRounded"
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import EditRoundedIcon from "@mui/icons-material/EditRounded"
import DriveFileMoveRoundedIcon from "@mui/icons-material/DriveFileMoveRounded"
import FolderRoundedIcon from "@mui/icons-material/FolderRounded"
import LinkRoundedIcon from "@mui/icons-material/LinkRounded"
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded"
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded"
import {
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material"
import { alpha, type Theme } from "@mui/material/styles"
import { useCallback, useState } from "react"

import RenameDialog from "./RenameDialog"
import type { PdfMetaLite } from "../database"
import EmptyState from "./EmptyState"
import { avatarColor, byRecency } from "../utils"
import DashedTile from "./DashedTile"
import PdfAiContextDialog from "./PdfAiContextDialog"

/** Colored circular avatar (avatarPalette, deterministic per name) — the same
 *  visual anchor the project tiles use; icon renders in the contrast color. */
function TileAvatar({ name, icon }: { name: string; icon: React.ReactNode }) {
  return (
    <Box
      sx={(t) => ({
        width: 36,
        height: 36,
        borderRadius: "50%",
        bgcolor: avatarColor(t.custom.avatarPalette, name),
        color: t.palette.getContrastText(
          avatarColor(t.custom.avatarPalette, name)
        ),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0
      })}>
      {icon}
    </Box>
  )
}

/** Two-section tile footer: divider + left meta (count) + optional right meta. */
function TileFooter({
  left,
  right
}: {
  left: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <Box
      sx={{
        mt: "auto",
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
        {left}
      </Typography>
      {right && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          {right}
        </Box>
      )}
    </Box>
  )
}

export const PDF_UNCLASSIFIED_TOPIC = "__unclassified__"
export type PdfTopicView = "topics" | "all" | string

interface PdfHubProps {
  pdfs: PdfMetaLite[]
  countByPdf: Record<string, number>
  onOpenPdf: (id: string) => void
  onNewPdf: () => void
  onOpenUrl?: () => void
  onDeletePdf: (pdf: PdfMetaLite) => void
  onRenamePdf?: (id: string, name: string) => void
  onSaveAiContext?: (id: string, value: string) => void | Promise<void>
  keyword?: string
  /** Read-only multi-select mode (backup view): click toggles selection. */
  selectable?: boolean
  selected?: (id: string) => boolean
  onToggleSelect?: (id: string) => void
  /** Topic layer (PDF view only — hidden in selectable/backup mode). */
  topicView?: PdfTopicView
  onTopicViewChange?: (view: PdfTopicView) => void
  topics?: string[]
  onNewTopic?: (name: string) => void
  onRenameTopic?: (oldName: string, newName: string) => void
  onDeleteTopic?: (topic: string) => void
  onMovePdf?: (pdfId: string, topic: string | undefined) => void
  /** PDFs currently in an ACTIVE (non-done) read-later — the reminder icon. */
  readLaterPdfIds?: Set<string>
  onAddReadLater?: (pdfId: string, name: string) => void
}

export default function PdfHub({
  pdfs,
  countByPdf,
  onOpenPdf,
  onNewPdf,
  onOpenUrl,
  onDeletePdf,
  onRenamePdf,
  onSaveAiContext,
  keyword = "",
  selectable,
  selected,
  onToggleSelect,
  topicView: controlledTopicView,
  onTopicViewChange,
  topics = [],
  onNewTopic,
  onRenameTopic,
  onDeleteTopic,
  onMovePdf,
  readLaterPdfIds,
  onAddReadLater
}: PdfHubProps) {
  const [localTopicView, setLocalTopicView] = useState<PdfTopicView>("topics")
  const topicView = controlledTopicView ?? localTopicView
  const setTopicView = useCallback(
    (view: PdfTopicView) => {
      setLocalTopicView(view)
      onTopicViewChange?.(view)
    },
    [onTopicViewChange]
  )
  const [newTopicOpen, setNewTopicOpen] = useState(false)
  const [newTopicName, setNewTopicName] = useState("")
  const [topicRename, setTopicRename] = useState<string | null>(null)
  const [pdfRename, setPdfRename] = useState<{
    id: string
    name: string
  } | null>(null)
  const [aiContextPdf, setAiContextPdf] = useState<PdfMetaLite | null>(null)
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
      if (topicView === PDF_UNCLASSIFIED_TOPIC) return !p.topic
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
      // Two-section tile (avatar row + footer) like the project tiles — the
      // footer pins to the bottom via mt:auto.
      display: "flex",
      flexDirection: "column",
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
          <Stack direction="row" spacing={1.5} alignItems="center">
            <TileAvatar
              name="全部 PDF"
              icon={<PictureAsPdfRoundedIcon sx={{ fontSize: 18 }} />}
            />
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                fontSize: "0.95rem",
                fontFamily: (t: Theme) => t.custom.serif
              }}>
              全部 PDF
            </Typography>
          </Stack>
          <TileFooter left={`${pdfs.length} 篇`} />
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
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <TileAvatar
                    name={t}
                    icon={<FolderRoundedIcon sx={{ fontSize: 18 }} />}
                  />
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{
                      fontWeight: 600,
                      fontSize: "0.95rem",
                      fontFamily: (t: Theme) => t.custom.serif,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      flex: 1
                    }}>
                    {t}
                  </Typography>
                </Stack>
                <TileFooter left={`${topicCounts.get(t) ?? 0} 篇`} />
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
                    <EditRoundedIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteTopic?.(t)
                    }}
                    title="删除主题"
                    aria-label="删除主题"
                    sx={{ p: 0.5, color: "text.disabled" }}>
                    <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
              </>
          </Paper>
        ))}

        <Paper
          elevation={0}
          onClick={() => setTopicView(PDF_UNCLASSIFIED_TOPIC)}
          sx={tileSx}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <TileAvatar
              name="未分类"
              icon={<FolderRoundedIcon sx={{ fontSize: 18 }} />}
            />
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                fontSize: "0.95rem",
                fontFamily: (t: Theme) => t.custom.serif
              }}>
              未分类
            </Typography>
          </Stack>
          <TileFooter left={`${unclassified} 篇`} />
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
              : topicView === PDF_UNCLASSIFIED_TOPIC
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
          const isPlaceholder = !p.hasBytes
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
                // Uniform height across the mixed first row (打开 PDF / URL +
                // PDFs); two-section layout (avatar row + footer) like the
                // project tiles.
                minHeight: 104,
                display: "flex",
                flexDirection: "column",
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
                  <Tooltip
                    title={
                      readLaterPdfIds?.has(p.id)
                        ? "该 PDF 已在稍后读中"
                        : "加入稍后读"
                    }>
                    <IconButton
                      className="hub-delete"
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation()
                        onAddReadLater?.(p.id, p.name)
                      }}
                      sx={{
                        position: "absolute",
                        top: 4,
                        right: 28,
                        p: 0.5,
                        opacity: 0,
                        color: readLaterPdfIds?.has(p.id)
                          ? "primary.main"
                          : "text.disabled",
                        transition: "opacity 0.15s, color 0.15s",
                        "&:hover": {
                          color: "primary.main",
                          bgcolor: "transparent"
                        }
                      }}>
                      {readLaterPdfIds?.has(p.id) ? (
                        <BookmarkRoundedIcon sx={{ fontSize: 16 }} />
                      ) : (
                        <BookmarkBorderRoundedIcon sx={{ fontSize: 16 }} />
                      )}
                    </IconButton>
                  </Tooltip>
                  <IconButton
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
                      // Destructive actions stay visible (设计基线), not
                      // hover-revealed like the tile's other actions.
                      opacity: 0.6,
                      color: "text.disabled",
                      transition: "opacity 0.15s",
                      "&:hover": { opacity: 1, color: "error.main", bgcolor: "transparent" }
                    }}>
                    <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                  <IconButton
                    className="hub-delete"
                    size="small"
                    title="编辑 AI 上下文"
                    onClick={(e) => {
                      e.stopPropagation()
                      setAiContextPdf(p)
                    }}
                    sx={{
                      position: "absolute",
                      top: 4,
                      right: 94,
                      p: 0.5,
                      opacity: 0,
                      color: p.aiContext ? "primary.main" : "text.disabled",
                      transition: "opacity 0.15s",
                      "&:hover": {
                        color: "primary.main",
                        bgcolor: "transparent"
                      }
                    }}>
                    <AutoAwesomeRoundedIcon sx={{ fontSize: 16 }} />
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
                      right: 72,
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
                      right: 50,
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
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                <TileAvatar
                  name={p.name}
                  icon={<PictureAsPdfRoundedIcon sx={{ fontSize: 18 }} />}
                />
                <Box sx={{ minWidth: 0, flex: 1 }}>
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
              <TileFooter
                left={p.topic ?? "未分类"}
                right={
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    {readLaterPdfIds?.has(p.id) && (
                      <Box
                        sx={(t) => ({
                          px: 0.6,
                          py: 0.15,
                          borderRadius: 1,
                          fontSize: "0.62rem",
                          lineHeight: 1.4,
                          color: "text.secondary",
                          bgcolor: t.custom.surface2,
                          border: "1px solid",
                          borderColor: t.custom.borderStrong
                        })}>
                        稍后读
                      </Box>
                    )}
                    <Typography
                      variant="caption"
                      sx={{ color: "text.disabled", fontSize: "0.7rem" }}>
                      {`${countByPdf[p.id] ?? 0} 张摘录`}
                    </Typography>
                  </Stack>
                }
              />
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
      {aiContextPdf && (
        <PdfAiContextDialog
          open
          pdfName={aiContextPdf.name}
          value={aiContextPdf.aiContext}
          onClose={() => setAiContextPdf(null)}
          onSave={(value) => onSaveAiContext?.(aiContextPdf.id, value)}
        />
      )}
    </Box>
  )
}
