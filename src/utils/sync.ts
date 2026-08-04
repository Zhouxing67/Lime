import type { Item, PdfAnnotation, PdfFile, Project, ReviewEntry } from "../types"
import { sendMessage } from "../types/messages"
import { base64ToBytes, blobToUint8, bytesToBase64, computeItemHash } from "./index"

const SYNC_PATH = "/Apps/lime/lime-sync.json"
const BASE_URL = "https://dav.jianguoyun.com/dav"

export interface SyncCredentials {
  username: string
  appPassword: string
}

/** PDF metadata as it travels in the sync payload (never the file bytes). */
export type PdfSyncMeta = Pick<PdfFile, "id" | "name" | "pageCount" | "addedAt" | "lastOpened">

interface SyncPayload {
  version: number
  syncedAt: number
  contentHash: string
  deviceInfo: { version: string }
  projects: Project[]
  items: Item[]
  reviews: ReviewEntry[]
  pdfAnnotations: PdfAnnotation[]
  pdfs: PdfSyncMeta[]
}

export interface SyncResult {
  success: boolean
  direction: "upload" | "download" | "noop" | "error"
  message: string
  payload?: SyncPayload
}

async function bgFetch(
  cred: SyncCredentials,
  path: string,
  options: { method?: string; body?: string; contentType?: string } = {}
): Promise<{ ok: boolean; status: number; body: string }> {
  const authBase64 = btoa(`${cred.username}:${cred.appPassword}`)
  return sendMessage<{ ok: boolean; status: number; body: string }>({
    kind: "webdav",
    url: `${BASE_URL}${path}`,
    method: options.method ?? "GET",
    authBase64,
    body: options.body,
    contentType: options.contentType
  })
}

// ---- PDF file sync (multi-file layer under lime-sync.json) ----

/** Binary fetch: upload body is base64, response body is base64. */
async function bgFetchBinary(
  cred: SyncCredentials,
  path: string,
  options: { method?: string; bodyBase64?: string } = {}
): Promise<{ ok: boolean; status: number; body: string }> {
  const authBase64 = btoa(`${cred.username}:${cred.appPassword}`)
  return sendMessage<{ ok: boolean; status: number; body: string }>({
    kind: "webdav",
    url: `${BASE_URL}${path}`,
    method: options.method ?? "GET",
    authBase64,
    body: options.bodyBase64,
    contentType: "application/pdf",
    binary: true
  })
}

/** Enumerate the remote /pdfs/ folder → the stored "<contentHash>.pdf" names. */
export async function listRemotePdfs(
  cred: SyncCredentials
): Promise<string[]> {
  const res = await bgFetch(cred, "/Apps/lime/pdfs/", { method: "PROPFIND" })
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`读取云端 PDF 列表失败：HTTP ${res.status}`)
  const doc = new DOMParser().parseFromString(res.body, "application/xml")
  const names = new Set<string>()
  for (const el of Array.from(doc.getElementsByTagName("*"))) {
    if (el.localName !== "href") continue
    const m = (el.textContent ?? "").match(/\/pdfs\/([^/]+\.pdf)$/)
    if (m) names.add(m[1])
  }
  return [...names]
}

/** Upload every local PDF file (with bytes) that the remote /pdfs/ folder
 *  doesn't have yet — PDFs are immutable (content-hash id) so each is PUT once. */
export async function uploadPdfFiles(
  cred: SyncCredentials,
  localPdfs: PdfFile[],
  onStatus?: (status: string) => void
): Promise<void> {
  const withBytes = localPdfs.filter((p) => p.bytes)
  if (withBytes.length === 0) return
  await bgFetch(cred, "/Apps/lime/pdfs/", { method: "MKCOL" }).catch(() => {})
  const remote = new Set(await listRemotePdfs(cred))
  let done = 0
  for (const pdf of withBytes) {
    if (remote.has(`${pdf.id}.pdf`)) continue
    done++
    onStatus?.(`正在上传 PDF 文件 (${done}/${withBytes.length})…`)
    const bytes = await blobToUint8(pdf.bytes!)
    const res = await bgFetchBinary(cred, `/Apps/lime/pdfs/${pdf.id}.pdf`, {
      method: "PUT",
      bodyBase64: bytesToBase64(bytes)
    })
    if (!res.ok && res.status !== 405)
      throw new Error(`PDF 上传失败：HTTP ${res.status}`)
  }
}

/** Download the PDF files the remote has that the local lacks (or only holds
 *  as a placeholder) — returns the fetched files for the caller to addPdf. */
export async function downloadPdfFiles(
  cred: SyncCredentials,
  remotePdfs: PdfSyncMeta[],
  localPdfs: PdfFile[],
  onStatus?: (status: string) => void
): Promise<{ meta: PdfSyncMeta; bytes: Blob }[]> {
  const local = new Map(localPdfs.map((p) => [p.id, p]))
  const remoteFiles = new Set(await listRemotePdfs(cred))
  const toFetch = remotePdfs.filter(
    (meta) =>
      !local.get(meta.id)?.bytes && remoteFiles.has(`${meta.id}.pdf`)
  )
  const out: { meta: PdfSyncMeta; bytes: Blob }[] = []
  let done = 0
  for (const meta of toFetch) {
    done++
    onStatus?.(`正在下载 PDF 文件 (${done}/${toFetch.length})…`)
    const res = await bgFetchBinary(cred, `/Apps/lime/pdfs/${meta.id}.pdf`, {
      method: "GET"
    })
    if (!res.ok) continue
    out.push({
      meta,
      bytes: new Blob([base64ToBytes(res.body)], { type: "application/pdf" })
    })
  }
  return out
}

// ---- Dirty-check helpers ----

