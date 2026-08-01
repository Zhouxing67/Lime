import CheckRoundedIcon from "@mui/icons-material/CheckRounded"
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import EditRoundedIcon from "@mui/icons-material/EditRounded"
import {
  Box,
  Button,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography
} from "@mui/material"
import { useEffect, useState } from "react"
import type { KeyboardEvent } from "react"

import type { Item } from "../types"
import {
  isTodoComplete,
  markdownCompletedCount,
  markdownTaskCount
} from "../utils"
import MarkdownRenderer from "./MarkdownRenderer"

interface TodoCardProps {
  item: Item
  editing: boolean
  onToggleTask: (index: number) => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: (title: string, content: string) => void
  onDelete: () => void
}

export default function TodoCard({
  item,
  editing,
  onToggleTask,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete
}: TodoCardProps) {
  const [draftTitle, setDraftTitle] = useState(item.title ?? "")
  const [draftContent, setDraftContent] = useState(item.content)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    setDraftTitle(item.title ?? "")
    setDraftContent(item.content)
    setConfirming(false)
  }, [item.id])

  const done = isTodoComplete(item.content)
  const total = markdownTaskCount(item.content)
  const doneCount = markdownCompletedCount(item.content)

  const handleContentKeyDown = (
    e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    if (e.key !== "Enter" || e.shiftKey) return
    e.preventDefault()
    const input = e.currentTarget
    const start = input.selectionStart ?? draftContent.length
    const end = input.selectionEnd ?? start
    const before = draftContent.slice(0, start)
    const currentLine = before.slice(before.lastIndexOf("\n") + 1)
    const prefix = !currentLine.trim() || /^#{1,6}\s+/.test(currentLine) ? "" : "- [ ] "
    const insert = `\n${prefix}`
    setDraftContent(before + insert + draftContent.slice(end))
    requestAnimationFrame(() => {
      input.selectionStart = input.selectionEnd = start + insert.length
    })
  }

  if (editing) {
    return (
      <Paper
        elevation={0}
        sx={(theme) => ({
          p: 2,
          borderRadius: 1,
          border: "1px solid",
          borderColor: "divider",
          boxShadow: theme.custom.cardShadow,
          display: "flex",
          flexDirection: "column",
          gap: 1.5
        })}>
        <TextField
          size="small"
          label="标题（可选）"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          fullWidth
        />
        <TextField
          size="small"
          multiline
          minRows={3}
          placeholder="每行一个任务（无需手动输入 - [ ]）"
          value={draftContent}
          onChange={(e) => setDraftContent(e.target.value)}
          slotProps={{ input: { onKeyDown: handleContentKeyDown } }}
          fullWidth
          sx={{ "& textarea": { fontFamily: (t) => t.custom.serif } }}
        />
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button size="small" onClick={onCancelEdit}>
            取消
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={() => onSave(draftTitle.trim(), draftContent)}>
            保存
          </Button>
        </Stack>
      </Paper>
    )
  }

  return (
    <Paper
      elevation={0}
      onClick={onStartEdit}
      sx={(theme) => ({
        p: 2,
        borderRadius: 1,
        border: "1px solid",
        borderColor: "divider",
        cursor: "pointer",
        boxShadow: theme.custom.cardShadow,
        opacity: done ? 0.55 : 1,
        transition: "all 0.2s",
        "&:hover": {
          boxShadow: theme.custom.cardShadowHover,
          transform: "translateY(-1px)"
        },
        "&:hover .todo-actions": { opacity: 1 }
      })}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography
          variant="body2"
          noWrap
          sx={{
            fontWeight: 600,
            fontFamily: (t) => t.custom.serif,
            flex: 1,
            minWidth: 0,
            textDecoration: done ? "line-through" : "none"
          }}>
          {item.title || "待办"}
        </Typography>
        {done ? (
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <CheckRoundedIcon sx={{ fontSize: 14, color: "success.main" }} />
            <Typography
              variant="caption"
              sx={{ color: "success.main", fontSize: "0.7rem" }}>
              已完成
            </Typography>
          </Stack>
        ) : total > 0 ? (
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", fontSize: "0.7rem" }}>
            {doneCount}/{total}
          </Typography>
        ) : null}
        <Box
          className="todo-actions"
          sx={{
            display: "flex",
            gap: 0.25,
            opacity: 0,
            transition: "opacity 0.15s"
          }}
          onClick={(e) => e.stopPropagation()}>
          <IconButton size="small" onClick={onStartEdit}>
            <EditRoundedIcon sx={{ fontSize: 14 }} />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => {
              if (confirming) onDelete()
              else setConfirming(true)
            }}
            sx={{ color: confirming ? "error.main" : undefined }}>
            <DeleteOutlineRoundedIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
      </Stack>
      <Box onClick={(e) => e.stopPropagation()}>
        <MarkdownRenderer content={item.content} onToggleTask={onToggleTask} />
      </Box>
      <Typography
        variant="caption"
        sx={{ color: "text.disabled", fontSize: "0.7rem", mt: 1, display: "block" }}>
        {new Date(item.createdAt).toLocaleDateString("zh-CN")}
      </Typography>
    </Paper>
  )
}
