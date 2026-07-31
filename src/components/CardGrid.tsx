import { Box, Checkbox, useMediaQuery, useTheme } from "@mui/material"
import { useLayoutEffect, useRef } from "react"

import type { CardDropState } from "../hooks/useCardDragReorder"
import type { Item } from "../types"
import ItemCard from "./ItemCard"

interface CardGridProps {
  items: Item[]
  selectMode: boolean
  selectedIds: string[]
  readOnly?: boolean
  firstRating?: Map<string, 1 | 2 | 3 | 4>
  reviewItemIds?: Set<string>
  draggable?: boolean
  draggedId?: string | null
  dropIndicator?: CardDropState | null
  flipRectsRef?: React.MutableRefObject<Map<string, DOMRect> | null>
  onGripPointerDown?: (e: React.PointerEvent, item: Item) => void
  onSelectItem: (id: string) => void
  onDeleteItem: (id: string) => void
  onOpenDialog: (item: Item) => void
  onToggleReview?: (id: string) => void
  onToggleRead?: (id: string) => void
  onMoveToProject?: (id: string) => void
  onCopyToProject?: (id: string) => void
  onMoveToSection?: (id: string) => void
}

function roundRobinCols<T>(items: T[], cols: number): T[][] {
  const result: T[][] = Array.from({ length: cols }, () => [])
  items.forEach((item, i) => result[i % cols].push(item))
  return result
}

export default function CardGrid({
  items,
  selectMode,
  selectedIds,
  readOnly,
  firstRating,
  draggable,
  draggedId,
  dropIndicator,
  flipRectsRef,
  onGripPointerDown,
  onSelectItem,
  onDeleteItem,
  onOpenDialog,
  onToggleReview,
  onToggleRead,
  onMoveToProject,
  onCopyToProject,
  onMoveToSection,
  reviewItemIds
}: CardGridProps) {
  const theme = useTheme()
  const isMd = useMediaQuery(theme.breakpoints.up(900))
  const isSm = useMediaQuery(theme.breakpoints.up(600))
  const cols = isMd ? 3 : isSm ? 2 : 1
  const columns = roundRobinCols(items, cols)
  const rootRef = useRef<HTMLDivElement>(null)

  // FLIP: after a drag reorder, animate every card from its previous position
  // to its new one instead of jumping. The hook snapshots rects into
  // flipRectsRef just before committing the move. Data ops trigger a double
  // refresh (db broadcast + explicit refreshAllData), so the reset is owned by
  // a timer rather than the effect cleanup — a second items change must not
  // abort the animation.
  useLayoutEffect(() => {
    const old = flipRectsRef?.current
    if (!old || old.size === 0) return
    flipRectsRef.current = null

    const els: HTMLElement[] = []
    rootRef.current
      ?.querySelectorAll<HTMLElement>("[data-card-id]")
      .forEach((el) => els.push(el))

    els.forEach((el) => {
      const id = el.getAttribute("data-card-id")!
      const prev = old.get(id)
      if (!prev) return
      const cur = el.getBoundingClientRect()
      const dx = prev.left - cur.left
      const dy = prev.top - cur.top
      if (dx === 0 && dy === 0) return
      el.style.transition = "none"
      el.style.transform = `translate(${dx}px, ${dy}px)`
    })

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        els.forEach((el) => {
          if (el.style.transform) {
            el.style.transition = "transform 0.25s cubic-bezier(0.2, 0, 0, 1)"
            el.style.transform = "translate(0, 0)"
          }
        })
        window.setTimeout(() => {
          els.forEach((el) => {
            el.style.transition = ""
            el.style.transform = ""
          })
        }, 300)
      })
    })
  }, [items, flipRectsRef])

  return (
    <Box
      ref={rootRef}
      sx={{ display: "flex", gap: 2, minWidth: 0 }}>
      {columns.map((col, ci) => (
        <Box
          key={ci}
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 2
          }}>
          {col.map((it) => {
            const isDragging = draggedId === it.id
            const dropPos =
              dropIndicator?.id === it.id ? dropIndicator.pos : null
            return (
              <Box
                key={it.id}
                data-card-id={it.id}
                sx={{
                  position: "relative",
                  breakInside: "avoid",
                  opacity: isDragging ? 0.3 : 1,
                  transition: "opacity 0.15s"
                }}>
                {dropPos === "before" && (
                  <Box
                    sx={{
                      position: "absolute",
                      top: -8,
                      left: 0,
                      right: 0,
                      height: 3,
                      bgcolor: "primary.main",
                      borderRadius: 1,
                      zIndex: 2,
                      boxShadow: 1
                    }}
                  />
                )}
                {dropPos === "after" && (
                  <Box
                    sx={{
                      position: "absolute",
                      bottom: -8,
                      left: 0,
                      right: 0,
                      height: 3,
                      bgcolor: "primary.main",
                      borderRadius: 1,
                      zIndex: 2,
                      boxShadow: 1
                    }}
                  />
                )}
                {selectMode && (
                  <Box
                    sx={{
                      position: "absolute",
                      top: 8,
                      left: 8,
                      zIndex: 10
                    }}
                    onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.includes(it.id)}
                      onChange={() => onSelectItem(it.id)}
                      sx={{
                        bgcolor: "background.paper",
                        borderRadius: 1,
                        "&:hover": { bgcolor: "action.hover" }
                      }}
                    />
                  </Box>
                )}
                <ItemCard
                  item={it}
                  inReview={reviewItemIds?.has(it.id)}
                  readOnly={readOnly}
                  firstRating={firstRating?.get(it.id)}
                  draggable={draggable && !selectMode}
                  selectMode={selectMode}
                  onGripPointerDown={onGripPointerDown}
                  onDelete={onDeleteItem}
                  onClick={() => {
                    if (selectMode) return onSelectItem(it.id)
                    onOpenDialog(it)
                  }}
                  onToggleReview={onToggleReview}
                  onToggleRead={onToggleRead}
                  onMoveToProject={onMoveToProject}
                  onCopyToProject={onCopyToProject}
                  onMoveToSection={onMoveToSection}
                />
              </Box>
            )
          })}
        </Box>
      ))}
    </Box>
  )
}
