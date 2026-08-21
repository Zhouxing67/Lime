import {
  Box,
  Button,
  CircularProgress,
  TextField,
  Typography
} from "@mui/material"
import { useCallback, useEffect, useRef, useState } from "react"

import AiFloatingCard from "./AiFloatingCard"

export interface AiInterpretResponse {
  ok: boolean
  text?: string
  error?: string
  cancelled?: boolean
}

/** Historical filename retained; the UI is now the shared non-modal AI card. */
export default function AiInterpretDialog({
  range,
  anchorEl,
  onClose,
  onInterpret,
  onCancel,
  onApply
}: {
  range: Range
  anchorEl: HTMLElement | null
  onClose: () => void
  onInterpret: (text: string, requestId: string) => Promise<AiInterpretResponse>
  onCancel: (requestId: string) => Promise<void>
  onApply: (range: Range, comment: string) => void
}) {
  const [requestId, setRequestId] = useState<string | null>(null)
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle")
  const [result, setResult] = useState("")
  const [error, setError] = useState("")
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [editing, setEditing] = useState(false)
  const startedRef = useRef(false)
  const generatedResultRef = useRef("")

  const run = useCallback(async () => {
    const id = crypto.randomUUID()
    setRequestId(id)
    setStatus("loading")
    setError("")
    setConfirmRegenerate(false)
    try {
      const response = await onInterpret(range.toString().trim(), id)
      setRequestId((current) => {
        if (current !== id) return current
        if (response.ok && response.text) {
          generatedResultRef.current = response.text
          setResult(response.text)
          setStatus("success")
        } else if (response.cancelled) {
          setStatus("idle")
        } else {
          setError(response.error ?? "AI 解读失败")
          setStatus("error")
        }
        return current
      })
    } catch (reason) {
      setRequestId((current) => {
        if (current !== id) return current
        setError((reason as Error)?.message ?? "AI 服务连接失败")
        setStatus("error")
        return current
      })
    }
  }, [onInterpret, range])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void run()
  }, [run])

  const close = () => {
    if (status === "loading" && requestId) void onCancel(requestId)
    setRequestId(null)
    onClose()
  }

  return (
    <AiFloatingCard
      anchorEl={anchorEl}
      title="AI 解读"
      onClose={close}
      width={420}>
      <Box sx={{ mb: 1.5 }}>
        <Typography sx={{ color: "text.secondary", fontSize: "0.7rem", mb: 0.25 }}>原文</Typography>
        <Typography sx={(theme) => ({ color: "text.secondary", fontFamily: theme.custom.serif, fontSize: "0.75rem", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" })}>
          {range.toString().trim()}
        </Typography>
      </Box>
      {status === "loading" && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 1 }}>
          <CircularProgress size={15} />
          <Typography sx={{ color: "text.secondary", fontSize: "0.78rem" }}>
            正在生成解读…
          </Typography>
        </Box>
      )}
      {(status === "idle" || status === "error") && (
        <Box>
          {error && (
            <Typography
              sx={{ color: "error.main", fontSize: "0.76rem", mb: 1 }}>
              {error}
            </Typography>
          )}
          <Button size="small" variant="contained" onClick={() => void run()}>
            {status === "error" ? "重试" : "开始解读"}
          </Button>
        </Box>
      )}
      {status === "success" && (
        <>
          <Box>
            <Typography sx={{ color: "text.secondary", fontSize: "0.7rem", mb: 0.5 }}>AI 解读</Typography>
            {editing ? (
              <TextField autoFocus value={result} onChange={(event) => setResult(event.target.value)} fullWidth multiline minRows={4} maxRows={10} size="small" />
            ) : (
              <Typography sx={(theme) => ({ fontFamily: theme.custom.serif, fontSize: "0.9rem", lineHeight: 1.75, whiteSpace: "pre-wrap", maxHeight: 300, overflowY: "auto" })}>{result}</Typography>
            )}
          </Box>
          {confirmRegenerate && (
            <Typography
              sx={{ color: "warning.main", fontSize: "0.72rem", mt: 1 }}>
              当前修改会被覆盖。再次点击“覆盖并重新生成”以确认。
            </Typography>
          )}
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
            <Box sx={{ display: "flex", gap: 0.25 }}>
              <Button size="small" color="inherit" onClick={() => setEditing((value) => !value)}>{editing ? "完成编辑" : "编辑"}</Button>
              <Button size="small" color="inherit" onClick={() => {
                if (
                  result !== generatedResultRef.current &&
                  !confirmRegenerate
                ) {
                  setConfirmRegenerate(true)
                } else {
                  void run()
                }
              }}>
                {confirmRegenerate ? "覆盖并重新生成" : "重新生成"}
              </Button>
            </Box>
            <Button
              size="small"
              variant="contained"
              disabled={!result.trim()}
              onClick={() => {
                onApply(range, result.trim())
                close()
              }}>
              生成高亮批注
            </Button>
          </Box>
        </>
      )}
    </AiFloatingCard>
  )
}
