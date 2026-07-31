import AddRoundedIcon from "@mui/icons-material/AddRounded"
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded"
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded"
import { Box, Collapse, IconButton, Stack, TextField, Tooltip, Typography, alpha } from "@mui/material"
import { useCallback, useState } from "react"

import type { Item, Section } from "../types"
import CardGrid from "./CardGrid"

type DropPos = "before" | "after" | "inside"

export interface ContentOutlineProps {
  items: Item[]
  sections: Section[]
  collapsedSections: Set<string>
  selectMode: boolean
  selectedIds: string[]
  readOnly?: boolean
  reviewItemIds?: Set<string>
  onToggleCollapse: (sectionId: string) => void
  onAddSection: (parentId: string | null) => void
  onRenameSection: (parentId: string | null, sectionId: string, title: string) => void
  onDeleteSection: (sectionId: string, cardCount: number, subSectionCount: number) => void
  onMoveSection: (sectionId: string, newParentId: string | null, newOrder: number) => void
  onMoveCard: (itemId: string, targetSectionId: string | null, targetOrder: number) => void
  onBatchMoveCards: (itemIds: string[], targetSectionId: string | null) => void
  onMoveCardToSection: (itemId: string) => void
  onSelectItem: (id: string) => void
  onDeleteItem: (id: string) => void
  onOpenDialog: (item: Item) => void
  onToggleReview?: (id: string) => void
  onToggleRead?: (id: string) => void
  onMoveToProject?: (id: string) => void
  onCopyToProject?: (id: string) => void
}

