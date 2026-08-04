import AddRoundedIcon from "@mui/icons-material/AddRounded"
import CheckRoundedIcon from "@mui/icons-material/CheckRounded"
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded"
import { Box, Button, IconButton, Paper, Stack, Typography } from "@mui/material"
import { alpha } from "@mui/material/styles"

import type { PdfFile } from "../types"
import EmptyState from "./EmptyState"

function relativeTime(ts?: number): string {
  if (!ts) return ""
  const diff = Date.now() - ts
  const day = 86400000
  if (diff < day) return "今天"
  if (diff < 2 * day) return "昨天"
  return `${Math.floor(diff / day)} 天前`
}

interface PdfHubProps {
  pdfs: PdfFile[]
  countByPdf: Record<string, number>
  onOpenPdf: (id: string) => void
  onNewPdf: () => void
  onDeletePdf: (pdf: PdfFile) => void
  keyword?: string
  /** Read-only multi-select mode (backup view): click toggles selection. */
  selectable?: boolean
  selected?: (id: string) => boolean
  onToggleSelect?: (id: string) => void
}

export default function PdfHub({
  pdfs,
  countByPdf,
  onOpenPdf,
  onNewPdf,
  onDeletePdf,
  keyword = "",
  selectable,
  selected,
  onToggleSelect
}: PdfHubProps) {
  const sorted = [...pdfs]
    .sort(
      (a, b) =>
        (b.lastOpened ?? 0) - (a.lastOpened ?? 0) || b.addedAt - a.addedAt
    )
    .filter((p) => {
      if (!keyword.trim()) return true
      return p.name.toLowerCase().includes(keyword.trim().toLowerCase())
    })

  if (pdfs.length === 0) {
    return (
      <EmptyState
        icon={
          <PictureAsPdfRoundedIcon
            className="empty-icon"
            sx={{ fontSize: 80, mb: 3 }}
          />
        }
        title={selectable ? "没有可备份的 PDF" : "还没有 PDF"}
        subtitle={
          selectable ? "本地没有 PDF，先去 PDF 视图打开一个" : "打开一个本地 PDF，开始批注与摘录"
        }
        action={
          !selectable ? (
            <Button
              variant="contained"
              startIcon={<AddRoundedIcon />}
              onClick={onNewPdf}
              sx={{ borderRadius: 1 }}>
              打开 PDF
            </Button>
          ) : undefined
        }
      />
    )
  }

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: 1.5
      }}>
      {!selectable && (
      <Paper
        elevation={0}
        onClick={onNewPdf}
        sx={(theme) => ({
          p: 2,
          borderRadius: 1,
          border: "1.5px dashed",
          borderColor: theme.custom.borderStrong,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
          minHeight: 104,
          color: "text.secondary",
          cursor: "pointer",
          transition: "all 0.2s",
          "&:hover": {
            borderColor: "primary.main",
            color: "primary.main",
            boxShadow: theme.custom.cardShadowHover
          }
        })}>
        <AddRoundedIcon sx={{ fontSize: 26 }} />
        <Typography variant="body2" sx={{ fontSize: "0.85rem" }}>
          打开 PDF
        </Typography>
      </Paper>
      )}
      {sorted.map((p) => {
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
            border: isPlaceholder
              ? "1.5px dashed"
              : "1px solid",
            borderColor: selectable
              ? "primary.main"
              : isPlaceholder
                ? theme.custom.borderStrong
                : isSelected
                  ? "primary.main"
                  : "divider",
            cursor: "pointer",
            position: "relative",
            // Align with ItemCard's selectMode look: uniform primary tint in
            // selectable mode, paper background otherwise (never transparent).
            bgcolor: selectable
              ? alpha(theme.palette.primary.main, 0.04)
              : isSelected
                ? alpha(theme.palette.primary.main, 0.04)
                : "background.paper",
            transition: "all 0.2s",
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
          )}
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 1,
                bgcolor: "#f0efec",
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
                  fontFamily: (t) => t.custom.serif
                }}>
                {p.name}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {countByPdf[p.id] ?? 0} 张摘录 ·{" "}
                {relativeTime(p.lastOpened) || "未打开"}
              </Typography>
              {isPlaceholder && (
                <Typography
                  variant="caption"
                  sx={{ color: "primary.main", fontSize: "0.68rem" }}>
                  未同步文件 · 点击打开本地 PDF 匹配
                </Typography>
              )}
            </Box>
          </Stack>
        </Paper>
        )
      })}
    </Box>
  )
}
