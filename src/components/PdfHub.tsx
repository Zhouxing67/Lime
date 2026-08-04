import AddRoundedIcon from "@mui/icons-material/AddRounded"
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import FileDownloadRoundedIcon from "@mui/icons-material/FileDownloadRounded"
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded"
import { Box, Button, IconButton, Paper, Stack, Typography } from "@mui/material"

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
  onExportPdf: (pdf: PdfFile) => void
}

export default function PdfHub({
  pdfs,
  countByPdf,
  onOpenPdf,
  onNewPdf,
  onDeletePdf,
  onExportPdf
}: PdfHubProps) {
  const sorted = [...pdfs].sort(
    (a, b) =>
      (b.lastOpened ?? 0) - (a.lastOpened ?? 0) || b.addedAt - a.addedAt
  )

  if (pdfs.length === 0) {
    return (
      <EmptyState
        icon={
          <PictureAsPdfRoundedIcon
            className="empty-icon"
            sx={{ fontSize: 80, mb: 3 }}
          />
        }
        title="还没有 PDF"
        subtitle="打开一个本地 PDF，开始批注与摘录"
        action={
          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={onNewPdf}
            sx={{ borderRadius: 1 }}>
            打开 PDF
          </Button>
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
      {/* dashed 打开 PDF tile */}
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
      {sorted.map((p) => (
        <Paper
          key={p.id}
          elevation={0}
          onClick={() => onOpenPdf(p.id)}
          sx={(theme) => ({
            p: 2,
            borderRadius: 1,
            border: "1px solid",
            borderColor: "divider",
            cursor: "pointer",
            position: "relative",
            transition: "all 0.2s",
            "&:hover": {
              boxShadow: theme.custom.cardShadowHover,
              transform: "translateY(-1px)",
              borderColor: theme.custom.borderStrong,
              ".hub-delete": { opacity: 1 },
              ".hub-export": { opacity: 1 }
            }
          })}>
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
            </Box>
          </Stack>
          <IconButton
            className="hub-export"
            size="small"
            onClick={(e) => {
              e.stopPropagation()
              onExportPdf(p)
            }}
            sx={{
              position: "absolute",
              bottom: 4,
              right: 4,
              p: 0.5,
              opacity: 0,
              color: "text.disabled",
              transition: "opacity 0.15s",
              "&:hover": { color: "primary.main", bgcolor: "transparent" }
            }}>
            <FileDownloadRoundedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Paper>
      ))}
    </Box>
  )
}
