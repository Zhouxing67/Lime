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
  const [newCardImages, setNewCardImages] = useState<string[]>([])

  const handleNewCard = useCallback(() => {
    if (!activeProjectId) return
    setNewCardTitle("")
    setNewCardContent("")
    setNewCardImages([])
    setNewCardOpen(true)
  }, [activeProjectId])

  const handleSaveNewCard = useCallback(async () => {
    const title = newCardTitle.trim()
    const content = newCardContent.trim()
    const images = newCardImages.map((u) => u.trim()).filter(Boolean)
    if (!title || !activeProjectId) return
    const item: Item = {
      id: crypto.randomUUID(),
      type: "text",
      title,
      content,
      createdAt: Date.now(),
      projectId: activeProjectId,
      images: images.length > 0 ? images : undefined
    }
    console.debug("[lime:newcard] saving item", { images: item.images, title })
    await addItem(item)
    setNewCardOpen(false)
    setNewCardTitle("")
    setNewCardContent("")
    setNewCardImages([])
    onSearch(activeProjectId)
  }, [newCardTitle, newCardContent, newCardImages, activeProjectId, onSearch])

  return {
    newCardOpen,
    newCardTitle,
    newCardContent,
    newCardImages,
    setNewCardTitle,
    setNewCardContent,
    setNewCardImages,
    setNewCardOpen,
    handleNewCard,
    handleSaveNewCard
  }
}
