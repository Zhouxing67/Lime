import { List, ListItemButton, ListItemText } from "@mui/material"

import type { Section } from "../types"
import DialogShell from "./DialogShell"

export interface MoveToSectionDialogProps {
  open: boolean
  sections: Section[]
  multi?: boolean
  count: number
  onClose: () => void
  onConfirm: (sectionId: string | null) => void
}

export default function MoveToSectionDialog({
  open,
  sections,
  multi,
  count,
  onClose,
  onConfirm
}: MoveToSectionDialogProps) {
  const l1 = sections
    .filter((s) => s.level === 1)
    .sort((a, b) => a.order - b.order)

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={`移到章节${multi ? `（${count} 张卡片）` : ""}`}
      maxWidth="xs">
      <List dense disablePadding>
        <ListItemButton
          onClick={() => onConfirm(null)}
          sx={{ borderRadius: 1, my: 0.25 }}>
          <ListItemText
            primary="未分类"
            slotProps={{
              primary: { sx: { fontSize: "0.82rem", color: "text.disabled" } }
            }}
          />
        </ListItemButton>
        {l1.map((s1) => (
          <div key={s1.id}>
            <ListItemButton
              onClick={() => onConfirm(s1.id)}
              sx={{ borderRadius: 1, my: 0.25 }}>
              <ListItemText
                primary={s1.title}
                slotProps={{
                  primary: { sx: { fontSize: "0.82rem", fontWeight: 600 } }
                }}
              />
            </ListItemButton>
            {sections
              .filter((s) => s.level === 2 && s.parentId === s1.id)
              .sort((a, b) => a.order - b.order)
              .map((s2) => (
                <ListItemButton
                  key={s2.id}
                  onClick={() => onConfirm(s2.id)}
                  sx={{ borderRadius: 1, ml: 3, my: 0.25 }}>
                  <ListItemText
                    primary={s2.title}
                    slotProps={{
                      primary: {
                        sx: { fontSize: "0.8rem", color: "text.secondary" }
                      }
                    }}
                  />
                </ListItemButton>
              ))}
          </div>
        ))}
      </List>
    </DialogShell>
  )
}
