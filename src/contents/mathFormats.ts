/** The formula-format registry — ONE extractor per site/library format.
 *  KaTeX, MathJax, Zhihu's ztext, future formats: each gets an entry here and
 *  nothing else in the perception layer changes. Extend this file when a new
 *  math container format shows up. */

export interface MathFormat {
  /** CSS selector matching this format's container. */
  selector: string
  /** Extract the LaTeX source (or best-effort text) from a matched element. */
  extract: (el: Element) => string | null
  /** Whether this element renders as display (block) math. */
  isDisplay?: (el: Element) => boolean
}

/** KaTeX keeps the LaTeX in its copy-tex annotation. */
function katexSource(el: Element): string | null {
  const ann = el.querySelector(".katex-mathml annotation")
  const src = ann?.textContent?.trim()
  return src && src.length > 0 ? src : null
}

/** MathJax (v2/v3) + native MathML — annotation → aria-label → rendered text. */
function mathJaxSource(el: Element): string | null {
  const ann = el.querySelector("annotation")
  if (ann?.textContent?.trim()) return ann.textContent.trim()
  const label = el.getAttribute("aria-label")
  if (label?.trim()) return label.trim()
  const rendered = el.textContent?.trim()
  return rendered && rendered.length > 0 ? rendered : null
}

/** Zhihu's `ztext-math`: LaTeX lives in `data-tex` (newer) or `alt` (the old
 *  img rendering); fall back to an inner annotation, then the rendered text. */
function ztextSource(el: Element): string | null {
  const tex = el.getAttribute("data-tex")
  if (tex?.trim()) return tex.trim()
  const alt = el.getAttribute("alt")
  if (alt?.trim()) return alt.trim()
  const ann = el.querySelector("annotation")
  if (ann?.textContent?.trim()) return ann.textContent.trim()
  const rendered = el.textContent?.trim()
  return rendered && rendered.length > 0 ? rendered : null
}

export const mathFormats: MathFormat[] = [
  { selector: ".katex", extract: katexSource, isDisplay: (el) => el.closest?.(".katex-display") != null },
  {
    selector: "mjx-container, .MathJax, math",
    extract: mathJaxSource,
    isDisplay: (el) =>
      el.closest?.(".MathJax_Display") != null ||
      el.matches?.('[display="block"], [display="true"]') === true
  },
  {
    selector: ".ztext-math",
    extract: ztextSource,
    isDisplay: (el) => {
      const src = el.getAttribute("data-tex") ?? el.getAttribute("alt") ?? ""
      return /\\begin\{/.test(src)
    }
  }
]

/** Every formula container on the page (combined selectors). */
export const MATH_SELECTOR = mathFormats.map((f) => f.selector).join(", ")

/** The formula + its display wrappers (used to skip up to the paragraph). */
export const MATH_CONTAINER_SELECTOR = `${MATH_SELECTOR}, .katex-display, .MathJax_Display`

/** LaTeX source (or best-effort text) of any math container. */
export function mathSource(el: Element): string | null {
  for (const f of mathFormats) {
    if (el.matches?.(f.selector)) {
      const src = f.extract(el)
      if (src) return src
    }
  }
  return null
}

/** Whether the element renders as display (block) math. */
export function isDisplayMath(el: Element): boolean {
  for (const f of mathFormats) {
    if (el.matches?.(f.selector) && f.isDisplay) {
      const d = f.isDisplay(el)
      if (d) return true
    }
  }
  return false
}

/** Wrap a source with inline/display delimiters. */
export function wrapMath(el: Element, src: string): string {
  return isDisplayMath(el) ? `$$${src}$$` : `$${src}$`
}
