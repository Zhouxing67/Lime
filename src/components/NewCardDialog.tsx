import { Box, TextField, Typography } from "@mui/material"

import DialogShell from "./DialogShell"
import ImageUrlInput from "./ImageUrlInput"

interface NewCardDialogProps {
  open: boolean
  title: string
  content: string
  onTitleChange: (v: string) => void
  onContentChange: (v: string) => void
  onClose: () => void
  onSave: () => void
}

export default function NewCardDialog({
  open,
  title,
  content,
  onTitleChange,
  onContentChange,
  onClose,
  onSave
}: NewCardDialogProps) {
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title="新建卡片"
      confirmLabel="保存"
      onConfirm={onSave}
      confirmDisabled={!title.trim()}>
      <TextField
        autoFocus
        fullWidth
        placeholder="用一句话概括这条内容…"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        sx={{
          mb: 2,
          "& .MuiOutlinedInput-root": {
            borderRadius: 1,
            fontSize: "1rem"
          }
        }}
      />
      <TextField
        multiline
        minRows={4}
        fullWidth
        placeholder="原始内容（选填）…"
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        sx={{
          "& .MuiOutlinedInput-root": {
            borderRadius: 1,
            fontSize: "1rem"
          }
        }}
      />

      <Typography
        variant="caption"
        sx={{ color: "text.secondary", mt: 2, mb: 0.5, display: "block" }}>
        图片（选填，插入到内容）
      </Typography>
      <ImageUrlInput content={content} onContentChange={onContentChange} />

      <Typography
        variant="caption"
        sx={{ color: "text.disabled", mt: 1, display: "block" }}>
        提示：可在卡片详情中添加笔记（复习背面）和标签
      </Typography>
    </DialogShell>
  )
}
