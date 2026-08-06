import { mathSource, wrapMath } from "./mathFormats"
import {
  enclosingParagraph,
  mathBlockText,
  selectionWithMath
} from "./formula"

describe("formula", () => {
  it("extracts LaTeX from a KaTeX .katex element", () => {
    document.body.innerHTML = `
      <span class="katex">
        <span class="katex-mathml">
          <math><semantics><annotation encoding="application/x-tex">\\frac{1}{x}</annotation></semantics></math>
        </span>
        <span class="katex-html" aria-hidden="true"></span>
      </span>
    `
    const el = document.querySelector(".katex")!
    expect(mathSource(el)).toBe("\\frac{1}{x}")
  })

  it("extracts LaTeX from a Zhihu .ztext-math data-tex element", () => {
    document.body.innerHTML = `
      <span class="ztext-math" data-tex="E=mc^2"><span>E=mc²</span></span>
    `
    const el = document.querySelector(".ztext-math")!
    expect(mathSource(el)).toBe("E=mc^2")
    expect(wrapMath(el, mathSource(el)!)).toBe("$E=mc^2$")
  })

  it("treats Zhihu block math (\\begin) as display", () => {
    document.body.innerHTML = `
      <span class="ztext-math" data-tex="\\begin{cases}a\\\\b\\end{cases}"></span>
    `
    const el = document.querySelector(".ztext-math")!
    expect(wrapMath(el, mathSource(el)!)).toBe("$$\\begin{cases}a\\\\b\\end{cases}$$")
  })

  it("replaces inline math with $…$ in a selection's text", () => {
    document.body.innerHTML = `
      <p>前文 <span class="katex">
        <span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">x^2</annotation></semantics></math></span>
        <span class="katex-html" aria-hidden="true"></span>
      </span> 后文</p>
    `
    const sel = window.getSelection()
    if (!sel) throw new Error("no selection in jsdom")
    const range = document.createRange()
    range.selectNodeContents(document.querySelector("p")!)
    sel.removeAllRanges()
    sel.addRange(range)
    const text = selectionWithMath(sel)
    expect(text).toContain("$x^2$")
    expect(text).toContain("前文")
    expect(text).toContain("后文")
  })

  it("uses display delimiters for math inside .katex-display", () => {
    document.body.innerHTML = `
      <div class="katex-display"><span class="katex">
        <span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">\\int_0^1 x dx</annotation></semantics></math></span>
        <span class="katex-html" aria-hidden="true"></span>
      </span></div>
    `
    const sel = window.getSelection()
    if (!sel) throw new Error("no selection in jsdom")
    const range = document.createRange()
    range.selectNode(document.querySelector(".katex-display")!)
    sel.removeAllRanges()
    sel.addRange(range)
    const text = selectionWithMath(sel)
    expect(text).toContain("$$\\int_0^1 x dx$$")
  })

  it("finds the enclosing paragraph block for a formula", () => {
    document.body.innerHTML = `
      <div class="content">
        <p>第一段 <span class="katex">
          <span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">a+b</annotation></semantics></math></span>
        </span> 文字</p>
        <p>第二段</p>
      </div>
    `
    const formula = document.querySelector(".katex")!
    const para = enclosingParagraph(formula)
    expect(para.tagName.toLowerCase()).toBe("p")
    expect(para.textContent).toContain("第一段")
    expect(para.textContent).not.toContain("第二段")
  })

  it("rebuilds a paragraph with all its formulas as $…$", () => {
    document.body.innerHTML = `
      <p>
        前文 <span class="katex">
          <span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">x_1</annotation></semantics></math></span>
        </span> 中段
        <span class="ztext-math" data-tex="\\sum_i y_i"></span>
        后文
      </p>
    `
    const para = document.querySelector("p")!
    const text = mathBlockText(para)
    expect(text).toContain("前文")
    expect(text).toContain("$x_1$")
    expect(text).toContain("$\\sum_i y_i$")
    expect(text).toContain("后文")
  })

  it("keeps short standalone formulas ($x$) capturable", () => {
    document.body.innerHTML = `
      <p><span class="katex">
        <span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">x</annotation></semantics></math></span>
      </span></p>
    `
    const para = document.querySelector("p")!
    expect(mathBlockText(para)).toBe("$x$")
  })
})

describe("mathFormats registry", () => {
  it("extracts Zhihu ztext-math from the data-tex attribute", () => {
    document.body.innerHTML = `
      <span class="ztext-math" data-tex="E=mc^2"></span>`
    const el = document.querySelector(".ztext-math")!
    expect(mathSource(el)).toBe("E=mc^2")
    expect(wrapMath(el, "E=mc^2")).toBe("$E=mc^2$")
  })

  it("falls back to alt for a ztext-math img without data-tex", () => {
    document.body.innerHTML = `<img class="ztext-math" alt="x_1 + x_2" />`
    const el = document.querySelector(".ztext-math")!
    expect(mathSource(el)).toBe("x_1 + x_2")
  })

  it("detects display math via the format's isDisplay hook", () => {
    document.body.innerHTML = `
      <div class="katex-display"><span class="katex">
        <span class="katex-mathml"><annotation>x</annotation></span>
      </span></div>`
    const el = document.querySelector(".katex")!
    expect(wrapMath(el, "x")).toBe("$$x$$")
  })
})

describe("MathJax v3 SVG perception", () => {
  it("reconstructs the rendered text from the glyph-name char codes", () => {
    document.body.innerHTML = `
      <svg role="img" aria-hidden="true">
        <use xlink:href="#MJMATHI-41" x="0"></use>
        <use xlink:href="#MJMAIN-3D" x="40"></use>
        <use xlink:href="#MJMATHI-78" x="80"></use>
      </svg>`
    const svg = document.querySelector("svg")!
    expect(mathSource(svg)).toBe("A=x")
    expect(wrapMath(svg, "A=x")).toBe("$A=x$")
  })

  it("prefers the enclosing ztext-math data-tex over the glyph text", () => {
    document.body.innerHTML = `
      <span class="ztext-math" data-tex="E=mc^2">
        <svg role="img" aria-hidden="true">
          <use xlink:href="#MJMATHI-45" x="0"></use>
        </svg>
      </span>`
    const svg = document.querySelector("svg")!
    expect(mathSource(svg)).toBe("E=mc^2")
  })

  it("returns null for a non-math svg[role=img]", () => {
    document.body.innerHTML = `<svg role="img" aria-hidden="true"></svg>`
    expect(mathSource(document.querySelector("svg")!)).toBeNull()
  })
})
