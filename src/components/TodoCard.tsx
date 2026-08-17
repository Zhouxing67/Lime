import AddRoundedIcon from "@mui/icons-material/AddRounded"
import CheckRoundedIcon from "@mui/icons-material/CheckRounded"
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded"
import EditRoundedIcon from "@mui/icons-material/EditRounded"
import LinkRoundedIcon from "@mui/icons-material/LinkRounded"
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded"
import StyleRoundedIcon from "@mui/icons-material/StyleRounded"
import {
  alpha,
  Box,
  Button,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material"
import { useEffect, useState } from "react"

import type { TodoCard as TodoCardType } from "../types"
import type { TodoLink } from "../hooks/useTodoView"
import {
  dueInfo,
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
  item: TodoCardType
  editing: boolean
  focusNewTask: boolean
  onToggleTask: (index: number) => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: (
    title: string,
    content: string,
    dueDate?: string,
    link?: TodoLink
  ) => void
  onDelete: () => void
  onQuickAdd: () => void
  onOpenLink: (link: TodoLink) => void
  projectCards?: { id: string; title: string; projectName: string }[]
  pdfs?: { id: string; name: string }[]
}

type LinkType = "none" | "card" | "pdf" | "url"

function DueChip({ item, today }: { item: TodoCardType; today: string }) {
  const { status, label } = dueInfo(item.dueDate, today)
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
        borderRadius: 1,
        color: tone.color,
        bgcolor:
          status === "overdue"
            ? alpha(t.palette.error.main, 0.08)
            : status === "today"
              ? alpha(t.palette.warning.main, 0.08)
              : alpha(t.palette.text.secondary, 0.08)
      })}>
      {label}
    </Typography>
  )
}

