import { useCallback, useEffect, useRef, useState } from "react"
import {
  Divider,
  IconButton,
  Paper,
  Popper,
  Tooltip
} from "@mui/material"
import {
  BorderColorRounded,
  ContentCopyRounded,
  FormatUnderlinedRounded,
  StrikethroughSRounded
} from "@mui/icons-material"

import { usePainter } from "~/src/pdf/inklayer/extensions/annotator/context/use_painter"
import { TOOL_LABELS, toolDef } from "./tools"

/** Our MUI text-selection bar — highlight/underline/strikeout on the range. */
export default function EngineSelectionBar({ range }: { range: Range | null }) {
  const { painter } = usePainter()
  const anchorRef = useRef<HTMLDivElement>(null)
  const [anchorPos, setAnchorPos] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
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
            boxShadow: (t) => t.custom.cardShadow,
            border: 1,
            borderColor: "divider"
          }}
        >
          {(["highlight", "underline", "strikeout"] as const).map((name) => {
            const Icon =
              name === "highlight"
                ? BorderColorRounded
                : name === "underline"
                  ? FormatUnderlinedRounded
                  : StrikethroughSRounded
            return (
              <Tooltip key={name} title={TOOL_LABELS[name]}>
                <IconButton size="small" onClick={() => apply(name)} sx={{ color: "text.secondary" }}>
                  <Icon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )
          })}
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Tooltip title="复制">
            <IconButton
              size="small"
              onClick={() => {
                const text = range?.toString() ?? ""
                if (!text) return
                void navigator.clipboard
                  ?.writeText(text)
                  .catch(() => {
                    const ta = document.createElement("textarea")
                    ta.value = text
                    document.body.append(ta)
                    ta.select()
                    document.execCommand("copy")
                    ta.remove()
                  })
              }}
              sx={{ color: "text.secondary" }}>
              <ContentCopyRounded sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Paper>
      </Popper>
    </>
  )
}
