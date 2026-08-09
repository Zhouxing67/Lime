import { useMemo, useRef, useState } from "react"
import { Box, TextField, Typography } from "@mui/material"
import TextFieldsRoundedIcon from "@mui/icons-material/TextFieldsRounded"

import MarkdownRenderer from "./MarkdownRenderer"

export type EditorView = "edit" | "split" | "preview"

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

/** A markdown FIELD (no toolbar — the tools live in the workspace's top bar).
 *  Source pane = a native mono textarea (cursor/char always aligned); preview
 *  pane shares the SAME MarkdownRenderer the cards use. The split has a
 *  draggable divider; the source width is a fixed percentage of the row. */
export default function MarkdownEditor({
  value,
  onChange,
  minRows = 6,
  view,
  registerRef,
  onFocusChange,
  autoFocus = false,
  placeholder
}: {
  value: string
  onChange: (v: string) => void
  minRows?: number
  view: EditorView
  registerRef: (el: HTMLTextAreaElement | null) => void
  onFocusChange?: (focused: boolean) => void
  autoFocus?: boolean
  placeholder?: string
}) {
  const localRef = useRef<HTMLTextAreaElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ startX: number; startRatio: number } | null>(null)
  const [splitRatio, setSplitRatio] = useState(0.5)

  const setRef = (el: HTMLTextAreaElement | null) => {
    localRef.current = el
    registerRef(el)
  }

  const onDividerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const target = e.currentTarget
    try {
      target.setPointerCapture(e.pointerId)
    } catch {
      /* pointer capture is best-effort */
    }
    const width = rootRef.current?.getBoundingClientRect().width ?? 1
    dragRef.current = { startX: e.clientX, startRatio: splitRatio }
    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const ratio = Math.min(
        0.8,
        Math.max(0.2, dragRef.current.startRatio + dx / width)
      )
      setSplitRatio(ratio)
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  const preview = useMemo(() => {
    if (view === "edit") return null
    return (
      <Box
        sx={{
          position: "relative",
          flex: "1 1 0",
          minWidth: 0,
          height: "100%",
          px: 2.5,
          py: 1.5,
          borderLeft: view === "split" ? "1px solid" : "none",
          borderColor: "divider",
          overflow: "auto",
          fontSize: "0.9rem",
          lineHeight: 1.8
        }}>
        {value.trim() ? (
          <Box sx={{ "& > div > :first-child": { mt: 0 } }}>
            <MarkdownRenderer content={value} />
          </Box>
        ) : (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              minHeight: 120,
              gap: 1,
              color: "text.disabled"
            }}>
            <TextFieldsRoundedIcon sx={{ fontSize: 28, opacity: 0.6 }} />
            <Typography variant="caption">预览将显示在右侧</Typography>
          </Box>
        )}
      </Box>
    )
  }, [view, value])

  const showSource = view !== "preview"
  const showPreview = view !== "edit"

  return (
    <Box
      ref={rootRef}
      sx={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        display: "flex",
        alignItems: "stretch"
      }}>
      {showSource && (
        <Box
          sx={{
            position: "relative",
            flex: view === "split" ? `0 0 ${splitRatio * 100}%` : "1 1 0",
            minWidth: 0,
            height: "100%",
            overflow: "hidden"
          }}>
          {!value.trim() && placeholder && (
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                color: "text.disabled",
                pointerEvents: "none",
                zIndex: 1
              }}>
              <TextFieldsRoundedIcon sx={{ fontSize: 28, opacity: 0.6 }} />
              <Typography variant="caption">{placeholder}</Typography>
            </Box>
          )}
          <TextField
            inputRef={setRef}
            multiline
            minRows={minRows}
            fullWidth
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => onFocusChange?.(true)}
            onBlur={() => onFocusChange?.(false)}
            autoFocus={autoFocus}
            variant="standard"
            sx={{
              width: "100%",
              height: "100%",
              fontFamily: MONO,
              fontSize: "0.85rem",
              "& .MuiInputBase-root": {
                height: "100%",
                p: 1.5,
                alignItems: "flex-start",
                lineHeight: 1.8,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word"
              },
              "& .MuiInputBase-root::before, & .MuiInputBase-root::after": {
                display: "none"
              }
            }}
          />
        </Box>
      )}
      {showSource && showPreview && (
        <Box
          onPointerDown={onDividerPointerDown}
          sx={{
            width: 4,
            cursor: "col-resize",
            flexShrink: 0,
            bgcolor: "transparent",
            position: "relative",
            alignSelf: "stretch",
            touchAction: "none",
            "&::after": {
              content: '""',
              position: "absolute",
              top: 0,
              bottom: 0,
              left: "50%",
              transform: "translateX(-50%)",
              width: 1,
              bgcolor: "divider"
            },
            "&:hover::after": { bgcolor: "primary.main" }
          }}
        />
      )}
      {showPreview && preview}
    </Box>
  )
}
