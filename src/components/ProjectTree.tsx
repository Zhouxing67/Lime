import AddRoundedIcon from "@mui/icons-material/AddRounded"
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded"
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded"
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded"
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded"
import {
  alpha,
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material"
import { useCallback, useMemo, useState } from "react"

import RenameDialog from "./RenameDialog"
import type { Project, Section } from "../types"
import { RECENT_TOTAL as RECENT_TOTAL_SHARED } from "../constants"
import { byRecency } from "../utils"

type DropPos = "before" | "after"

interface ProjectTreeProps {
  projects: Project[]
  activeProjectId: string | null
  activeSectionId: string | null
  isOpen: boolean
  expanded: Set<string>
  countBySection: Map<string, number>
  unclassifiedByProject: Record<string, number>
  onSelectProject: (id: string) => void
  onCloseProject: () => void
  onSelectSection: (sectionId: string | null) => void
  onToggleExpanded: (id: string) => void
  onAddSection: (parentId: string | null, title: string) => void
  onRenameSection: (sectionId: string, title: string) => void
  onDeleteSection: (
    sectionId: string,
    cardCount: number,
    subSectionCount: number
  ) => void
  onMoveSection: (
    sectionId: string,
    newParentId: string | null,
    newOrder: number
  ) => void
  onRenameProject: (id: string, name: string) => void
  onUpdateNote: (id: string, note: string) => void
  onDeleteProject: (id: string) => void
  onExportMarkdown: (projectId: string, sectionId?: string | null) => void
}

const sortByOrder = (list: Section[]) =>
  [...list].sort((a, b) => a.order - b.order)

export default function ProjectTree({
  projects,
  activeProjectId,
  activeSectionId,
  isOpen,
  expanded,
  countBySection,
  unclassifiedByProject,
  onSelectProject,
  onCloseProject,
  onSelectSection,
  onToggleExpanded,
  onAddSection,
  onRenameSection,
  onDeleteSection,
  onMoveSection,
  onRenameProject,
  onUpdateNote,
  onDeleteProject,
  onExportMarkdown
}: ProjectTreeProps) {
  const [draggedSection, setDraggedSection] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{
    id: string
    pos: DropPos
  } | null>(null)
  const [addingFor, setAddingFor] = useState<
    { type: "project"; id: string } | { type: "section"; id: string } | null
  >(null)
  const [addTitle, setAddTitle] = useState("")
  const [sectionRename, setSectionRename] = useState<{
    id: string
    title: string
  } | null>(null)
  const [projectRename, setProjectRename] = useState<{
    id: string
    name: string
    note?: string
  } | null>(null)
  const [showAllProjects, setShowAllProjects] = useState(false)

  // Active project pinned first, then others by most-recently-opened, so the
  // sidebar never drowns under a long project list. The rest collapse behind
  // a "全部项目" toggle.
  const RECENT_TOTAL = RECENT_TOTAL_SHARED
  const orderedProjects = useMemo(() => {
    const sorted = [...projects].sort(
      byRecency(
        (p) => p.lastOpened,
        (a, b) => b.createdAt - a.createdAt
      )
    )
    if (activeProjectId) {
      const active = sorted.find((p) => p.id === activeProjectId)
      if (active) {
        return [
          active,
          ...sorted.filter((p) => p.id !== activeProjectId)
        ]
      }
    }
    return sorted
  }, [projects, activeProjectId])
  const visibleProjects = showAllProjects
    ? orderedProjects
    : orderedProjects.slice(0, RECENT_TOTAL)
  const hiddenCount = orderedProjects.length - visibleProjects.length

  const startAdd = (
    target: { type: "project"; id: string } | { type: "section"; id: string }
  ) => {
    setAddingFor(target)
    setAddTitle("")
  }

  const commitAdd = () => {
    if (!addingFor) return
    const title = addTitle.trim() || "新章节"
    onAddSection(addingFor.type === "project" ? null : addingFor.id, title)
    setAddingFor(null)
    setAddTitle("")
  }

  // ---- Section drag (reorder among same-parent siblings only; no reparent) ----
  const handleSectionDragStart = useCallback(
    (e: React.DragEvent, sectionId: string) => {
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData("text/section", sectionId)
      setDraggedSection(sectionId)
    },
    []
  )

  const handleSectionDragEnd = useCallback(() => {
    setDraggedSection(null)
    setDropTarget(null)
  }, [])

  const handleSectionDragOver = useCallback(
    (e: React.DragEvent, target: Section) => {
      if (!draggedSection || draggedSection === target.id) return
      const hostProject = projects.find((p) =>
        p.sections?.some((s) => s.id === draggedSection)
      )
      if (!hostProject?.sections) return
      const dragged = hostProject.sections.find(
        (s) => s.id === draggedSection
      )
      if (!dragged) return
      // Reparent disabled: only reorder among same-parent, same-level siblings.
      if (dragged.level !== target.level) return
      if ((dragged.parentId ?? null) !== (target.parentId ?? null)) return

      const el = e.currentTarget as HTMLElement
      const rect = el.getBoundingClientRect()
      const pos: DropPos =
        e.clientY < rect.top + rect.height / 2 ? "before" : "after"
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"
      setDropTarget({ id: target.id, pos })
    },
    [draggedSection, projects]
  )

  const handleSectionDrop = useCallback(
    (e: React.DragEvent, target: Section) => {
      e.preventDefault()
      e.stopPropagation()
      if (!draggedSection || !dropTarget) return
      const hostProject = projects.find((p) =>
        p.sections?.some((s) => s.id === draggedSection)
      )
      if (!hostProject?.sections) return
      const sections = hostProject.sections

      const parentId = target.parentId
      const siblings = sections
        .filter((s) => s.parentId === parentId && s.level === target.level)
        .sort((a, b) => a.order - b.order)
      const targetIdx = siblings.findIndex((s) => s.id === target.id)
      const newIdx = dropTarget.pos === "before" ? targetIdx : targetIdx + 1
      const others = siblings.filter((s) => s.id !== draggedSection)
      let newOrder: number
      if (others.length === 0) newOrder = 0
      else if (newIdx === 0) newOrder = others[0].order - 1
      else if (newIdx >= others.length)
        newOrder = others[others.length - 1].order + 1
      else newOrder = (others[newIdx - 1].order + others[newIdx].order) / 2
      onMoveSection(draggedSection, parentId, newOrder)

      setDraggedSection(null)
      setDropTarget(null)
    },
    [draggedSection, dropTarget, onMoveSection, projects]
  )

  const renderInlineAdd = (pl: number) =>
    addingFor ? (
      <Box sx={{ pl, pr: 1.5, py: 0.5 }}>
        <TextField
          autoFocus
          fullWidth
          size="small"
          placeholder="章节名称，回车确认"
          value={addTitle}
          onChange={(e) => setAddTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitAdd()
            if (e.key === "Escape") setAddingFor(null)
          }}
          onBlur={commitAdd}
          sx={{
            "& .MuiOutlinedInput-root": {
              borderRadius: 1,
              fontSize: "0.85rem",
              py: 0.25
            }
          }}
        />
      </Box>
    ) : null

  // Render a section node; rename goes through the shared dialog.
  const sectionRow = (
    section: Section,
    isChild: boolean,
    opts: {
      collapsed: boolean
      onToggle?: () => void
      onAddChild?: () => void
      onDelete?: () => void
      onExportMarkdown?: () => void
    }
  ) => (
      <SectionNode
        section={section}
        isChild={isChild}
        active={activeSectionId === section.id}
        count={countBySection.get(section.id) ?? 0}
        collapsed={opts.collapsed}
        dropIndicator={
          dropTarget?.id === section.id ? dropTarget.pos : null
        }
        onToggle={opts.onToggle}
        onSelect={() => onSelectSection(section.id)}
        onAddChild={opts.onAddChild}
        onRename={() => setSectionRename({ id: section.id, title: section.title })}
        onDelete={
          opts.onDelete ??
          (() =>
            onDeleteSection(
              section.id,
              countBySection.get(section.id) ?? 0,
              0
            ))
        }
        onExportMarkdown={opts.onExportMarkdown}
        onDragStart={(e) => handleSectionDragStart(e, section.id)}
        onDragEnd={handleSectionDragEnd}
        onDragOver={(e) => handleSectionDragOver(e, section)}
        onDrop={(e) => handleSectionDrop(e, section)}
      />
    )

  return (
    <Box>
      {visibleProjects.map((project) => {
        const sections = sortByOrder(project.sections ?? [])
        const l1s = sections.filter((s) => s.level === 1)
        const l2Of = (l1Id: string) =>
          sections.filter((s) => s.level === 2 && s.parentId === l1Id)
        const projectTotal =
          sections.reduce(
            (acc, s) => acc + (countBySection.get(s.id) ?? 0),
            0
          ) +
          (unclassifiedByProject[project.id] ?? 0)
        // The project tree is expanded when it is the open project AND the
        // row has been clicked open (isOpen toggles on row click). Only one
        // project can be open at a time, so this is an accordion.
        const isExpanded = activeProjectId === project.id && isOpen

        return (
          <Box
            key={project.id}
            sx={{
              mb: 0.75,
              borderRadius: 1,
              bgcolor: "background.default",
              p: 0.25
            }}>
            <ProjectNode
              project={project}
              active={activeProjectId === project.id}
              total={projectTotal}
              onOpen={() => onSelectProject(project.id)}
              onClose={onCloseProject}
              onAdd={() => {
                if (!isExpanded) onSelectProject(project.id)
                startAdd({ type: "project", id: project.id })
              }}
              onDelete={() => onDeleteProject(project.id)}
              onExportMarkdown={() => onExportMarkdown(project.id)}
              onRequestRename={() =>
                setProjectRename({
                  id: project.id,
                  name: project.name,
                  note: project.note ?? ""
                })
              }
            />
            {isExpanded && (
              <Box sx={{ pl: 1.5 }}>
                {addingFor?.type === "project" &&
                  addingFor.id === project.id &&
                  renderInlineAdd(1)}
                {l1s.map((s1) => {
                  const subs = l2Of(s1.id)
                  const collapsed = !expanded.has(s1.id)
                  return (
                    <Box key={s1.id}>
                      {sectionRow(s1, false, {
                        collapsed,
                        onToggle:
                          subs.length > 0
                            ? () => onToggleExpanded(s1.id)
                            : undefined,
                        onAddChild: () => {
                          if (collapsed) onToggleExpanded(s1.id)
                          startAdd({ type: "section", id: s1.id })
                        },
                        onDelete: () =>
                          onDeleteSection(
                            s1.id,
                            countBySection.get(s1.id) ?? 0,
                            subs.length
                          ),
                        onExportMarkdown: () =>
                          onExportMarkdown(project.id, s1.id)
                      })}
                      {!collapsed &&
                        (subs.length > 0 ||
                          (addingFor?.type === "section" &&
                            addingFor.id === s1.id)) && (
                        <Box
                          sx={{
                            pl: 2,
                            borderLeft: "1px solid",
                            borderColor: "divider"
                          }}>
                          {addingFor?.type === "section" &&
                            addingFor.id === s1.id &&
                            renderInlineAdd(0)}
                          {subs.map((s2) => (
                            <Box key={s2.id}>
                              {sectionRow(s2, true, {
                                collapsed: false,
                                onExportMarkdown: () =>
                                  onExportMarkdown(project.id, s2.id)
                              })}
                            </Box>
                          ))}
                        </Box>
                      )}
                    </Box>
                  )
                })}

                {/* 未分类 */}
                <TreeRow
                  active={activeSectionId === "__unclassified__"}
                  onClick={() => onSelectSection("__unclassified__")}
                  indent={1}>
                  <Box sx={{ width: 21, flexShrink: 0 }} />
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{
                      fontSize: "0.8rem",
                      flex: 1,
                      minWidth: 0,
                      color:
                        activeSectionId === "__unclassified__"
                          ? "primary.main"
                          : "text.secondary"
                    }}>
                    未分类
                  </Typography>
                  <CountBadge
                    count={unclassifiedByProject[project.id] ?? 0}
                  />
                </TreeRow>
              </Box>
            )}
          </Box>
        )
      })}
      {hiddenCount > 0 && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            px: 1.5,
            py: 0.5,
            cursor: "pointer",
            "&:hover": { bgcolor: "action.hover" }
          }}
          onClick={() => setShowAllProjects((v) => !v)}>
          <ExpandMoreRoundedIcon
            sx={{
              fontSize: 14,
              color: "text.secondary",
              transform: showAllProjects ? "rotate(180deg)" : "none",
              transition: "transform 0.15s"
            }}
          />
          <Typography
            variant="body2"
            sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
            {showAllProjects ? "收起" : `全部项目（${projects.length}）`}
          </Typography>
        </Box>
      )}
      {projects.length === 0 && (
        <Box sx={{ px: 1.5, py: 1 }}>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            暂无项目
          </Typography>
        </Box>
      )}
      {sectionRename && (
        <RenameDialog
          open={Boolean(sectionRename)}
          title="重命名章节"
          label="章节名称"
          value={sectionRename.title}
          onClose={() => setSectionRename(null)}
          onConfirm={(title) => onRenameSection(sectionRename.id, title)}
        />
      )}
      {projectRename && (
        <RenameDialog
          open={Boolean(projectRename)}
          title="重命名项目"
          label="项目名称"
          value={projectRename.name}
          note={projectRename.note ?? ""}
          onClose={() => setProjectRename(null)}
          onConfirm={(name, note) => {
            if (name && name !== projectRename.name)
              onRenameProject(projectRename.id, name)
            if (note !== undefined && note !== (projectRename.note ?? ""))
              onUpdateNote(projectRename.id, note)
          }}
        />
      )}
    </Box>
  )
}

