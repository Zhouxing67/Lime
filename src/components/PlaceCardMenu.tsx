import { Box, Menu, MenuItem, TextField, Typography } from "@mui/material"
import AddRoundedIcon from "@mui/icons-material/AddRounded"
import FolderRoundedIcon from "@mui/icons-material/FolderRounded"
import { useMemo, useState } from "react"

import type { Project } from "../types"
import { byRecency } from "../utils"

/** The cards panel's "置入项目" menu — project list (recent-first, top 7 +
 *  fold), ellipsis-truncated names, and an inline 新建项目 input. Extracted so
 *  PdfCardsPanel stays a shell + card list. */
export default function PlaceCardMenu({
  anchor,
  cardIds,
  projects,
  onPlace,
  onCreateProject,
  onClose
}: {
  anchor: HTMLElement | null
  cardIds: string[]
  projects: Project[]
  onPlace: (cardIds: string[], projectId: string) => void
  onCreateProject?: (name: string, cardIds: string[]) => Promise<boolean>
  onClose: () => void
}) {
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState("")
  const [showAllProjects, setShowAllProjects] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)

  const sortedProjects = useMemo(
    () =>
      [...projects].sort(
        byRecency(
          (p) => p.lastOpened,
          (a, b) => b.createdAt - a.createdAt
        )
      ),
    [projects]
  )
  const visibleProjects = showAllProjects
    ? sortedProjects
    : sortedProjects.slice(0, 7)
  const hiddenProjects = sortedProjects.length - visibleProjects.length

  const handleCreateProjectPlace = async () => {
    const name = newProjectName.trim()
    if (!name || !onCreateProject) return
    setCreatingProject(true)
    const ok = await onCreateProject(name, cardIds)
    setCreatingProject(false)
    if (ok) {
      setNewProjectName("")
      setNewProjectOpen(false)
      onClose()
    }
  }

  const handleClose = () => {
    setNewProjectOpen(false)
    setNewProjectName("")
    setShowAllProjects(false)
    onClose()
  }

  return (
    <Menu
      anchorEl={anchor}
      open={Boolean(anchor)}
      onClose={handleClose}
      slotProps={{
        paper: { sx: { py: 0.5, borderRadius: 1, minWidth: 200 } }
      }}>
      <Typography
        sx={{
          fontSize: "0.68rem",
          color: "text.disabled",
          px: 1.5,
          pt: 0.5,
          pb: 0.25
        }}>
        置入项目（未分类）
      </Typography>
      {visibleProjects.map((p) => (
        <MenuItem
          key={p.id}
          onClick={() => {
            onPlace(cardIds, p.id)
            handleClose()
          }}
          title={p.name}
          sx={{ gap: 1, fontSize: "0.8rem", maxWidth: 240 }}>
          <FolderRoundedIcon sx={{ fontSize: 15 }} />
          <Box
            component="span"
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}>
            {p.name}
          </Box>
        </MenuItem>
      ))}
      {hiddenProjects > 0 && (
        <MenuItem
          onClick={() => setShowAllProjects((s) => !s)}
          sx={{ gap: 1, fontSize: "0.75rem", color: "text.secondary" }}>
          {showAllProjects ? "收起" : `全部项目（${sortedProjects.length}）`}
        </MenuItem>
      )}
      <Box sx={{ borderTop: "1px solid", borderColor: "divider", my: 0.5 }} />
      {newProjectOpen ? (
        <Box sx={{ px: 1, py: 0.5 }}>
          <TextField
            autoFocus
            size="small"
            fullWidth
            placeholder="项目名称"
            value={newProjectName}
            disabled={creatingProject}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateProjectPlace()
              if (e.key === "Escape") setNewProjectOpen(false)
            }}
            sx={{ "& .MuiInputBase-input": { fontSize: "0.8rem" } }}
          />
        </Box>
      ) : (
        <MenuItem
          onClick={() => setNewProjectOpen(true)}
          sx={{ gap: 1, fontSize: "0.8rem" }}>
          <AddRoundedIcon sx={{ fontSize: 15 }} />
          新建项目
        </MenuItem>
      )}
    </Menu>
  )
}
