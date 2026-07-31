import CheckRoundedIcon from "@mui/icons-material/CheckRounded"
import CloudDoneRoundedIcon from "@mui/icons-material/CloudDoneRounded"
import CloudSyncRoundedIcon from "@mui/icons-material/CloudSyncRounded"
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded"
import PaletteRoundedIcon from "@mui/icons-material/PaletteRounded"
import {
  Box,
  Button,
  CircularProgress,
  DialogActions,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material"
import { useEffect, useState } from "react"

import { palettes } from "../theme"
import type { PresetName } from "../types"
import { PRESET_LABELS } from "../types"
import { testConnection } from "../utils/sync"
import type { SyncCredentials } from "../utils/sync"
import DialogShell from "./DialogShell"

export default function SettingsDialog({
  open,
  onClose,
  preset,
  onPresetChange
}: {
  open: boolean
  onClose: () => void
  preset: PresetName
  onPresetChange: (name: PresetName) => void
}) {
  const [username, setUsername] = useState("")
  const [appPassword, setAppPassword] = useState("")
  const [lastSync, setLastSync] = useState("")
  const [status, setStatus] = useState<{
    type: "idle" | "loading" | "success" | "error"
    text: string
  }>({ type: "idle", text: "" })
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (!open) return
    chrome.storage.sync.get(["syncUsername", "syncPassword"], (data) => {
      if (data.syncUsername) setUsername(data.syncUsername)
      if (data.syncPassword) setAppPassword(data.syncPassword)
    })
    chrome.storage.local.get("lastSyncTime", (data) => {
      setLastSync(
        data.lastSyncTime
          ? new Date(data.lastSyncTime).toLocaleString("zh-CN")
          : "从未同步"
      )
    })
  }, [open])

  const saveCredentials = (u: string, p: string) => {
    chrome.storage.sync.set({ syncUsername: u, syncPassword: p })
  }

  const cred = (): SyncCredentials | null => {
    if (!username || !appPassword) {
      setStatus({ type: "error", text: "请填写用户名和 App 密码" })
      return null
    }
    return { username, appPassword }
  }

  const handleTest = async () => {
    const c = cred()
    if (!c) return
    setTesting(true)
    setStatus({ type: "loading", text: "连接测试中…" })
    const result = await testConnection(c)
    setTesting(false)
    setStatus({ type: result.ok ? "success" : "error", text: result.message })
    if (result.ok) saveCredentials(username, appPassword)
  }

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      maxWidth="sm"
      title={
        <Stack direction="row" spacing={1} alignItems="center">
          <CloudSyncRoundedIcon sx={{ fontSize: 20, color: "primary.main" }} />
          <span>设置</span>
        </Stack>
      }
      actions={
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} sx={{ borderRadius: 1 }}>
            关闭
          </Button>
        </DialogActions>
      }>
      <Typography
        variant="subtitle2"
        sx={{ mb: 1.5, color: "text.secondary", fontSize: "0.85rem" }}>
        <CloudDoneRoundedIcon
          sx={{ fontSize: 16, mr: 0.5, verticalAlign: "text-bottom" }}
        />
        坚果云同步
      </Typography>

      <Stack spacing={1.5}>
        <TextField
          fullWidth
          size="small"
          label="坚果云用户名（邮箱）"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1 } }}
        />
        <TextField
          fullWidth
          size="small"
          type="password"
          label="App 密码"
          value={appPassword}
          onChange={(e) => setAppPassword(e.target.value)}
          sx={{ "& .MuiOutlinedInput-root": { borderRadius: 1 } }}
        />
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="outlined"
            disabled={testing}
            onClick={handleTest}
            sx={{ borderRadius: 1 }}>
            {testing ? "测试中…" : "测试连接"}
          </Button>
        </Stack>

        {status.type !== "idle" && (
          <Typography
            variant="caption"
            sx={{
              display: "block",
              mt: 0.5,
              color:
                status.type === "success"
                  ? "success.main"
                  : status.type === "error"
                    ? "error.main"
                    : "text.secondary"
            }}>
            {status.type === "loading" && (
              <CircularProgress
                size={12}
                sx={{ mr: 0.5, verticalAlign: "middle" }}
              />
            )}
            {status.type === "success" && (
              <CheckRoundedIcon
                sx={{ fontSize: 14, mr: 0.5, verticalAlign: "middle" }}
              />
            )}
            {status.type === "error" && (
              <ErrorOutlineRoundedIcon
                sx={{ fontSize: 14, mr: 0.5, verticalAlign: "middle" }}
              />
            )}
            {status.text}
          </Typography>
        )}

        <Typography
          variant="caption"
          sx={{ color: "text.disabled", display: "block" }}>
          上次同步：{lastSync}
        </Typography>

        <Typography
          variant="caption"
          sx={{
            color: "text.disabled",
            display: "block",
            mt: 1,
            fontSize: "0.65rem",
            lineHeight: 1.6
          }}>
          App 密码请在坚果云网页端「账户信息 → 安全选项」中生成。
          <br />
          上传/下载操作请在侧栏「备份与同步」中进行。
        </Typography>

        <Box
          sx={{
            mt: 2,
            pt: 2,
            borderTop: "1px solid",
            borderColor: "divider"
          }}>
          <Typography
            variant="subtitle2"
            sx={{ mb: 1.5, color: "text.secondary", fontSize: "0.85rem" }}>
            <PaletteRoundedIcon
              sx={{ fontSize: 16, mr: 0.5, verticalAlign: "text-bottom" }}
            />
            主题配色
          </Typography>
          <Stack direction="row" spacing={2} alignItems="center">
            {(Object.keys(PRESET_LABELS) as PresetName[]).map((name) => (
              <Tooltip key={name} title={PRESET_LABELS[name]}>
                <Stack
                  alignItems="center"
                  spacing={0.5}
                  sx={{ cursor: "pointer" }}
                  onClick={() => onPresetChange(name)}>
                  <Box
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      transition: "all 0.2s",
                      "&:hover": { transform: "scale(1.15)" },
                      border: "2px solid",
                      borderColor:
                        preset === name ? "primary.main" : "transparent",
                      bgcolor: palettes[name].primary.main
                    }}
                  />
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: "0.6rem",
                      color:
                        preset === name ? "primary.main" : "text.disabled",
                      fontWeight: preset === name ? 600 : 400
                    }}>
                    {PRESET_LABELS[name]}
                  </Typography>
                </Stack>
              </Tooltip>
            ))}
          </Stack>
        </Box>
      </Stack>
    </DialogShell>
  )
}
