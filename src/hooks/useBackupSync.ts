import { useRef } from "react"

import {
  addPdf,
  applyPdfSync,
  bulkReplace,
  getAllAnnotations,
  getAllPdfCards,
  getAllVocabularyCards,
  getAllProjectCards,
  getAllReadLater,
  getAllReviews,
  getAllTodos,
  listPdfs,
  listPdfMeta
} from "../database"
import type { Project, ProjectCard } from "../types"
import {
  collectImageFiles,
  downloadImageFiles,
  downloadPdfFiles,
  downloadRemote,
  hydratePayloadImages,
  pruneRemoteImages,
  pruneRemotePdfs,
  runSync,
  uploadImageFiles,
  uploadPdfFiles,
  type SyncCredentials,
  sanitizeSyncPayload,
} from "../utils/sync"
import { toJsonZip } from "../utils/zip"

export function useBackupSync(options: {
  projects: Project[]
  allItemsUnfiltered: ProjectCard[]
  backupScope: "projects" | "pdfs"
  backupSelectedIds: string[]
  backupSelectedPdfIds: string[]
  syncStatus: string
  setSyncStatus: (status: string) => void
  setSnackbarMsg: (msg: string, severity?: "success" | "error") => void
}) {
  const {
    projects,
    allItemsUnfiltered,
    backupScope,
    backupSelectedIds,
    backupSelectedPdfIds,
    setSyncStatus,
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
      const projectCards = allItemsUnfiltered.filter(
        (c) => c.projectId && backupSelectedIds.includes(c.projectId)
      )
      // A placed card carries NO content — its quote lives in the linked
      // pdfCard. Include those pdfCards so the backup is self-contained.
      const referencedPdfIds = new Set(
        projectCards
          .map((c) => c.pdfCardId)
          .filter((id): id is string => Boolean(id))
      )
      const referencedVocabularyIds = new Set(
        projectCards
          .map((card) => card.pdfVocabularyCardId)
          .filter((id): id is string => Boolean(id))
      )
      const referencedVocabularyCards = (await getAllVocabularyCards()).filter(
        (card) => referencedVocabularyIds.has(card.id)
      )
      const allPdfCards = await getAllPdfCards()
      const referencedPdfCards = allPdfCards.filter((c) =>
        referencedPdfIds.has(c.id)
      )
      // A placed card's quote/crop lives in the linked ANNOTATION — include the
      // referenced annotations so a restore is fully self-contained (a
      // placement without its annotation renders an empty card, A8).
      const referencedAnnIds = new Set(
        referencedPdfCards
          .map((c) => c.annotationId)
          .filter((id): id is string => Boolean(id))
      )
      const referencedAnnotations = referencedAnnIds.size
        ? (await getAllAnnotations()).filter((a) =>
            referencedAnnIds.has(a.id)
          )
        : []
      // Todos are global — the projects-scope export carries them all.
      const todos = await getAllTodos()
      const selectedProjects = projects.filter((p) =>
        backupSelectedIds.includes(p.id)
      )
      const reviews = await getAllReviews()
      const scopedReviews = reviews.filter((r) =>
        backupSelectedIds.includes(r.projectId)
      )
      const blob = await toJsonZip(
        projectCards,
        referencedPdfCards,
        todos,
        selectedProjects,
        scopedReviews,
        undefined,
        referencedAnnotations,
        // readLater is global like todos — the projects-scope export carries
        // them all so a restore doesn't lose them.
        await getAllReadLater(),
        referencedVocabularyCards
      )
      const url = URL.createObjectURL(blob)
      await chrome.downloads.download({ url, filename: "lime-backup.zip" })
      URL.revokeObjectURL(url)
    } else {
      // PDF-scope export embeds the real bytes — load the FULL records only on
      // export (the shared library list carries no blobs, listPdfs pulls them).
      const allPdfs = await listPdfs()
      const selectedPdfs = allPdfs.filter((p) =>
        backupSelectedPdfIds.includes(p.id)
      )
      const allPdfCards = await getAllPdfCards()
      const pdfCards = allPdfCards.filter((c) =>
        backupSelectedPdfIds.includes(c.pdfId)
      )
      // Preserve the placements of the exported pdfCards (the reverse of the
      // projects scope) so a restore can re-place them into matching projects.
      const pdfCardIds = new Set(pdfCards.map((c) => c.id))
      const placements = allItemsUnfiltered.filter(
        (c) => c.pdfCardId && pdfCardIds.has(c.pdfCardId)
      )
      const annotations = (await getAllAnnotations()).filter((a) =>
        backupSelectedPdfIds.includes(a.pdfId)
      )
      const vocabularyCards = (await getAllVocabularyCards()).filter((card) =>
        backupSelectedPdfIds.includes(card.pdfId)
      )
      const vocabularyIds = new Set(vocabularyCards.map((card) => card.id))
      placements.push(
        ...allItemsUnfiltered.filter(
          (card) =>
            card.pdfVocabularyCardId &&
            vocabularyIds.has(card.pdfVocabularyCardId) &&
            !placements.some((placement) => placement.id === card.id)
        )
      )
      const vocabularyProjects = projects.filter(
        (project) => project.systemKind === "vocabulary"
      )
      const blob = await toJsonZip(
        placements,
        pdfCards,
        [],
        vocabularyProjects,
        [],
        selectedPdfs,
        annotations,
        // readLater is global — carry it in the PDF-scope export too.
        await getAllReadLater(),
        vocabularyCards
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

  const handleUploadSync = async (force = false) => {
    try {
      // Force: a previous sync may have set lastSyncTime with no new writes —
      // the runSync would skip ("数据无变化"). Zeroing it makes the next run
      // always proceed (e.g. to migrate the remote to a newer payload format).
      if (force) await chrome.storage.local.set({ lastSyncTime: 0 })
      const cred = await getSyncCredentials()
      if (!cred) {
        setSyncStatus("请先在设置中配置坚果云")
        return
      }
      const pdfCards = await getAllPdfCards()
      const todos = await getAllTodos()
      const reviews = await getAllReviews()
      const annotations = await getAllAnnotations()
      const readLater = await getAllReadLater()
      const vocabularyCards = await getAllVocabularyCards()
      const localPdfs = await listPdfs()
      const pdfMeta = localPdfs.map((p) => ({
        id: p.id,
        name: p.name,
        pageCount: p.pageCount,
        addedAt: p.addedAt,
        lastOpened: p.lastOpened,
        lastPage: p.lastPage,
        ...(p.topic ? { topic: p.topic } : {})
      }))
      const result = await runSync(
        cred,
        allItemsUnfiltered,
        pdfCards,
        todos,
        projects,
        reviews,
        annotations,
        pdfMeta,
        readLater,
        setSyncStatus,
        vocabularyCards
      )
      if (result.success) {
        // PDF file layer: upload every local file the remote /pdfs/ lacks,
        // then prune the remote files the local has deleted.
        await uploadPdfFiles(cred, localPdfs, setSyncStatus)
        await pruneRemotePdfs(cred, localPdfs)
        // Image file layer: the sync copies carry references only — PUT the
        // missing /images/ files, then prune the ones no record references.
        const images = await collectImageFiles(
          allItemsUnfiltered,
          annotations,
          pdfCards
        )
        await uploadImageFiles(cred, images, setSyncStatus)
        await pruneRemoteImages(
          cred,
          images,
          result.remoteImageRefs ?? new Set<string>(),
          setSyncStatus
        )
        chrome.storage.local.set({ lastSyncTime: Date.now() })
      } else {
        setSnackbarMsg(result.message, "error")
      }
      setSyncStatus(result.message)
    } catch (e) {
      setSnackbarMsg(`同步失败：${e}`, "error")
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

      const pdfCards = await getAllPdfCards()
      const todos = await getAllTodos()
      const reviews = await getAllReviews()
      const annotations = await getAllAnnotations()
      const readLater = await getAllReadLater()
      const vocabularyCards = await getAllVocabularyCards()
      const pdfMeta = (await listPdfMeta()).map((p) => ({
        id: p.id,
        name: p.name,
        pageCount: p.pageCount,
        addedAt: p.addedAt,
        lastOpened: p.lastOpened,
        lastPage: p.lastPage,
        ...(p.topic ? { topic: p.topic } : {})
      }))
      const remote = await downloadRemote(
        cred,
        allItemsUnfiltered,
        pdfCards,
        todos,
        projects,
        reviews,
        annotations,
        pdfMeta,
        readLater,
        setSyncStatus,
        vocabularyCards
      )
      if (!remote.success) {
        setSyncStatus(remote.message || "下载失败")
        return
      }
      if (remote.payload) {
        // Validate the downloaded record arrays against the single-source
        // schemas BEFORE applying — corrupt records are skipped, never written
        // into the DB.
        const { payload: cleanPayload, skipped } = sanitizeSyncPayload(remote.payload)
        if (skipped > 0) {
          console.warn(`[lime] sync: ${skipped} 条记录因校验失败被跳过`)
          setSyncStatus(`下载：${skipped} 条无效记录已跳过`)
        }
        // Image file layer: pull the referenced /images/ files + hydrate the
        // stripped image fields (v6 references) back into local-form data-URLs.
        const { files: imageFiles, unresolved } = await downloadImageFiles(
          cred,
          cleanPayload,
          setSyncStatus
        )
        const hydrated = hydratePayloadImages(cleanPayload, imageFiles)
        // Records whose image ref couldn't resolve (dangling remote file) KEEP
        // their local version — never overwrite a local image with an
        // imageless remote record (A1).
        if (unresolved.size > 0) {
          const refs = cleanPayload.images ?? {}
          const drop = (id: string) => unresolved.has(refs[id] ?? "")
          hydrated.projectCards = hydrated.projectCards.filter((c) => !drop(c.id))
          hydrated.pdfCards = hydrated.pdfCards.filter((c) => !drop(c.id))
          hydrated.pdfAnnotations = hydrated.pdfAnnotations.filter((a) => !drop(a.id))
        }
        if (remote.direction === "download") {
          setSyncStatus("正在应用数据…")
          await bulkReplace(
            hydrated.projectCards ?? [],
            hydrated.pdfCards ?? [],
            hydrated.todos ?? [],
            hydrated.projects ?? [],
            hydrated.reviews ?? [],
            await getAllProjectCards(),
            await getAllPdfCards(),
            await getAllTodos(),
            projects,
            reviews,
            hydrated.readLater ?? [],
            readLater,
            hydrated.pdfVocabularyCards ?? [],
            vocabularyCards
          )
          // PDF domain (notes only — local file bytes are preserved).
          await applyPdfSync(
            hydrated.pdfs ?? [],
            hydrated.pdfAnnotations ?? [],
            annotations
          )
        }
        // PDF file layer: ALWAYS attempt to pull missing files — a noop hash
        // match must not strand PDFs interrupted on a previous download.
        const localPdfs = await listPdfs()
        // Persist each PDF as it downloads (never accumulate N blobs in memory).
        await downloadPdfFiles(
          cred,
          cleanPayload.pdfs ?? [],
          localPdfs,
          setSyncStatus,
          async (meta, bytes) => {
            await addPdf({
              id: meta.id,
              name: meta.name,
              bytes,
              pageCount: meta.pageCount,
              addedAt: meta.addedAt,
              lastOpened: meta.lastOpened,
              lastPage: meta.lastPage,
              ...(meta.topic ? { topic: meta.topic } : {})
            })
          }
        )
        chrome.storage.local.set({ lastSyncTime: Date.now() })
        const msg = remote.message || "从云端同步"
        setSyncStatus(msg)
        // Download writes broadcast every store stamp — the per-stamp
        // listeners reload each source; no explicit full refresh (R5).
      }
    } catch (e) {
      setSnackbarMsg(`下载失败：${e}`, "error")
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
