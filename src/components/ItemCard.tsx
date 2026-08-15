import DragIndicatorRoundedIcon from "@mui/icons-material/DragIndicatorRounded"
import { Box, Link, Paper, Stack, Typography, alpha } from "@mui/material"
import { useState } from "react"

import type { DisplayCard } from "../types"
import { RATING_META, hostnameOf } from "../utils"
import CardRenderer, { typeIcon } from "./CardRenderer"
import ItemCardOperations from "./ItemCardOperations"

export default function ItemCard({
  item,
  firstRating,
  inReview,
  mastered,
  readOnly,
  draggable,
  selectMode,
  onGripPointerDown,
  onDelete,
  onClick,
  onToggleReview,
  onReReview,
  onCopyToProject,
  onEdit,
  onOpenPdfSource,
  onMoveToSection,
  highlighted
}: {
  item: DisplayCard
  firstRating?: 1 | 2 | 3
  inReview?: boolean
  mastered?: boolean
  readOnly?: boolean
  draggable?: boolean
  selectMode?: boolean
  onGripPointerDown?: (e: React.PointerEvent, item: DisplayCard) => void
  onDelete: (id: string) => void
  onClick?: () => void
  onToggleReview?: (id: string) => void
  onReReview?: (id: string) => void
  onCopyToProject?: (id: string, anchor: HTMLElement) => void
  onEdit?: (id: string) => void
  onOpenPdfSource?: (item: DisplayCard) => void
  onMoveToSection?: (id: string, anchor: HTMLElement) => void
  highlighted?: boolean
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <Paper
      elevation={0}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={(theme) => ({
        position: "relative",
        overflow: "hidden",
        borderRadius: 1,
        p: 2.5,
        minHeight: 100,
        cursor: "pointer",
        bgcolor: selectMode
          ? alpha(theme.palette.primary.main, 0.04)
          : "background.paper",
        boxShadow: highlighted
          ? `0 0 0 2px ${theme.palette.primary.main}`
          : theme.custom.cardShadow,
        border: "1px solid",
        borderColor: selectMode || highlighted ? "primary.main" : "divider",
        transition:
          "box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s ease, background-color 0.2s ease",
        "&:hover": {
          boxShadow: theme.custom.cardShadowHover,
          transform: "translateY(-1px)",
          borderColor: selectMode ? "primary.main" : theme.custom.borderStrong
        },
        "&:active": {
          transform: "scale(0.99)",
          transition: "transform 0.15s"
        }
      })}
      onClick={onClick}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ mb: 1.5, minHeight: 28 }}>
        <Stack
          direction="row"
          spacing={0.75}
          alignItems="center"
          sx={{ minWidth: 0, flex: 1 }}>
          {draggable && onGripPointerDown && (
            <Box
              component="span"
              title="拖拽排序"
              onPointerDown={(e) => onGripPointerDown(e, item)}
              onClick={(e) => e.stopPropagation()}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                cursor: "grab",
                color: "text.disabled",
                opacity: 0.25,
                transition: "opacity 0.15s",
                touchAction: "none",
                flexShrink: 0,
                "&:hover": { opacity: 0.9, color: "primary.main" }
              }}>
              <DragIndicatorRoundedIcon sx={{ fontSize: 18 }} />
            </Box>
          )}
          {firstRating && (
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                flexShrink: 0,
                bgcolor: RATING_META[firstRating - 1].color
              }}
            />
          )}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              color: "text.disabled",
              flexShrink: 0
            }}>
            {typeIcon(item.type)}
          </Box>
          {item.isDraft && (
            <Box
              sx={{
                ml: 0.5,
                flexShrink: 0,
                px: 0.5,
                py: 0.1,
                borderRadius: 1,
                bgcolor: "action.selected",
                color: "primary.main",
                fontSize: "0.6rem",
                lineHeight: 1.2,
                fontWeight: 600
              }}>
              草稿
            </Box>
          )}
        </Stack>
        {!selectMode && (
          <ItemCardOperations
            item={item}
            inReview={inReview}
            mastered={mastered}
            readOnly={readOnly}
            visible={hovered}
            onDelete={onDelete}
            onToggleReview={onToggleReview}
            onReReview={onReReview}
            onCopyToProject={onCopyToProject}
            onEdit={onEdit}
            onMoveToSection={onMoveToSection}
          />
        )}
      </Stack>

      <Box sx={{ mb: 1.5 }}>
        <CardRenderer
          item={item}
          mode="preview"
          truncateTo={160}
          onOpenPdfSource={onOpenPdfSource}
        />
      </Box>

      <Box
        sx={{
          mt: 1.25,
          pt: 1.25,
          borderTop: "1px solid",
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1
        }}>
        
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
              {hostnameOf(item.source.url)}
            </Link>
          ) : item.pdfSource ? (
            <Typography
              variant="caption"
              onClick={(e) => {
                e.stopPropagation()
                onOpenPdfSource?.(item)
              }}
              sx={{
                color: "text.secondary",
                fontSize: "0.72rem",
                cursor: "pointer",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "100%",
                "&:hover": { color: "primary.main" }
              }}>
              {item.pdfSource.pdfName
                ? `${item.pdfSource.pdfName} · 第 ${item.pdfSource.page} 页`
                : `PDF · 第 ${item.pdfSource.page} 页`}
            </Typography>
          ) : (
            <Typography
              variant="caption"
              sx={{ color: "text.disabled", fontSize: "0.72rem" }}>
              自建卡片
            </Typography>
          )}
        <Typography
          variant="caption"
          sx={{ color: "text.disabled", fontSize: "0.7rem", flexShrink: 0 }}>
          {new Date(item.createdAt).toLocaleDateString("zh-CN", {
            month: "long",
            day: "numeric"
          })}
        </Typography>
      </Box>
    </Paper>
  )
}
