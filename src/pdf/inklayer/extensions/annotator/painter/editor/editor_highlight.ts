import Konva from 'konva'

import { AnnotationType, IAnnotationStore, IAnnotationStyle } from '../../const/definitions'
import { Editor, IEditorOptions } from './editor'
import { mergeRectsByLine } from './merge_rects'

/** 内部：span 在 canvas 坐标系中的矩形 */
interface SpanCanvasRect {
    x: number
    y: number
    width: number
    height: number
}

interface ViewportRectLike {
    left: number
    top: number
    width: number
    height: number
}

/**
 * EditorHighLight 是继承自 Editor 的高亮编辑器类。
 */
export class EditorHighLight extends Editor {
    /**
     * 创建一个 EditorHighLight 实例。
     * @param EditorOptions 初始化编辑器的选项
     * @param editorType 注释类型
     */
    constructor(EditorOptions: IEditorOptions, editorType: AnnotationType) {
        super({ ...EditorOptions, editorType })
    }

    /**
     * 将网页上选中文字区域转换为图形并绘制在 Canvas 上。
     *
     * 采用「按行分组 → 行内合并为连续块」策略：
     * 1. 收集所有 span 的 canvas 坐标矩形
     * 2. 按 Y 坐标分组（同一行）
     * 3. 行内全部合并为一个连续矩形（桥接 justify 词间距）
     * 4. 每个合并后的行段只画一个矩形
     *
     * 避免了逐 span 画矩形时文字间隙导致的「断裂」视觉。
     *
     * @param elements HTMLSpanElement 数组，表示要绘制的元素
     * @param fixElement 用于修正计算的元素
     */
    public convertTextSelection(elements: HTMLSpanElement[], fixElement: HTMLDivElement, range: Range) {
        this.currentShapeGroup = this.createShapeGroup()
        this.getBgLayer().add(this.currentShapeGroup.konvaGroup)

        const fixBounding = fixElement.getBoundingClientRect()

        // 1. 对 Range 覆盖到的每个 pdf.js leaf span 创建局部字符 Range。
        //    局部 Range 提供精确横界，原始 span 提供紧凑纵向 em box。
        //    全程不插入临时 mark，因此不会污染 TextLayer 的节点与偏移索引。
        const selectedRects = elements.flatMap(element => {
            const localRange = this.intersectRangeWithElement(range, element)
            if (!localRange) return []
            const emRect = element.getBoundingClientRect()
            return Array.from(localRange.getClientRects()).map(rect => ({
                left: rect.left,
                top: emRect.top,
                width: rect.width,
                height: emRect.height
            }))
        })
        const viewportRects = selectedRects.length > 0
            ? selectedRects
            : Array.from(range.getClientRects())
        const spanRects: SpanCanvasRect[] = viewportRects
            .map(rect => this.clipRectToPage(rect, fixBounding))
            .filter((rect): rect is ViewportRectLike => Boolean(rect))
            .map(rect => this.calculateRelativePosition(rect, fixBounding))

        // 2. 按行分组 + 行内合并为连续块
        const mergedRects = this.mergeSpanRectsByRow(spanRects)

        // 3. 每个合并行段绘一个形状
        mergedRects.forEach(rect => {
            const shape = this.createShape(rect.x, rect.y, rect.width, rect.height)
            this.currentShapeGroup!.konvaGroup.add(shape)
        })

        this.setShapeGroupDone({
            id: this.currentShapeGroup.id,
            contentsObj: {
                text: '',
                selectedText: this.getSelectedText(range, elements)
            },
            color: this.currentAnnotation!.style!.color,
            sourceRects: mergedRects
        })
    }

    /**
     * 将 span canvas 矩形按行分组 + 行内合并为连续块。
     *
     * 委托给纯函数 mergeRectsByLine（桥接词间距，见 merge_rects.ts）。
     *
     * @param rects span 矩形数组
     * @returns 合并后的矩形数组（每行一个连续段）
     */
    private mergeSpanRectsByRow(rects: SpanCanvasRect[]): SpanCanvasRect[] {
        return mergeRectsByLine(rects)
    }

    /**
     * 获取所有 elements 内部文字。
     * @param elements HTMLSpanElement 数组
     * @returns 所有元素内部文字的字符串
     */
    private getSelectedText(range: Range, elements: HTMLSpanElement[]): string {
        return elements
            .map(element => this.intersectRangeWithElement(range, element)?.toString() ?? '')
            .join('')
            .replace(/\s+/g, ' ')
            .trim()
    }

    /** Return the portion of `range` that lies inside one leaf text span. */
    private intersectRangeWithElement(range: Range, element: HTMLElement): Range | null {
        let intersects = false
        try {
            intersects = range.intersectsNode(element)
        } catch {
            return null
        }
        if (!intersects) return null

        const local = document.createRange()
        local.selectNodeContents(element)
        if (range.compareBoundaryPoints(Range.START_TO_START, local) > 0) {
            local.setStart(range.startContainer, range.startOffset)
        }
        if (range.compareBoundaryPoints(Range.END_TO_END, local) < 0) {
            local.setEnd(range.endContainer, range.endOffset)
        }
        return local.collapsed ? null : local
    }

