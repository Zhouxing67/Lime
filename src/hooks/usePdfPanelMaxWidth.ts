import { useEffect, useRef, useState } from "react"

/** Shared max-width computation for the right-side PDF panels (cards + search).
 *  The panel is a top-level sibling AFTER the main area: the shared horizontal
 *  space = main-area width + panel width is CONSTANT, so the panel's max width
 *  must leave the PDF workspace at least 400px — measuring the ROOT's width
 *  would include the NavRail + sidebar and let the panel squeeze the PDF to ~0.
 *  The main area is measured via the panel's previous sibling. */
export function usePdfPanelMaxWidth(width: number): {
  rootRef: React.RefObject<HTMLDivElement>
  getMax: () => number
} {
  const rootRef = useRef<HTMLDivElement>(null)
  const [mainAreaW, setMainAreaW] = useState(0)

  useEffect(() => {
    const el = rootRef.current?.previousElementSibling
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      setMainAreaW(Math.floor(entries[0].contentRect.width))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const sharedSpace = mainAreaW + width
  const maxPanelW =
    sharedSpace > 0 ? Math.max(240, Math.min(520, sharedSpace - 400)) : 520
  return { rootRef, getMax: () => maxPanelW }
}
