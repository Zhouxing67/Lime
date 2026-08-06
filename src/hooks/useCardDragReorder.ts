import { useCallback, useEffect, useRef, useState } from "react"

import type { ProjectCard } from "../types"
import { compareCards, computeDropIndex, type DropPos } from "../utils"

export interface CardDropState {
  id: string
  pos: DropPos | "append"
}

export interface UseCardDragReorderArgs {
  items: ProjectCard[]
  onMoveCard: (
    itemId: string,
    targetSectionId: string | null,
    targetOrder: number
  ) => void | Promise<void>
}

// Movement required before a pointer press becomes a drag, so a click on the
// card still opens it without accidentally dragging.
const DRAG_THRESHOLD = 6

/**
 * Pointer-event based card drag-reorder (no HTML5 DnD). Only reorders within
 * the same section: a drop is valid only when dragged and target share the
 * same sectionId. Drag is started from a dedicated grip (exclusive source),
 * follows a custom ghost clone, and hits test with elementFromPoint. Before
 * committing the move it snapshots card rects into `flipRectsRef` so CardGrid
 * can FLIP-animate the cards to their new positions.
 */
export function useCardDragReorder({
  items,
  onMoveCard
}: UseCardDragReorderArgs) {
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [drop, setDrop] = useState<CardDropState | null>(null)

  const itemsRef = useRef(items)
  itemsRef.current = items
  const onMoveCardRef = useRef(onMoveCard)
  onMoveCardRef.current = onMoveCard
  const dropRef = useRef(drop)
  dropRef.current = drop

  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    offsetX: number
    offsetY: number
    armed: boolean
    itemId: string
  } | null>(null)
  const ghostRef = useRef<HTMLElement | null>(null)
  const flipRectsRef = useRef<Map<string, DOMRect> | null>(null)

  const removeGhost = useCallback(() => {
    if (ghostRef.current) {
      ghostRef.current.remove()
      ghostRef.current = null
    }
  }, [])

  const createGhost = useCallback(
    (itemId: string, clientX: number, clientY: number) => {
      const source = document.querySelector<HTMLElement>(
        `[data-card-id="${itemId}"]`
      )
      const d = dragRef.current
      if (!source || !d) return
      const sourceRect = source.getBoundingClientRect()
      d.offsetX = clientX - sourceRect.left
      d.offsetY = clientY - sourceRect.top
      const ghost = source.cloneNode(true) as HTMLElement
      ghost.removeAttribute("data-card-id")
      ghost.style.position = "fixed"
      ghost.style.left = "0"
      ghost.style.top = "0"
      ghost.style.zIndex = "2147483000"
      ghost.style.pointerEvents = "none"
      ghost.style.opacity = "0.92"
      ghost.style.width = `${sourceRect.width}px`
      ghost.style.boxShadow = "0 12px 28px rgba(0,0,0,0.18)"
      ghost.style.borderRadius = "8px"
      ghost.style.overflow = "hidden"
      ghost.style.transition = "none"
      ghost.style.transform = `translate3d(${clientX - d.offsetX}px, ${clientY - d.offsetY}px, 0) scale(0.96)`
      document.body.appendChild(ghost)
      ghostRef.current = ghost
    },
    []
  )

  const moveGhost = useCallback((clientX: number, clientY: number) => {
    const ghost = ghostRef.current
    const d = dragRef.current
    if (!ghost || !d) return
    ghost.style.transform = `translate3d(${clientX - d.offsetX}px, ${clientY - d.offsetY}px, 0) scale(0.96)`
  }, [])

  const updateDropTarget = useCallback((clientX: number, clientY: number) => {
    const d = dragRef.current
    if (!d) return
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null
    // Drop onto the "放到末尾" zone appends the card to its section's end.
    if (el?.closest?.("[data-card-drop-end]")) {
      const dragged = itemsRef.current.find((i) => i.id === d.itemId)
      if (dragged) setDrop({ id: "__end__", pos: "append" })
      return
    }
    const cardEl = el?.closest?.("[data-card-id]") as HTMLElement | null
    const id = cardEl?.getAttribute("data-card-id")
    if (!cardEl || !id || id === d.itemId) {
      setDrop(null)
      return
    }
    const dragged = itemsRef.current.find((i) => i.id === d.itemId)
    const target = itemsRef.current.find((i) => i.id === id)
    if (!dragged || !target) {
      setDrop(null)
      return
    }
    // Same section only — cross-section moves go through the move dialog.
    if ((dragged.sectionId ?? null) !== (target.sectionId ?? null)) {
      setDrop(null)
      return
    }
    const rect = cardEl.getBoundingClientRect()
    const pos: DropPos =
      clientY < rect.top + rect.height / 2 ? "before" : "after"
    setDrop({ id, pos })
  }, [])

  const snapshotRects = useCallback(() => {
    const map = new Map<string, DOMRect>()
    document.querySelectorAll("[data-card-id]").forEach((el) => {
      map.set(el.getAttribute("data-card-id")!, el.getBoundingClientRect())
    })
    flipRectsRef.current = map
  }, [])

  const finalizeDrop = useCallback(() => {
    const d = dragRef.current
    const dropState = dropRef.current
    if (!d || !dropState) return
    const dragged = itemsRef.current.find((i) => i.id === d.itemId)
    if (!dragged) return
    const targetSection = dragged.sectionId ?? null
    const sectionCards = itemsRef.current.filter(
      (i) => (i.sectionId ?? null) === targetSection
    )
    const fullSorted = sectionCards.slice().sort(compareCards)
    const oldIndex = fullSorted.findIndex((c) => c.id === d.itemId)

    let index: number
    if (dropState.id === "__end__") {
      index = fullSorted.filter((c) => c.id !== d.itemId).length
    } else {
      const target = itemsRef.current.find((i) => i.id === dropState.id)
      if (!target || (target.sectionId ?? null) !== targetSection) return
      index = computeDropIndex(
        sectionCards,
        d.itemId,
        dropState.id,
        dropState.pos as DropPos
      )
    }
    // Skip no-op moves (card already sits at the target position) so we
    // don't trigger a pointless reflow + toast that reads like a "swap".
    if (index === oldIndex) return
    snapshotRects()
    onMoveCardRef.current(d.itemId, targetSection, index)
  }, [snapshotRects])

  const cleanup = useCallback(() => {
    dragRef.current = null
    removeGhost()
    setDraggedId(null)
    setDrop(null)
  }, [removeGhost])

  const handleGripPointerDown = useCallback(
    (e: React.PointerEvent, item: ProjectCard) => {
      if (e.pointerType === "mouse" && e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        offsetX: 0,
        offsetY: 0,
        armed: false,
        itemId: item.id
      }
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    },
    []
  )

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d || d.pointerId !== e.pointerId) return
      if (!d.armed) {
        const dx = e.clientX - d.startX
        const dy = e.clientY - d.startY
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        d.armed = true
        setDraggedId(d.itemId)
        createGhost(d.itemId, e.clientX, e.clientY)
      }
      moveGhost(e.clientX, e.clientY)
      updateDropTarget(e.clientX, e.clientY)
    }
    const onPointerUp = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d || d.pointerId !== e.pointerId) return
      if (d.armed) finalizeDrop()
      cleanup()
    }
    const onPointerCancel = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d || d.pointerId !== e.pointerId) return
      cleanup()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dragRef.current) cleanup()
    }
    document.addEventListener("pointermove", onPointerMove)
    document.addEventListener("pointerup", onPointerUp)
    document.addEventListener("pointercancel", onPointerCancel)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointermove", onPointerMove)
      document.removeEventListener("pointerup", onPointerUp)
      document.removeEventListener("pointercancel", onPointerCancel)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [createGhost, moveGhost, updateDropTarget, finalizeDrop, cleanup])

  return {
    draggedId,
    drop,
    flipRectsRef,
    handleGripPointerDown
  }
}
