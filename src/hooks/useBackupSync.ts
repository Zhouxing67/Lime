import { useRef } from "react"

import {
  addPdf,
  applyPdfSync,
  bulkReplace,
  getAllAnnotations,
  getAllReviews,
  listPdfs
} from "../database"
import type { Item, PdfFile, Project } from "../types"
import {
  downloadPdfFiles,
  downloadRemote,
  runSync,
  uploadPdfFiles,
  type SyncCredentials
} from "../utils/sync"
import { toJsonZip } from "../utils/zip"

export function useBackupSync(options: {
  projects: Project[]
  allItemsUnfiltered: Item[]
  backupScope: "projects" | "pdfs"
  backupSelectedIds: string[]
  backupSelectedPdfIds: string[]
  pdfs: PdfFile[]
  syncStatus: string
  setSyncStatus: (status: string) => void
  refreshAllData: () => Promise<void>
  setSnackbarMsg: (msg: string) => void
}) {
  const {
    projects,
    allItemsUnfiltered,
    backupScope,
    backupSelectedIds,
    backupSelectedPdfIds,
    pdfs,
    setSyncStatus,
    refreshAllData,
    setSnackbarMsg
  } = options

  const backupFileInputRef = useRef<HTMLInputElement>(null)

  const getSyncCredentials = async (): Promise<SyncCredentials | null> => {
    const data = await chrome.storage.sync.get(["syncUsername", "syncPassword"])
    const u = data.syncUsername as string | undefined
    const p = data.syncPassword as string | undefined
    return u && p ? { username: u, appPassword: p } : null
  }

  const handleExportBackup = async () => {
    if (backupScope === "projects") {
      const items = allItemsUnfiltered.filter(
        (i) => i.projectId && backupSelectedIds.includes(i.projectId)
      )
      const selectedProjects = projects.filter((p) =>
        backupSelectedIds.includes(p.id)
      )
      const reviews = await getAllReviews()
      const scopedReviews = reviews.filter((r) =>
        backupSelectedIds.includes(r.projectId)
      )
      const blob = await toJsonZip(items, selectedProjects, scopedReviews)
      const url = URL.createObjectURL(blob)
      await chrome.downloads.download({ url, filename: "lime-backup.zip" })
      URL.revokeObjectURL(url)
    } else {
      const selectedPdfs = pdfs.filter((p) =>
        backupSelectedPdfIds.includes(p.id)
      )
      const pdfCards = allItemsUnfiltered.filter(
        (i) => i.pdfRef && backupSelectedPdfIds.includes(i.pdfRef.pdfId)
      )
      const annotations = (await getAllAnnotations()).filter((a) =>
        backupSelectedPdfIds.includes(a.pdfId)
      )
      const blob = await toJsonZip(
        pdfCards,
        [],
        [],
        selectedPdfs,
        annotations
      )
      const url = URL.createObjectURL(blob)
      const name = selectedPdfs.length === 1 ? selectedPdfs[0].name : "pdfs"
      const safe = name.replace(/[\\/:*?"<>|]/g, "-").slice(0, 60)
      await chrome.downloads.download({
        url,
        filename: `lime-pdf-${safe || "export"}.zip`
      })
      URL.revokeObjectURL(url)
    }
  }

  const handleUploadSync = async () => {
    try {
      const cred = await getSyncCredentials()
      if (!cred) {
        setSyncStatus("请先在设置中配置坚果云")
        return
      }
      const reviews = await getAllReviews()
      const annotations = await getAllAnnotations()
      const localPdfs = await listPdfs()
      const pdfMeta = localPdfs.map((p) => ({
        id: p.id,
        name: p.name,
        pageCount: p.pageCount,
        addedAt: p.addedAt,
        lastOpened: p.lastOpened,
        ...(p.topic ? { topic: p.topic } : {})
      }))
      const result = await runSync(
        cred,
        allItemsUnfiltered,
        projects,
        reviews,
        annotations,
        pdfMeta,
        setSyncStatus
      )
      if (result.success) {
        // PDF file layer: upload every local file the remote /pdfs/ lacks.
        await uploadPdfFiles(cred, localPdfs, setSyncStatus)
        chrome.storage.local.set({ lastSyncTime: Date.now() })
      }
      setSyncStatus(result.message)
    } catch (e) {
      setSnackbarMsg(`同步失败：${e}`)
      setSyncStatus("同步失败")
    }
  }

  const handleDownloadSync = async () => {
    try {
      const cred = await getSyncCredentials()
      if (!cred) {
        setSyncStatus("请先在设置中配置坚果云")
        return
      }

      const reviews = await getAllReviews()
      const annotations = await getAllAnnotations()
      const pdfMeta = (await listPdfs()).map((p) => ({
        id: p.id,
        name: p.name,
        pageCount: p.pageCount,
        addedAt: p.addedAt,
        lastOpened: p.lastOpened,
        ...(p.topic ? { topic: p.topic } : {})
      }))
      const remote = await downloadRemote(
        cred,
        allItemsUnfiltered,
        projects,
        reviews,
        annotations,
        pdfMeta,
        setSyncStatus
      )
      if (!remote.success) {
        setSyncStatus(remote.message || "下载失败")
        return
      }
      if (remote.payload) {
        if (remote.direction === "download") {
          setSyncStatus("正在应用数据…")
          await bulkReplace(
            remote.payload.items,
            remote.payload.projects,
            remote.payload.reviews ?? [],
            allItemsUnfiltered,
            projects,
            reviews
          )
          // PDF domain (notes only — local file bytes are preserved).
          const localPdfs = await listPdfs()
          await applyPdfSync(
            remote.payload.pdfs ?? [],
            remote.payload.pdfAnnotations ?? [],
            localPdfs,
            annotations
          )
        }
        // PDF file layer: ALWAYS attempt to pull missing files — a noop hash
        // match must not strand PDFs interrupted on a previous download.
        const localPdfs = await listPdfs()
        const fetched = await downloadPdfFiles(
          cred,
          remote.payload.pdfs ?? [],
          localPdfs,
          setSyncStatus
        )
        for (const { meta, bytes } of fetched) {
          await addPdf({
            id: meta.id,
            name: meta.name,
            bytes,
            pageCount: meta.pageCount,
            addedAt: meta.addedAt,
            lastOpened: meta.lastOpened,
            ...(meta.topic ? { topic: meta.topic } : {})
          })
        }
        chrome.storage.local.set({ lastSyncTime: Date.now() })
        const msg = remote.message || "从云端同步"
        setSyncStatus(msg)
        if (remote.direction === "download" || fetched.length > 0) {
          await refreshAllData()
        }
      }
    } catch (e) {
      setSnackbarMsg(`下载失败：${e}`)
      setSyncStatus("下载失败")
    }
  }

  return {
    backupFileInputRef,
    handleExportBackup,
    handleDownloadSync,
    handleUploadSync
  }
}
