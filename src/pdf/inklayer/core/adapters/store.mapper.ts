/**
 * InkLayer Annotation 映射层
 * ==========================
 * 
 * 提供 IAnnotationStore（旧系统）到 Annotation Core（新系统）的映射。
 * 
 * 目的：
 * - 渐进式迁移：不必一次性重写整个系统
 * - 双向转换：可以新旧并存
 * - 清晰边界：明确哪些字段在新系统中如何定位
 * 
 * 数据流：
 * - 提交时：IAnnotationStore → Annotation → Storage
 * - 读取时：Storage → Annotation → Konva Node
 * 
 * @version 0.1.0
 */

import {
  type PdfjsAnnotationSubtype,
  AnnotationType,
  PdfjsAnnotationType,
  IAnnotationStore,
} from '@/extensions/annotator/const/definitions'

/* ============================================================================
 * 局部类型：storeToAnnotation 使用的 Core 数据模型
 * ========================================================================= */
interface PdfPoint {
  x: number
  y: number
}

interface PdfRect {
  x: number
  y: number
  width: number
  height: number
}

interface PdfQuad {
  p1: PdfPoint
  p2: PdfPoint
  p3: PdfPoint
  p4: PdfPoint
}

type Geometry =
  | { type: 'rect'; rect: PdfRect }
  | { type: 'quad'; quads: PdfQuad[] }
  | { type: 'path'; points: PdfPoint[]; closed?: boolean }
  | { type: 'line'; start: PdfPoint; end: PdfPoint }
  | { type: 'poly'; points: PdfPoint[]; closed: boolean }

type AnnotationKind =
  | 'text-markup'
  | 'note'
  | 'ink'
  | 'shape'
  | 'line'
  | 'stamp'
  | 'file'

interface AnnotationTarget {
  pageIndex: number
  geometry: Geometry
  coordinateSystem: string
  documentId?: string
}

type AnnotationPayload =
  | {
      kind: 'text-markup'
      variant: 'highlight' | 'underline' | 'squiggly' | 'strikeout'
      text?: string
      selectedText?: string
      color?: string
      opacity?: number
    }
  | { kind: 'note'; text: string }
  | { kind: 'ink'; color?: string; width?: number }
  | { kind: 'shape'; shape: 'rect' | 'ellipse' | 'cloud' | 'polygon' }
  | { kind: 'line'; arrowStart?: boolean; arrowEnd?: boolean }
  | {
      kind: 'stamp'
      name: string
      label?: string
      source?: 'standard' | 'custom' | 'image'
      appearanceRef?: string
      rotation?: number
      scale?: number
    }
  | { kind: 'file'; fileName: string; fileUrl: string; size?: number; mimeType?: string }

interface AnnotationAppearance {
  strokeColor?: string
  fillColor?: string
  strokeWidth?: number
  opacity?: number
  dashArray?: number[]
  fontSize?: number
  fontFamily?: string
  textAlign?: 'left' | 'center' | 'right'
  zIndex?: number
}

interface AnnotationRelations {
  parentId?: string
  replies?: string[]
  popupFor?: string
  linkedAnnotationIds?: string[]
}

interface AnnotationMeta {
  referenceNumber?: number
  createdAt?: string
  updatedAt?: string
  authorId?: string | { id: string; name?: string; avatarUrl?: string }
  isNative?: boolean
  source?: 'inklayer' | 'pdfjs' | 'import'
  version?: number
}

interface Annotation {
  id: string
  kind: AnnotationKind
  target: AnnotationTarget
  payload?: AnnotationPayload
  appearance?: AnnotationAppearance
  relations?: AnnotationRelations
  meta?: AnnotationMeta
  extensions?: Record<string, unknown>
}

/* ============================================================================
 * 常量映射表
 * ========================================================================= */

/** AnnotationType → AnnotationKind 映射 */
const TYPE_TO_KIND: Record<AnnotationType, AnnotationKind> = {
  [AnnotationType.NONE]: 'note',
  [AnnotationType.SELECT]: 'note',  // SELECT 不是真正的批注类型
  [AnnotationType.HIGHLIGHT]: 'text-markup',
  [AnnotationType.STRIKEOUT]: 'text-markup',
  [AnnotationType.UNDERLINE]: 'text-markup',
  [AnnotationType.FREETEXT]: 'note',
  [AnnotationType.RECTANGLE]: 'shape',
  [AnnotationType.CIRCLE]: 'shape',
  [AnnotationType.FREEHAND]: 'ink',
  [AnnotationType.FREE_HIGHLIGHT]: 'ink',
  [AnnotationType.SIGNATURE]: 'stamp',
  [AnnotationType.STAMP]: 'stamp',
  [AnnotationType.NOTE]: 'note',
  [AnnotationType.ARROW]: 'line',
  [AnnotationType.CLOUD]: 'shape',
}

