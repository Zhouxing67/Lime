import { useCallback, useMemo, useState } from "react"

import type { SidebarTab } from "../components/NavRail"
import type { ReadLater, TodoCard, TodoFilter } from "../types"
import {
  addReadLater,
  addTodo,
  deleteReadLater,
  deleteTodo,
  updateReadLater,
  updateTodo
} from "../database/index"
import {
  createReadLater,
  createTodoCard,
  dueStatus,
  isTodoComplete,
  toggleMarkdownTask,
  todayLocalDate
} from "../utils"

export type TodoTab = "todo" | "readLater"
export type ReadLaterFilter = "active" | "done"

/** A todo's optional link target (PDF / project card / web URL). */
export interface TodoLink {
  pdfId?: string
  cardId?: string
  url?: string
}

/** The todo view's own state — the tab, the filter, the edit flow, and the
 *  filtered lists. The shared todo/read-later data comes from the data hub;
 *  the view colocation means adding a todo feature touches only this hook +
 *  the TodoView. */
export function useTodoView({
  allTodos,
  allReadLater,
  navigate,
  onToast,
  onOpenPdf,
  onJumpToCard
}: {
  allTodos: TodoCard[]
  allReadLater: ReadLater[]
  navigate: (tab: SidebarTab) => void
  onToast: (message: string, severity?: "success" | "error") => void
  onOpenPdf: (id: string) => void
  onJumpToCard: (cardId: string) => void
}) {
  const [activeTab, setActiveTab] = useState<TodoTab>("todo")
  const [todoFilter, setTodoFilter] = useState<TodoFilter>("incomplete")
  const [todoEditingId, setTodoEditingId] = useState<string | null>(null)
  const [focusNewTaskId, setFocusNewTaskId] = useState<string | null>(null)
  const [todoDeleteTarget, setTodoDeleteTarget] = useState<TodoCard | null>(
    null
  )
  const [readLaterFilter, setReadLaterFilter] =
    useState<ReadLaterFilter>("active")
  const [readLaterEditingId, setReadLaterEditingId] = useState<string | null>(
    null
  )
  const [readLaterDeleteTarget, setReadLaterDeleteTarget] =
    useState<ReadLater | null>(null)
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

  // Active (unread/reading) vs archived (done) read-later items, newest first.
  const activeReadLater = useMemo(
    () =>
      allReadLater
        .filter((r) => r.status !== "done")
        .sort((a, b) => b.addedAt - a.addedAt),
    [allReadLater]
  )
  const doneReadLater = useMemo(
    () =>
      allReadLater
        .filter((r) => r.status === "done")
        .sort((a, b) => b.addedAt - a.addedAt),
    [allReadLater]
  )

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
      dueDate?: string,
      link?: TodoLink
    ) => {
      if (!title.trim() && !content.trim()) {
        setTodoEditingId(null)
        setFocusNewTaskId(null)
        return
      }
      const cleanDue =
        dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : undefined
      const cleanLink = link
        ? {
            ...(link.pdfId ? { pdfId: link.pdfId } : {}),
            ...(link.cardId ? { cardId: link.cardId } : {}),
            ...(link.url ? { url: link.url } : {})
          }
        : undefined
      if (item.id === "__new__") {
        const created = createTodoCard({
          title: title.trim() || undefined,
          content,
          ...(cleanDue && { dueDate: cleanDue })
        })
        await addTodo({ ...created, ...cleanLink })
      } else {
        await updateTodo({
          ...item,
          title: title.trim() || undefined,
          content,
          dueDate: cleanDue,
          pdfId: cleanLink?.pdfId,
          cardId: cleanLink?.cardId,
          url: cleanLink?.url
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

  // ---- read-later ----
  const handleNewReadLater = useCallback(() => {
    setActiveTab("readLater")
    setReadLaterFilter("active")
    setReadLaterEditingId("__new__")
  }, [])

  const handleStartEditReadLater = useCallback((id: string) => {
    setReadLaterEditingId(id)
  }, [])

  const handleSaveReadLater = useCallback(
    async (
      item: ReadLater,
      title: string,
      url?: string,
      pdfId?: string,
      notes?: string
    ) => {
      if (!title.trim()) {
        setReadLaterEditingId(null)
        return
      }
      const cleanUrl = url?.trim() || undefined
      const cleanPdfId = pdfId || undefined
      const cleanNotes = notes?.trim() || undefined
      if (item.id === "__new__") {
        const created = createReadLater({
          title: title.trim(),
          url: cleanUrl,
          pdfId: cleanPdfId,
          notes: cleanNotes
        })
        const saved = await addReadLater(created)
        if (!saved) {
          onToast("该 PDF 已在稍后读中", "error")
          setReadLaterEditingId(null)
          return
        }
      } else {
        const saved = await updateReadLater({
          ...item,
          title: title.trim(),
          url: cleanUrl,
          pdfId: cleanPdfId,
          notes: cleanNotes
        })
        if (!saved) {
          onToast("该 PDF 已在稍后读中", "error")
          setReadLaterEditingId(null)
          return
        }
      }
      setReadLaterEditingId(null)
    },
    [onToast]
  )

  const handleDeleteReadLater = useCallback(async (item: ReadLater) => {
    await deleteReadLater(item.id)
    setReadLaterEditingId(null)
  }, [])

  const handleStartRead = useCallback(
    async (item: ReadLater) => {
      if (item.status !== "reading") {
        await updateReadLater({ ...item, status: "reading" })
      }
      // 开始阅读 = 打开条目并切到对应视图：PDF → PDF 阅读视图，网页 → 新标签页。
      if (item.pdfId) {
        onOpenPdf(item.pdfId)
        navigate("pdf")
      } else if (item.url) {
        window.open(item.url, "_blank", "noopener")
      }
    },
    [onOpenPdf, navigate]
  )

  const handleMarkDone = useCallback(async (item: ReadLater) => {
    if (item.status === "done") return
    await updateReadLater({ ...item, status: "done" })
  }, [])

  const handleOpenReadLater = useCallback(
    (item: ReadLater) => {
      if (item.pdfId) {
        onOpenPdf(item.pdfId)
        navigate("pdf")
      } else if (item.url) window.open(item.url, "_blank", "noopener")
    },
    [onOpenPdf, navigate]
  )

  const handleOpenTodoLink = useCallback(
    (link: TodoLink) => {
      if (link.cardId) onJumpToCard(link.cardId)
      else if (link.pdfId) onOpenPdf(link.pdfId)
      else if (link.url) window.open(link.url, "_blank", "noopener")
    },
    [onJumpToCard, onOpenPdf]
  )

  return {
    activeTab,
    setActiveTab,
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
    handleDeleteTodo,
    readLaterFilter,
    setReadLaterFilter,
    readLaterEditingId,
    setReadLaterEditingId,
    readLaterDeleteTarget,
    setReadLaterDeleteTarget,
    activeReadLater,
    doneReadLater,
    handleNewReadLater,
    handleStartEditReadLater,
    handleSaveReadLater,
    handleDeleteReadLater,
    handleStartRead,
    handleMarkDone,
    handleOpenReadLater,
    handleOpenTodoLink
  }
}
