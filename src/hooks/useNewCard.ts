import { useCallback, useState } from "react"

import { addItem } from "../database"
import type { Item } from "../types"
import { maxScopeOrder } from "../utils"

export function useNewCard({
  activeProjectId,
  activeSectionId,
  onSearch,
  allItemsUnfiltered
}: {
  activeProjectId: string | null
  activeSectionId: string | null
  onSearch: (projectId?: string | null) => void
  allItemsUnfiltered: Item[]
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
    // Place the new card LAST in its section: order = max(existing) + 1.
    // Cards sort by `order ?? 0` first, then createdAt — an explicit order is
    // required so a fresh card (undefined order, ties at 0) doesn't jump to
    // the front of a reordered section. The unfiltered item set keeps active
    // search/date filters from hiding same-scope cards with higher orders.
    const maxOrder = maxScopeOrder(allItemsUnfiltered, sectionId)
    const item: Item = {
      id: crypto.randomUUID(),
      type: "text",
      title,
      content,
      createdAt: Date.now(),
      projectId: activeProjectId,
      order: maxOrder + 1,
      ...(sectionId ? { sectionId } : {})
    }
    await addItem(item)
    setNewCardOpen(false)
    setNewCardTitle("")
    setNewCardContent("")
    onSearch(activeProjectId)
  }, [
    newCardTitle,
    newCardContent,
    activeProjectId,
    activeSectionId,
    onSearch,
    allItemsUnfiltered
  ])

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
