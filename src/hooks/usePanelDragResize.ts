import { useCallback, useEffect, useRef } from "react"

/** Pointer-drag resize for the right-sidebar panels (cards + search share it).
 *  Dragging the panel's left edge widens/narrows it; the PDF re-flows
 *  immediately (no width transition while dragging). */
export function usePanelDragResize(
  width: number,
  onWidthChange: (w: number) => void,
  getMax: () => number,
  min = 240
): (e: React.PointerEvent) => void {
  const dragRef = useRef<{ startX: number; startW: number } | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const getMaxRef = useRef(getMax)
  getMaxRef.current = getMax
  useEffect(() => () => cleanupRef.current?.(), [])
  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      dragRef.current = { startX: e.clientX, startW: width }
      const mv = (ev: PointerEvent) => {
        const d = dragRef.current
        if (!d) return
        const next = Math.max(
          min,
          Math.min(
            getMaxRef.current(),
            d.startW - (ev.clientX - d.startX)
          )
        )
        onWidthChange(next)
      }
      const up = () => {
        dragRef.current = null
        cleanupRef.current = null
        document.removeEventListener("pointermove", mv)
        document.removeEventListener("pointerup", up)
      }
      cleanupRef.current = up
      document.addEventListener("pointermove", mv)
      document.addEventListener("pointerup", up)
    },
    [width, onWidthChange, min]
  )
  return startDrag
}