    /**
     * 计算元素的相对位置和尺寸，适配 Canvas 坐标系。
     * @param elementBounding 元素的边界矩形
     * @param fixBounding 基准元素的边界矩形
     * @returns 相对位置和尺寸的对象 { x, y, width, height }
     */
    private clipRectToPage(rect: ViewportRectLike, pageBounding: DOMRect): ViewportRectLike | null {
        const left = Math.max(rect.left, pageBounding.left)
        const top = Math.max(rect.top, pageBounding.top)
        const right = Math.min(rect.left + rect.width, pageBounding.right)
        const bottom = Math.min(rect.top + rect.height, pageBounding.bottom)
        const width = right - left
        const height = bottom - top
        if (width <= 0 || height <= 0) return null
        return { left, top, width, height }
    }

    private calculateRelativePosition(elementBounding: ViewportRectLike, fixBounding: DOMRect) {
        const scale = this.konvaStage.scale()
        const x = (elementBounding.left - fixBounding.left) / scale.x
        const y = (elementBounding.top - fixBounding.top) / scale.y
        const width = elementBounding.width / scale.x
        const height = elementBounding.height / scale.y
        return { x, y, width, height }
    }

    /**
     * 根据当前的注释类型创建对应的形状。
     * @param x 形状的 X 坐标
     * @param y 形状的 Y 坐标
     * @param width 形状的宽度
     * @param height 形状的高度
     * @returns Konva.Shape 具体类型的形状
     */
    private createShape(x: number, y: number, width: number, height: number): Konva.Shape {
        switch (this.currentAnnotation!.type) {
            case AnnotationType.HIGHLIGHT:
                return this.createHighlightShape(x, y, width, height)
            case AnnotationType.UNDERLINE:
                return this.createUnderlineShape(x, y, width, height)
            case AnnotationType.STRIKEOUT:
                return this.createStrikeoutShape(x, y, width, height)
            default:
                throw new Error(`Unsupported annotation type: ${this.currentAnnotation!.type}`)
        }
    }

    /**
     * 创建高亮形状。
     * @param x 形状的 X 坐标
     * @param y 形状的 Y 坐标
     * @param width 形状的宽度
     * @param height 形状的高度
     * @returns Konva.Rect 高亮形状对象
     */
    private createHighlightShape(x: number, y: number, width: number, height: number): Konva.Rect {
        return new Konva.Rect({
            x,
            y,
            width,
            height,
            opacity: 0.5,
            fill: this.currentAnnotation!.style!.color
        })
    }

    /**
     * 创建下划线形状。
     * @param x 形状的 X 坐标
     * @param y 形状的 Y 坐标
     * @param width 形状的宽度
     * @param height 形状的高度
     * @returns Konva.Rect 下划线形状对象
     */
    private createUnderlineShape(x: number, y: number, width: number, height: number): Konva.Rect {
        return new Konva.Rect({
            x,
            y: height + y - 2,
            width,
            fill: this.currentAnnotation!.style!.color,
            opacity: 1,
            hitStrokeWidth: 10,
            height: 1.5
        })
    }

    /**
     * 创建删除线形状。
     * @param x 形状的 X 坐标
     * @param y 形状的 Y 坐标
     * @param width 形状的宽度
     * @param height 形状的高度
     * @returns Konva.Rect 删除线形状对象
     */
    private createStrikeoutShape(x: number, y: number, width: number, height: number): Konva.Rect {
        return new Konva.Rect({
            x,
            y: y + height / 2,
            width,
            fill: this.currentAnnotation!.style!.color,
            opacity: 1,
            hitStrokeWidth: 10,
            height: 2
        })
    }

    /**
     * 处理鼠标按下事件，目前未实现具体逻辑。
     */
    protected mouseDownHandler() {}

    /**
     * 处理鼠标移动事件，目前未实现具体逻辑。
     */
    protected mouseMoveHandler() {}

    /**
     * 处理鼠标抬起事件，目前未实现具体逻辑。
     */
    protected mouseUpHandler() {}

    /**
     * @description 更改注释样式
     * @param annotationStore
     * @param styles
     */
    protected changeStyle(annotationStore: IAnnotationStore, styles: IAnnotationStyle): void {
        const id = annotationStore.id
        const group = this.getShapeGroupById(id)
        if (group) {
            group.getChildren().forEach(shape => {
                if (annotationStore.type === AnnotationType.HIGHLIGHT) {
                    if (shape instanceof Konva.Rect) {
                        if (styles.color !== undefined) {
                            shape.fill(styles.color)
                        }
                        if (styles.strokeWidth !== undefined) {
                            shape.strokeWidth(styles.strokeWidth)
                        }
                        if (styles.opacity !== undefined) {
                            shape.opacity(styles.opacity)
                        }
                    }
                }
                if (annotationStore.type === AnnotationType.UNDERLINE) {
                    if (shape instanceof Konva.Rect) {
                        if (styles.color !== undefined) {
                            shape.fill(styles.color)
                        }
                        if (styles.strokeWidth !== undefined) {
                            shape.strokeWidth(styles.strokeWidth)
                        }
                        if (styles.opacity !== undefined) {
                            shape.opacity(styles.opacity)
                        }
                    }
                }
                if (annotationStore.type === AnnotationType.STRIKEOUT) {
                    if (shape instanceof Konva.Rect) {
                        if (styles.color !== undefined) {
                            shape.stroke(styles.color)
                        }
                        if (styles.strokeWidth !== undefined) {
                            shape.strokeWidth(styles.strokeWidth)
                        }
                        if (styles.opacity !== undefined) {
                            shape.opacity(styles.opacity)
                        }
                    }
                }
            })
            const changedPayload: { konvaString: string; color?: string } = {
                konvaString: group.toJSON()
            }

            if (styles.color !== undefined) {
                changedPayload.color = styles.color
            }

            this.setChanged(id, changedPayload)
        }
    }
}
