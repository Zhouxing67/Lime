import { useEffect, useState } from "react"
import { TextField } from "@mui/material"

import DialogShell from "./DialogShell"

/** Shared rename dialog (DialogShell-based) — replaces inline rename inputs
 *  across the sidebar (project / section) and the PDF hub (topic / pdf). The
 *  optional `note` field serves the project rename (name + 备注). */
export default function RenameDialog({
  open,
  title,
  label,
  value,
  note,
  noteLabel = "备注",
  confirmLabel = "保存",
  onClose,
  onConfirm
}: {
  open: boolean
  title: string
  label: string
  value: string
  note?: string
  noteLabel?: string
  confirmLabel?: string
  onClose: () => void
  onConfirm: (value: string, note?: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const [draftNote, setDraftNote] = useState(note ?? "")

  useEffect(() => {
    if (open) {
      setDraft(value)
      setDraftNote(note ?? "")
    }
  }, [open, value, note])

  const trimmed = draft.trim()

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={title}
      confirmLabel={confirmLabel}
      confirmDisabled={!trimmed || (trimmed === value && draftNote === (note ?? ""))}
      onConfirm={() => {
        onConfirm(trimmed, draftNote)
        onClose()
      }}>
      <TextField
        autoFocus
        fullWidth
        size="small"
        label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const t = draft.trim()
            if (t && (t !== value || draftNote !== (note ?? ""))) {
              onConfirm(t, draftNote)
              onClose()
            }
          }
        }}
      />
      {note !== undefined && (
        <TextField
          fullWidth
          size="small"
          multiline
          minRows={2}
          label={noteLabel}
          placeholder="可选"
          value={draftNote}
          onChange={(e) => setDraftNote(e.target.value)}
          sx={{ mt: 1.5 }}
        />
      )}
    </DialogShell>
  )
}
