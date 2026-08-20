import { Button, CircularProgress, DialogActions, TextField, Typography } from "@mui/material"
import { useCallback, useEffect, useRef, useState } from "react"

import DialogShell from "../DialogShell"

export interface AiInterpretResponse {
  ok: boolean
  text?: string
  error?: string
  cancelled?: boolean
}

export default function AiInterpretDialog({
  range,
  onClose,
  onInterpret,
  onCancel,
  onApply
}: {
  range: Range
  onClose: () => void
  onInterpret: (text: string, requestId: string) => Promise<AiInterpretResponse>
  onCancel: (requestId: string) => Promise<void>
  onApply: (range: Range, comment: string) => void
}) {
  const [requestId, setRequestId] = useState<string | null>(null)
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [result, setResult] = useState("")
  const [error, setError] = useState("")
  const startedRef = useRef(false)

  const run = useCallback(async () => {
    const id = crypto.randomUUID()
    setRequestId(id)
    setStatus("loading")
    setError("")
    const response = await onInterpret(range.toString().trim(), id)
    setRequestId((current) => {
      if (current !== id) return current
      if (response.ok && response.text) {
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
    <DialogShell
      open
      onClose={close}
      title="AI 解读"
      maxWidth="sm"
      actions={
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={close}>{status === "loading" ? "取消请求" : "关闭"}</Button>
          {(status === "idle" || status === "error") && (
            <Button variant="contained" onClick={() => void run()}>
              {status === "error" ? "重试" : "开始解读"}
            </Button>
          )}
          {status === "success" && (
            <>
              <Button onClick={() => void run()}>重新生成</Button>
              <Button
                variant="contained"
                disabled={!result.trim()}
                onClick={() => {
                  onApply(range, result.trim())
                  close()
                }}>
                生成高亮批注
              </Button>
            </>
          )}
        </DialogActions>
      }>
      <TextField
        label="选中原文"
        value={range.toString().trim()}
        fullWidth
        multiline
        minRows={2}
        slotProps={{ input: { readOnly: true } }}
        sx={{ mb: 2 }}
      />
      {status === "loading" && (
        <Typography
          color="text.secondary"
          sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <CircularProgress size={16} /> 正在生成解读…
        </Typography>
      )}
      {status === "error" && <Typography color="error.main">{error}</Typography>}
      {status === "success" && (
        <TextField
          label="AI 解读"
          value={result}
          onChange={(event) => setResult(event.target.value)}
          fullWidth
          multiline
          minRows={6}
        />
      )}
    </DialogShell>
  )
}
