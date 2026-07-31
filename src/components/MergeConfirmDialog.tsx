import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography
} from "@mui/material"
import { useState } from "react"

import type { Item } from "../types"
import { truncateText } from "../utils"

export interface MergeConfirmDialogProps {
  open: boolean
  items: Item[]
  onClose: () => void
  onConfirm: (title: string) => void
}

export default function MergeConfirmDialog({
  open,
  items,
  onClose,
  onConfirm
}: MergeConfirmDialogProps) {
  const [draftTitle, setDraftTitle] = useState("")

  const handleConfirm = () => {
    const title = draftTitle.trim()
    if (!title) return
    onConfirm(title)
    setDraftTitle("")
  }

  const handleClose = () => {
    setDraftTitle("")
    onClose()
  }

  const totalImages = items.reduce(
    (acc, item) => acc + (item.images?.length ?? 0),
    0
  )

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 1 } } }}>
      <DialogTitle sx={{ py: 2.5, px: 3, fontSize: "1rem" }}>
        合并 {items.length} 张卡片
      </DialogTitle>
      <DialogContent sx={{ px: 3, pb: 0 }}>
        <TextField
          autoFocus
          fullWidth
          placeholder="输入合并后的卡片标题"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draftTitle.trim()) handleConfirm()
          }}
          sx={{
            mb: 2,
            "& .MuiOutlinedInput-root": { borderRadius: 1, fontSize: "0.95rem" }
          }}
        />
        <Box
          sx={{
            maxHeight: "40vh",
            overflowY: "auto",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            px: 2,
            py: 1.5,
            bgcolor: "background.default",
            mb: 2
          }}>
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ display: "block", mb: 1 }}>
            预览（将按以下顺序合并正文和图片）
          </Typography>
          {items.map((item, idx) => (
            <Box
              key={item.id}
              sx={{
                mb: idx < items.length - 1 ? 1.5 : 0,
                p: 1.5,
                borderRadius: 1,
                bgcolor: "background.paper"
              }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  mb: 0.5,
                  fontSize: "0.84rem",
                  color: "text.primary"
                }}>
                {idx + 1}. {item.title || "（无摘要）"}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontSize: "0.78rem",
                  color: "text.secondary",
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical" as const
                }}>
                {truncateText(item.content, 200) || "（无正文）"}
              </Typography>
              {item.images && item.images.length > 0 && (
                <Typography
                  variant="caption"
                  sx={{ color: "text.disabled", fontSize: "0.7rem" }}>
                  +{item.images.length} 张图片
                </Typography>
              )}
            </Box>
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary">
          将合并 {items.length} 张卡片 → 1 张
          {totalImages > 0 ? `，合并 ${totalImages} 张图片` : ""}
          。原卡片将被删除。
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2.5 }}>
        <Button onClick={handleClose}>取消</Button>
        <Button
          variant="contained"
          disabled={!draftTitle.trim()}
          onClick={handleConfirm}>
          合并并删除原件
        </Button>
      </DialogActions>
    </Dialog>
  )
}
