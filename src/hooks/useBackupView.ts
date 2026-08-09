import { useCallback, useState } from "react"

import type { PdfFile, Project } from "../types"

/** The backup view's own selection + scope state. The export/download/sync
 *  handlers stay in the composition root (they coordinate the WebDAV layer). */
export function useBackupView({
  projects,
  pdfs
}: {
  projects: Project[]
  pdfs: PdfFile[]
}) {
  const [backupSelectedIds, setBackupSelectedIds] = useState<string[]>([])
  const [backupScope, setBackupScope] = useState<"projects" | "pdfs">(
    "projects"
  )
  const [backupKeyword, setBackupKeyword] = useState("")
  const [backupSelectedPdfIds, setBackupSelectedPdfIds] = useState<string[]>([])

  const handleBackupToggleSelect = useCallback(
    (id: string) => {
      if (backupScope === "projects") {
        setBackupSelectedIds((prev) =>
          prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        )
      } else {
        setBackupSelectedPdfIds((prev) =>
          prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        )
      }
    },
    [backupScope]
  )

  const handleBackupSelectAll = useCallback(() => {
    if (backupScope === "projects") {
      setBackupSelectedIds((prev) =>
        prev.length === projects.length ? [] : projects.map((p) => p.id)
      )
    } else {
      setBackupSelectedPdfIds((prev) =>
        prev.length === pdfs.length ? [] : pdfs.map((p) => p.id)
      )
    }
  }, [backupScope, projects, pdfs])

  return {
    backupSelectedIds,
    setBackupSelectedIds,
    backupScope,
    setBackupScope,
    backupKeyword,
    setBackupKeyword,
    backupSelectedPdfIds,
    setBackupSelectedPdfIds,
    handleBackupToggleSelect,
    handleBackupSelectAll
  }
}
