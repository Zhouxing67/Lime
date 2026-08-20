import {
  BorderColorRounded,
  ContentCopyRounded,
  FormatUnderlinedRounded,
  StrikethroughSRounded
} from "@mui/icons-material"
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded"
import TranslateRoundedIcon from "@mui/icons-material/TranslateRounded"
import { Divider, IconButton, Paper, Popper, Tooltip } from "@mui/material"
import { useCallback, useEffect, useRef, useState } from "react"

import { usePainter } from "~/src/pdf/inklayer/extensions/annotator/context/use_painter"

import AiInterpretDialog, {
  type AiInterpretResponse
} from "./AiInterpretDialog"
import AiTranslatePopover from "./AiTranslatePopover"
import { TOOL_LABELS, toolDef } from "./tools"

/** Our MUI text-selection bar — highlight/underline/strikeout on the range. */
export default function EngineSelectionBar({
  range,
  onAddVocabulary,
  onAiTranslate,
  onAiInterpret,
  onAiCancel,
  onApplyAiInterpretation
}: {
  range: Range | null
  onAddVocabulary?: (range: Range, translation: string) => Promise<void>
  onAiTranslate?: (
    text: string,
    requestId: string
  ) => Promise<AiInterpretResponse>
  onAiInterpret?: (
    text: string,
    requestId: string
  ) => Promise<AiInterpretResponse>
  onAiCancel?: (requestId: string) => Promise<void>
  onApplyAiInterpretation?: (range: Range, comment: string) => void
}) {
  const { painter } = usePainter()
  const anchorRef = useRef<HTMLDivElement>(null)
  const translationAnchorRef = useRef<HTMLDivElement>(null)
  const aiAnchorRef = useRef<HTMLDivElement>(null)
  const [anchorPos, setAnchorPos] = useState<{ x: number; y: number } | null>(
    null
  )
  const [translationRange, setTranslationRange] = useState<Range | null>(null)
  const [translationPos, setTranslationPos] = useState<{
    x: number
    y: number
  } | null>(null)
  const [aiRange, setAiRange] = useState<Range | null>(null)
  const [aiPos, setAiPos] = useState<{ x: number; y: number } | null>(null)
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
      <div
        ref={anchorRef}
        style={{
          position: "absolute",
          left: anchorPos?.x ?? -9999,
          top: anchorPos?.y ?? -9999,
          width: 1,
          height: 1
        }}
      />
      <div
        ref={translationAnchorRef}
        style={{
          position: "fixed",
          left: translationPos?.x ?? -9999,
          top: translationPos?.y ?? -9999,
          width: 1,
          height: 1
        }}
      />
      <div
        ref={aiAnchorRef}
        style={{
          position: "fixed",
          left: aiPos?.x ?? -9999,
          top: aiPos?.y ?? -9999,
          width: 1,
          height: 1
        }}
      />
      <Popper
        open={!!anchorPos && !!range}
        anchorEl={anchorRef.current}
        placement="top"
        modifiers={[{ name: "offset", options: { offset: [0, 8] } }]}>
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
          }}>
          {(["highlight", "underline", "strikeout"] as const).map((name) => {
            const Icon =
              name === "highlight"
                ? BorderColorRounded
                : name === "underline"
                  ? FormatUnderlinedRounded
                  : StrikethroughSRounded
            return (
              <Tooltip key={name} title={TOOL_LABELS[name]}>
                <IconButton
                  size="small"
                  onClick={() => apply(name)}
                  sx={{ color: "text.secondary" }}>
                  <Icon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )
          })}
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          {onAiTranslate && onAiCancel && (
            <Tooltip title="AI 快速翻译">
              <IconButton
                size="small"
                onClick={() => {
                  if (!range || !range.toString().trim()) return
                  const rect = range.getBoundingClientRect()
                  setTranslationRange(range.cloneRange())
                  setTranslationPos({
                    x: rect.left + rect.width / 2,
                    y: rect.top
                  })
                  setAnchorPos(null)
                }}
                sx={{ color: "text.secondary" }}>
                <TranslateRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
          {onAiInterpret && onAiCancel && onApplyAiInterpretation && (
            <Tooltip title="AI 解读">
              <IconButton
                size="small"
                onClick={() => {
                  if (!range || !range.toString().trim()) return
                  const rect = range.getBoundingClientRect()
                  setAiRange(range.cloneRange())
                  setAiPos({ x: rect.left + rect.width / 2, y: rect.top })
                  setAnchorPos(null)
                }}
                sx={{ color: "text.secondary" }}>
                <AutoAwesomeRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="复制">
            <IconButton
              size="small"
              onClick={() => {
                const text = range?.toString() ?? ""
                if (!text) return
                void navigator.clipboard?.writeText(text).catch(() => {
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
      {translationRange && translationPos && onAiTranslate && onAiCancel && (
        <AiTranslatePopover
          range={translationRange}
          anchorEl={translationAnchorRef.current}
          onTranslate={onAiTranslate}
          onCancel={onAiCancel}
          onAddVocabulary={onAddVocabulary}
          onAddAnnotation={onApplyAiInterpretation}
          onClose={() => {
            setTranslationRange(null)
            setTranslationPos(null)
          }}
        />
      )}
      {aiRange &&
        aiPos &&
        onAiInterpret &&
        onAiCancel &&
        onApplyAiInterpretation && (
          <AiInterpretDialog
            range={aiRange}
            anchorEl={aiAnchorRef.current}
            onClose={() => {
              setAiRange(null)
              setAiPos(null)
            }}
            onInterpret={onAiInterpret}
            onCancel={onAiCancel}
            onApply={onApplyAiInterpretation}
          />
        )}
    </>
  )
}
