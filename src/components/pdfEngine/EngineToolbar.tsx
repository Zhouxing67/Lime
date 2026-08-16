import { useCallback, useEffect, useRef, useState } from "react"
import { Box, Divider, IconButton, TextField, Tooltip, Typography } from "@mui/material"
import {
  AddRounded,
  AspectRatioRounded,
  FitScreenRounded,
  MenuOpenRounded,
  RemoveRounded,
  SearchRounded,
  SwipeRightRounded,
  UndoRounded
} from "@mui/icons-material"

import { annotationDefinitions } from "~/src/pdf/inklayer/extensions/annotator/const/definitions"
import { usePainter } from "~/src/pdf/inklayer/extensions/annotator/context/use_painter"
import { useAnnotationStore } from "~/src/pdf/inklayer/extensions/annotator/store"
import { usePdfViewerContext } from "~/src/pdf/inklayer/context/pdf_viewer_context"
import {
  LIME_REGION_TOOL_NAMES,
  REGION_ICONS,
  TOOL_LABELS,
  toolDef
} from "./tools"

export default function EngineToolbar({
  onSearchClick,
  onToggleReader,
  onSwapLeft,
  readerOpen
}: {
  onSearchClick?: () => void
  onToggleReader?: () => void
  onSwapLeft?: () => void
  readerOpen?: boolean
}) {
  const { painter } = usePainter()
  const { pdfViewer, eventBus } = usePdfViewerContext()
  const setCurrentAnnotationType = useAnnotationStore((s) => s.setCurrentAnnotationType)
  const [activeTool, setActiveTool] = useState<
    (typeof LIME_REGION_TOOL_NAMES)[number] | null
  >(null)
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [zoomPct, setZoomPct] = useState(100)
  const [editingJump, setEditingJump] = useState(false)
  const [jumpDraft, setJumpDraft] = useState("")
  const navHistoryRef = useRef<number[]>([])
  const [canGoBack, setCanGoBack] = useState(false)

  useEffect(() => {
    if (!eventBus) return
    const onPage = (evt: { pageNumber: number; previous?: number }) => {
      setPage(evt.pageNumber)
      const prev = evt.previous as number | undefined
      if (prev && prev !== evt.pageNumber) {
        // Cap the back-history so long reading sessions don't grow unbounded.
        navHistoryRef.current.push(prev)
        if (navHistoryRef.current.length > 50)
          navHistoryRef.current.shift()
        setCanGoBack(navHistoryRef.current.length > 0)
      }
    }
    const onLoaded = () => setPageCount(pdfViewer?.pagesCount ?? 1)
    eventBus.on("pagechanging", onPage)
    eventBus.on("pagesloaded", onLoaded)
    if (pdfViewer?.pagesCount) setPageCount(pdfViewer.pagesCount)
    return () => {
      eventBus.off("pagechanging", onPage)
      eventBus.off("pagesloaded", onLoaded)
    }
  }, [eventBus, pdfViewer])

  const handleTool = useCallback(
    (name: (typeof LIME_REGION_TOOL_NAMES)[number]) => {
      const isActive = activeTool === name
      // Deactivating a tool returns to SELECT mode so clicking a mark still
      // routes to the selector (painter.activate(null) would return early and
      // leave the selector dormant).
      if (isActive) {
        setActiveTool(null)
        setCurrentAnnotationType(annotationDefinitions[0])
        painter?.activate(annotationDefinitions[0], null)
      } else {
        setActiveTool(name)
        const def = toolDef(name)
        setCurrentAnnotationType(def)
        painter?.activate(def, null)
      }
    },
    [activeTool, painter, setCurrentAnnotationType]
  )

  const goTo = useCallback(
    (n: number) => {
      if (!pdfViewer) return
      const clamped = Math.max(1, Math.min(n, pdfViewer.pagesCount))
      pdfViewer.currentPageNumber = clamped
    },
    [pdfViewer]
  )

  const goBack = useCallback(() => {
    const prev = navHistoryRef.current.pop()
    setCanGoBack(navHistoryRef.current.length > 0)
    if (prev != null) goTo(prev)
  }, [goTo])

  const applyZoom = useCallback(
    (factor: number) => {
      if (!pdfViewer) return
      const next = Math.max(0.5, Math.min(3, pdfViewer.currentScale * factor))
      pdfViewer.currentScale = next
    },
    [pdfViewer]
  )

  const toggleFit = useCallback(() => {
    if (!pdfViewer) return
    pdfViewer.currentScaleValue =
      pdfViewer.currentScaleValue === "page-width" ? "page-fit" : "page-width"
  }, [pdfViewer])

  useEffect(() => {
    if (!eventBus) return
    const onScale = (evt: { scale: number }) => setZoomPct(Math.round(evt.scale * 100))
    eventBus.on("scalechanging", onScale)
    return () => eventBus.off("scalechanging", onScale)
  }, [eventBus])

  const navBtn = (title: string, onClick: () => void, disabled = false, children: React.ReactNode) => (
    <Tooltip title={title}>
      <span>
        <IconButton
          size="small"
          onClick={onClick}
          disabled={disabled}
          sx={{
            p: 0.5,
            color: "text.secondary",
            "&:hover": { color: "primary.main" },
            "&.Mui-disabled": { color: "text.disabled", opacity: 0.35 }
          }}>
          {children}
        </IconButton>
      </span>
    </Tooltip>
  )

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        px: 1,
        minHeight: 40,
        bgcolor: "background.paper",
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1200
      }}>
      {/* left: nav + view controls */}
      <Box sx={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 0.5 }}>
        {navBtn(
          readerOpen ? "收起导航面板" : "目录 / 缩略图",
          () => onToggleReader?.(),
          false,
          <MenuOpenRounded sx={{ fontSize: 16 }} />
        )}
        {onSwapLeft &&
          navBtn(
            "切换导航面板（目录 ↔ 侧栏）",
            () => onSwapLeft?.(),
            false,
            <SwipeRightRounded sx={{ fontSize: 16 }} />
          )}
        {navBtn("回跳到上一页", goBack, !canGoBack, <UndoRounded sx={{ fontSize: 16 }} />)}
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 16 }} />
        {navBtn(
          "适应宽度 / 适应页面大小",
          toggleFit,
          false,
          pdfViewer?.currentScaleValue === "page-width" ? (
            <FitScreenRounded sx={{ fontSize: 16 }} />
          ) : (
            <AspectRatioRounded sx={{ fontSize: 16 }} />
          )
        )}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.25,
            ml: 0.5,
            px: 0.5,
            py: 0.25,
            borderRadius: 1,
            bgcolor: "action.hover",
            color: "text.secondary"
          }}>
          {navBtn("缩小", () => applyZoom(1 / 1.1), false, <RemoveRounded sx={{ fontSize: 16 }} />)}
          <Typography
            title="适应宽度"
            onClick={() => {
              if (pdfViewer) pdfViewer.currentScaleValue = "page-width"
            }}
            sx={{
              fontSize: "0.75rem",
              minWidth: 38,
              textAlign: "center",
              cursor: "pointer",
              "&:hover": { color: "primary.main" }
            }}>
            {zoomPct}%
          </Typography>
          {navBtn("放大", () => applyZoom(1.1), false, <AddRounded sx={{ fontSize: 16 }} />)}
        </Box>
      </Box>
      {/* center: page indicator */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <TextField
          size="small"
          variant="outlined"
          type="number"
          value={editingJump ? jumpDraft : String(page)}
          inputProps={{ min: 1, max: pageCount, step: 1 }}
          onFocus={(e) => {
            setJumpDraft(String(page))
            setEditingJump(true)
            e.target.select()
          }}
          onChange={(e) => setJumpDraft(e.target.value)}
          onBlur={() => {
            setEditingJump(false)
            setJumpDraft("")
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && jumpDraft !== "") {
              const n = Number(jumpDraft)
              if (Number.isInteger(n) && n >= 1 && n <= pageCount) goTo(n)
              setEditingJump(false)
              setJumpDraft("")
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          sx={{
            width: 52,
            "& .MuiOutlinedInput-root": {
              borderRadius: 1,
              fontSize: "0.8rem",
              px: 0.5
            },
            "& input": { textAlign: "center", p: "6px 4px" }
          }}
        />
        <Typography
          variant="caption"
          sx={{ fontSize: "0.75rem", color: "text.disabled", whiteSpace: "nowrap" }}>
          / {pageCount}
        </Typography>
      </Box>
      {/* right: region annotation tools + search */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 0.5
        }}>
        {LIME_REGION_TOOL_NAMES.map((name) => {
          const selected = activeTool === name
          const Icon = REGION_ICONS[name]
          return (
            <Tooltip key={name} title={TOOL_LABELS[name]}>
              <IconButton
                size="small"
                onClick={() => handleTool(name)}
                sx={{
                  p: 0.5,
                  color: selected ? "primary.main" : "text.secondary",
                  bgcolor: selected ? "action.selected" : "transparent",
                  "&:hover": { color: "primary.main" }
                }}>
                <Icon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )
        })}
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 16 }} />
        {onSearchClick &&
          navBtn("搜索全文", () => onSearchClick?.(), false, <SearchRounded sx={{ fontSize: 16 }} />)}
      </Box>
    </Box>
  )
}
