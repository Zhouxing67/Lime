import { Box, Menu, MenuItem, TextField, Typography } from "@mui/material"
import AddRoundedIcon from "@mui/icons-material/AddRounded"
import FolderRoundedIcon from "@mui/icons-material/FolderRounded"
import { useMemo, useState } from "react"

import type { Project } from "../types"
import { byRecency } from "../utils"

/** The copy-to-project picker as a lightweight Menu (same surface as the
 *  PlaceCardMenu): recent-first, top 7 + 全部项目（N）fold, ellipsis names,
 *  and an inline 新建项目 input. */
export default function CopyCardsMenu({
  anchor,
  title,
  projects,
  onSelect,
  onCreateProject,
  onClose
}: {
  anchor: HTMLElement | null
  title: string
  projects: Project[]
  onSelect: (projectId: string) => void
  onCreateProject?: (name: string) => Promise<string | null>
  onClose: () => void
}) {
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)
  const [showAllProjects, setShowAllProjects] = useState(false)
  const [name, setName] = useState("")

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

  const handleClose = () => {
    setNewProjectOpen(false)
    setName("")
    setShowAllProjects(false)
    onClose()
  }

  return (
    <Menu
      anchorEl={anchor}
      open={Boolean(anchor)}
      onClose={handleClose}
      slotProps={{
        paper: { sx: { py: 0.5, borderRadius: 1, minWidth: 220 } }
      }}>
      <Typography
        sx={{
          fontSize: "0.68rem",
          color: "text.disabled",
          px: 1.5,
          pt: 0.5,
          pb: 0.25
        }}>
        {title}
      </Typography>
      {visibleProjects.length === 0 && (
        <Typography
          sx={{ fontSize: "0.75rem", color: "text.secondary", px: 1.5, py: 1 }}>
          没有其他项目
        </Typography>
      )}
      {visibleProjects.map((p) => (
        <MenuItem
          key={p.id}
          onClick={() => {
            onSelect(p.id)
            handleClose()
          }}
          title={p.name}
          sx={{ gap: 1, fontSize: "0.8rem", maxWidth: 260 }}>
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
      {onCreateProject && (
        <>
          <Box sx={{ borderTop: "1px solid", borderColor: "divider", my: 0.5 }} />
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
            <MenuItem
              onClick={() => setNewProjectOpen(true)}
              sx={{ gap: 1, fontSize: "0.8rem" }}>
              <AddRoundedIcon sx={{ fontSize: 15 }} />
              新建项目
            </MenuItem>
          )}
        </>
      )}
    </Menu>
  )
}