// ---- Row primitives ----

function CountBadge({ count }: { count: number }) {
  return (
    <Typography
      variant="caption"
      sx={{
        color: "text.disabled",
        fontSize: "0.65rem",
        flexShrink: 0
      }}>
      {count}
    </Typography>
  )
}

function TreeRow({
  children,
  onClick,
  active,
  dropIndicator,
  indent
}: {
  children: React.ReactNode
  onClick?: () => void
  active?: boolean
  dropIndicator?: DropPos | null
  indent?: number
}) {
  return (
    <Box sx={{ position: "relative" }}>
      {dropIndicator === "before" && (
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: 4,
            right: 4,
            height: 2,
            bgcolor: "primary.main",
            borderRadius: 1,
            zIndex: 1
          }}
        />
      )}
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.75}
        sx={(theme) => ({
          pl: indent ?? 1.5,
          pr: 1.5,
          py: 0.5,
          cursor: onClick ? "pointer" : "default",
          bgcolor: active
            ? alpha(theme.palette.primary.main, 0.05)
            : "transparent",
          "&:hover": {
            bgcolor: active
              ? alpha(theme.palette.primary.main, 0.05)
              : "action.hover"
          },
          "&:hover .tree-actions": { opacity: 1 }
        })}
        onClick={onClick}>
        {children}
      </Stack>
      {dropIndicator === "after" && (
        <Box
          sx={{
            position: "absolute",
            bottom: 0,
            left: 4,
            right: 4,
            height: 2,
            bgcolor: "primary.main",
            borderRadius: 1,
            zIndex: 1
          }}
        />
      )}
    </Box>
  )
}

