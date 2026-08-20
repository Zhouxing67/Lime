/**
 * Tracks the browser's native PDF text selection without rewriting the
 * pdf.js TextLayer DOM. Annotation creation receives the original Range plus
 * the leaf text spans it intersects, grouped by page.
 */
export class TextSelection {
    private readonly onSelect: (range: Range | null) => void
    private readonly onHighlight: (selection: Partial<Record<string, HTMLElement[]>>, range: Range) => void
    private root: HTMLDivElement | null = null
    private isSelecting = false

    private readonly handleSelectionChange = () => {
        const selection = window.getSelection()
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
            this.isSelecting = false
            this.onSelect(null)
            return
        }

        const range = selection.getRangeAt(0)
        if (selection.toString() && this.containsRange(range)) {
            this.isSelecting = true
            return
        }

        this.isSelecting = false
        this.onSelect(null)
    }

    private readonly handleSelectionEnd = () => {
        if (!this.isSelecting) return

        this.isSelecting = false
        const selection = window.getSelection()
        const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
        this.onSelect(range && this.containsRange(range) ? range : null)
    }

    constructor({
        onSelect,
        onHighlight
    }: {
        onSelect: (range: Range | null) => void
        onHighlight: (selection: Partial<Record<string, HTMLElement[]>>, range: Range) => void
    }) {
        this.onSelect = onSelect
        this.onHighlight = onHighlight
    }

    public create(root: HTMLDivElement) {
        this.destroy()
        this.root = root
        document.addEventListener('selectionchange', this.handleSelectionChange)
        document.addEventListener('mouseup', this.handleSelectionEnd)
        document.addEventListener('touchend', this.handleSelectionEnd)
    }

    public highlight(range: Range | null) {
        if (!range || !this.root || !this.containsRange(range)) return

        const pageSelection: Record<string, HTMLElement[]> = {}
        const leafSpans = Array.from(this.root.querySelectorAll<HTMLElement>('.textLayer span')).filter(
            span => !span.querySelector(':scope > span') && Boolean(span.textContent)
        )
        for (const span of leafSpans) {
            let intersects = false
            try {
                intersects = range.intersectsNode(span)
            } catch {
                continue
            }
            if (!intersects) continue
            const page = span.closest('.page')?.getAttribute('data-page-number')
            if (page) (pageSelection[page] ||= []).push(span)
        }

        if (Object.keys(pageSelection).length === 0) return
        this.onHighlight(pageSelection, range.cloneRange())
        window.getSelection()?.removeAllRanges()
    }

    public isRangeSelectionActive(): boolean {
        return this.isSelecting
    }

    public destroy() {
        document.removeEventListener('selectionchange', this.handleSelectionChange)
        document.removeEventListener('mouseup', this.handleSelectionEnd)
        document.removeEventListener('touchend', this.handleSelectionEnd)
        this.root = null
        this.isSelecting = false
    }

    private containsRange(range: Range): boolean {
        return Boolean(
            this.root?.contains(range.startContainer) &&
            this.root.contains(range.endContainer)
        )
    }
}
