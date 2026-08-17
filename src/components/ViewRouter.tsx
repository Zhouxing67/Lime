import { Fragment, useCallback } from "react"
import {
  Box,
  CircularProgress,
  Container,
  Fade,
  Typography
} from "@mui/material"
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded"
import NoteAddRoundedIcon from "@mui/icons-material/NoteAddRounded"

import CardWorkspace from "./CardWorkspace"
import type { CardEditorValues } from "./CardEditorView"
import PdfView from "./PdfView"
import PdfHub from "./PdfHub"
import BackupView from "./BackupView"
import TodoView from "./TodoView"
import ReviewSession from "./ReviewSession"
import ProjectHub from "./ProjectHub"
import CardGrid from "./CardGrid"
import EmptyState from "./EmptyState"
import type { SidebarTab } from "./NavRail"
import type { DisplayCard, PdfAnnotation, PdfFile, PdfOutlineItem, Project, ProjectCard } from "../types"
import type { PdfSearchEntry, PdfSearchMatch } from "./pdfText"
import type { CardWorkspaceState } from "../hooks/useWorkspaceView"
import type { CardDropState } from "../hooks/useCardDragReorder"

interface CardWorkspaceHandlers {
  onCloseCardWorkspace: () => void
  onSaveCardWorkspace: (
    values: CardEditorValues,
    type: "text" | "image" | "placed"
  ) => void
  onSaveDraftCardWorkspace: (
    values: CardEditorValues,
    type: "text" | "image" | "placed"
  ) => void
  onDiscardCardWorkspace: () => void
}

export interface MainViewProps extends CardWorkspaceHandlers {
  cardWorkspace: CardWorkspaceState | null
  sidebarTab: SidebarTab
  pdfProps: PdfViewRouterProps
  backupProps: React.ComponentProps<typeof BackupView>
  todoProps: React.ComponentProps<typeof TodoView>
  reviewProps: ReviewViewRouterProps
  projectsProps: ProjectsMainProps
}

interface PdfViewRouterProps {
  openPdfIds: string[]
  activePdfId: string | null
  pdfOutlineDest: PdfOutlineItem | null
  setPdfOutlineDest: (item: PdfOutlineItem | null) => void
  pdfReaderOpen: boolean
  toggleReader: () => void
  swapLeft: () => void
  pdfFlashTarget: { page: number; annId: string; token: number } | null
  pdfClearRingToken: number
  annotationById: Map<string, PdfAnnotation>
  handlePdfAnnotationSelected: (annId: string | null) => void
  pdfTypeChangeTarget: { id: string; type: number; seq: number } | null
  handleJumpInPanel: (cardId: string) => void
  setPdfCurrentPage: (page: number) => void
  setPdfPageCount: (n: number) => void
  setPdfSidebarView: (v: "cards" | "search") => void
  searchRequest: {
    query: string
    caseSensitive: boolean
    wholeWord: boolean
    seq: number
  } | null
  handlePdfSearchResults: (res: {
    entries: PdfSearchEntry[]
    matches: PdfSearchMatch[]
  }) => void
  jumpRequest: { index: number; seq: number } | null
  topics: string[]
  pdfs: PdfFile[]
  countByPdf: Record<string, number>
  handleOpenPdf: (id: string) => void
  onOpenUrl?: () => void
  pdfFileInputRef: React.RefObject<HTMLInputElement | null>
  handleDeletePdf: (pdf: PdfFile) => void
  onRenamePdf?: (id: string, name: string) => void
  handleNewTopic: (name: string) => void
  handleRenameTopic: (oldName: string, name: string) => void
  handleDeleteTopic: (name: string) => void
  handleMovePdf: (id: string, topic: string) => void
  pdfBatchMode: boolean
  pdfBatchSelectedIds: string[]
  onTogglePdfBatchSelect: (id: string) => void
  onToast?: (message: string, severity?: "success" | "error") => void
}

type GridProps = React.ComponentProps<typeof CardGrid>
type SharedGridProps = Omit<
  GridProps,
  "items" | "selectMode" | "onSelectItem" | "onDeleteItem"
>

interface ReviewViewRouterProps {
  reviewDateFilter: string | null
  ratingFilter: 1 | 2 | 3 | null
  filteredDateItems: DisplayCard[]
  cardFirstRating: Map<string, 1 | 2 | 3>
  sharedCardGridProps: SharedGridProps
  item: DisplayCard | null
  ratedCount: number
  passedCount: number
  flipped: boolean
  completed: boolean
  animating: boolean
  masteredCount: number
  activeCount: number
  todayRatings: [number, number, number]
  streakDays: number
  onFlip: () => void
  onRate: (rating: 1 | 2 | 3) => void
  onExit: () => void
}

