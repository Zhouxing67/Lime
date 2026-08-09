import { useCallback, useMemo, useState } from "react"

import type { SidebarTab } from "../components/NavRail"
import type { TodoCard, TodoFilter } from "../types"
import { addTodo, deleteTodo, updateTodo } from "../database/index"
import {
  createTodoCard,
  dueStatus,
  isTodoComplete,
  toggleMarkdownTask,
  todayLocalDate
} from "../utils"

/** The todo view's own state — the filter, the edit flow, and the filtered
 *  list. The shared todo data comes from the data hub; the view colocation
 *  means adding a todo feature touches only this hook + the TodoView. */
export function useTodoView({
  allTodos,
  navigate
}: {
  allTodos: TodoCard[]
  navigate: (tab: SidebarTab) => void
}) {
  const [todoFilter, setTodoFilter] = useState<TodoFilter>("incomplete")
  const [todoEditingId, setTodoEditingId] = useState<string | null>(null)
  const [focusNewTaskId, setFocusNewTaskId] = useState<string | null>(null)
  const [todoDeleteTarget, setTodoDeleteTarget] = useState<TodoCard | null>(
    null
  )
  const today = todayLocalDate()

  const filteredTodos = useMemo(() => {
    const list = allTodos.filter((t) => {
      switch (todoFilter) {
        case "all":
          return true
        case "incomplete":
          return !isTodoComplete(t.content)
        case "completed":
          return isTodoComplete(t.content)
        case "overdue":
          return dueStatus(t.dueDate, today) === "overdue"
        case "today":
          return dueStatus(t.dueDate, today) === "today"
      }
    })
    return list.sort((a, b) => {
      const ad = a.dueDate
      const bd = b.dueDate
      if (ad && bd) return ad.localeCompare(bd)
      if (ad) return -1
      if (bd) return 1
      return b.createdAt - a.createdAt
    })
  }, [allTodos, todoFilter, today])

  const handleNewTodo = useCallback(() => {
    setFocusNewTaskId(null)
    setTodoFilter("incomplete")
    setTodoEditingId("__new__")
    navigate("todo")
  }, [navigate])

  const handleStartEditTodo = useCallback((id: string) => {
    setFocusNewTaskId(null)
    setTodoEditingId(id)
  }, [])

  const handleQuickAdd = useCallback((item: TodoCard) => {
    setTodoEditingId(item.id)
    setFocusNewTaskId(item.id)
  }, [])

  const handleToggleTodoTask = useCallback(
    async (item: TodoCard, index: number) => {
      const next = toggleMarkdownTask(item.content, index)
      if (next === item.content) return
      await updateTodo({ ...item, content: next })
    },
    []
  )

  const handleSaveTodo = useCallback(
    async (
      item: TodoCard,
      title: string,
      content: string,
      dueDate?: string
    ) => {
      if (!title.trim() && !content.trim()) {
        setTodoEditingId(null)
        setFocusNewTaskId(null)
        return
      }
      const cleanDue =
        dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : undefined
      if (item.id === "__new__") {
        const created = createTodoCard({
          title: title.trim() || undefined,
          content,
          ...(cleanDue && { dueDate: cleanDue })
        })
        await addTodo(created)
      } else {
        await updateTodo({
          ...item,
          title: title.trim() || undefined,
          content,
          dueDate: cleanDue
        })
      }
      setTodoEditingId(null)
      setFocusNewTaskId(null)
    },
    []
  )

  const handleDeleteTodo = useCallback(async (item: TodoCard) => {
    await deleteTodo(item.id)
    setTodoEditingId(null)
    setFocusNewTaskId(null)
  }, [])

  return {
    todoFilter,
    setTodoFilter,
    todoEditingId,
    setTodoEditingId,
    focusNewTaskId,
    setFocusNewTaskId,
    todoDeleteTarget,
    setTodoDeleteTarget,
    filteredTodos,
    handleNewTodo,
    handleStartEditTodo,
    handleQuickAdd,
    handleToggleTodoTask,
    handleSaveTodo,
    handleDeleteTodo
  }
}