export default function ContentOutline({
  items,
  sections,
  collapsedSections,
  selectMode,
  selectedIds,
  readOnly,
  reviewItemIds,
  onToggleCollapse,
  onAddSection,
  onRenameSection,
  onDeleteSection,
  onMoveSection,
  onMoveCard,
  onBatchMoveCards,
  onMoveCardToSection,
  onSelectItem,
  onDeleteItem,
  onOpenDialog,
  onToggleReview,
  onToggleRead,
  onMoveToProject,
  onCopyToProject
}: ContentOutlineProps) {
  const [draggedSection, setDraggedSection] = useState<string | null>(null)
  const [draggedItem, setDraggedItem] = useState<Item | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: DropPos; type: "section" | "card" | "uncategorized" } | null>(null)

  const l1Sections = sections
    .filter((s) => s.level === 1)
    .sort((a, b) => a.order - b.order)
  const l2ByParent = (parentId: string) =>
    sections.filter((s) => s.level === 2 && s.parentId === parentId).sort((a, b) => a.order - b.order)
  const unclassified = items.filter((i) => !i.sectionId || !sections.some((s) => s.id === i.sectionId))
  const itemsForSection = (sectionId: string) =>
    items.filter((i) => i.sectionId === sectionId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt)

  // ---- Section drag handlers ----

  const handleSectionDragStart = useCallback((e: React.DragEvent, sectionId: string) => {
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/section", sectionId)
    setDraggedSection(sectionId)
  }, [])

  const handleSectionDragEnd = useCallback(() => {
    setDraggedSection(null)
    setDropTarget(null)
  }, [])

  /**
   * Section drag-over validation.
   * Returns true if the drop is allowed, false otherwise.
   */
  const canDropSection = useCallback(
    (draggedId: string, targetId: string, pos: DropPos): boolean => {
      if (draggedId === targetId) return false
      const dragged = sections.find((s) => s.id === draggedId)
      const target = sections.find((s) => s.id === targetId)
      if (!dragged || !target) return false
      // Can only drop before/after on same level siblings or same-level targets
      if (pos === "inside") {
        // Only 1-level can accept 2-level children
        if (target.level !== 1) return false
        // Can't drop a 1-level section inside another 1-level (would create level 2 — actually this IS reparenting)
        return true
      }
      // before/after: same level only
      if (dragged.level !== target.level) return false
      // If different parents, still allowed if same level (reparent at position)
      // But we only allow this for level-2 sections; level-1 sections are all under null
      return true
    },
    [sections]
  )

  const handleSectionDragOver = useCallback(
    (e: React.DragEvent, sectionId: string) => {
      if (!draggedSection) return
      if (draggedSection === sectionId) return
      const header = e.currentTarget as HTMLElement
      const rect = header.getBoundingClientRect()
      const mid = rect.top + rect.height / 2
      const pos: DropPos = e.clientY < mid ? "before" : "after"
      if (canDropSection(draggedSection, sectionId, pos)) {
        e.preventDefault()
        e.dataTransfer.dropEffect = "move"
        setDropTarget({ id: sectionId, pos, type: "section" })
      }
    },
    [draggedSection, canDropSection]
  )

  const handleSectionDrop = useCallback(
    (e: React.DragEvent, targetSection: Section) => {
      e.preventDefault()
      e.stopPropagation()
      if (!dropTarget || !draggedSection) return
      const dragged = sections.find((s) => s.id === draggedSection)
      if (!dragged) return

      if (dropTarget.pos === "inside") {
        if (targetSection.level !== 1) return
        const children = l2ByParent(targetSection.id)
        onMoveSection(draggedSection, targetSection.id, children.length)
      } else {
        const parentId = targetSection.parentId
        const siblings = sections
          .filter((s) => s.parentId === parentId && s.level === targetSection.level)
          .sort((a, b) => a.order - b.order)
        const targetIdx = siblings.findIndex((s) => s.id === targetSection.id)
        const newIdx = dropTarget.pos === "before" ? targetIdx : targetIdx + 1
        // Calculate gap-based order for the dragged section only
        // Siblings keep their existing orders — no need to rebalance all
        const others = siblings.filter((s) => s.id !== draggedSection)
        let newOrder: number
        if (others.length === 0) {
          newOrder = 0
        } else if (newIdx === 0) {
          newOrder = others[0].order - 1
        } else if (newIdx >= others.length) {
          newOrder = others[others.length - 1].order + 1
        } else {
          newOrder = (others[newIdx - 1].order + others[newIdx].order) / 2
        }
        onMoveSection(draggedSection, parentId, newOrder)
      }
      setDraggedSection(null)
      setDropTarget(null)
    },
    [dropTarget, draggedSection, sections, l2ByParent, onMoveSection]
  )

  // ---- Card drag handlers ----

  const handleCardDragStart = useCallback((item: Item) => {
    setDraggedItem(item)
  }, [])

  const handleCardDragEnd = useCallback(() => {
    setDraggedItem(null)
    setDropTarget(null)
  }, [])

  const handleCardDragOver = useCallback(
    (e: React.DragEvent, targetItemId: string) => {
      if (!draggedItem || draggedItem.id === targetItemId) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"
      const el = e.currentTarget as HTMLElement
      const rect = el.getBoundingClientRect()
      const mid = rect.top + rect.height / 2
      const pos: DropPos = e.clientY < mid ? "before" : "after"
      // Only update if target actually changed (reduces re-renders)
      if (dropTarget?.id !== targetItemId || dropTarget?.pos !== pos) {
        setDropTarget({ id: targetItemId, pos, type: "card" })
      }
    },
    [draggedItem, dropTarget]
  )

  const handleCardDrop = useCallback(
    (e: React.DragEvent, targetItemId: string) => {
      e.preventDefault()
      e.stopPropagation()
      if (!draggedItem || draggedItem.id === targetItemId) return
      const targetItem = items.find((i) => i.id === targetItemId)
      if (!targetItem) return
      const targetSection = targetItem.sectionId ?? null
      const sectionCards = itemsForSection(targetSection ?? "")
      const unclassifiedCards = unclassified
      // Exclude the dragged card from the reference list so insertIndex matches
      // onMoveCard's splice (which drops the dragged item first). Without this,
      // downward drops within the same section land one slot too far.
      const cards = (targetSection ? sectionCards : unclassifiedCards).filter(
        (c) => c.id !== draggedItem.id
      )
      const targetIndex = cards.findIndex((c) => c.id === targetItemId)
      const insertIndex = dropTarget?.pos === "after" ? targetIndex + 1 : targetIndex
      // New order = insertIndex (others shift)
      onMoveCard(draggedItem.id, targetSection, insertIndex)
      setDraggedItem(null)
      setDropTarget(null)
    },
    [draggedItem, items, itemsForSection, unclassified, dropTarget, onMoveCard]
  )

  // ---- Section drop target for cards (drop card on section header → move to that section) ----

  const handleSectionHeaderCardDragOver = useCallback(
    (e: React.DragEvent, sectionId: string) => {
      if (!draggedItem) return
      const sectionCards = itemsForSection(sectionId)
      if (sectionCards.length > 0) return  // Only empty sections accept card drops on header
      e.preventDefault()
      setDropTarget({ id: sectionId, pos: "inside", type: "section" })
    },
    [draggedItem, itemsForSection]
  )

  const handleSectionHeaderCardDrop = useCallback(
    (e: React.DragEvent, sectionId: string) => {
      e.preventDefault()
      e.stopPropagation()
      if (!draggedItem) return
      const sectionCards = itemsForSection(sectionId)
      onMoveCard(draggedItem.id, sectionId, sectionCards.length)
      setDraggedItem(null)
      setDropTarget(null)
    },
    [draggedItem, itemsForSection, onMoveCard]
  )

  // ---- Uncategorized drop target for cards ----

  const handleUncategorizedDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!draggedItem) return
      if (!draggedItem.sectionId) return // already in unclassified
      e.preventDefault()
      setDropTarget({ id: "__unclassified__", pos: "inside", type: "uncategorized" })
    },
    [draggedItem]
  )

  const handleUncategorizedDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!draggedItem) return
      onMoveCard(draggedItem.id, null, unclassified.length)
      setDraggedItem(null)
      setDropTarget(null)
    },
    [draggedItem, onMoveCard, unclassified.length]
  )

  // ---- Move card to section dialog (handled by parent options.tsx) ----

  const cardGrid = (list: Item[], sectionId: string | null) =>
    list.length > 0 ? (
      <>
        <CardGrid
          items={list}
          selectMode={selectMode}
          selectedIds={selectedIds}
          readOnly={readOnly}
          draggable
          reviewItemIds={reviewItemIds}
          onSelectItem={onSelectItem}
          onDeleteItem={onDeleteItem}
          onOpenDialog={onOpenDialog}
          onToggleReview={onToggleReview}
          onToggleRead={onToggleRead}
          onMoveToProject={onMoveToProject}
          onCopyToProject={onCopyToProject}
          onCardDragStart={handleCardDragStart}
          onCardDragEnd={handleCardDragEnd}
          onCardDragOver={handleCardDragOver}
          onCardDrop={handleCardDrop}
        />
{draggedItem && sectionId !== null && (
          <SectionDropZone
            sectionId={sectionId}
            isDropTarget={dropTarget?.id === sectionId && dropTarget?.type === "section" && dropTarget?.pos === "inside"}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = "move"
              if (dropTarget?.id !== sectionId || dropTarget?.type !== "section" || dropTarget?.pos !== "inside") {
                setDropTarget({ id: sectionId, pos: "inside", type: "section" })
              }
            }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (!draggedItem) return; onMoveCard(draggedItem.id, sectionId, list.length); setDraggedItem(null); setDropTarget(null) }}
          />
        )}
      </>
    ) : (
      <Box
        onDragOver={sectionId !== null ? (e) => handleSectionHeaderCardDragOver(e, sectionId) : undefined}
        onDrop={sectionId !== null ? (e) => handleSectionHeaderCardDrop(e, sectionId) : undefined}
        sx={{
          minHeight: 8,
          borderRadius: 1,
          transition: "background 0.15s",
          ...(dropTarget?.id === sectionId && dropTarget?.type === "section" && dropTarget?.pos === "inside"
            ? { bgcolor: alpha("#6366f1", 0.1), outline: "2px dashed", outlineColor: "primary.main" }
            : {})
        }}
      />
    )

  return (
    <Stack spacing={1.5}>
      {l1Sections.map((s1) => {
        const subs = l2ByParent(s1.id)
        const s1Items = itemsForSection(s1.id)
        const collapse1 = collapsedSections.has(s1.id)
        return (
          <Box key={s1.id}>
            <SectionHeader
              section={s1}
              collapsed={collapse1}
              isDragging={draggedSection === s1.id}
              dropTarget={dropTarget?.id === s1.id && dropTarget?.type === "section" ? dropTarget.pos : null}
              draggedItem={draggedItem}
              onToggle={() => onToggleCollapse(s1.id)}
              onAddChild={() => onAddSection(s1.id)}
              onRename={(title) => onRenameSection(null, s1.id, title)}
              onDelete={() =>
                onDeleteSection(
                  s1.id,
                  s1Items.length + subs.reduce((acc, sub) => acc + itemsForSection(sub.id).length, 0),
                  subs.length
                )
              }
              onDragStart={(e) => handleSectionDragStart(e, s1.id)}
              onDragEnd={handleSectionDragEnd}
              onDragOver={(e) => handleSectionDragOver(e, s1.id)}
              onDrop={(e) => handleSectionDrop(e, s1)}
              onCardDragOver={draggedItem ? (e) => handleSectionHeaderCardDragOver(e, s1.id) : undefined}
              onCardDrop={draggedItem ? (e) => handleSectionHeaderCardDrop(e, s1.id) : undefined}
            />
            <Collapse in={!collapse1} sx={{ pl: 2 }}>
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                {cardGrid(s1Items, s1.id)}
                {subs.map((s2) => {
                  const s2Items = itemsForSection(s2.id)
                  const collapse2 = collapsedSections.has(s2.id)
                  return (
                    <Box key={s2.id}>
                      <SectionHeader
                        section={s2}
                        collapsed={collapse2}
                        isChild
                        isDragging={draggedSection === s2.id}
                        dropTarget={dropTarget?.id === s2.id && dropTarget?.type === "section" ? dropTarget.pos : null}
                        draggedItem={draggedItem}
                        onToggle={() => onToggleCollapse(s2.id)}
                        onRename={(title) => onRenameSection(s1.id, s2.id, title)}
                        onDelete={() => onDeleteSection(s2.id, s2Items.length, 0)}
                        onDragStart={(e) => handleSectionDragStart(e, s2.id)}
                        onDragEnd={handleSectionDragEnd}
                        onDragOver={(e) => handleSectionDragOver(e, s2.id)}
                        onDrop={(e) => handleSectionDrop(e, s2)}
                        onCardDragOver={draggedItem ? (e) => handleSectionHeaderCardDragOver(e, s2.id) : undefined}
                        onCardDrop={draggedItem ? (e) => handleSectionHeaderCardDrop(e, s2.id) : undefined}
                      />
                      <Collapse in={!collapse2} sx={{ pl: 2, mt: 1 }}>
                        {cardGrid(s2Items, s2.id)}
                      </Collapse>
                    </Box>
                  )
                })}
              </Stack>
            </Collapse>
          </Box>
        )
      })}

      {unclassified.length > 0 && (
        <UnclassifiedGroup
          items={unclassified}
          collapsed={collapsedSections.has("__unclassified__")}
          onToggle={() => onToggleCollapse("__unclassified__")}
          isDropTarget={dropTarget?.id === "__unclassified__" && dropTarget?.type === "uncategorized"}
          onUncategorizedDragOver={handleUncategorizedDragOver}
          onUncategorizedDrop={handleUncategorizedDrop}
          draggedItem={draggedItem}
          cardGrid={cardGrid}
        />
      )}
    </Stack>
  )

  // Expose move-card dialog for batch operation via ref or callback
  // The batch move button is rendered in AppHeader by options.tsx
}

