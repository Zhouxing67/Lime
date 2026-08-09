import { useCallback, useMemo, useState } from "react"

import type {
  DisplayCard,
  Project,
  ProjectCard,
  SearchQuery
} from "../types"
import { compareCards } from "../utils"
import { searchProjectCards } from "../database/index"

const ITEMS_PER_PAGE = 20

export interface ProjectsViewOpts {
  /** EVERY project card across projects (review/hub/backup share this). */
  allProjectCardsUnfiltered: ProjectCard[]
  resolveDisplay: (card: ProjectCard) => DisplayCard
  draftByOriginal: Map<string, ProjectCard>
}

/** The projects view's own state + search + scope computation: the search
 *  keyword/date range, the active project/section scope, the batch selection,
 *  the pagination, and the derived display list. The shared data hub and the
 *  cross-view coordination stay in the composition root. */
export function useProjectsView({
  allProjectCardsUnfiltered,
  resolveDisplay,
  draftByOriginal
}: ProjectsViewOpts) {
  const [allProjectCards, setAllProjectCards] = useState<ProjectCard[]>([])
  const [keyword, setKeyword] = useState("")
  const [dateRange, setDateRange] = useState<{
    from?: number
    to?: number
  } | null>(null)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [activeSectionByProject, setActiveSectionByProject] = useState<
    Record<string, string | null>
  >({})
  const [expandedNav, setExpandedNav] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [projectDeleteTarget, setProjectDeleteTarget] =
    useState<Project | null>(null)
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE)

  const activeSectionId = activeProjectId
    ? (activeSectionByProject[activeProjectId] ?? null)
    : null

  const visibleProjectCards = useMemo(
    () =>
      allProjectCards.filter(
        (c) => c.isDraft || !draftByOriginal.has(c.id)
      ),
    [allProjectCards, draftByOriginal]
  )

  const displayCards = useMemo(
    () => visibleProjectCards.map(resolveDisplay),
    [visibleProjectCards, resolveDisplay]
  )

  const displayedItems = useMemo(
    () => displayCards.slice(0, visibleCount),
    [displayCards, visibleCount]
  )
  const hasMore = useMemo(
    () => displayCards.length > visibleCount,
    [displayCards.length, visibleCount]
  )

  const onSearch = useCallback(
    async (projectId?: string | null) => {
      const pid = projectId !== undefined ? projectId : activeProjectId
      const q: SearchQuery = {
        keyword,
        projectId: pid ?? undefined,
        from: dateRange?.from,
        to: dateRange?.to
      }
      const list = await searchProjectCards(q)
      // Todos live in their own store/view now — never mixed into project/search.
      list.sort(compareCards)
      setAllProjectCards(list)
      setVisibleCount(ITEMS_PER_PAGE)
    },
    [keyword, activeProjectId, dateRange]
  )

  return {
    allProjectCards,
    setAllProjectCards,
    keyword,
    setKeyword,
    dateRange,
    setDateRange,
    activeProjectId,
    setActiveProjectId,
    activeSectionByProject,
    setActiveSectionByProject,
    expandedNav,
    setExpandedNav,
    selectMode,
    setSelectMode,
    selectedIds,
    setSelectedIds,
    confirmDeleteId,
    setConfirmDeleteId,
    confirmBatchDelete,
    setConfirmBatchDelete,
    createDialogOpen,
    setCreateDialogOpen,
    projectDeleteTarget,
    setProjectDeleteTarget,
    visibleCount,
    setVisibleCount,
    activeSectionId,
    visibleProjectCards,
    displayCards,
    displayedItems,
    hasMore,
    onSearch
  }
}
