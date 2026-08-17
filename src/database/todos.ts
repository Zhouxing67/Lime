import { collectAll, tx, withStore } from "./core"
import type { TodoCard } from "../types"
import { isTodoComplete } from "../utils"

export async function addTodo(todo: TodoCard): Promise<void> {
  const ready: TodoCard = { ...todo, updatedAt: todo.updatedAt ?? Date.now() }
  await withStore("todos", "readwrite", async (store) => {
    await new Promise<void>((resolve, reject) => {
      const req = store.put(ready)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  })
}

export async function getAllTodos(): Promise<TodoCard[]> {
  return withStore("todos", "readonly", (store) => collectAll<TodoCard>(store))
}

export async function updateTodo(todo: TodoCard): Promise<void> {
  await withStore("todos", "readwrite", (store) => {
    store.put({ ...todo, updatedAt: Date.now() })
  })
}

export async function deleteTodo(id: string): Promise<void> {
  await tx({ reviews: "readwrite", todos: "readwrite" }, async (stores) => {
    const idx = stores.reviews.index("itemId")
    return new Promise<void>((resolve, reject) => {
      const req = idx.getKey(id)
      req.onsuccess = () => {
        if (req.result) stores.reviews.delete(req.result as string)
        stores.todos.delete(id)
        resolve()
      }
      req.onerror = () => reject(req.error)
    })
  })
}

/** Shared light-weight incomplete-todo count (the toolbar badge's algorithm) —
 *  the NavRail todo icon uses it so it updates as fast as the badge. */
export async function getIncompleteTodoCount(): Promise<number> {
  const todos = await getAllTodos()
  return todos.filter((t) => !isTodoComplete(t.content)).length
}
