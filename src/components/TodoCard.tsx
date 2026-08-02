import AddRoundedIcon from "@mui/icons-material/AddRounded"
import CheckRoundedIcon from "@mui/icons-material/CheckRounded"
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import EditRoundedIcon from "@mui/icons-material/EditRounded"
import { alpha, Box, Button, IconButton, Paper, Stack, TextField, Typography } from "@mui/material"
import { useEffect, useState } from "react"

import type { Item } from "../types"
import {
  dueLabel,
  dueStatus,
  isTodoComplete,
  markdownCompletedCount,
  markdownTaskCount,
  todayLocalDate
} from "../utils"
import MarkdownRenderer from "./MarkdownRenderer"
import TaskEditor from "./TaskEditor"
import DateField from "./DateField"

interface TodoCardProps {
  item: Item
  editing: boolean
  focusNewTask: boolean
  onToggleTask: (index: number) => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: (title: string, content: string, dueDate?: string) => void
  onDelete: () => void
  onQuickAdd: () => void
}

function DueChip({ item }: { item: Item }) {
  const status = dueStatus(item.dueDate, todayLocalDate())
  if (status === "none") return null
  const tone = {
    overdue: { color: "error.main" },
    today: { color: "warning.main" },
    tomorrow: { color: "text.secondary" },
    future: { color: "text.secondary" }
  }[status]
  return (
    <Typography
      variant="caption"
      sx={(t) => ({
        fontSize: "0.65rem",
        lineHeight: 1.4,
        px: 0.75,
        py: 0.15,
        borderRadius: 0.75,
        color: tone.color,
        bgcolor:
          status === "overdue"
            ? alpha(t.palette.error.main, 0.08)
            : status === "today"
              ? alpha(t.palette.warning.main, 0.08)
              : alpha(t.palette.text.secondary, 0.08)
      })}>
      {dueLabel(item.dueDate, todayLocalDate())}
    </Typography>
  )
}

export default function TodoCard({
  item,
  editing,
  focusNewTask,
  onToggleTask,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onQuickAdd
}: TodoCardProps) {
  const [draftTitle, setDraftTitle] = useState(item.title ?? "")
  const [draftContent, setDraftContent] = useState(item.content)
  const [draftDueDate, setDraftDueDate] = useState<string | undefined>(
    item.dueDate
  )
  useEffect(() => {
    setDraftTitle(item.title ?? "")
    setDraftContent(item.content)
    setDraftDueDate(item.dueDate)
  }, [item.id, editing])

  const done = isTodoComplete(item.content)
  const total = markdownTaskCount(item.content)
  const doneCount = markdownCompletedCount(item.content)
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0
  const overdue = dueStatus(item.dueDate, todayLocalDate()) === "overdue"

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
          gap: 1.5,
          minWidth: 0
        })}>
        <TextField
          size="small"
          label="标题（可选）"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          fullWidth
        />
        <TaskEditor
          key={item.id}
          value={draftContent}
          onChange={setDraftContent}
          autoFocus={!focusNewTask}
          autoFocusNewRow={focusNewTask}
        />
        <DateField
          label="设置到期日"
          value={draftDueDate ?? ""}
          onChange={(v) => setDraftDueDate(v || undefined)}
        />
        <Stack direction="row" justifyContent="flex-end" spacing={1}>
          <Button size="small" onClick={onCancelEdit}>
            取消
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={() =>
              onSave(draftTitle.trim(), draftContent, draftDueDate)
            }>
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
        transition: "all 0.2s",
        ...(overdue && {
          borderLeft: "2px solid",
          borderLeftColor: "error.main"
        }),
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
            textDecoration: done ? "line-through" : "none",
            color: done ? "text.disabled" : "text.primary"
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
          <IconButton size="small" onClick={onDelete}>
            <DeleteOutlineRoundedIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
      </Stack>

      {total > 0 && (
        <Box
          sx={{
            height: 3,
            borderRadius: 1.5,
            bgcolor: "action.hover",
            overflow: "hidden",
            mb: 1
          }}>
          <Box
            sx={{
              height: "100%",
              width: `${pct}%`,
              bgcolor: done ? "success.main" : "primary.main",
              transition: "width 0.3s"
            }}
          />
        </Box>
      )}

      <Box
        onClick={(e) => e.stopPropagation()}
        sx={{ color: done ? "text.disabled" : "inherit" }}>
        <MarkdownRenderer content={item.content} onToggleTask={onToggleTask} />
        <Box
          onClick={onQuickAdd}
          sx={{
            mt: 0.75,
            py: 0.5,
            px: 1,
            borderRadius: 1,
            border: "1px dashed",
            borderColor: "divider",
            color: "text.disabled",
            fontSize: "0.75rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            "&:hover": { color: "primary.main", borderColor: "primary.main" }
          }}>
          <AddRoundedIcon sx={{ fontSize: 14 }} />
          添加任务
        </Box>
      </Box>

      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mt: 1 }}>
        <Typography
          variant="caption"
          sx={{ color: "text.disabled", fontSize: "0.7rem" }}>
          {new Date(item.createdAt).toLocaleDateString("zh-CN")}
        </Typography>
        <DueChip item={item} />
      </Stack>
    </Paper>
  )
}