interface ProjectsMainProps {
  activeProject: Project | null
  projects: Project[]
  countByProject: Record<string, number>
  keyword: string
  setKeyword: (k: string) => void
  setDateRange: (d: { from?: number; to?: number } | null) => void
  handleOpenProject: (id: string) => void
  setCreateDialogOpen: (open: boolean) => void
  setProjectDeleteTarget: (p: Project | null) => void
  onRenameProject: (id: string, name: string) => void
  activeSectionId: string | null
  handleSelectSection: (id: string | null) => void
  sectionPath: { id: string; title: string }[]
  scopeItems: DisplayCard[]
  cardDraggedId: string | null
  cardDrop: CardDropState | null
  flipRectsRef: GridProps["flipRectsRef"]
  handleGripPointerDown: GridProps["onGripPointerDown"]
  openCardWorkspace: (view: "edit" | "create", card: DisplayCard | null) => void
  selectMode: boolean
  setSelectedIds: (fn: (prev: string[]) => string[]) => void
  onDelete: (id: string) => void
  displayedItems: DisplayCard[]
  hasMore: boolean
  allProjectCards: ProjectCard[]
  dateRange: { from?: number; to?: number } | null
  loadMoreRef: React.RefObject<HTMLDivElement | null>
  sharedCardGridProps: SharedGridProps
}

/** The main-area view router — maps the workspace state (cardWorkspace +
 *  sidebarTab) to the active view. Adding a view = a new branch here. */
export default function ViewRouter(props: MainViewProps) {
  const {
    cardWorkspace,
    sidebarTab,
    onCloseCardWorkspace,
    onSaveCardWorkspace,
    onSaveDraftCardWorkspace,
    onDiscardCardWorkspace,
    pdfProps,
    backupProps,
    todoProps,
    reviewProps,
    projectsProps
  } = props

  if (cardWorkspace) {
    return (
      <CardWorkspace
        view={cardWorkspace.view}
        card={cardWorkspace.card}
        onClose={onCloseCardWorkspace}
        onSave={onSaveCardWorkspace}
        onSaveDraft={onSaveDraftCardWorkspace}
        onDiscard={onDiscardCardWorkspace}
      />
    )
  }

  if (sidebarTab === "pdf") return <PdfViewRouter {...pdfProps} />

  return (
    <Container sx={{ py: 4 }} maxWidth="xl">
      <Fade in key={sidebarTab} timeout={250}>
        <Box>
          {sidebarTab === "backup" ? (
            <BackupView {...backupProps} />
          ) : sidebarTab === "todo" ? (
            <TodoView {...todoProps} />
          ) : sidebarTab === "review" ? (
            <ReviewViewRouter {...reviewProps} />
          ) : (
            <ProjectsMain {...projectsProps} />
          )}
        </Box>
      </Fade>
    </Container>
  )
}