async function hasChangesSince(lastSync: number): Promise<boolean> {
  const data = await chrome.storage.local.get(["_dbi", "_dbp", "_dbr", "_dbpdf"])
  return (
    (data._dbi ?? 0) > lastSync ||
    (data._dbp ?? 0) > lastSync ||
    (data._dbr ?? 0) > lastSync ||
    (data._dbpdf ?? 0) > lastSync
  )
}

async function getLastSyncTime(): Promise<number | null> {
  const data = await chrome.storage.local.get("lastSyncTime")
  return (data.lastSyncTime as number) ?? null
}

// ---- End dirty-check helpers ----

export async function testConnection(
  cred: SyncCredentials
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await bgFetch(cred, "/Apps/lime/", { method: "PROPFIND" })
    if (res.status === 401 || res.status === 403)
      return { ok: false, message: "认证失败，请检查用户名和 App 密码" }
    return { ok: true, message: "连接成功" }
  } catch (err: any) {
    return { ok: false, message: `连接失败：${err.message ?? err}` }
  }
}

async function downloadSyncFile(
  cred: SyncCredentials
): Promise<SyncPayload | null> {
  const res = await bgFetch(cred, SYNC_PATH)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`下载失败：HTTP ${res.status}`)
  try {
    const payload = JSON.parse(res.body) as SyncPayload
    // Read v3 (legacy cloud data) and v4; older/newer → prompt to upgrade.
    // The next upload writes v4, upgrading the cloud file automatically.
    if (payload.version < 3 || payload.version > 4)
      throw new Error("云端数据版本不兼容，请升级扩展后重试")
    if (!Array.isArray(payload.items))
      throw new Error("数据格式异常：缺少 items 字段")
    return payload
  } catch (e: any) {
    throw new Error(`解析云端数据失败：${e.message ?? e}`)
  }
}

async function uploadSyncFile(
  cred: SyncCredentials,
  payload: SyncPayload
): Promise<void> {
  await bgFetch(cred, "/Apps/lime/", { method: "MKCOL" }).catch(() => {})
  const json = JSON.stringify(payload)
  const res = await bgFetch(cred, SYNC_PATH, {
    method: "PUT",
    body: json,
    contentType: "application/json"
  })
  if (!res.ok) throw new Error(`上传失败：HTTP ${res.status}`)
}

async function buildPayload(
  items: Item[],
  projects: Project[],
  reviews: ReviewEntry[],
  pdfAnnotations: PdfAnnotation[],
  pdfs: PdfSyncMeta[]
): Promise<SyncPayload> {
  const byId = <T extends { id: string }>(arr: T[]) =>
    [...arr].sort((a, b) => a.id.localeCompare(b.id))
  const raw = JSON.stringify({
    items: byId(items),
    projects: byId(projects),
    reviews: byId(reviews),
    pdfAnnotations: byId(pdfAnnotations),
    pdfs: byId(pdfs)
  })
  const contentHash = await computeItemHash(raw, "")
  return {
    version: 4,
    syncedAt: Date.now(),
    contentHash,
    deviceInfo: { version: "0.4.0" },
    projects: byId(projects),
    items: byId(items),
    reviews: byId(reviews),
    pdfAnnotations: byId(pdfAnnotations),
    pdfs: byId(pdfs)
  }
}

export async function runSync(
  cred: SyncCredentials,
  items: Item[],
  projects: Project[],
  reviews: ReviewEntry[],
  pdfAnnotations: PdfAnnotation[],
  pdfs: PdfSyncMeta[],
  onStatus?: (status: string) => void
): Promise<SyncResult> {
  try {
    // Step 1: skip if nothing changed since last sync (avoids serialization + network)
    const lastSync = await getLastSyncTime()
    if (lastSync && !(await hasChangesSince(lastSync))) {
      return { success: true, direction: "noop", message: "数据无变化" }
    }

    onStatus?.("正在序列化数据…")
    const localPayload = await buildPayload(
      items,
      projects,
      reviews,
      pdfAnnotations,
      pdfs
    )

    onStatus?.("正在检查云端…")
    const remote = await downloadSyncFile(cred)

    if (!remote) {
      onStatus?.("首次同步，正在上传…")
      await uploadSyncFile(cred, localPayload)
      return { success: true, direction: "upload", message: "同步到云端" }
    }

    if (localPayload.contentHash === remote.contentHash) {
      return { success: true, direction: "noop", message: "数据无变化" }
    }

    onStatus?.("正在上传…")
    await uploadSyncFile(cred, localPayload)
    return {
      success: true,
      direction: "upload",
      message: "同步到云端"
    }
  } catch (e: any) {
    return {
      success: false,
      direction: "error",
      message: e.message ?? String(e)
    }
  }
}

export async function downloadRemote(
  cred: SyncCredentials,
  items: Item[],
  projects: Project[],
  reviews: ReviewEntry[],
  pdfAnnotations: PdfAnnotation[],
  pdfs: PdfSyncMeta[],
  onStatus?: (status: string) => void
): Promise<SyncResult> {
  try {
    onStatus?.("正在下载云端数据…")
    const remote = await downloadSyncFile(cred)
    if (!remote) {
      return { success: false, direction: "error", message: "云端无数据" }
    }

    onStatus?.("正在对比数据…")
    const localPayload = await buildPayload(
      items,
      projects,
      reviews,
      pdfAnnotations,
      pdfs
    )
    if (localPayload.contentHash === remote.contentHash) {
      return { success: true, direction: "noop", message: "数据无变化" }
    }

    return {
      success: true,
      direction: "download",
      message: "从云端同步",
      payload: remote
    }
  } catch (e: any) {
    return {
      success: false,
      direction: "error",
      message: e.message ?? String(e)
    }
  }
}
