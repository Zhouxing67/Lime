const MATH_SELECTOR =
  ".katex, mjx-container, .MathJax, math, .ztext-math, [data-tex]"
const HIGHLIGHT_CLASS = "lime-math-hover"
const FLASH_CLASS = "lime-math-flash"

/** Extract the LaTeX source from a KaTeX `.katex` element (its `.katex-mathml
 *  annotation` node always holds `application/x-tex`). */
function katexSource(el: Element): string | null {
  const ann = el.querySelector(".katex-mathml annotation")
  const src = ann?.textContent?.trim()
  return src && src.length > 0 ? src : null
}

/** Best-effort source for MathJax / native MathML containers. */
function fallbackMathSource(el: Element): string | null {
  const ann = el.querySelector("annotation")
  if (ann?.textContent?.trim()) return ann.textContent.trim()
  const label = el.getAttribute("aria-label")
  if (label?.trim()) return label.trim()
  const rendered = el.textContent?.trim()
  return rendered && rendered.length > 0 ? rendered : null
}

/** Source from a `data-tex` container (Zhihu's simplified MathJax keeps the
 *  LaTeX in the `data-tex` attribute). */
function dataTexSource(el: Element): string | null {
  const src = el.getAttribute("data-tex")
  return src && src.length > 0 ? src : null
}

/** LaTeX source (or best-effort text) of any math container. */
export function mathSource(el: Element): string | null {
  if (el.classList.contains("katex")) return katexSource(el)
  if (el.hasAttribute("data-tex")) return dataTexSource(el)
  return fallbackMathSource(el)
}

function isDisplayMath(el: Element): boolean {
  if (
    el.closest?.(".katex-display") != null ||
    el.closest?.(".MathJax_Display") != null ||
    el.matches?.('[display="block"], [display="true"]') === true
  ) {
    return true
  }
  // Zhihu block math uses `\begin{…}` environments.
  const src = el.getAttribute?.("data-tex")
  if (src && /\\begin\{/.test(src)) return true
  return false
}

/** Wrap a source with inline/display delimiters. */
export function wrapMath(el: Element, src: string): string {
  return isDisplayMath(el) ? `$$${src}$$` : `$${src}$`
}

/** Element under the given page coordinates that is a math container. */
export function mathAtPoint(x: number, y: number): Element | null {
  if (x < 0 || y < 0) return null
  const el = document.elementFromPoint(x, y)
  if (!el) return null
  return el.closest?.(MATH_SELECTOR) ?? null
}

/** Rebuild a selection's text, replacing math containers with `$…$`/`$$…$$`
 *  LaTeX source. Falls back to the plain selection text if nothing matched. */
export function selectionWithMath(sel: Selection): string {
  if (!sel.rangeCount || sel.isCollapsed) return sel.toString().trim()
  const fragment = sel.getRangeAt(0).cloneContents()
  for (const el of Array.from(fragment.querySelectorAll(".katex"))) {
    const src = katexSource(el)
    if (!src) continue
    el.replaceWith(document.createTextNode(wrapMath(el, src)))
  }
  for (const el of Array.from(
    fragment.querySelectorAll(
      "mjx-container, .MathJax, math, .ztext-math, [data-tex]"
    )
  )) {
    const src = mathSource(el)
    if (!src) continue
    el.replaceWith(document.createTextNode(wrapMath(el, src)))
  }
  return (fragment.textContent ?? "").replace(/\s+/g, " ").trim()
}

const MATH_CONTAINER_SELECTOR =
  ".katex, .katex-display, mjx-container, .MathJax, .MathJax_Display, .ztext-math, [data-tex]"

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
  const clone = root.cloneNode(true) as Element
  for (const el of Array.from(clone.querySelectorAll(".katex"))) {
    const src = katexSource(el)
    if (!src) continue
    el.replaceWith(document.createTextNode(wrapMath(el, src)))
  }
  for (const el of Array.from(
    clone.querySelectorAll(
      "mjx-container, .MathJax, math, .ztext-math, [data-tex]"
    )
  )) {
    const src = mathSource(el)
    if (!src) continue
    el.replaceWith(document.createTextNode(wrapMath(el, src)))
  }
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim()
}

/** Capture the paragraph containing the formula under the cursor — the whole
 *  paragraph's text with every formula as $…$ / $$…$$. */
export function paragraphFromCursor(): { content: string; el: Element } | null {
  const formula =
    lastTarget?.closest?.(MATH_SELECTOR) ?? mathAtPoint(lastX, lastY)
  if (!formula) return null
  const para = enclosingParagraph(formula)
  const content = mathBlockText(para)
  if (!content || content.length < 5) return null
  return { content, el: para }
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

export function getLastCursor(): { x: number; y: number } {
  return { x: lastX, y: lastY }
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
      const el = lastTarget?.closest?.(MATH_SELECTOR) ?? null
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
