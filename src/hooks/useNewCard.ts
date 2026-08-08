import { useCallback, useState } from "react"

import { createTextCard } from "../database"


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
    // Default into the active section so the new card stays visible in the
    // current single-section view ("__unclassified__" / null = unclassified).
    const sectionId =
      activeSectionId && activeSectionId !== "__unclassified__"
        ? activeSectionId
        : undefined
    // Place the new card LAST in its section — addProjectCard auto-assigns the
    // section's max order + 1, so a fresh card never lands at the front of a
    // reordered section.
    await createTextCard({
      title,
      content,
      projectId: activeProjectId,
      ...(sectionId ? { sectionId } : {})
    })
    setNewCardOpen(false)
    setNewCardTitle("")
    setNewCardContent("")
    onSearch(activeProjectId)
  }, [newCardTitle, newCardContent, activeProjectId, activeSectionId, onSearch])

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
