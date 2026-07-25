import { useCallback, useState } from "react"

import { addItem } from "../database"
import type { Item } from "../types"

export function useNewCard({
  activeProjectId,
  onSearch
}: {
  activeProjectId: string | null
  onSearch: (projectId?: string | null) => void
}) {
  const [newCardOpen, setNewCardOpen] = useState(false)
  const [newCardTitle, setNewCardTitle] = useState("")
  const [newCardContent, setNewCardContent] = useState("")

  const handleNewCard = useCallback(() => {
    if (!activeProjectId) return
    setNewCardTitle("")
    setNewCardContent("")
    setNewCardOpen(true)
  }, [activeProjectId])

  const handleSaveNewCard = useCallback(async () => {
    const title = newCardTitle.trim()
    const content = newCardContent.trim()
    if (!title || !activeProjectId) return
    const item: Item = {
      id: crypto.randomUUID(),
      type: "text",
      title,
      content,
      createdAt: Date.now(),
      projectId: activeProjectId
    }
    await addItem(item)
    setNewCardOpen(false)
    setNewCardTitle("")
    setNewCardContent("")
    onSearch(activeProjectId)
  }, [newCardTitle, newCardContent, activeProjectId, onSearch])

  return {
    newCardOpen,
    newCardTitle,
    newCardContent,
    setNewCardTitle,
    setNewCardContent,
    setNewCardOpen,
    handleNewCard,
    handleSaveNewCard
  }
}
