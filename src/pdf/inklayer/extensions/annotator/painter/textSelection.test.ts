import { TextSelection } from "./textSelection"

describe("TextSelection", () => {
  it("groups intersected leaf spans by page without rewriting the text layer", () => {
    const root = document.createElement("div")
    root.innerHTML = `
      <div class="page" data-page-number="1">
        <div class="textLayer"><span>alpha </span><span>beta</span></div>
      </div>
      <div class="page" data-page-number="2">
        <div class="textLayer"><span>gamma</span></div>
      </div>`
    document.body.appendChild(root)
    const spans = root.querySelectorAll("span")
    const range = document.createRange()
    range.setStart(spans[0].firstChild!, 2)
    range.setEnd(spans[1].firstChild!, 2)

    const onHighlight = jest.fn()
    const selection = new TextSelection({ onSelect: jest.fn(), onHighlight })
    selection.create(root)
    const before = root.innerHTML

    selection.highlight(range)

    expect(root.innerHTML).toBe(before)
    expect(root.querySelector("mark")).toBeNull()
    expect(onHighlight).toHaveBeenCalledTimes(1)
    const [byPage, forwardedRange] = onHighlight.mock.calls[0]
    expect(byPage["1"]).toEqual([spans[0], spans[1]])
    expect(byPage["2"]).toBeUndefined()
    expect(forwardedRange.toString()).toBe("pha be")
    selection.destroy()
  })

  it("keeps marked-content wrappers out and returns their leaf spans once", () => {
    const root = document.createElement("div")
    root.innerHTML = `
      <div class="page" data-page-number="1"><div class="textLayer">
        <span class="markedContent"><span>nested</span></span><span> tail</span>
      </div></div>`
    document.body.appendChild(root)
    const leaves = root.querySelectorAll(".textLayer span:not(.markedContent)")
    const range = document.createRange()
    range.selectNodeContents(root.querySelector(".textLayer")!)
    const onHighlight = jest.fn()
    const selection = new TextSelection({ onSelect: jest.fn(), onHighlight })
    selection.create(root)

    selection.highlight(range)

    expect(onHighlight.mock.calls[0][0]["1"]).toEqual(Array.from(leaves))
    selection.destroy()
  })
})
