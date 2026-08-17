import BookmarkRoundedIcon from "@mui/icons-material/BookmarkRounded"
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import EditRoundedIcon from "@mui/icons-material/EditRounded"
import LinkRoundedIcon from "@mui/icons-material/LinkRounded"
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded"
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded"
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded"
import { alpha, Box, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material"

import type { ReadLater } from "../types"

interface ReadingCardProps {
  item: ReadLater
  /** Resolved PDF name for the source line (undefined for web items). */
  pdfName?: string
  onStartEdit: () => void
  onDelete: () => void
  onStartRead: () => void
  onMarkDone: () => void
  onOpen: () => void
}

const STATUS_META = {
  unread: { label: "未读", color: "text.secondary" },
  reading: { label: "在读", color: "text.secondary" },
  done: { label: "已读", color: "success.main" }
} as const

/** Resolve a palette path ("text.secondary") to an actual color string —
 *  `alpha()` cannot parse theme path strings (MUI error #9). */
function resolvePalette(
  t: Record<string, any>,
  path: string
): string {
  return path.split(".").reduce<any>((acc, k) => acc?.[k], t.palette)
}

export default function ReadingCard({
  item,
  pdfName,
  onStartEdit,
  onDelete,
  onStartRead,
  onMarkDone,
  onOpen
}: ReadingCardProps) {
  const status = STATUS_META[item.status]
  const sourceLabel = item.pdfId ? pdfName ?? "PDF" : item.url ?? ""

  return (
    <Paper
      elevation={0}
      sx={(theme) => ({
        p: 2,
        borderRadius: 1,
        border: "1px solid",
        borderColor: "divider",
        boxShadow: theme.custom.cardShadow,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        minWidth: 0,
        minHeight: 140,
        transition: "all 0.2s",
        "&:hover": {
          boxShadow: theme.custom.cardShadowHover,
          transform: "translateY(-1px)",
          ".reading-actions": { opacity: 1 }
        }
      })}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
        <Typography
          variant="body2"
          noWrap
          sx={{
            fontWeight: 700,
            fontFamily: (t) => t.custom.serif,
            flex: 1,
            minWidth: 0
          }}>
          {item.title}
        </Typography>
        <Typography
          variant="caption"
          sx={(t) => ({
            fontSize: "0.65rem",
            lineHeight: 1.4,
            px: 0.75,
            py: 0.15,
            borderRadius: 1,
            flexShrink: 0,
            color: status.color,
            bgcolor: alpha(resolvePalette(t, status.color), 0.08)
          })}>
          {status.label}
        </Typography>
      </Stack>

      {item.excerpt && (
        <Typography
          variant="body2"
          sx={{
            fontFamily: (t) => t.custom.serif,
            color: "text.secondary",
            fontSize: "0.8rem",
            lineHeight: 1.6,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden"
          }}>
          {item.excerpt}
        </Typography>
      )}

      {item.notes && (
        <Typography
          variant="body2"
          sx={{
            fontFamily: (t) => t.custom.serif,
            color: "text.primary",
            fontSize: "0.8rem",
            lineHeight: 1.6,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden"
          }}>
          {item.notes}
        </Typography>
      )}

      {sourceLabel && (
        <Box
          onClick={(e) => {
            e.stopPropagation()
            onOpen()
          }}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            minWidth: 0,
            cursor: "pointer",
            color: "text.secondary",
            fontSize: "0.72rem",
            "&:hover": { color: "primary.main" }
          }}>
          {item.pdfId ? (
            <PictureAsPdfRoundedIcon sx={{ fontSize: 16, flexShrink: 0 }} />
          ) : (
            <LinkRoundedIcon sx={{ fontSize: 16, flexShrink: 0 }} />
          )}
          <Typography
            variant="caption"
            noWrap
            sx={{ fontSize: "0.72rem", minWidth: 0 }}>
            {sourceLabel}
          </Typography>
        </Box>
      )}

      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mt: "auto", pt: 0.5 }}>
        <Stack direction="row" spacing={0.5}>
          {item.status !== "reading" && item.status !== "done" && (
            <Tooltip title="开始读">
              <IconButton
                size="small"
                onClick={onStartRead}
                sx={{ p: 0.5, color: "text.secondary", "&:hover": { color: "primary.main" } }}>
                <PlayArrowRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
          {item.status !== "done" && (
            <Tooltip title="标记已读">
              <IconButton
                size="small"
                onClick={onMarkDone}
                sx={{ p: 0.5, color: "text.secondary", "&:hover": { color: "success.main" } }}>
                <BookmarkRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="打开">
            <IconButton
              size="small"
              onClick={onOpen}
              sx={{ p: 0.5, color: "text.secondary", "&:hover": { color: "primary.main" } }}>
              <OpenInNewRoundedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Stack>
        <Stack direction="row" spacing={0.25} alignItems="center">
          <Box
            className="reading-actions"
            sx={{
              display: "flex",
              gap: 0.25,
              opacity: 0,
              transition: "opacity 0.15s"
            }}
            onClick={(e) => e.stopPropagation()}>
            <Tooltip title="编辑">
              <IconButton size="small" onClick={onStartEdit} sx={{ p: 0.5 }}>
                <EditRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Box>
          {/* Destructive action stays visible (设计基线), outside the hover group. */}
          <Box onClick={(e) => e.stopPropagation()}>
            <Tooltip title="删除">
              <IconButton
                size="small"
                onClick={onDelete}
                sx={{ p: 0.5, opacity: 0.6, transition: "opacity 0.15s", "&:hover": { opacity: 1 } }}>
                <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Stack>
      </Stack>
    </Paper>
  )
}