// ---- Section header ----

function SectionHeader({
  section,
  collapsed,
  isChild,
  isDragging,
  dropTarget,
  draggedItem,
  onToggle,
  onAddChild,
  onRename,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onCardDragOver,
  onCardDrop
}: {
  section: Section
  collapsed: boolean
  isChild?: boolean
  isDragging?: boolean
  dropTarget?: DropPos | null
  draggedItem?: Item | null
  onToggle: () => void
  onAddChild?: () => void
  onRename: (title: string) => void
  onDelete: () => void
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onCardDragOver?: (e: React.DragEvent) => void
  onCardDrop?: (e: React.DragEvent) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(section.title)

  const commit = () => {
    onRename(draft.trim() || section.title)
    setEditing(false)
  }

  if (editing) {
    return (
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ py: 0.25, pl: isChild ? 1 : 0 }}>
        <ChevronRightRoundedIcon sx={{ fontSize: 18, color: "text.disabled", transform: "rotate(90deg)" }} />
        <TextField
          autoFocus
          size="small"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit()
            if (e.key === "Escape") { setDraft(section.title); setEditing(false) }
          }}
          onBlur={commit}
          sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1, fontSize: "0.85rem", py: 0.25 } }}
        />
      </Stack>
    )
  }

  const showInsertBefore = dropTarget === "before"
  const showInsertAfter = dropTarget === "after"
  const showCardDrop = dropTarget === "inside" && draggedItem

  return (
    <Box
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDrop={onCardDrop}
      onDragOver={onCardDragOver}
      sx={{ position: "relative" }}>
      {showInsertBefore && (
        <Box sx={{ height: 2, bgcolor: "primary.main", mb: 0.25, mx: 0.5, borderRadius: 1 }} />
      )}
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.5}
        onDragOver={onDragOver}
        onDrop={onDrop}
        sx={{
          py: 0.5,
          px: 1,
          borderRadius: 1,
          opacity: isDragging ? 0.4 : 1,
          bgcolor: showCardDrop
            ? alpha("#6366f1", 0.12)
            : alpha("#6366f1", 0.08),
          border: "1px solid",
          borderColor: isChild ? "divider" : "primary.main",
          borderLeft: isChild ? undefined : "3px solid",
          borderLeftColor: isChild ? undefined : "primary.main",
          transition: "background 0.15s, opacity 0.15s",
          "&:hover .section-actions": { opacity: 1 }
        }}>
        <IconButton size="small" onClick={onToggle} sx={{ p: 0.5 }}>
          {collapsed ? (
            <ChevronRightRoundedIcon sx={{ fontSize: 18, color: "text.secondary", transform: "rotate(0deg)" }} />
          ) : (
            <ExpandMoreRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
          )}
        </IconButton>
        <Typography
          sx={{
fontSize: isChild ? "0.9rem" : "0.95rem",
          fontWeight: isChild ? 500 : 600,
            color: isChild ? "text.secondary" : "text.primary",
            cursor: "pointer",
            flex: 1,
            "&:hover": { color: "primary.main" }
          }}
          onClick={onToggle}
          onDoubleClick={() => { setDraft(section.title); setEditing(true) }}>
          {section.title}
        </Typography>
        <Box className="section-actions" sx={{ display: "flex", gap: 0.5, opacity: 0, transition: "opacity 0.15s" }}>
          {onAddChild && (
            <Tooltip title="添加子章节">
              <IconButton size="small" onClick={onAddChild} sx={{ p: 0.5 }}>
                <AddRoundedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="删除章节">
            <IconButton size="small" onClick={onDelete} sx={{ p: 0.5, "&:hover": { color: "error.main" } }}>
              <DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Stack>
      {showInsertAfter && (
        <Box sx={{ height: 2, bgcolor: "primary.main", mt: 0.25, mx: 0.5, borderRadius: 1 }} />
      )}
    </Box>
  )
}

