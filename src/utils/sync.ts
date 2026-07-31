import type { Item, Project, ReviewEntry } from "../types"
import { sendMessage } from "../types/messages"
import { computeItemHash } from "./index"

const SYNC_PATH = "/Apps/lime/lime-sync.json"
const BASE_URL = "https://dav.jianguoyun.com/dav"

export interface SyncCredentials {
  username: string
  appPassword: string
}

interface SyncPayload {
  version: number
  syncedAt: number
  contentHash: string
  deviceInfo: { version: string }
  projects: Project[]
  items: Item[]
  reviews: ReviewEntry[]
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

// ---- Dirty-check helpers ----

async function hasChangesSince(lastSync: number): Promise<boolean> {
  const data = await chrome.storage.local.get(["_dbi", "_dbp"])
  return (data._dbi ?? 0) > lastSync || (data._dbp ?? 0) > lastSync
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
    if (!payload.version || !Array.isArray(payload.items))
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
  reviews: ReviewEntry[]
): Promise<SyncPayload> {
  const byId = <T extends { id: string }>(arr: T[]) =>
    [...arr].sort((a, b) => a.id.localeCompare(b.id))
  const raw = JSON.stringify({
    items: byId(items),
    projects: byId(projects),
    reviews: byId(reviews)
  })
  const contentHash = await computeItemHash(raw, "")
  return {
    version: 3,
    syncedAt: Date.now(),
    contentHash,
    deviceInfo: { version: "0.3.0" },
    projects: byId(projects),
    items: byId(items),
    reviews: byId(reviews)
  }
}

export async function runSync(
  cred: SyncCredentials,
  items: Item[],
  projects: Project[],
  reviews: ReviewEntry[],
  onStatus?: (status: string) => void
): Promise<SyncResult> {
  try {
    // Step 1: skip if nothing changed since last sync (avoids serialization + network)
    const lastSync = await getLastSyncTime()
    if (lastSync && !(await hasChangesSince(lastSync))) {
      return { success: true, direction: "noop", message: "数据无变化" }
    }

    onStatus?.("正在序列化数据…")
    const localPayload = await buildPayload(items, projects, reviews)

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
  onStatus?: (status: string) => void
): Promise<SyncResult> {
  try {
    onStatus?.("正在下载云端数据…")
    const remote = await downloadSyncFile(cred)
    if (!remote) {
      return { success: false, direction: "error", message: "云端无数据" }
    }

    onStatus?.("正在对比数据…")
    const localPayload = await buildPayload(items, projects, reviews)
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
