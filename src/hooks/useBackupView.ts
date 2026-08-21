import { useCallback, useState } from "react"

import type { PdfMetaLite } from "../database"
import type { Project } from "../types"

/** The backup view's own selection + scope state. The export/download/sync
 *  handlers stay in the composition root (they coordinate the WebDAV layer). */
export function useBackupView({
  projects,
  pdfs
}: {
  projects: Project[]
  pdfs: PdfMetaLite[]
}) {
  const [backupSelectedIds, setBackupSelectedIds] = useState<string[]>([])
  const [backupScope, setBackupScope] = useState<"projects" | "pdfs">(
    "projects"
  )
  const [backupKeyword, setBackupKeyword] = useState("")
  const [backupSelectedPdfIds, setBackupSelectedPdfIds] = useState<string[]>([])

  const normalizedKeyword = backupKeyword.trim().toLowerCase()
  const backupVisibleIds =
    backupScope === "projects"
      ? projects
          .filter(
            (project) =>
              !normalizedKeyword ||
              project.name.toLowerCase().includes(normalizedKeyword) ||
              (project.note ?? "").toLowerCase().includes(normalizedKeyword)
          )
          .map((project) => project.id)
      : pdfs
          .filter(
            (pdf) =>
              !normalizedKeyword ||
              pdf.name.toLowerCase().includes(normalizedKeyword)
          )
          .map((pdf) => pdf.id)

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
      setBackupSelectedIds((prev) => {
        const visible = new Set(backupVisibleIds)
        const allVisibleSelected = backupVisibleIds.every((id) =>
          prev.includes(id)
        )
        return allVisibleSelected
          ? prev.filter((id) => !visible.has(id))
          : [...new Set([...prev, ...backupVisibleIds])]
      })
    } else {
      setBackupSelectedPdfIds((prev) => {
        const visible = new Set(backupVisibleIds)
        const allVisibleSelected = backupVisibleIds.every((id) =>
          prev.includes(id)
        )
        return allVisibleSelected
          ? prev.filter((id) => !visible.has(id))
          : [...new Set([...prev, ...backupVisibleIds])]
      })
    }
  }, [backupScope, backupVisibleIds])

  return {
    backupSelectedIds,
    backupScope,
    setBackupScope,
    backupKeyword,
    setBackupKeyword,
    backupSelectedPdfIds,
    backupVisibleIds,
    handleBackupToggleSelect,
    handleBackupSelectAll
  }
}
