import {
  Box,
  Button,
  DialogActions,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Typography
} from "@mui/material"
import AddRoundedIcon from "@mui/icons-material/AddRounded"
import { useState } from "react"

import type { Project } from "../types"
import DialogShell from "./DialogShell"

export default function CopyCardsDialog({
  open,
  title,
  projects,
  onSelect,
  onCreateProject,
  onClose
}: {
  open: boolean
  title: string
  projects: Project[]
  onSelect: (projectId: string) => void
  /** Create a new project inline (returns its id, or null on failure). */
  onCreateProject?: (name: string) => Promise<string | null>
  onClose: () => void
}) {
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)
  const [name, setName] = useState("")

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed || !onCreateProject || creatingProject) return
    setCreatingProject(true)
    const id = await onCreateProject(trimmed)
    setCreatingProject(false)
    if (id) {
      setName("")
      setNewProjectOpen(false)
      onClose()
      onSelect(id)
    }
  }

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={title}
      maxWidth="xs"
      actions={
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose}>取消</Button>
        </DialogActions>
      }>
      {projects.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary", py: 2 }}>
          没有其他项目
        </Typography>
      ) : (
        <List disablePadding sx={{ maxHeight: 300, overflowY: "auto" }}>
          {projects.map((p) => (
            <ListItemButton
              key={p.id}
              onClick={() => onSelect(p.id)}
              sx={{ borderRadius: 1, my: 0.25 }}>
              <ListItemText
                primary={p.name}
                secondary={p.note || undefined}
                primaryTypographyProps={{ fontSize: "0.85rem" }}
                secondaryTypographyProps={{ fontSize: "0.75rem" }}
              />
            </ListItemButton>
          ))}
        </List>
      )}
      {onCreateProject && (
        <>
          <Box sx={{ borderTop: "1px solid", borderColor: "divider", my: 1 }} />
          {newProjectOpen ? (
            <Box sx={{ px: 1, py: 0.5 }}>
              <TextField
                autoFocus
                size="small"
                fullWidth
                placeholder="项目名称"
                value={name}
                disabled={creatingProject}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate()
                  if (e.key === "Escape") setNewProjectOpen(false)
                }}
                sx={{ "& .MuiInputBase-input": { fontSize: "0.8rem" } }}
              />
            </Box>
          ) : (
            <ListItemButton
              onClick={() => setNewProjectOpen(true)}
              sx={{ gap: 1, borderRadius: 1, fontSize: "0.8rem" }}>
              <AddRoundedIcon sx={{ fontSize: 15 }} />
              新建项目
            </ListItemButton>
          )}
        </>
      )}
    </DialogShell>
  )
}