// ---- Section drop zone (thin strip at bottom of section content) ----

function SectionDropZone({
  sectionId,
  isDropTarget,
  onDragOver,
  onDrop
}: {
  sectionId: string
  isDropTarget: boolean
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}) {
  return (
    <Box
      onDragOver={onDragOver}
      onDrop={onDrop}
      sx={{
        height: 6,
        borderRadius: 1,
        mt: 0.5,
        transition: "all 0.15s",
        ...(isDropTarget
          ? { height: 28, bgcolor: alpha("#6366f1", 0.1), outline: "2px dashed", outlineColor: "primary.main" }
          : { bgcolor: alpha("#6366f1", 0.03) })
      }}
    />
  )
}

// ---- Unclassified group ----

function UnclassifiedGroup({
  items: unclassifiedItems,
  collapsed,
  onToggle,
  isDropTarget,
  onUncategorizedDragOver,
  onUncategorizedDrop,
  draggedItem,
  cardGrid
}: {
  items: Item[]
  collapsed: boolean
  onToggle: () => void
  isDropTarget?: boolean
  onUncategorizedDragOver?: (e: React.DragEvent) => void
  onUncategorizedDrop?: (e: React.DragEvent) => void
  draggedItem?: Item | null
  cardGrid: (list: Item[], sectionId: string | null) => React.ReactNode
}) {
  return (
    <Box
      onDragOver={onUncategorizedDragOver}
      onDrop={onUncategorizedDrop}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.5}
        sx={{
          py: 0.5,
          px: 1,
          borderRadius: 1,
          bgcolor: isDropTarget ? alpha("#6366f1", 0.08) : alpha("#000", 0.02),
          transition: "background 0.15s"
        }}>
        <IconButton size="small" onClick={onToggle} sx={{ p: 0.25 }}>
          {collapsed ? (
            <ChevronRightRoundedIcon sx={{ fontSize: 14, color: "text.disabled", transform: "rotate(0deg)" }} />
          ) : (
            <ExpandMoreRoundedIcon sx={{ fontSize: 16, color: "text.disabled" }} />
          )}
        </IconButton>
        <Typography sx={{ fontSize: "0.8rem", fontWeight: 600, color: "text.disabled", flex: 1 }}>
          未分类 · {unclassifiedItems.length} 张
        </Typography>
      </Stack>
      <Collapse in={!collapsed} sx={{ mt: 1 }}>
        {cardGrid(unclassifiedItems, null)}
      </Collapse>
    </Box>
  )
}