/** The linked-source chip (PDF / 卡片 / 链接) — click jumps to the source. */
function LinkChip({
  item,
  onOpenLink
}: {
  item: TodoCardType
  onOpenLink: (link: TodoLink) => void
}) {
  const link: TodoLink = item.pdfId
    ? { pdfId: item.pdfId }
    : item.cardId
      ? { cardId: item.cardId }
      : item.url
        ? { url: item.url }
        : null
  if (!link) return null
  const meta = item.pdfId
    ? { label: "PDF", icon: <PictureAsPdfRoundedIcon sx={{ fontSize: 16 }} /> }
    : item.cardId
      ? { label: "卡片", icon: <StyleRoundedIcon sx={{ fontSize: 16 }} /> }
      : { label: "链接", icon: <LinkRoundedIcon sx={{ fontSize: 16 }} /> }
  return (
    <Box
      onClick={(e) => {
        e.stopPropagation()
        onOpenLink(link)
      }}
      sx={(t) => ({
        display: "inline-flex",
        alignItems: "center",
        gap: 0.4,
        px: 0.6,
        py: 0.15,
        borderRadius: 1,
        fontSize: "0.65rem",
        lineHeight: 1.4,
        cursor: "pointer",
        color: "text.secondary",
        bgcolor: alpha(t.palette.text.secondary, 0.08),
        "&:hover": { color: "primary.main", bgcolor: alpha(t.palette.primary.main, 0.08) }
      })}>
      {meta.icon}
      {meta.label}
    </Box>
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
  onQuickAdd,
  onOpenLink,
  projectCards = [],
  pdfs = []
}: TodoCardProps) {
  const [draftTitle, setDraftTitle] = useState(item.title ?? "")
  const [draftContent, setDraftContent] = useState(item.content)
  const [draftDueDate, setDraftDueDate] = useState<string | undefined>(
    item.dueDate
  )
  const [linkType, setLinkType] = useState<LinkType>(
    item.pdfId ? "pdf" : item.cardId ? "card" : item.url ? "url" : "none"
  )
  const [draftCardId, setDraftCardId] = useState(item.cardId ?? "")
  const [draftPdfId, setDraftPdfId] = useState(item.pdfId ?? "")
  const [draftUrl, setDraftUrl] = useState(item.url ?? "")
  useEffect(() => {
    setDraftTitle(item.title ?? "")
    setDraftContent(item.content)
    setDraftDueDate(item.dueDate)
    setLinkType(item.pdfId ? "pdf" : item.cardId ? "card" : item.url ? "url" : "none")
    setDraftCardId(item.cardId ?? "")
    setDraftPdfId(item.pdfId ?? "")
    setDraftUrl(item.url ?? "")
  }, [item.id, editing, item.title, item.content, item.dueDate, item.pdfId, item.cardId, item.url])

  const today = todayLocalDate()
  const done = isTodoComplete(item.content)
  const total = markdownTaskCount(item.content)
  const doneCount = markdownCompletedCount(item.content)
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0
  const overdue = dueStatus(item.dueDate, today) === "overdue"

  const buildLink = (): TodoLink | undefined => {
    if (linkType === "card" && draftCardId)
      return { cardId: draftCardId }
    if (linkType === "pdf" && draftPdfId) return { pdfId: draftPdfId }
    if (linkType === "url" && draftUrl.trim()) return { url: draftUrl.trim() }
    return undefined
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
        <Box>
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", fontSize: "0.72rem", mb: 0.5, display: "block" }}>
            关联
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <Select
                value={linkType}
                onChange={(e) => setLinkType(e.target.value as LinkType)}
                sx={{ fontSize: "0.8rem" }}>
                <MenuItem value="none">无</MenuItem>
                <MenuItem value="card">卡片</MenuItem>
                <MenuItem value="pdf">PDF</MenuItem>
                <MenuItem value="url">链接</MenuItem>
              </Select>
            </FormControl>
            {linkType === "card" && (
              <FormControl size="small" fullWidth>
                <InputLabel>选择卡片</InputLabel>
                <Select
                  label="选择卡片"
                  value={draftCardId}
                  onChange={(e) => setDraftCardId(e.target.value as string)}
                  sx={{ fontSize: "0.8rem" }}>
                  {projectCards.length === 0 && (
                    <MenuItem value="" disabled>
                      暂无卡片
                    </MenuItem>
                  )}
                  {projectCards.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.projectName ? `${c.projectName} · ` : ""}
                      {c.title}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {linkType === "pdf" && (
              <FormControl size="small" fullWidth>
                <InputLabel>选择 PDF</InputLabel>
                <Select
                  label="选择 PDF"
                  value={draftPdfId}
                  onChange={(e) => setDraftPdfId(e.target.value as string)}
                  sx={{ fontSize: "0.8rem" }}>
                  {pdfs.length === 0 && (
                    <MenuItem value="" disabled>
                      暂无 PDF
                    </MenuItem>
                  )}
                  {pdfs.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {linkType === "url" && (
              <TextField
                size="small"
                placeholder="https://…"
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                fullWidth
              />
            )}
          </Stack>
        </Box>
        <Stack direction="row" justifyContent="flex-end" spacing={1}>
          <Button size="small" onClick={onCancelEdit}>
            取消
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={() =>
              onSave(draftTitle.trim(), draftContent, draftDueDate, buildLink())
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
            fontWeight: 700,
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
          <Tooltip title="编辑">
            <IconButton size="small" onClick={onStartEdit} sx={{ p: 0.75 }}>
              <EditRoundedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
        {/* Destructive action stays visible (设计基线), outside the hover group. */}
        <Box onClick={(e) => e.stopPropagation()}>
          <Tooltip title="删除">
            <IconButton
              size="small"
              onClick={onDelete}
              sx={{ p: 0.75, opacity: 0.6, transition: "opacity 0.15s", "&:hover": { opacity: 1 } }}>
              <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Stack>

      {total > 0 && (
        <Box
          sx={{
            height: 3,
            borderRadius: 1,
            bgcolor: "action.hover",
            overflow: "hidden",
            mb: 1
          }}>
          <Box
            sx={{
              height: "100%",
              width: `${pct}%`,
              bgcolor: done ? "success.main" : "primary.main",
              transition: "width 0.2s"
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
          <AddRoundedIcon sx={{ fontSize: 16 }} />
          添加任务
        </Box>
      </Box>

      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mt: 1 }}>
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
          <Typography
            variant="caption"
            sx={{ color: "text.disabled", fontSize: "0.7rem" }}>
            {new Date(item.createdAt).toLocaleDateString("zh-CN")}
          </Typography>
          <LinkChip item={item} onOpenLink={onOpenLink} />
        </Stack>
        <DueChip item={item} today={today} />
      </Stack>
    </Paper>
  )
}
