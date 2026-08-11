import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Box, IconButton, Stack, Tooltip, Typography, Popper, Paper, Divider } from "@mui/material"
import { useTheme } from "@mui/material/styles"
import { Theme } from "@radix-ui/themes"
import { TooltipProvider } from "@radix-ui/react-tooltip"
import "@radix-ui/themes/styles.css"

import "~/src/pdf/inklayer/i18n"
import { PdfViewerProvider } from "~/src/pdf/inklayer/context/pdf_viewer_provider"
import { AnnotatorExtension } from "~/src/pdf/inklayer/extensions/annotator"
import { PainterProvider } from "~/src/pdf/inklayer/extensions/annotator/context/painter_context"
import { OptionsContext } from "~/src/pdf/inklayer/extensions/annotator/context/options_context"
import { defaultOptions as defaultAnnotatorOptions } from "~/src/pdf/inklayer/extensions/annotator/const/default_options"
import { deepMerge } from "~/src/pdf/inklayer/utils"
import { usePainter } from "~/src/pdf/inklayer/extensions/annotator/context/use_painter"
import { useAnnotationStore } from "~/src/pdf/inklayer/extensions/annotator/store"
import { usePdfViewerContext } from "~/src/pdf/inklayer/context/pdf_viewer_context"
import {
  annotationDefinitions,
  type IAnnotationStore,
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

const TOOL_LABELS: Record<(typeof LIME_TOOL_NAMES)[number], string> = {
  highlight: "高亮",
  underline: "下划线",
  strikeout: "删除线",
  rectangle: "框选",
  freehand: "画笔",
  freeHighlight: "自由高亮",
  freeText: "文本框"
}

const TOOL_ICONS: Record<(typeof LIME_TOOL_NAMES)[number], string> = {
  highlight: "🖍",
  underline: "＿",
  strikeout: "𠝹",
  rectangle: "▭",
  freehand: "✏",
  freeHighlight: "🖌",
  freeText: "T"
}

function toolDef(name: (typeof LIME_TOOL_NAMES)[number]): IAnnotationType {
  return annotationDefinitions.find((a) => a.name === name)!
}

/** Our MUI annotation-tool bar — drives the vendored painter via activate(). */
function EngineToolbar() {
  const { painter } = usePainter()
  const setCurrentAnnotationType = useAnnotationStore((s) => s.setCurrentAnnotationType)
  const active = useAnnotationStore((s) => s.currentAnnotationType)
  const theme = useTheme()

  const handleTool = useCallback(
    (name: (typeof LIME_TOOL_NAMES)[number]) => {
      const def = toolDef(name)
      const isActive = active?.type === def.type
      setCurrentAnnotationType(isActive ? null : def)
      painter?.activate(isActive ? null : def, null)
    },
    [active, painter, setCurrentAnnotationType]
  )

  return (
    <Stack
      direction="row"
      spacing={0.5}
      sx={{
        position: "absolute",
        top: 8,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1200,
        px: 1,
        py: 0.5,
        borderRadius: 1,
        bgcolor: "background.paper",
        boxShadow: 2,
        border: 1,
        borderColor: "divider"
      }}
    >
      {LIME_TOOL_NAMES.map((name) => {
        const def = toolDef(name)
        const selected = active?.type === def.type
        return (
          <Tooltip key={name} title={TOOL_LABELS[name]}>
            <IconButton
              size="small"
              onClick={() => handleTool(name)}
              sx={{
                color: selected ? "primary.main" : "text.secondary",
                bgcolor: selected ? "action.selected" : "transparent"
              }}
            >
              <Box component="span" sx={{ fontSize: 15, lineHeight: 1 }}>
                {TOOL_ICONS[name]}
              </Box>
            </IconButton>
          </Tooltip>
        )
      })}
    </Stack>
  )
}

/** Our MUI text-selection bar — highlight/underline/strikeout on the range. */
function EngineSelectionBar({ range }: { range: Range | null }) {
  const { painter } = usePainter()
  const anchorRef = useRef<HTMLDivElement>(null)
  const [anchorPos, setAnchorPos] = useState<{ x: number; y: number } | null>(null)

  useMemo(() => {
    if (range && range.getBoundingClientRect) {
      const r = range.getBoundingClientRect()
      setAnchorPos({ x: r.left + r.width / 2, y: r.top })
    } else {
      setAnchorPos(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.toString()])

  const apply = useCallback(
    (name: "highlight" | "underline" | "strikeout") => {
      if (!painter) return
      painter.highlightRange(range, toolDef(name))
      setAnchorPos(null)
    },
    [painter, range]
  )

  return (
    <>
      <div ref={anchorRef} style={{ position: "absolute", left: anchorPos?.x ?? -9999, top: anchorPos?.y ?? -9999, width: 1, height: 1 }} />
      <Popper open={!!anchorPos && !!range} anchorEl={anchorRef.current} placement="top" modifiers={[{ name: "offset", options: { offset: [0, 8] } }]}>
        <Paper
          sx={{
            px: 0.5,
            py: 0.25,
            display: "flex",
            alignItems: "center",
            borderRadius: 1,
            boxShadow: 4,
            border: 1,
            borderColor: "divider"
          }}
        >
          {(["highlight", "underline", "strikeout"] as const).map((name) => (
            <Tooltip key={name} title={TOOL_LABELS[name]}>
              <IconButton size="small" onClick={() => apply(name)} sx={{ color: "text.secondary" }}>
                <Box component="span" sx={{ fontSize: 14, lineHeight: 1 }}>
                  {TOOL_ICONS[name]}
                </Box>
              </IconButton>
            </Tooltip>
          ))}
        </Paper>
      </Popper>
    </>
  )
}

export interface PdfEngineViewProps {
  data: ArrayBuffer
  title?: string
  annotations?: IAnnotationStore[]
  onAnnotationAdd?: (annotation: IAnnotationStore, pos?: { x: number; y: number }) => void
  onAnnotationDelete?: (id: string) => void
  onAnnotationSelected?: (annotation: IAnnotationStore | null, isClick: boolean) => void
  onAnnotationChanged?: (annotation: IAnnotationStore) => void
  onVisiblePageChange?: (page: number) => void
  onLoad?: () => void
}

/** Bridge rendered INSIDE PdfViewerProvider — needs the pdfViewer/eventBus. */
function EngineBridge({
  annotations,
  onAnnotationAdd,
  onAnnotationDelete,
  onAnnotationSelected,
  onAnnotationChanged,
  onVisiblePageChange,
  onLoad,
  textRange,
  onTextSelected
}: {
  annotations?: IAnnotationStore[]
  onAnnotationAdd?: (annotation: IAnnotationStore, pos?: { x: number; y: number }) => void
  onAnnotationDelete?: (id: string) => void
  onAnnotationSelected?: (annotation: IAnnotationStore | null, isClick: boolean) => void
  onAnnotationChanged?: (annotation: IAnnotationStore) => void
  onVisiblePageChange?: (page: number) => void
  onLoad?: () => void
  textRange: Range | null
  onTextSelected: (range: Range | null) => void
}) {
  const { pdfViewer, eventBus } = usePdfViewerContext()

  const onVisiblePageRef = useRef(onVisiblePageChange)
  onVisiblePageRef.current = onVisiblePageChange
  useEffect(() => {
    if (!eventBus) return
    const onPageChanging = (evt: { pageNumber: number }) => {
      onVisiblePageRef.current?.(evt.pageNumber)
    }
    eventBus.on("pagechanging", onPageChanging)
    return () => {
      eventBus.off("pagechanging", onPageChanging)
    }
  }, [eventBus])

  const handleAdd = useCallback(
    (store: IAnnotationStore) => {
      let pos: { x: number; y: number } | undefined
      try {
        const pv = pdfViewer?.getPageView(store.pageNumber - 1)
        const vp = pv?.viewport
        const r = store.konvaClientRect
        if (vp && r && vp.width > 0 && vp.height > 0) {
          pos = {
            x: (r.x + r.width / 2) / vp.width,
            y: (r.y + r.height / 2) / vp.height
          }
        }
      } catch {
        // fall back to no pos
      }
      onAnnotationAdd?.(store, pos)
    },
    [onAnnotationAdd, pdfViewer]
  )

  return (
    <>
      <EngineToolbar />
      <EngineSelectionBar range={textRange} />
      <AnnotatorExtension
        enableNativeAnnotations={false}
        annotations={annotations}
        onLoad={onLoad ?? (() => {})}
        onAnnotationAdd={handleAdd}
        onAnnotationDelete={onAnnotationDelete ?? (() => {})}
        onAnnotationSelected={onAnnotationSelected ?? (() => {})}
        onAnnotationChanged={onAnnotationChanged ?? (() => {})}
        onTextSelected={onTextSelected}
      />
    </>
  )
}

/** The Lime PDF view — vendored inklayer engine + our MUI chrome. */
export default function PdfEngineView({
  data,
  title = "PDF",
  annotations,
  onAnnotationAdd,
  onAnnotationDelete,
  onAnnotationSelected,
  onAnnotationChanged,
  onVisiblePageChange,
  onLoad
}: PdfEngineViewProps) {
  const [textRange, setTextRange] = useState<Range | null>(null)
  const optionsValue = useMemo(
    () => ({ defaultOptions: deepMerge(defaultAnnotatorOptions, {}), primaryColor: "#1272e8" }),
    []
  )

  // The official pdf.js viewer CSS (page/textLayer/annotationLayer layout) is
  // required by the vendored engine — load it as a runtime <link> like the old
  // renderer did (kept out of Parcel's CSS pipeline).
  useEffect(() => {
    const cssLink = document.createElement("link")
    cssLink.rel = "stylesheet"
    cssLink.href = chrome.runtime.getURL("assets/pdfjs/pdf_viewer.css")
    document.head.append(cssLink)
    return () => cssLink.remove()
  }, [])

  const rootRef = useRef<HTMLDivElement>(null)
  const [rootSize, setRootSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const measure = () =>
      setRootSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const handleTextSelected = useCallback((range: Range | null) => {
    setTextRange(range)
  }, [])

  return (
    <div ref={rootRef} style={{ width: "100%", height: "100%" }}>
      <Theme accentColor="blue" appearance="light" style={{ height: "100%" }}>
      <TooltipProvider>
        <PainterProvider>
          <OptionsContext.Provider value={optionsValue}>
            <PdfViewerProvider
              data={data}
              url={undefined}
              user={{ id: "local", name: "我" }}
              title={title}
              toolbar={null}
              sidebar={[]}
              style={{
                width: rootSize ? rootSize.w : "100%",
                height: rootSize ? rootSize.h : "100%"
              }}
            >
              <EngineBridge
                annotations={annotations}
                onAnnotationAdd={onAnnotationAdd}
                onAnnotationDelete={onAnnotationDelete}
                onAnnotationSelected={onAnnotationSelected}
                onAnnotationChanged={onAnnotationChanged}
                onVisiblePageChange={onVisiblePageChange}
                onLoad={onLoad}
                textRange={textRange}
                onTextSelected={handleTextSelected}
              />
            </PdfViewerProvider>
          </OptionsContext.Provider>
        </PainterProvider>
      </TooltipProvider>
      </Theme>
    </div>
  )
}
