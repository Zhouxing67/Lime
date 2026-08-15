import CheckRoundedIcon from "@mui/icons-material/CheckRounded"
import CloudDoneRoundedIcon from "@mui/icons-material/CloudDoneRounded"
import CloudSyncRoundedIcon from "@mui/icons-material/CloudSyncRounded"
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded"
import FunctionsRoundedIcon from "@mui/icons-material/FunctionsRounded"
import PaletteRoundedIcon from "@mui/icons-material/PaletteRounded"
import TextFieldsRoundedIcon from "@mui/icons-material/TextFieldsRounded"
import {
  Box,
  Button,
  CircularProgress,
  DialogActions,
  Stack,
  Switch,
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
  const [mathHoverEnabled, setMathHover] = useState(true)
  const [ballEnabled, setBallEnabled] = useState(true)
  const [hiddenHostCount, setHiddenHostCount] = useState(0)

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
    chrome.storage.local.get("mathHoverEnabled", (data) => {
      setMathHover(data.mathHoverEnabled !== false)
    })
    chrome.storage.local.get(
      ["floatBallEnabled", "floatBallHiddenHosts"],
      (data) => {
        setBallEnabled(data.floatBallEnabled !== false)
        setHiddenHostCount((data.floatBallHiddenHosts ?? []).length)
      }
    )
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
        <DialogActions sx={{ px: 3, py: 2 }}>
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
        <Stack direction="row" spacing={1}>
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
        </Stack>
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
          上传/下载请在「备份」视图中进行。
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
                      transition: "all 0.2s ease",
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

        <Box
          sx={{
            mt: 2,
            pt: 2,
            borderTop: "1px solid",
            borderColor: "divider",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
          <Box>
            <Typography
              variant="subtitle2"
              sx={{ color: "text.secondary", fontSize: "0.85rem" }}>
              <FunctionsRoundedIcon
                sx={{ fontSize: 16, mr: 0.5, verticalAlign: "text-bottom" }}
              />
              悬停公式高亮
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: "text.disabled", display: "block", mt: 0.5 }}>
              阅读页面悬停公式时显示柔和底色，便于 Alt+S 捕获公式
            </Typography>
          </Box>
          <Switch
            checked={mathHoverEnabled}
            onChange={(e) => {
              setMathHover(e.target.checked)
              chrome.storage.local.set({
                mathHoverEnabled: e.target.checked
              })
            }}
          />
        </Box>

        <Box
          sx={{
            mt: 2,
            pt: 2,
            borderTop: "1px solid",
            borderColor: "divider",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
          <Box>
            <Typography
              variant="subtitle2"
              sx={{ color: "text.secondary", fontSize: "0.85rem" }}>
              <TextFieldsRoundedIcon
                sx={{ fontSize: 16, mr: 0.5, verticalAlign: "text-bottom" }}
              />
              页面悬浮球
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: "text.disabled", display: "block", mt: 0.5 }}>
              网页右下角的 Lime 捕获入口（可拖动记忆位置；Alt+S 不受此开关影响）
            </Typography>
          </Box>
          <Switch
            checked={ballEnabled}
            onChange={(e) => {
              setBallEnabled(e.target.checked)
              chrome.storage.local.set({
                floatBallEnabled: e.target.checked
              })
            }}
          />
        </Box>
        {hiddenHostCount > 0 && (
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                chrome.storage.local.set({ floatBallHiddenHosts: [] })
                setHiddenHostCount(0)
              }}
              sx={{ borderRadius: 1, fontSize: "0.8rem" }}>
              恢复已隐藏悬浮球的站点（{hiddenHostCount}）
            </Button>
          </Box>
        )}
      </Stack>
    </DialogShell>
  )
}
