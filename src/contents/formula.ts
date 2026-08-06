import {
  MATH_CONTAINER_SELECTOR,
  MATH_SELECTOR,
  mathSource,
  wrapMath
} from "./mathFormats"

const HIGHLIGHT_CLASS = "lime-math-hover"
const FLASH_CLASS = "lime-math-flash"

/** Element under the given page coordinates that is a math container. */
export function mathAtPoint(x: number, y: number): Element | null {
  if (x < 0 || y < 0) return null
  const el = document.elementFromPoint(x, y)
  if (!el) return null
  const formula = el.closest?.(MATH_SELECTOR) ?? null
  // Verify it's really a math container — svg[role=img] matches broad, but the
  // extractor distinguishes real MathJax SVGs (null for non-math SVGs).
  return formula && mathSource(formula) ? formula : null
}

/** Replace every math container in a cloned root with its `$…$`/`$$…$$` source
 *  and return the normalized text. Shared by selection and paragraph capture. */
function mathTextFromClone(clone: Element | DocumentFragment): string {
  for (const el of Array.from(clone.querySelectorAll(MATH_SELECTOR))) {
    const src = mathSource(el)
    if (!src) continue
    el.replaceWith(document.createTextNode(wrapMath(el, src)))
  }
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim()
}

/** Rebuild a selection's text, replacing math containers with `$…$`/`$$…$$`
 *  LaTeX source. Falls back to the plain selection text if nothing matched. */
export function selectionWithMath(sel: Selection): string {
  if (!sel.rangeCount || sel.isCollapsed) return sel.toString().trim()
  return mathTextFromClone(sel.getRangeAt(0).cloneContents())
}

function isBlockDisplay(d: string): boolean {
  return d === "block" || d === "flex" || d === "grid" || d === "list-item"
}

/** Nearest block-level paragraph container that holds `el`, skipping the
 *  formula's own wrappers (.katex-display / .ztext-math / …). */
export function enclosingParagraph(el: Element): Element {
  let cur: Element | null = el
  while (cur && cur !== document.body && cur !== document.documentElement) {
    if (!cur.matches(MATH_CONTAINER_SELECTOR)) {
      const parent = cur.parentElement
      if (
        isBlockDisplay(window.getComputedStyle(cur).display) &&
        parent &&
        isBlockDisplay(window.getComputedStyle(parent).display)
      ) {
        return cur
      }
    }
    cur = cur.parentElement
  }
  return el
}

/** Rebuild a block element's text, replacing every math container with its
 *  `$…$` / `$$…$$` LaTeX source. */
export function mathBlockText(root: Element): string {
  return mathTextFromClone(root.cloneNode(true) as Element)
}

/** Capture the paragraph containing the formula under the cursor — the whole
 *  paragraph's text with every formula as $…$ / $$…$$. */
export function paragraphFromCursor(): { content: string; el: Element } | null {
  const formula =
    lastTarget?.closest?.(MATH_SELECTOR) ?? mathAtPoint(lastX, lastY)
  if (!formula || !mathSource(formula)) return null
  const para = enclosingParagraph(formula)
  const content = mathBlockText(para)
  if (!content) return null
  return { content, el: para }
}

/** `<img>` under the current cursor (for Alt+L image capture). The src is
 *  resolved to an absolute URL so it renders in lime regardless of the page. */
export function imageFromCursor(): { src: string; el: Element } | null {
  const img =
    lastTarget?.closest?.("img") ??
    document.elementFromPoint(lastX, lastY)?.closest?.("img") ??
    null
  if (!img) return null
  const raw = img.getAttribute("src")
  if (!raw) return null
  try {
    return { src: new URL(raw, window.location.href).href, el: img }
  } catch {
    return null
  }
}

// ---- cursor tracking + hover highlight ----

let lastX = -1
let lastY = -1
let lastTarget: Element | null = null
let hovered: Element | null = null
let styleEl: HTMLStyleElement | null = null
let enabled = true

export function setMathHoverEnabled(v: boolean) {
  enabled = v
  if (!v) clearHighlight()
}

function clearHighlight() {
  hovered?.classList.remove(HIGHLIGHT_CLASS)
  hovered = null
}

/** Brief capture feedback on a formula. */
export function flashMath(el: Element) {
  clearHighlight()
  el.classList.add(FLASH_CLASS)
  setTimeout(() => el.classList.remove(FLASH_CLASS), 900)
}

/** Start persistent mousemove → hover highlight + cursor tracking. Uses the
 *  event target (the topmost element under the cursor) rather than
 *  elementFromPoint so overlays (panel, sticky headers, etc.) never block it.
 *  Returns a cleanup that also removes the injected style. */
export function initMathHover(): () => void {
  if (!styleEl) {
    styleEl = document.createElement("style")
    styleEl.textContent = `
.${HIGHLIGHT_CLASS} { background-color: rgba(99,102,241,.10) !important; border-radius: 3px; }
.${FLASH_CLASS} { background-color: rgba(99,102,241,.18) !important; border-radius: 3px; }
`
    document.head.appendChild(styleEl)
  }
  let raf = 0
  const onMove = (e: MouseEvent) => {
    lastX = e.clientX
    lastY = e.clientY
    lastTarget = e.target instanceof Element ? e.target : null
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      if (!enabled) return
      const matched = lastTarget?.closest?.(MATH_SELECTOR) ?? null
      // Only highlight real math — the svg selector matches broad.
      const el = matched && mathSource(matched) ? matched : null
      if (el === hovered) return
      clearHighlight()
      if (el) {
        el.classList.add(HIGHLIGHT_CLASS)
        hovered = el
      }
    })
  }
  const onScroll = () => clearHighlight()
  document.addEventListener("mousemove", onMove)
  window.addEventListener("scroll", onScroll, true)
  return () => {
    document.removeEventListener("mousemove", onMove)
    window.removeEventListener("scroll", onScroll, true)
    if (raf) cancelAnimationFrame(raf)
    clearHighlight()
    if (styleEl) {
      styleEl.remove()
      styleEl = null
    }
  }
}