// ---- Project node ----

function ProjectNode({
  project,
  active,
  total,
  onOpen,
  onClose,
  onAdd,
  onDelete,
  onExportMarkdown,
  onRequestRename
}: {
  project: Project
  active: boolean
  total: number
  onOpen: () => void
  onClose: () => void
  onAdd: () => void
  onDelete: () => void
  onExportMarkdown?: () => void
  onRequestRename: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)

  if (confirming) {
    return (
      <Box
        sx={{
          px: 1.5,
          py: 1,
          bgcolor: "action.selected",
          "&:hover": { bgcolor: "action.selected" }
        }}>
        <Typography variant="caption" sx={{ display: "block", mb: 1 }}>
          删除「{project.name}」？该项目的所有卡片也将一并删除。
        </Typography>
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button size="small" onClick={() => setConfirming(false)}>
            取消
          </Button>
          <Button
            size="small"
            color="error"
            variant="contained"
            onClick={() => {
              setConfirming(false)
              onDelete()
            }}>
            删除
          </Button>
        </Stack>
      </Box>
    )
  }

  return (
    <TreeRow
      active={active}
      onClick={() => (active ? onClose() : onOpen())}
      indent={1.5}>
      <FolderOpenRoundedIcon
        sx={{
          fontSize: 16,
          color: active ? "primary.main" : "text.secondary"
        }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="body2"
          noWrap
          sx={{
            fontSize: "0.8rem",
            fontWeight: active ? 600 : 400,
            color: active ? "primary.main" : "text.primary"
          }}>
          {project.name}
        </Typography>
        {project.note && (
          <Typography
            variant="caption"
            noWrap
            sx={{
              color: "text.secondary",
              display: "block",
              fontSize: "0.65rem"
            }}>
            {project.note}
          </Typography>
        )}
      </Box>
      <CountBadge count={total} />
      <Box
        className="tree-actions"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.25,
          opacity: 0,
          transition: "opacity 0.15s"
        }}
        onClick={(e) => e.stopPropagation()}>
        {project.systemKind !== "vocabulary" && (
          <Tooltip title="添加章节">
            <IconButton size="small" onClick={onAdd}>
              <AddRoundedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="更多操作">
          <IconButton
            size="small"
            onClick={(e) => setMenuAnchor(e.currentTarget)}>
            <MoreHorizRoundedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Menu
              anchorEl={menuAnchor}
              open={Boolean(menuAnchor)}
              onClose={() => setMenuAnchor(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{ paper: { sx: { py: 0.5, borderRadius: 1 } } }}>
              {project.systemKind !== "vocabulary" && (
                <MenuItem
                  sx={{ fontSize: "0.8rem" }}
                  onClick={() => {
                    setMenuAnchor(null)
                    onRequestRename()
                  }}>
                  重命名 / 编辑备注
                </MenuItem>
              )}
              {onExportMarkdown && (
                <MenuItem
                  sx={{ fontSize: "0.8rem" }}
                  onClick={() => {
                    setMenuAnchor(null)
                    onExportMarkdown()
                  }}>
                  导出 Markdown
                </MenuItem>
              )}
              {project.systemKind !== "vocabulary" && (
                <MenuItem
                  sx={{ fontSize: "0.8rem" }}
                  onClick={() => {
                    setMenuAnchor(null)
                    setConfirming(true)
                  }}>
                  删除项目
                </MenuItem>
              )}
            </Menu>
      </Box>
    </TreeRow>
  )
}

// ---- Section node ----

function SectionNode({
  section,
  isChild,
  active,
  count,
  collapsed,
  dropIndicator,
  onToggle,
  onSelect,
  onAddChild,
  onRename,
  onDelete,
  onExportMarkdown,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop
}: {
  section: Section
  isChild: boolean
  active: boolean
  count: number
  collapsed: boolean
  dropIndicator?: DropPos | null
  onToggle?: () => void
  onSelect: () => void
  onAddChild?: () => void
  onRename: () => void
  onDelete: () => void
  onExportMarkdown?: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)

  return (
    <TreeRow
      active={active}
      dropIndicator={dropIndicator}
      onClick={onSelect}
      indent={isChild ? 0 : 1}>
      <Box
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDrop={onDrop}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          flex: 1,
          minWidth: 0,
          cursor: "grab"
        }}>
        {onToggle ? (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
            sx={{ p: 0.25 }}>
            {collapsed ? (
              <ChevronRightRoundedIcon
                sx={{ fontSize: 15, color: "text.disabled" }}
              />
            ) : (
              <ExpandMoreRoundedIcon
                sx={{ fontSize: 15, color: "text.disabled" }}
              />
            )}
          </IconButton>
        ) : (
          <Box sx={{ width: 21, flexShrink: 0 }} />
        )}
        <Typography
          variant="body2"
          noWrap
          sx={{
            fontSize: "0.8rem",
            flex: 1,
            minWidth: 0,
            fontWeight: active ? 600 : isChild ? 400 : 500,
            color: active
              ? "primary.main"
              : isChild
                ? "text.secondary"
                : "text.primary"
          }}>
          {section.title}
        </Typography>
        <CountBadge count={count} />
      </Box>
      <Box
        className="tree-actions"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.25,
          opacity: 0,
          transition: "opacity 0.15s"
        }}
        onClick={(e) => e.stopPropagation()}>
        {onAddChild && (
          <Tooltip title="添加子章节">
            <IconButton size="small" onClick={onAddChild}>
              <AddRoundedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="更多操作">
          <IconButton
            size="small"
            onClick={(e) => setMenuAnchor(e.currentTarget)}>
            <MoreHorizRoundedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{ paper: { sx: { py: 0.5, borderRadius: 1 } } }}>
          <MenuItem
            sx={{ fontSize: "0.8rem" }}
            onClick={() => {
              setMenuAnchor(null)
              onRename()
            }}>
            重命名
          </MenuItem>
          <MenuItem
            sx={{ fontSize: "0.8rem" }}
            onClick={() => {
              setMenuAnchor(null)
              onDelete()
            }}>
            删除章节
          </MenuItem>
          {onExportMarkdown && (
            <MenuItem
              sx={{ fontSize: "0.8rem" }}
              onClick={() => {
                setMenuAnchor(null)
                onExportMarkdown()
              }}>
              导出章节 Markdown
            </MenuItem>
          )}
        </Menu>
      </Box>
    </TreeRow>
  )
}
