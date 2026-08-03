import {
  enclosingParagraph,
  mathBlockText,
  mathSource,
  selectionWithMath,
  wrapMath
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
