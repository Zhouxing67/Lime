import { Box, Checkbox, useMediaQuery, useTheme } from "@mui/material"

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
  onSelectItem: (id: string) => void
  onDeleteItem: (id: string) => void
  onOpenDialog: (item: Item) => void
  onToggleReview?: (id: string) => void
  onToggleRead?: (id: string) => void
  onMoveToProject?: (id: string) => void
  onCopyToProject?: (id: string) => void
  onCardDragStart?: (item: Item) => void
  onCardDragEnd?: () => void
  onCardDragOver?: (e: React.DragEvent, itemId: string) => void
  onCardDrop?: (e: React.DragEvent, targetItemId: string) => void
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
  onSelectItem,
  onDeleteItem,
  onOpenDialog,
  onToggleReview,
  onToggleRead,
  onMoveToProject,
  onCopyToProject,
  reviewItemIds,
  onCardDragStart,
  onCardDragEnd,
  onCardDragOver,
  onCardDrop
}: CardGridProps) {
  const theme = useTheme()
  const isMd = useMediaQuery(theme.breakpoints.up(900))
  const isSm = useMediaQuery(theme.breakpoints.up(600))
  const cols = isMd ? 3 : isSm ? 2 : 1
  const columns = roundRobinCols(items, cols)

  return (
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .masonry-item {
          animation: fadeInUp 0.4s ease-out both;
        }
      `}</style>
      <Box sx={{ display: "flex", gap: 2, overflow: "hidden", minWidth: 0 }}>
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
            {col.map((it, idx) => {
              const globalIdx = idx * cols + ci
              return (
                <Box
                  key={it.id}
                  className="masonry-item"
                  sx={{ position: "relative", breakInside: "avoid" }}
                  style={{ animationDelay: `${globalIdx * 40}ms` }}
                  onDragOver={(e) => {
                    if (draggable && onCardDragOver) onCardDragOver(e, it.id)
                  }}
                  onDrop={(e) => {
                    if (draggable && onCardDrop) onCardDrop(e, it.id)
                  }}>
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
                    onDragStart={() => onCardDragStart?.(it)}
                    onDragEnd={() => onCardDragEnd?.()}
                    onDelete={onDeleteItem}
                    onClick={() => {
                      if (selectMode) return onSelectItem(it.id)
                      onOpenDialog(it)
                    }}
                    onToggleReview={onToggleReview}
                    onToggleRead={onToggleRead}
                    onMoveToProject={onMoveToProject}
                    onCopyToProject={onCopyToProject}
                  />
                </Box>
              )
            })}
          </Box>
        ))}
      </Box>
    </>
  )
}
