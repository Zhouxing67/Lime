import { Box, TextField, Typography } from "@mui/material"
import { useEffect, useState } from "react"

import type { PdfCard } from "../types"
import DialogShell from "./DialogShell"
import PdfCardBody from "./PdfCardBody"

/** Simple PDF-card note editor: content read-only + editable `idea`. */
export default function PdfEditDialog({
  item,
  open,
  onClose,
  onSave
}: {
  item: PdfCard | null
  open: boolean
  onClose: () => void
  onSave: (idea: string) => void
}) {
  const [idea, setIdea] = useState("")
  useEffect(() => {
    if (open) setIdea(item?.idea ?? "")
  }, [open, item])

  const unchanged = idea.trim() === (item?.idea ?? "").trim()

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={item?.page ? `P${item.page} · 补充说明` : "补充说明"}
      maxWidth="sm"
      confirmLabel="保存"
      onConfirm={() => onSave(idea.trim())}
      confirmDisabled={unchanged}>
      <Box sx={{ pt: 1 }}>
        {item && <PdfCardBody item={item} />}
        <Typography
          variant="caption"
          sx={{ display: "block", color: "text.secondary", mt: 2, mb: 0.5 }}>
          补充说明（支持 Markdown）
        </Typography>
        <TextField
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          multiline
          minRows={4}
          fullWidth
          size="small"
          variant="outlined"
          placeholder="写下你的理解、批注或补充…"
          autoFocus
          sx={{
            "& .MuiOutlinedInput-root": { borderRadius: 1, fontSize: "0.85rem" }
          }}
        />
      </Box>
    </DialogShell>
  )
}
