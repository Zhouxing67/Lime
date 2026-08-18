import LinkRoundedIcon from "@mui/icons-material/LinkRounded"
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded"
import {
  Autocomplete,
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
  /** pdfIds that already have an ACTIVE read-later (excluded from the picker,
   *  minus the item being edited). */
  activeReadLaterPdfIds?: Set<string>
  onClose: () => void
  onSave: (title: string, url?: string, pdfId?: string, notes?: string) => void
}

type SourceType = "url" | "pdf"

export default function ReadLaterDialog({
  open,
  item,
  pdfs,
  activeReadLaterPdfIds,
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
    (item ? true : sourceType === "pdf" ? pdfId !== "" : url.trim() !== "")

  const editSourceName = item?.pdfId
    ? pdfs.find((p) => p.id === item.pdfId)?.name
    : undefined

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
          item
            ? (item.url ?? undefined)
            : sourceType === "url"
              ? url.trim() || undefined
              : undefined,
          item
            ? (item.pdfId ?? undefined)
            : sourceType === "pdf"
              ? pdfId || undefined
              : undefined,
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
        {item ? (
          /* 编辑模式：来源锁定，仅标题/笔记可改 */
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: 1.5,
              py: 1,
              borderRadius: 1,
              bgcolor: "action.hover"
            }}>
            {item.pdfId ? (
              <PictureAsPdfRoundedIcon
                sx={{ fontSize: 16, flexShrink: 0, color: "text.secondary" }}
              />
            ) : (
              <LinkRoundedIcon
                sx={{ fontSize: 16, flexShrink: 0, color: "text.secondary" }}
              />
            )}
            <Typography
              variant="body2"
              noWrap
              sx={{ fontSize: "0.8rem", color: "text.secondary", minWidth: 0 }}>
              {item.pdfId ? (editSourceName ?? "PDF") : (item.url ?? "")}
            </Typography>
          </Box>
        ) : (
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
        )}
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
          <Autocomplete
            size="small"
            fullWidth
            options={pdfs}
            getOptionLabel={(p) => p.name}
            getOptionDisabled={(p) =>
              activeReadLaterPdfIds?.has(p.id) ?? false
            }
            value={pdfs.find((p) => p.id === pdfId) ?? null}
            onChange={(_, v) => setPdfId(v?.id ?? "")}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            noOptionsText="库内暂无 PDF"
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    minWidth: 0,
                    width: "100%"
                  }}>
                  <PictureAsPdfRoundedIcon
                    sx={{ fontSize: 16, flexShrink: 0, color: "text.secondary" }}
                  />
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{ fontSize: "0.8rem", flex: 1, minWidth: 0 }}>
                    {option.name}
                  </Typography>
                  {activeReadLaterPdfIds?.has(option.id) && (
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.disabled",
                        fontSize: "0.65rem",
                        flexShrink: 0
                      }}>
                      已在稍后读中
                    </Typography>
                  )}
                </Box>
              </li>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                label="选择 PDF"
                placeholder="搜索 PDF 名称…"
                size="small"
              />
            )}
          />
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
