import {
  Button,
  DialogActions,
  List,
  ListItemButton,
  ListItemText,
  Typography
} from "@mui/material"
import { Fragment } from "react"

import type { Section } from "../types"
import DialogShell from "./DialogShell"

/** Pick a section (or 未分类) to move a card into. The active project's L1/L2
 *  tree renders flat with L2 indented; the card's current section is marked. */
export default function MoveToSectionDialog({
  open,
  sections,
  currentSectionId,
  onMove,
  onClose
}: {
  open: boolean
  sections: Section[]
  currentSectionId: string | null
  onMove: (sectionId: string | null) => void
  onClose: () => void
}) {
  const l1 = sections.filter((s) => s.level === 1)
  const byParent = (parentId: string | null) =>
    sections.filter((s) => s.parentId === parentId)

  const SectionRow = ({ section, indent }: { section: Section; indent: number }) => (
    <ListItemButton
      sx={{
        pl: 1.5 + indent * 2,
        borderRadius: 1,
        mx: 1,
        ...(section.id === currentSectionId
          ? { bgcolor: "action.selected", color: "primary.main" }
          : {}),
        "&:hover": { bgcolor: "action.hover" }
      }}
      onClick={() => onMove(section.id)}>
      <ListItemText
        primary={section.title}
        primaryTypographyProps={{ fontSize: "0.85rem" }}
      />
    </ListItemButton>
  )

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title="移动到章节"
      maxWidth="xs"
      actions={
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose}>取消</Button>
        </DialogActions>
      }>
      {sections.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary", py: 2 }}>
          该项目还没有章节
        </Typography>
      ) : (
        <List dense disablePadding>
          {l1.map((s) => (
            <Fragment key={s.id}>
              <SectionRow section={s} indent={0} />
              {byParent(s.id).map((c) => (
                <SectionRow key={c.id} section={c} indent={1} />
              ))}
            </Fragment>
          ))}
        </List>
      )}
      <ListItemButton
        sx={{
          borderRadius: 1,
          mx: 1,
          color: "text.secondary",
          "&:hover": { bgcolor: "action.hover" }
        }}
        onClick={() => onMove(null)}>
        <ListItemText
          primary={currentSectionId !== null ? "移回未分类" : "移动到未分类"}
          primaryTypographyProps={{ fontSize: "0.85rem" }}
        />
      </ListItemButton>
    </DialogShell>
  )
}
