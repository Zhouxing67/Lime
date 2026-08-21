import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded"
import EditRoundedIcon from "@mui/icons-material/EditRounded"
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  TextField,
  Tooltip,
  Typography
} from "@mui/material"
import { useCallback, useEffect, useRef, useState } from "react"

import AiFloatingCard from "./AiFloatingCard"
import type { AiInterpretResponse } from "./AiInterpretDialog"

export function isVocabularyCandidate(text: string): boolean {
  const normalized = text.trim().replace(/\s+/g, " ")
  if (!normalized || normalized.length > 80) return false
  if (/[。！？.!?；;\n]/.test(normalized)) return false
  const words = normalized.match(/[\p{L}\p{N}]+/gu) ?? []
  return words.length <= 12
}

export default function AiTranslatePopover({
  range,
  anchorEl,
  onTranslate,
  onCancel,
  onAddVocabulary,
  onAddAnnotation,
  onClose
}: {
  range: Range
  anchorEl: HTMLElement | null
  onTranslate: (text: string, requestId: string) => Promise<AiInterpretResponse>
  onCancel: (requestId: string) => Promise<void>
  onAddVocabulary?: (range: Range, translation: string) => Promise<void>
  onAddAnnotation?: (range: Range, translation: string) => void
  onClose: () => void
}) {
  const source = range.toString().trim()
  const canAdd = Boolean(onAddVocabulary && isVocabularyCandidate(source))
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  )
  const [translation, setTranslation] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [editing, setEditing] = useState(false)
  const requestIdRef = useRef<string | null>(null)
  const startedRef = useRef(false)

  const run = useCallback(async () => {
    const id = crypto.randomUUID()
    requestIdRef.current = id
    setStatus("loading")
    setError("")
    try {
      const response = await onTranslate(source, id)
      if (requestIdRef.current !== id) return
      if (response.ok && response.text) {
        setTranslation(response.text)
        setStatus("success")
      } else if (!response.cancelled) {
        setError(response.error ?? "翻译失败")
        setStatus("error")
      }
    } catch (reason) {
      if (requestIdRef.current !== id) return
      setError((reason as Error)?.message ?? "AI 服务连接失败")
      setStatus("error")
    }
  }, [onTranslate, source])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void run()
  }, [run])

  const close = () => {
    const id = requestIdRef.current
    requestIdRef.current = null
    if (status === "loading" && id) void onCancel(id)
    onClose()
  }

  return (
    <AiFloatingCard
      anchorEl={anchorEl}
      title="即时翻译"
      onClose={close}>
      <Box sx={{ mb: 1.5 }}>
        <Typography sx={{ color: "text.secondary", fontSize: "0.7rem", mb: 0.25 }}>原文</Typography>
        <Typography sx={(theme) => ({ color: "text.secondary", fontFamily: theme.custom.serif, fontSize: "0.75rem", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" })}>
          {source}
        </Typography>
      </Box>
      {status === "loading" && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 1 }}>
          <CircularProgress size={15} />
          <Typography sx={{ color: "text.secondary", fontSize: "0.78rem" }}>
            正在翻译…
          </Typography>
        </Box>
      )}
      {status === "error" && (
        <Box>
          <Typography sx={{ color: "error.main", fontSize: "0.76rem", mb: 1 }}>
            {error}
          </Typography>
          <Button size="small" onClick={() => void run()}>
            重试
          </Button>
        </Box>
      )}
      {status === "success" && (
        <>
          <Box>
            <Typography sx={{ color: "text.secondary", fontSize: "0.7rem", mb: 0.5 }}>译文</Typography>
            {editing ? (
              <TextField autoFocus value={translation} onChange={(event) => setTranslation(event.target.value)} fullWidth multiline minRows={2} maxRows={7} size="small" />
            ) : (
              <Typography sx={(theme) => ({ fontFamily: theme.custom.serif, fontSize: "0.9rem", lineHeight: 1.75, whiteSpace: "pre-wrap", maxHeight: 190, overflowY: "auto" })}>{translation}</Typography>
            )}
          </Box>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              gap: 0.75,
              mt: 1.5,
              pt: 1.25,
              borderTop: "1px solid",
              borderColor: "divider"
            }}>
            <Box sx={{ display: "flex", gap: 0.35 }}>
              <Tooltip title="复制译文">
                <IconButton size="small" onClick={() => void navigator.clipboard.writeText(translation)} sx={{ p: 0.75 }}><ContentCopyRoundedIcon sx={{ fontSize: 16 }} /></IconButton>
              </Tooltip>
              <Tooltip title={editing ? "完成编辑" : "编辑译文"}>
                <IconButton size="small" onClick={() => setEditing((value) => !value)} sx={{ p: 0.75 }}><EditRoundedIcon sx={{ fontSize: 16 }} /></IconButton>
              </Tooltip>
            </Box>
            <Box sx={{ display: "flex", gap: 0.65 }}>
              {canAdd && (
              <Button
                size="small"
                variant={onAddAnnotation ? "text" : "contained"}
                disabled={saving}
                onClick={async () => {
                  if (!onAddVocabulary) return
                  setSaving(true)
                  setSaveError("")
                  try {
                    await onAddVocabulary(range, translation)
                    close()
                  } catch (reason) {
                    setSaveError((reason as Error)?.message ?? "加入生词卡失败")
                  } finally {
                    setSaving(false)
                  }
                }}>
                {saving ? "加入中…" : "加入生词"}
              </Button>
              )}
              {onAddAnnotation && (
              <Button
                size="small"
                variant="contained"
                disabled={!translation.trim()}
                onClick={() => {
                  onAddAnnotation(range, translation.trim())
                  close()
                }}>
                生成高亮批注
              </Button>
              )}
            </Box>
          </Box>
          {saveError && (
            <Typography
              sx={{ color: "error.main", fontSize: "0.72rem", mt: 0.5 }}>
              {saveError}
            </Typography>
          )}
        </>
      )}
    </AiFloatingCard>
  )
}
