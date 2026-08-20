import { Box, TextField, Typography } from "@mui/material"
import { useEffect, useState } from "react"

import DialogShell from "./DialogShell"

export const PDF_AI_CONTEXT_MAX_LENGTH = 8000

export default function PdfAiContextDialog({
  open,
  pdfName,
  value,
  onClose,
  onSave
}: {
  open: boolean
  pdfName: string
  value?: string
  onClose: () => void
  onSave: (value: string) => void | Promise<void>
}) {
  const [draft, setDraft] = useState(value ?? "")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setDraft(value ?? "")
  }, [open, value])

  const save = async () => {
    setSaving(true)
    try {
      await onSave(draft.trim())
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title="PDF AI 上下文"
      maxWidth="sm"
      confirmLabel={saving ? "保存中…" : "保存"}
      confirmDisabled={saving || draft.length > PDF_AI_CONTEXT_MAX_LENGTH}
      onConfirm={() => void save()}>
      <Typography
        variant="body2"
        sx={{ color: "text.secondary", mb: 2, wordBreak: "break-word" }}>
        {pdfName}
      </Typography>
      <TextField
        autoFocus
        fullWidth
        multiline
        minRows={7}
        maxRows={16}
        label="AI 上下文"
        placeholder="例如：这是一篇机器学习论文。请面向有基础的读者，用中文解释概念，并保留重要英文术语。"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        error={draft.length > PDF_AI_CONTEXT_MAX_LENGTH}
      />
      <Box sx={{ mt: 0.75, display: "flex", justifyContent: "space-between" }}>
        <Typography variant="caption" color="text.secondary">
          该内容会随 PDF 元数据备份和同步，不包含未来配置的 API Key。
        </Typography>
        <Typography
          variant="caption"
          color={
            draft.length > PDF_AI_CONTEXT_MAX_LENGTH
              ? "error.main"
              : "text.disabled"
          }>
          {draft.length}/{PDF_AI_CONTEXT_MAX_LENGTH}
        </Typography>
      </Box>
    </DialogShell>
  )
}
