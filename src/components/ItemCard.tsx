import { Box, Chip, Link, Paper, Stack, Typography } from "@mui/material"

import type { Item } from "../types"
import { prettyUrl } from "../utils"
import CardRenderer from "./CardRenderer"
import ItemCardOperations from "./ItemCardOperations"

export default function ItemCard({
  item,
  firstRating,
  inReview,
  readOnly,
  draggable,
  selectMode,
  onDragStart,
  onDragEnd,
  onDelete,
  onClick,
  onToggleReview,
  onToggleRead,
  onMoveToProject,
  onCopyToProject
}: {
  item: Item
  firstRating?: 1 | 2 | 3 | 4
  inReview?: boolean
  readOnly?: boolean
  draggable?: boolean
  selectMode?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
  onDelete: (id: string) => void
  onClick?: () => void
  onToggleReview?: (id: string) => void
  onToggleRead?: (id: string) => void
  onMoveToProject?: (id: string) => void
  onCopyToProject?: (id: string) => void
}) {
  return (
    <Paper
      elevation={0}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      sx={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 1,
        p: 2.5,
        mb: 2,
        minHeight: 100,
        cursor: "pointer",
        bgcolor: "background.paper",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        border: "1px solid",
        borderColor: "divider",
        "&:hover": {
          boxShadow: 2,
          transform: "translateY(-2px)",
          borderColor: "primary.light"
        },
        "&:active": {
          transform: "scale(0.97)",
          transition: "transform 0.1s"
        }
      }}
      onClick={onClick}>
      <Box sx={{ position: "absolute", top: 0, left: 0, width: 48, height: 3, bgcolor: "secondary.main", borderTopLeftRadius: 16 }} />
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          {!selectMode && (
          <Chip
            label={item.type === "text" ? "文本" : item.type === "image" ? "图片" : "链接"}
            size="small"
            variant="outlined"
            sx={{
              height: 20,
              fontSize: "0.65rem",
              fontWeight: 500,
              letterSpacing: "0.04em"
            }}
          />
          )}
          {!item.title && (
            <Chip
              label="未设置摘要"
              size="small"
              sx={{
                height: 18,
                fontSize: "0.6rem",
                fontWeight: 500,
                bgcolor: "action.hover",
                color: "text.disabled",
                borderRadius: 1,
                letterSpacing: "0.02em"
              }}
            />
          )}
          {firstRating && (
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: ["#ef4444", "#f97316", "#22c55e", "#3b82f6"][firstRating - 1] }} />
          )}
        </Stack>
        <ItemCardOperations
          item={item}
          inReview={inReview}
          readOnly={readOnly}
          onDelete={onDelete}
          onToggleReview={onToggleReview}
          onMoveToProject={onMoveToProject}
          onCopyToProject={onCopyToProject}
          onToggleRead={onToggleRead}
        />
      </Stack>

      <Box sx={{ mb: 2 }}>
        <CardRenderer item={item} mode="preview" truncateTo={160} />
      </Box>

      <Box
        sx={{
          mt: 1.5,
          pt: 1.5,
          borderTop: "1px solid",
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1
        }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0, flex: 1 }}>
          {item.source ? (
            <Link
              href={item.source.url}
              target="_blank"
              rel="noreferrer"
              underline="hover"
              onClick={(e) => e.stopPropagation()}
              sx={{
                color: "text.secondary",
                fontSize: "0.72rem",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "100%"
              }}>
              {item.source.title || prettyUrl(item.source.url)}
            </Link>
          ) : (
            <Typography
              variant="caption"
              sx={{
                color: "text.disabled",
                fontSize: "0.72rem",
                letterSpacing: "0.03em"
              }}>
              自建卡片
            </Typography>
          )}
        </Box>
        <Typography
          variant="caption"
          sx={{
            color: "text.disabled",
            fontSize: "0.7rem",
            letterSpacing: "0.05em",
            flexShrink: 0
          }}>
          {new Date(item.createdAt).toLocaleDateString("zh-CN", {
            month: "long",
            day: "numeric"
          })}
        </Typography>
      </Box>
    </Paper>
  )
}