function PdfViewRouter(props: PdfViewRouterProps) {
  const {
    openPdfIds,
    activePdfId,
    pdfOutlineDest,
    setPdfOutlineDest,
    pdfReaderOpen,
    toggleReader,
    swapLeft,
    pdfFlashTarget,
    pdfClearRingToken,
    annotationById,
    handlePdfAnnotationSelected,
    pdfTypeChangeTarget,
    handleJumpInPanel,
    setPdfCurrentPage,
    setPdfPageCount,
    setPdfSidebarView,
    searchRequest,
    handlePdfSearchResults,
    jumpRequest,
    topics,
    pdfs,
    countByPdf,
    handleOpenPdf,
    onOpenUrl,
    pdfFileInputRef,
    handleDeletePdf,
    onRenamePdf,
    handleNewTopic,
    handleRenameTopic,
    handleDeleteTopic,
    handleMovePdf,
    pdfBatchMode,
    pdfBatchSelectedIds,
    onTogglePdfBatchSelect,
    onToast
  } = props
  if (openPdfIds.length === 0) {
    return (
      <Box
        sx={{
          height: "100%",
          overflowY: "auto",
          bgcolor: (t) => t.custom.surface2
        }}>
        <Container sx={{ py: 4 }} maxWidth="xl">
          <PdfHub
            key={topics.join("|")}
            pdfs={pdfs}
            countByPdf={countByPdf}
            onOpenPdf={handleOpenPdf}
            onNewPdf={() => pdfFileInputRef.current?.click()}
            onOpenUrl={onOpenUrl}
            onDeletePdf={handleDeletePdf}
            onRenamePdf={onRenamePdf}
            topics={topics}
            onNewTopic={handleNewTopic}
            onRenameTopic={handleRenameTopic}
            onDeleteTopic={handleDeleteTopic}
            onMovePdf={handleMovePdf}
            selectable={pdfBatchMode}
            selected={(id) => pdfBatchSelectedIds.includes(id)}
            onToggleSelect={onTogglePdfBatchSelect}
          />
        </Container>
      </Box>
    )
  }
  return (
    <Box sx={{ height: "100%", minHeight: 0, overflow: "hidden" }}>
      {activePdfId && openPdfIds.includes(activePdfId) ? (
        <Box key={activePdfId} sx={{ height: "100%", minHeight: 0 }}>
          <PdfView
            pdfId={activePdfId}
            outlineDest={pdfOutlineDest}
            onOutlineClick={(item) => setPdfOutlineDest(item)}
            readerOpen={pdfReaderOpen}
            onToggleReader={toggleReader}
            onSwapLeft={swapLeft}
            flashTarget={pdfFlashTarget}
            onJumpInPanel={handleJumpInPanel}
            onVisiblePageChange={setPdfCurrentPage}
            onPageCountChange={setPdfPageCount}
            onSearchClick={() => setPdfSidebarView("search")}
            searchRequest={searchRequest}
            onSearchResults={handlePdfSearchResults}
            jumpRequest={jumpRequest}
            typeChangeRequest={pdfTypeChangeTarget}
            onAnnotationSelected={handlePdfAnnotationSelected}
            clearRingToken={pdfClearRingToken}
            annotationById={annotationById}
            onToast={onToast}
          />
        </Box>
      ) : (
        <PdfHub
          key={topics.join("|")}
          pdfs={pdfs}
          countByPdf={countByPdf}
          onOpenPdf={handleOpenPdf}
          onNewPdf={() => pdfFileInputRef.current?.click()}
          onOpenUrl={onOpenUrl}
          onDeletePdf={handleDeletePdf}
          onRenamePdf={onRenamePdf}
          topics={topics}
          onNewTopic={handleNewTopic}
          onRenameTopic={handleRenameTopic}
          onDeleteTopic={handleDeleteTopic}
          onMovePdf={handleMovePdf}
        />
      )}
    </Box>
  )
}

const noSelect = () => {}
const noDelete = () => {}

function ReviewViewRouter(props: ReviewViewRouterProps) {
  const { reviewDateFilter, ratingFilter, filteredDateItems } = props
  if (reviewDateFilter) {
    return (
      <Box>
        {ratingFilter && filteredDateItems.length === 0 ? (
          <EmptyState
            iconSize={64}
            icon={<SearchOffRoundedIcon className="empty-icon" />}
            title="该评分下无卡片"
            subtitle="切换评分或清除筛选试试"
          />
        ) : (
          <CardGrid
            items={filteredDateItems}
            selectMode={false}
            readOnly
            onSelectItem={noSelect}
            onDeleteItem={noDelete}
            firstRating={props.cardFirstRating}
            {...props.sharedCardGridProps}
          />
        )}
      </Box>
    )
  }
  const {
    reviewDateFilter: _df,
    ratingFilter: _rf,
    filteredDateItems: _fdi,
    cardFirstRating: _cfr,
    sharedCardGridProps: _scg,
    ...sessionProps
  } = props
  return <ReviewSession {...sessionProps} />
}

