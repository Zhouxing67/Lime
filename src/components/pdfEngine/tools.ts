import {
  CropFreeRounded,
  GestureRounded,
  HighlightRounded,
  NotesRounded
} from "@mui/icons-material"
import {
  annotationDefinitions,
  type IAnnotationType
} from "~/src/pdf/inklayer/extensions/annotator/const/definitions"

export const LIME_TOOL_NAMES = [
  "highlight",
  "underline",
  "strikeout",
  "rectangle",
  "freehand",
  "freeHighlight",
  "freeText"
] as const

const LIME_REGION_TOOL_NAMES = ["rectangle", "freehand", "freeHighlight", "freeText"] as const
export { LIME_REGION_TOOL_NAMES }

const REGION_ICONS: Record<(typeof LIME_REGION_TOOL_NAMES)[number], typeof CropFreeRounded> = {
  rectangle: CropFreeRounded,
  freehand: GestureRounded,
  freeHighlight: HighlightRounded,
  freeText: NotesRounded
}
export { REGION_ICONS }

const TOOL_LABELS: Record<(typeof LIME_TOOL_NAMES)[number], string> = {
  highlight: "高亮",
  underline: "下划线",
  strikeout: "删除线",
  rectangle: "框选",
  freehand: "画笔",
  freeHighlight: "自由高亮",
  freeText: "文本框"
}
export { TOOL_LABELS }

function toolDef(name: (typeof LIME_TOOL_NAMES)[number]): IAnnotationType {
  return annotationDefinitions.find((a) => a.name === name)!
}
export { toolDef }
