import AddRoundedIcon from "@mui/icons-material/AddRounded"
import BookmarkAddRoundedIcon from "@mui/icons-material/BookmarkAddRounded"
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded"
import { Box, Typography } from "@mui/material"

import type { ReadLater, TodoCard as TodoCardType } from "../types"
import type { TodoLink } from "../hooks/useTodoView"
import type { ReadLaterFilter, TodoTab } from "../hooks/useTodoView"
import TodoCard from "./TodoCard"
import ReadingCard from "./ReadingCard"
import ReadLaterDialog from "./ReadLaterDialog"
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
    dueDate?: string,
    link?: TodoLink
  ) => void
  onDelete: (item: TodoCardType) => void
  onQuickAdd: (item: TodoCardType) => void
  onNewTodo: () => void
  activeTab: TodoTab
  readLaterFilter: ReadLaterFilter
  readLaterEditingId: string | null
  setReadLaterEditingId: (id: string | null) => void
  readLaterDeleteTarget: ReadLater | null
  setReadLaterDeleteTarget: (item: ReadLater | null) => void
  activeReadLater: ReadLater[]
  doneReadLater: ReadLater[]
  onNewReadLater: () => void
  onCancelEditReadLater: () => void
  onSaveReadLater: (
    item: ReadLater,
    title: string,
    url?: string,
    pdfId?: string,
    notes?: string
  ) => void
  onDeleteReadLater: (item: ReadLater) => void
  onStartRead: (item: ReadLater) => void
  onMarkDone: (item: ReadLater) => void
  onOpenReadLater: (item: ReadLater) => void
  onOpenLink: (link: TodoLink) => void
  projectCards: { id: string; title: string; projectName: string }[]
  pdfs: { id: string; name: string }[]
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
  onNewTodo,
  activeTab,
  readLaterFilter,
  readLaterEditingId,
  setReadLaterEditingId,
  readLaterDeleteTarget,
  setReadLaterDeleteTarget,
  activeReadLater,
  doneReadLater,
  onNewReadLater,
  onCancelEditReadLater,
  onSaveReadLater,
  onDeleteReadLater,
  onStartRead,
  onMarkDone,
  onOpenReadLater,
  onOpenLink,
  projectCards,
  pdfs
}: TodoViewProps) {
  const readLaterItems = readLaterFilter === "active" ? activeReadLater : doneReadLater
  const editingReadLater =
    readLaterEditingId === "__new__"
      ? null
      : readLaterEditingId
        ? [...activeReadLater, ...doneReadLater].find(
            (r) => r.id === readLaterEditingId
          ) ?? null
        : null

  const pdfNameById = new Map(pdfs.map((p) => [p.id, p.name]))

  // PDFs that already have an ACTIVE read-later — disabled in the picker,
  // except the one currently being edited.
  const activeReadLaterPdfIds = new Set(
    activeReadLater.filter((r) => r.pdfId).map((r) => r.pdfId)
  )
  if (editingReadLater?.pdfId) activeReadLaterPdfIds.delete(editingReadLater.pdfId)

  return (
    <>
      {activeTab === "todo" ? (
        <>
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
              onSave={(t, c, d, l) => onSave(NEW_TODO, t, c, d, l)}
              onDelete={() => {}}
              onQuickAdd={() => {}}
              onOpenLink={onOpenLink}
              projectCards={projectCards}
              pdfs={pdfs}
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
              onSave={(t, c, d, l) => onSave(it, t, c, d, l)}
              onDelete={() => onDelete(it)}
              onQuickAdd={() => onQuickAdd(it)}
              onOpenLink={onOpenLink}
              projectCards={projectCards}
              pdfs={pdfs}
            />
          ))}
        </Box>

        {items.length === 0 && editingId !== "__new__" && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              width: "100%",
              pt: 5
            }}>
            <EmptyState
              icon={<CheckCircleOutlineRoundedIcon />}
              iconSize={48}
              title="还没有待办项"
              subtitle="点击上方「新增待办」开始记录"
            />
          </Box>
        )}
        </>
      ) : (
        <>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 1.5,
              alignItems: "start"
            }}>
            {readLaterFilter === "active" && (
              <DashedTile
                icon={<BookmarkAddRoundedIcon sx={{ fontSize: 20 }} />}
                label="新增稍后读"
                onClick={onNewReadLater}
                variant="card"
                circleIcon
                minHeight={140}
                labelSize="0.8rem"
              />
            )}

            {readLaterItems.map((r) => (
              <ReadingCard
                key={r.id}
                item={r}
                pdfName={r.pdfId ? pdfNameById.get(r.pdfId) : undefined}
                onDelete={() => onDeleteReadLater(r)}
                onStartRead={() => onStartRead(r)}
                onMarkDone={() => onMarkDone(r)}
                onOpen={() => onOpenReadLater(r)}
              />
            ))}
          </Box>

          {readLaterItems.length === 0 && (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                width: "100%",
                pt: 5
              }}>
              <EmptyState
                icon={<BookmarkAddRoundedIcon />}
                iconSize={48}
                title={
                  readLaterFilter === "active"
                    ? "还没有稍后读"
                    : "还没有已读条目"
                }
                subtitle={
                  readLaterFilter === "active"
                    ? "点击上方「新增稍后读」，或在 PDF 库中收藏"
                    : "标记已读的条目会归档到这里"
                }
              />
            </Box>
          )}
        </>
      )}

      <ReadLaterDialog
        open={readLaterEditingId !== null}
        item={editingReadLater}
        pdfs={pdfs}
        activeReadLaterPdfIds={activeReadLaterPdfIds}
        onClose={onCancelEditReadLater}
        onSave={(title, url, pdfId, notes) => {
          const target =
            editingReadLater ??
            ({
              id: "__new__",
              title: "",
              status: "unread",
              addedAt: Date.now()
            } as ReadLater)
          onSaveReadLater(target, title, url, pdfId, notes)
        }}
      />
    </>
  )
}
