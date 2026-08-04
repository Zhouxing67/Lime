import AddRoundedIcon from "@mui/icons-material/AddRounded"
import { Box, Paper, Typography } from "@mui/material"

import type { Item } from "../types"
import TodoCard from "./TodoCard"

interface TodoViewProps {
  items: Item[]
  editingId: string | null
  focusNewTaskId: string | null
  onToggleTask: (item: Item, index: number) => void
  onStartEdit: (id: string) => void
  onCancelEdit: () => void
  onSave: (item: Item, title: string, content: string, dueDate?: string) => void
  onDelete: (item: Item) => void
  onQuickAdd: (item: Item) => void
  onNewTodo: () => void
}

const NEW_TODO: Item = {
  id: "__new__",
  type: "todo",
  content: "",
  createdAt: Date.now()
}

export default function TodoView({
  items,
  editingId,
  focusNewTaskId,
  onToggleTask,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onQuickAdd,
  onNewTodo
}: TodoViewProps) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 1.5,
        alignItems: "start"
      }}>
      <Paper
        elevation={0}
        onClick={onNewTodo}
        sx={(theme) => ({
          p: 2,
          borderRadius: 1,
          border: "1.5px dashed",
          borderColor: theme.custom.borderStrong,
          minHeight: 140,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
          cursor: "pointer",
          color: "text.secondary",
          bgcolor: "background.paper",
          boxShadow: theme.custom.cardShadow,
          transition: "all 0.2s",
          "&:hover": {
            borderColor: "primary.main",
            color: "primary.main",
            boxShadow: theme.custom.cardShadowHover,
            transform: "translateY(-1px)"
          }
        })}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "1.5px dashed",
            borderColor: "divider",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
          <AddRoundedIcon sx={{ fontSize: 20 }} />
        </Box>
        <Typography variant="body2" sx={{ fontSize: "0.8rem" }}>
          新增待办
        </Typography>
      </Paper>

      {editingId === "__new__" && (
        <TodoCard
          key={NEW_TODO.id}
          item={NEW_TODO}
          editing
          focusNewTask={false}
          onToggleTask={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={onCancelEdit}
          onSave={(t, c, d) => onSave(NEW_TODO, t, c, d)}
          onDelete={() => {}}
          onQuickAdd={() => {}}
        />
      )}

      {items.map((it) => (
        <TodoCard
          key={it.id}
          item={it}
          editing={editingId === it.id}
          focusNewTask={focusNewTaskId === it.id}
          onToggleTask={(i) => onToggleTask(it, i)}
          onStartEdit={() => onStartEdit(it.id)}
          onCancelEdit={onCancelEdit}
          onSave={(t, c, d) => onSave(it, t, c, d)}
          onDelete={() => onDelete(it)}
          onQuickAdd={() => onQuickAdd(it)}
        />
      ))}
    </Box>
  )
}
