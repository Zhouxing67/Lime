import { useCallback, useState } from "react"

import { addItem } from "../database"
import type { Item } from "../types"

export function useNewCard({
  activeProjectId,
  activeSectionId,
  onSearch
}: {
  activeProjectId: string | null
  activeSectionId: string | null
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
    // Default into the active section so the new card stays visible in the
    // current single-section view ("__unclassified__" / null = unclassified).
    const sectionId =
      activeSectionId && activeSectionId !== "__unclassified__"
        ? activeSectionId
        : undefined
    const item: Item = {
      id: crypto.randomUUID(),
      type: "text",
      title,
      content,
      createdAt: Date.now(),
      projectId: activeProjectId,
      ...(sectionId ? { sectionId } : {}),
      images: images.length > 0 ? images : undefined
    }
    await addItem(item)
    setNewCardOpen(false)
    setNewCardTitle("")
    setNewCardContent("")
    setNewCardImages([])
    onSearch(activeProjectId)
  }, [
    newCardTitle,
    newCardContent,
    newCardImages,
    activeProjectId,
    activeSectionId,
    onSearch
  ])

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
