import { useCallback, useEffect, useRef } from "react"

/** Pointer-drag resize for the right-sidebar panels (cards + search share it).
 *  Dragging the panel's left edge widens/narrows it; the PDF re-flows
 *  immediately (no width transition while dragging).
 *
 *  `onDragStart`/`onDragEnd` let the host switch the panel into an OVERLAY
 *  during the drag (position: fixed over the PDF) so the PDF container size —
 *  and thus its re-render — stays frozen until the drag ends (deferred dock).
 */
export function usePanelDragResize(
  width: number,
  onWidthChange: (w: number) => void,
  getMax: () => number,
  min = 240,
  callbacks?: { onDragStart?: () => void; onDragEnd?: () => void }
): (e: React.PointerEvent) => void {
  const dragRef = useRef<{ startX: number; startW: number } | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const getMaxRef = useRef(getMax)
  getMaxRef.current = getMax
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks
  useEffect(() => () => cleanupRef.current?.(), [])
  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      callbacksRef.current?.onDragStart?.()
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
        callbacksRef.current?.onDragEnd?.()
      }
      cleanupRef.current = up
      document.addEventListener("pointermove", mv)
      document.addEventListener("pointerup", up)
    },
    [width, onWidthChange, min]
  )
  return startDrag
}
