import AddRoundedIcon from "@mui/icons-material/AddRounded"
import {
  Box,
  Button,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Typography
} from "@mui/material"
import { createTheme, ThemeProvider } from "@mui/material/styles"
import { useEffect, useState } from "react"

import {
  addItem,
  addProject,
  getProjectByName,
  listProjects
} from "../database"
import type { Item, Project } from "../types"
import { sendMessage } from "../types/messages"
import { createItem } from "../utils"

interface PendingCapture {
  type: Item["type"]
  content: string
  source: { title: string; url: string; site?: string }
}

export default function NewProjectPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingCapture | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    chrome.storage.session.get("pendingCapture", async (res) => {
      const data = (res as { pendingCapture?: PendingCapture }).pendingCapture
      if (!data) {
        setError("未获取到捕获内容，请重试")
        return
      }
      setPending(data)
      const list = await listProjects()
      setProjects(list)
    })
  }, [])

  const saveAndClose = async (projectId: string, projectName: string) => {
    if (!pending) return
    setBusy(true)
    const item = createItem({
      type: pending.type,
      content: pending.content,
      source: pending.source,
      projectId
    })
    const saved = await addItem(item)
    const result = await chrome.storage.session.get("pendingTabId")
    const tabId = (result as { pendingTabId?: number }).pendingTabId

    // Delegate toast to the background SW
    sendMessage({
      kind: "save-feedback",
      tabId,
      saved,
      type: pending.type,
      projectName
    }).catch(() => {})

    chrome.storage.session.remove("pendingCapture")
    chrome.storage.session.remove("pendingTabId")
    window.close()
  }

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError("项目名不能为空")
      return
    }
    const existing = await getProjectByName(trimmed)
    const project = existing ?? {
      id: crypto.randomUUID(),
      name: trimmed,
      createdAt: Date.now()
    }
    if (!existing) await addProject(project)
    await saveAndClose(project.id, project.name)
  }

  const theme = createTheme({ palette: { mode: "light" } })

  return (
    <ThemeProvider theme={theme}>
      <Box
        sx={{
          p: 3,
          width: 460,
          minHeight: 380,
          bgcolor: "background.default"
        }}>
        <Typography variant="h6" sx={{ fontWeight: 400, mb: 0.5 }}>
          新建项目并加入
        </Typography>
        {pending && (
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mb: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}>
            {pending.type === "text"
              ? pending.content
              : pending.type === "link"
                ? pending.content
                : pending.type === "image"
                  ? "[图片]"
                  : "[网页快照]"}
            {" · "}
            {pending.source.title || (pending.source?.url ?? "")}
          </Typography>
        )}

        <TextField
          autoFocus
          fullWidth
          size="small"
          label="项目名称"
          value={name}
          error={Boolean(error)}
          helperText={error}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate()
          }}
          sx={{ mb: 2 }}
        />

        <Button
          fullWidth
          variant="contained"
          disabled={busy}
          onClick={handleCreate}
          sx={{ borderRadius: 1.5, mb: 3 }}>
          <AddRoundedIcon sx={{ fontSize: 16, mr: 0.5 }} />
          创建并加入
        </Button>

        {projects.length > 0 && (
          <>
            <Typography
              variant="caption"
              sx={{ color: "text.secondary", letterSpacing: "0.05em" }}>
              或加入已有项目
            </Typography>
            <List dense sx={{ mt: 0.5 }}>
              {projects.map((p) => (
                <ListItemButton
                  key={p.id}
                  disabled={busy}
                  onClick={() => saveAndClose(p.id, p.name)}>
                  <ListItemText primary={p.name} />
                </ListItemButton>
              ))}
            </List>
          </>
        )}
      </Box>
    </ThemeProvider>
  )
}