function ProjectsMain(props: ProjectsMainProps) {
  const {
    activeProject,
    projects,
    countByProject,
    keyword,
    setKeyword,
    setDateRange,
    handleOpenProject,
    setCreateDialogOpen,
    setProjectDeleteTarget,
    onRenameProject,
    activeSectionId,
    handleSelectSection,
    sectionPath,
    scopeItems,
    cardDraggedId,
    cardDrop,
    flipRectsRef,
    handleGripPointerDown,
    openCardWorkspace,
    selectMode,
    setSelectedIds,
    onDelete,
    displayedItems,
    hasMore,
    allProjectCards,
    dateRange,
    loadMoreRef,
    sharedCardGridProps
  } = props
  const handleSelectItem = useCallback(
    (id: string) => {
      setSelectedIds((prev) =>
        prev.includes(id)
          ? prev.filter((i) => i !== id)
          : [...prev, id]
      )
    },
    [setSelectedIds]
  )
  const handleNewCard = useCallback(
    () => openCardWorkspace("create", null),
    [openCardWorkspace]
  )
  return (
    <>
      {!activeProject && (
        <ProjectHub
          projects={projects}
          countByProject={countByProject}
          keyword={keyword}
          onOpenProject={(id) => {
            // Hub keyword is a project filter, never a card search — clear it
            // so the project opens unfiltered.
            setKeyword("")
            setDateRange(null)
            handleOpenProject(id)
          }}
          onNewProject={() => setCreateDialogOpen(true)}
          onDeleteProject={(id) => {
            const proj = projects.find((p) => p.id === id)
            if (proj) setProjectDeleteTarget(proj)
          }}
          onRenameProject={onRenameProject}
        />
      )}

      {activeProject && !keyword && !dateRange && (
        <>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: 0.5,
              pb: 1.5,
              mb: 1,
              borderBottom: "1px solid",
              borderColor: "divider"
            }}>
            <Typography
              variant="body2"
              noWrap
              sx={{
                color: "text.secondary",
                fontSize: "0.85rem",
                minWidth: 0
              }}>
              <Box
                component="span"
                sx={{
                  color: "text.primary",
                  fontWeight: 600,
                  cursor: activeSectionId ? "pointer" : "default",
                  "&:hover": activeSectionId
                    ? { color: "primary.main" }
                    : undefined
                }}
                onClick={
                  activeSectionId ? () => handleSelectSection(null) : undefined
                }>
                {activeProject.name}
              </Box>
              {sectionPath.length > 0 &&
                sectionPath.map((seg, i) => {
                  const isLast = i === sectionPath.length - 1
                  const goTo = isLast
                    ? undefined
                    : () => handleSelectSection(seg.id)
                  return (
                    <Fragment key={seg.id}>
                      <Box component="span" sx={{ mx: 0.75, color: "text.disabled" }}>
                        /
                      </Box>
                      <Box
                        component="span"
                        sx={{
                          cursor: goTo ? "pointer" : "default",
                          color: isLast ? "text.secondary" : "text.primary",
                          "&:hover": goTo ? { color: "primary.main" } : undefined
                        }}
                        onClick={goTo}>
                        {seg.title}
                      </Box>
                    </Fragment>
                  )
                })}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: "text.disabled",
                fontSize: "0.75rem",
                flexShrink: 0
              }}>
              {scopeItems.length} 张
            </Typography>
          </Box>
          <CardGrid
            items={scopeItems}
            draggable
            draggedId={cardDraggedId}
            dropIndicator={cardDrop}
            flipRectsRef={flipRectsRef}
            onGripPointerDown={handleGripPointerDown}
            onNewCard={handleNewCard}
            selectMode={selectMode}
            onSelectItem={handleSelectItem}
            onDeleteItem={onDelete}
            {...sharedCardGridProps}
          />
        </>
      )}

      {activeProject && (keyword || dateRange) && (
        <CardGrid
          items={displayedItems}
          selectMode={selectMode}
          onSelectItem={handleSelectItem}
          onDeleteItem={onDelete}
          {...sharedCardGridProps}
        />
      )}

      {activeProject &&
        !hasMore &&
        allProjectCards.length === 0 &&
        (keyword ? (
          <EmptyState
            icon={<SearchOffRoundedIcon className="empty-icon" />}
            title="没有找到匹配的卡片"
            subtitle="试试其他关键词"
          />
        ) : dateRange ? (
          <EmptyState
            icon={<SearchOffRoundedIcon className="empty-icon" />}
            title="该时间段内无相关卡片"
            subtitle="请调整日期范围"
          />
        ) : (
          <EmptyState
            icon={<NoteAddRoundedIcon className="empty-icon" />}
            title="此项目暂无卡片"
            subtitle="点击顶部 ＋ 按钮新建一张卡片"
          />
        ))}

      {activeProject &&
        !keyword &&
        !dateRange &&
        allProjectCards.length > 0 &&
        scopeItems.length === 0 && (
          <EmptyState
            icon={<NoteAddRoundedIcon className="empty-icon" />}
            title="此章节暂无卡片"
            subtitle="使用「移动到章节」整理卡片到具体章节"
          />
        )}

      {hasMore && activeProject && (keyword || dateRange) && (
        <Box
          ref={loadMoreRef}
          sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      )}
    </>
  )
}
