import type React from "react"

import type { Project } from "../types"
import { FloatingPanelContent, PanelErrorBoundary } from "./FloatingPanel"
import type { PanelData } from "./FloatingPanel"

/** The right-docked capture sidebar — the single capture surface (the floating
 *  panel was removed). Shares the lifted draft with the entry. */
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
  captureType,
  onClose,
  onProjectsChange,
  onSelectedProjectChange,
  onDirtyChange,
  onCaptureRegion
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
  captureType: "text" | "image"
  onClose: () => void
  onProjectsChange: (projects: Project[]) => void
  onSelectedProjectChange: (id: string) => void
  onDirtyChange?: (isDirty: boolean) => void
  onCaptureRegion: () => void
}) {
  return (
    <PanelErrorBoundary>
      <FloatingPanelContent
        data={data}
        width={width}
        onWidthChange={onWidthChange}
        projects={projects}
        selectedProjectId={selectedProjectId}
        title={title}
        setTitle={setTitle}
        content={content}
        setContent={setContent}
        imageDraft={imageDraft}
        setImageDraft={setImageDraft}
        captureType={captureType}
        onClose={onClose}
        onProjectsChange={onProjectsChange}
        onSelectedProjectChange={onSelectedProjectChange}
        onDirtyChange={onDirtyChange}
        onCaptureRegion={onCaptureRegion}
      />
    </PanelErrorBoundary>
  )
}
