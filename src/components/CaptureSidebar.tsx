import type React from "react"

import type { Project } from "../types"
import {
  FloatingPanelContent,
  PanelErrorBoundary
} from "./FloatingPanel"
import type { PanelData, PanelPosition } from "./FloatingPanel"

/** Right-docked capture surface (switch model: only one of the floating
 *  panel / this sidebar is mounted at a time, sharing the same draft). */
export default function CaptureSidebar({
  data,
  width,
  onWidthChange,
  projects,
  selectedProjectId,
  title,
  setTitle,
  content,
  setContent,
  imageDraft,
  setImageDraft,
  onClose,
  onSaved,
  onProjectsChange,
  onSelectedProjectChange,
  onDirtyChange,
  onBackToPanel
}: {
  data: PanelData
  width: number
  onWidthChange: (w: number) => void
  projects: Project[]
  selectedProjectId: string
  title: string
  setTitle: (v: string) => void
  content: string
  setContent: React.Dispatch<React.SetStateAction<string>>
  imageDraft: string
  setImageDraft: (v: string) => void
  onClose: () => void
  onSaved: () => void
  onProjectsChange: (projects: Project[]) => void
  onSelectedProjectChange: (id: string) => void
  onDirtyChange?: (isDirty: boolean) => void
  onBackToPanel: () => void
}) {
  const noop = () => {}
  return (
    <PanelErrorBoundary>
      <FloatingPanelContent
        variant="sidebar"
        data={data}
        width={width}
        onWidthChange={onWidthChange}
        pinned={false}
        position={{ left: 0, top: 0 } as PanelPosition}
        projects={projects}
        selectedProjectId={selectedProjectId}
        title={title}
        setTitle={setTitle}
        content={content}
        setContent={setContent}
        imageDraft={imageDraft}
        setImageDraft={setImageDraft}
        onClose={onClose}
        onSaved={onSaved}
        onPinChange={noop}
        onPositionChange={noop}
        onProjectsChange={onProjectsChange}
        onSelectedProjectChange={onSelectedProjectChange}
        onDirtyChange={onDirtyChange}
        onBackToPanel={onBackToPanel}
      />
    </PanelErrorBoundary>
  )
}