/** AnnotationType → Geometry type 映射 */
const TYPE_TO_GEOMETRY_TYPE: Record<AnnotationType, Geometry['type']> = {
  [AnnotationType.NONE]: 'rect',
  [AnnotationType.SELECT]: 'rect',
  [AnnotationType.HIGHLIGHT]: 'quad',
  [AnnotationType.STRIKEOUT]: 'quad',
  [AnnotationType.UNDERLINE]: 'quad',
  [AnnotationType.FREETEXT]: 'rect',
  [AnnotationType.RECTANGLE]: 'rect',
  [AnnotationType.CIRCLE]: 'rect',  // 实际渲染用 rect 包围盒
  [AnnotationType.FREEHAND]: 'path',
  [AnnotationType.FREE_HIGHLIGHT]: 'path',
  [AnnotationType.SIGNATURE]: 'rect',
  [AnnotationType.STAMP]: 'rect',
  [AnnotationType.NOTE]: 'rect',
  [AnnotationType.ARROW]: 'line',
  [AnnotationType.CLOUD]: 'path',
}

/** PdfjsAnnotationSubtype → text-markup variant 映射 */
const SUBTYPE_TO_TEXT_MARKUP_VARIANT: Record<string, 'highlight' | 'underline' | 'squiggly' | 'strikeout'> = {
  'Highlight': 'highlight',
  'Underline': 'underline',
  'Squiggly': 'squiggly',
  'StrikeOut': 'strikeout',
}

/** PdfjsAnnotationSubtype → shape variant 映射 */
const SUBTYPE_TO_SHAPE_VARIANT: Record<string, 'rect' | 'ellipse' | 'cloud' | 'polygon'> = {
  'Square': 'rect',
  'Circle': 'ellipse',
  'Polygon': 'polygon',
  'PolyLine': 'polygon',
  'Cloud': 'cloud',
}

/* ============================================================================
 * 类型转换函数
 * ========================================================================= */

/**
 * 将 IAnnotationStore 转换为 Annotation Core
 * 
 * @param store 旧系统的批注存储对象
 * @param options 转换选项
 * @returns InkLayer Annotation 对象
 */
export function storeToAnnotation(store: IAnnotationStore): Annotation {
  // 1. 确定 Kind
  const kind = TYPE_TO_KIND[store.type] || 'note'

  // 2. 构建 Geometry（从 konvaClientRect 提取）
  const geometry = extractGeometryFromStore(store)

  // 3. 构建 Target
  const target: AnnotationTarget = {
    pageIndex: store.pageNumber - 1, // 转换为 0-based
    geometry,
    coordinateSystem: 'pdf-user-space',
  }

  // 4. 构建 Payload
  const payload = extractPayload(store, kind)

  // 5. 构建 Appearance
  const appearance: AnnotationAppearance = {
    strokeColor: store.color || undefined,
    fillColor: store.color ? adjustOpacity(store.color, 0.3) : undefined,
    opacity: 1,
  }

  // 6. 构建 Relations
  const relations: AnnotationRelations = {}

  // 7. 构建 Meta
  const meta: AnnotationMeta = {
    referenceNumber: store.referenceNumber,
    createdAt: store.date || undefined,
    updatedAt: store.date || undefined,
    authorId: store.user,
    isNative: store.native,
    source: store.native ? 'pdfjs' : 'inklayer',
  }

  return {
    id: store.id,
    kind,
    target,
    payload,
    appearance,
    relations,
    meta,
    extensions: {
      // 保留原始实现细节
      konva: {
        serialized: store.konvaString,
        clientRect: store.konvaClientRect,
      },
      pdfjs: {
        type: PdfjsAnnotationType[store.pdfjsType],
        subtype: store.subtype,
      },
      legacy: {
        annotationType: store.type,
        title: store.title,
        contentsObj: store.contentsObj,
        comments: store.comments,
      },
    },
  }
}

/**
 * 从 IAnnotationStore 提取 Geometry
 */
