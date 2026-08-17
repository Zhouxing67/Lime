import LinkRoundedIcon from "@mui/icons-material/LinkRounded"
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded"
import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography
} from "@mui/material"
import { useEffect, useState } from "react"

import type { ReadLater } from "../types"
import DialogShell from "./DialogShell"

interface ReadLaterDialogProps {
  open: boolean
  /** The item being edited, or null for a new one. */
  item: ReadLater | null
  pdfs: { id: string; name: string }[]
  onClose: () => void
  onSave: (title: string, url?: string, pdfId?: string, notes?: string) => void
}

type SourceType = "url" | "pdf"

export default function ReadLaterDialog({
  open,
  item,
  pdfs,
  onClose,
  onSave
}: ReadLaterDialogProps) {
  const [title, setTitle] = useState("")
  const [sourceType, setSourceType] = useState<SourceType>("url")
  const [url, setUrl] = useState("")
  const [pdfId, setPdfId] = useState("")
  const [notes, setNotes] = useState("")

  useEffect(() => {
    if (!open) return
    setTitle(item?.title ?? "")
    setSourceType(item?.pdfId ? "pdf" : "url")
    setUrl(item?.url ?? "")
    setPdfId(item?.pdfId ?? "")
    setNotes(item?.notes ?? "")
  }, [open, item])

  const canSave =
    title.trim() !== "" &&
    (sourceType === "pdf" ? pdfId !== "" : url.trim() !== "")

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={item ? "编辑稍后读" : "新增稍后读"}
      confirmLabel="保存"
      confirmDisabled={!canSave}
      onConfirm={() =>
        onSave(
          title.trim(),
          sourceType === "url" ? url.trim() || undefined : undefined,
          sourceType === "pdf" ? pdfId || undefined : undefined,
          notes
        )
      }>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <TextField
          size="small"
          label="标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          fullWidth
          autoFocus
        />
        <FormControl size="small" fullWidth>
          <InputLabel>来源</InputLabel>
          <Select
            label="来源"
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as SourceType)}>
            <MenuItem value="url">
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <LinkRoundedIcon sx={{ fontSize: 16 }} />
                网页链接
              </Box>
            </MenuItem>
            <MenuItem value="pdf">
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <PictureAsPdfRoundedIcon sx={{ fontSize: 16 }} />
                库内 PDF
              </Box>
            </MenuItem>
          </Select>
        </FormControl>
        {sourceType === "url" ? (
          <TextField
            size="small"
            label="URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            fullWidth
            placeholder="https://…"
          />
        ) : (
          <FormControl size="small" fullWidth>
            <InputLabel>选择 PDF</InputLabel>
            <Select
              label="选择 PDF"
              value={pdfId}
              onChange={(e) => setPdfId(e.target.value as string)}>
              {pdfs.length === 0 && (
                <MenuItem value="" disabled>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    库内暂无 PDF
                  </Typography>
                </MenuItem>
              )}
              {pdfs.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <TextField
          size="small"
          label="笔记（可选）"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          fullWidth
          multiline
          minRows={2}
        />
      </Box>
    </DialogShell>
  )
}
