import AddRoundedIcon from "@mui/icons-material/AddRounded"
import { Box, Paper, Typography } from "@mui/material"

import type { Item } from "../types"
import TodoCard from "./TodoCard"
import DashedTile from "./DashedTile"

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
      <DashedTile
        icon={<AddRoundedIcon sx={{ fontSize: 20 }} />}
        label="新增待办"
        onClick={onNewTodo}
        variant="card"
        circleIcon
        minHeight={140}
        labelSize="0.8rem"
      />

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
