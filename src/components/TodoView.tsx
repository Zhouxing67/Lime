import AddRoundedIcon from "@mui/icons-material/AddRounded"
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded"
import { Box } from "@mui/material"

import type { TodoCard as TodoCardType } from "../types"
import TodoCard from "./TodoCard"
import DashedTile from "./DashedTile"
import EmptyState from "./EmptyState"

interface TodoViewProps {
  items: TodoCardType[]
  editingId: string | null
  focusNewTaskId: string | null
  onToggleTask: (item: TodoCardType, index: number) => void
  onStartEdit: (id: string) => void
  onCancelEdit: () => void
  onSave: (
    item: TodoCardType,
    title: string,
    content: string,
    dueDate?: string
  ) => void
  onDelete: (item: TodoCardType) => void
  onQuickAdd: (item: TodoCardType) => void
  onNewTodo: () => void
}

const NEW_TODO: TodoCardType = {
  id: "__new__",
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

      {items.length === 0 && editingId !== "__new__" && (
        <EmptyState
          icon={<CheckCircleOutlineRoundedIcon />}
          iconSize={48}
          title="还没有待办"
          subtitle="点击上方「新增待办」开始记录"
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
