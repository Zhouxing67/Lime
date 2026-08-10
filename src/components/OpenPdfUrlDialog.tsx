import { useState } from "react"
import { DialogContentText, TextField } from "@mui/material"

import DialogShell from "./DialogShell"

/** The "从 URL 打开" dialog — paste a direct PDF URL, best-effort fetch via
 *  the background SW. The caller handles the fetch + the feedback. */
export default function OpenPdfUrlDialog({
  open,
  loading,
  onClose,
  onOpen
}: {
  open: boolean
  loading: boolean
  onClose: () => void
  onOpen: (url: string) => void
}) {
  const [url, setUrl] = useState("")

  const handleClose = () => {
    if (loading) return
    setUrl("")
    onClose()
  }

  const handleConfirm = () => {
    const u = url.trim()
    if (!u || loading) return
    onOpen(u)
  }

  return (
    <DialogShell
      open={open}
      onClose={handleClose}
      title="从 URL 打开 PDF"
      maxWidth="xs"
      confirmLabel={loading ? "获取中…" : "打开"}
      confirmDisabled={!url.trim() || loading}
      onConfirm={handleConfirm}>
      <DialogContentText sx={{ mb: 2, fontSize: "0.85rem" }}>
        粘贴 PDF 的直接链接（尽力而为：部分站点需登录或防盗链，可能失败）。
      </DialogContentText>
      <TextField
        fullWidth
        size="small"
        autoFocus
        placeholder="https://example.com/paper.pdf"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleConfirm()
        }}
        sx={{
          "& .MuiOutlinedInput-root": { borderRadius: 1 }
        }}
      />
    </DialogShell>
  )
}
