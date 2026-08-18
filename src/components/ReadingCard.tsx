import BookmarkRoundedIcon from "@mui/icons-material/BookmarkRounded"
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import EditRoundedIcon from "@mui/icons-material/EditRounded"
import LinkRoundedIcon from "@mui/icons-material/LinkRounded"
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded"
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded"
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded"
import { Box, Button, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material"

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
  unread: { label: "未读", dot: "text.secondary" },
  reading: { label: "在读", dot: "text.secondary" },
  done: { label: "已读", dot: "success.main" }
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
      onClick={onStartEdit}
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
        cursor: "pointer",
        transition: "all 0.2s ease",
        "&:hover": {
          boxShadow: theme.custom.cardShadowHover,
          transform: "translateY(-1px)",
          borderColor: theme.custom.borderStrong,
          ".reading-actions": { opacity: 1 }
        }
      })}>
      {/* Status dot + label */}
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Box
          sx={(t) => ({
            width: 6,
            height: 6,
            borderRadius: "50%",
            bgcolor: resolvePalette(t, status.dot),
            flexShrink: 0
          })}
        />
        <Typography
          variant="caption"
          sx={{ fontSize: "0.7rem", color: "text.secondary" }}>
          {status.label}
        </Typography>
      </Stack>

      {/* Title */}
      <Typography
        variant="body2"
        noWrap
        sx={{
          fontWeight: 700,
          fontFamily: (t) => t.custom.serif,
          lineHeight: 1.4,
          minWidth: 0
        }}>
        {item.title}
      </Typography>

      {/* Source line */}
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
            "&:hover": { color: "primary.main" }
          }}>
          {item.pdfId ? (
            <PictureAsPdfRoundedIcon sx={{ fontSize: 14, flexShrink: 0 }} />
          ) : (
            <LinkRoundedIcon sx={{ fontSize: 14, flexShrink: 0 }} />
          )}
          <Typography
            variant="caption"
            noWrap
            sx={{ fontSize: "0.72rem", minWidth: 0 }}>
            {sourceLabel}
          </Typography>
        </Box>
      )}

      {/* Excerpt */}
      {item.excerpt && (
        <Typography
          variant="body2"
          sx={{
            fontFamily: (t) => t.custom.serif,
            color: "text.secondary",
            fontSize: "0.8rem",
            lineHeight: 1.6,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden"
          }}>
          {item.excerpt}
        </Typography>
      )}

      {/* Notes */}
      {item.notes && (
        <Typography
          variant="body2"
          sx={{
            fontFamily: (t) => t.custom.serif,
            color: "text.primary",
            fontSize: "0.8rem",
            lineHeight: 1.6,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden"
          }}>
          {item.notes}
        </Typography>
      )}

      {/* Actions */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mt: "auto", pt: 0.5 }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          {item.status === "unread" && (
            <Button
              size="small"
              variant="text"
              startIcon={<PlayArrowRoundedIcon sx={{ fontSize: 16 }} />}
              onClick={(e) => {
                e.stopPropagation()
                onStartRead()
              }}
              sx={{
                fontSize: "0.75rem",
                color: "text.secondary",
                minWidth: 0,
                px: 1,
                py: 0.25,
                "&:hover": { color: "primary.main" }
              }}>
              开始读
            </Button>
          )}
          {item.status !== "unread" && (
            <Button
              size="small"
              variant="text"
              startIcon={<OpenInNewRoundedIcon sx={{ fontSize: 16 }} />}
              onClick={(e) => {
                e.stopPropagation()
                onOpen()
              }}
              sx={{
                fontSize: "0.75rem",
                color: "text.secondary",
                minWidth: 0,
                px: 1,
                py: 0.25,
                "&:hover": { color: "primary.main" }
              }}>
              打开
            </Button>
          )}
          {item.status !== "done" && (
            <Tooltip title="标记已读">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation()
                  onMarkDone()
                }}
                sx={{ p: 0.75, color: "text.secondary", "&:hover": { color: "success.main" } }}>
                <BookmarkRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
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
              <IconButton size="small" onClick={onStartEdit} sx={{ p: 0.75 }}>
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
                sx={{ p: 0.75, opacity: 0.6, transition: "opacity 0.15s", "&:hover": { opacity: 1 } }}>
                <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Stack>
      </Stack>
    </Paper>
  )
}