function extractGeometryFromStore(store: IAnnotationStore): Geometry {
  const geoType = TYPE_TO_GEOMETRY_TYPE[store.type] || 'rect'
  const { x, y, width, height } = store.konvaClientRect

  // 根据类型构造对应的几何结构
  // konvaClientRect 只提供矩形信息，非 rect 类型做最小化近似
  // 精确几何数据由 konvaString 反序列化补充
  switch (geoType) {
    case 'rect':
      return { type: 'rect', rect: { x, y, width, height } }
    case 'quad':
      return {
        type: 'quad',
        quads: [{
          p1: { x, y },
          p2: { x: x + width, y },
          p3: { x, y: y + height },
          p4: { x: x + width, y: y + height },
        }],
      }
    case 'line':
      return { type: 'line', start: { x, y }, end: { x: x + width, y: y + height } }
    case 'path':
      return {
        type: 'path',
        points: [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }],
        closed: true,
      }
    case 'poly':
      return {
        type: 'poly',
        points: [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }],
        closed: true,
      }
  }
}

/**
 * 从 IAnnotationStore 提取 Payload
 */
function extractPayload(store: IAnnotationStore, kind: AnnotationKind): AnnotationPayload | undefined {
  const subtype = store.subtype

  switch (kind) {
    case 'text-markup': {
      const variant = SUBTYPE_TO_TEXT_MARKUP_VARIANT[subtype] || 'highlight'
      return {
        kind: 'text-markup',
        variant,
        text: store.contentsObj?.text || '',
        selectedText: store.contentsObj?.selectedText,
        color: store.color || undefined,
      }
    }

    case 'note': {
      return {
        kind: 'note',
        text: store.contentsObj?.text || store.title || '',
      }
    }

    case 'ink': {
      return {
        kind: 'ink',
        color: store.color || undefined,
        width: store.konvaClientRect.height || 2,
      }
    }

    case 'shape': {
      const shape = store.type === AnnotationType.CLOUD
        ? 'cloud'
        : SUBTYPE_TO_SHAPE_VARIANT[subtype] || 'rect'
      return {
        kind: 'shape',
        shape,
      }
    }

    case 'line': {
      return {
        kind: 'line',
        arrowStart: false,
        arrowEnd: subtype === 'Arrow',
      }
    }

    case 'stamp': {
      return {
        kind: 'stamp',
        name: store.title || 'custom-stamp',
        label: store.title || undefined,
        source: 'custom',
      }
    }

    default:
      return undefined
  }
}

/**
 * 调整颜色透明度
 */
function adjustOpacity(color: string, opacity: number): string {
  // 如果已经是 rgba，直接返回
  if (color.startsWith('rgba')) return color

  // 如果是 hex，转换
  if (color.startsWith('#')) {
    const hex = color.slice(1)
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${opacity})`
  }

  return color
}

/**
 * 从任意 Geometry 提取包围盒（用作 konvaClientRect 的 fallback）
 */
function extractBoundingRect(geometry: Geometry): { x: number; y: number; width: number; height: number } {
  switch (geometry.type) {
    case 'rect':
      return {
        x: geometry.rect.x,
        y: geometry.rect.y,
        width: geometry.rect.width,
        height: geometry.rect.height,
      }
    case 'quad': {
      // QuadGeometry 只有 quads（p1/p2/p3/p4），从所有四边形点计算包围盒
      const allPts = geometry.quads.flatMap((q) => [q.p1, q.p2, q.p3, q.p4])
      const qxs = allPts.map((p) => p.x)
      const qys = allPts.map((p) => p.y)
      const qMinX = Math.min(...qxs)
      const qMinY = Math.min(...qys)
      return {
        x: qMinX,
        y: qMinY,
        width: Math.max(...qxs) - qMinX,
        height: Math.max(...qys) - qMinY,
      }
    }
    case 'line':
      return {
        x: Math.min(geometry.start.x, geometry.end.x),
        y: Math.min(geometry.start.y, geometry.end.y),
        width: Math.abs(geometry.end.x - geometry.start.x),
        height: Math.abs(geometry.end.y - geometry.start.y),
      }
    case 'path':
    case 'poly': {
      if (geometry.points.length === 0) {
        return { x: 0, y: 0, width: 0, height: 0 }
      }
      const xs = geometry.points.map((p) => p.x)
      const ys = geometry.points.map((p) => p.y)
      const minX = Math.min(...xs)
      const minY = Math.min(...ys)
      return {
        x: minX,
        y: minY,
        width: Math.max(...xs) - minX,
        height: Math.max(...ys) - minY,
      }
    }
  }
}
