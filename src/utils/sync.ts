import type {
  PdfAnnotation,
  PdfCard,
  PdfFile,
  Project,
  ProjectCard,
  ReadLater,
  ReviewEntry,
  TodoCard
} from "../types"
import {
  pdfAnnotationSchema,
  pdfCardSchema,
  pdfMetaSchema,
  projectCardSchema,
  projectSchema,
  readLaterSchema,
  reviewEntrySchema,
  todoCardSchema
} from "../types/schemas"
import { sendMessage } from "../types/messages"
import { splitLegacyItem, type LegacyItem } from "./cards"
import {
  base64ToBytes,
  blobToUint8,
  bytesToBase64,
  computeItemHash
} from "./index"

const SYNC_PATH = "/Apps/lime/lime-sync.json"
const BASE_URL = "https://dav.jianguoyun.com/dav"

export interface SyncCredentials {
  username: string
  appPassword: string
}

/** PDF metadata as it travels in the sync payload (never the file bytes). */
export type PdfSyncMeta = Pick<
  PdfFile,
  "id" | "name" | "pageCount" | "addedAt" | "lastOpened" | "topic"
>

export interface SyncPayload {
  version: number
  syncedAt: number
  contentHash: string
  deviceInfo: { version: string }
  projects: Project[]
  projectCards: ProjectCard[]
  pdfCards: PdfCard[]
  todos: TodoCard[]
  reviews: ReviewEntry[]
  pdfAnnotations: PdfAnnotation[]
  pdfs: PdfSyncMeta[]
  readLater: ReadLater[]
  /** Image references (recordId → content-hash of the data-URL). The image
   *  BYTES live in the remote /images/ folder (multi-file layer, like the
   *  PDFs) — the sync copies carry the image field stripped. */
  images?: Record<string, string>
}

export interface SyncResult {
  success: boolean
  direction: "upload" | "download" | "noop" | "error"
  message: string
  /** The remote payload's image refs (hashes) observed during this run — lets
   *  the caller prune the /images/ layer on a "remote refs ∪ local" basis so a
   *  file another device's payload still references is never deleted (A1). */
  remoteImageRefs?: Set<string>
  payload?: SyncPayload
}

/** Total record count across all 8 payload arrays (tolerant of older versions
 *  that may omit an array). */
export function countPayloadRecords(payload: SyncPayload | null): number {
  if (!payload) return 0
  return (
    (payload.projects?.length ?? 0) +
    (payload.projectCards?.length ?? 0) +
    (payload.pdfCards?.length ?? 0) +
    (payload.todos?.length ?? 0) +
    (payload.reviews?.length ?? 0) +
    (payload.pdfAnnotations?.length ?? 0) +
    (payload.pdfs?.length ?? 0) +
    (payload.readLater?.length ?? 0)
  )
}

/** Fresh-install upload guard (R1): a never-synced local that carries FEWER
 *  records than a populated remote is a fresh install about to overwrite the
 *  cloud. The user must download instead — an upload would wipe remote data. */
export function wouldWipeRemote(
  lastSync: number | null,
  localPayload: SyncPayload,
  remotePayload: SyncPayload | null
): boolean {
  if (lastSync) return false
  const local = countPayloadRecords(localPayload)
  const remote = countPayloadRecords(remotePayload)
  return remote > 0 && local < remote
}

/** Validate a downloaded payload's record arrays against the single-source
 *  schemas BEFORE they are applied. Corrupt records are SKIPPED (never write
 *  garbage into the DB) and counted; valid records are returned UNCHANGED —
 *  bulkReplace spreads them, so forward-compatible unknown fields survive. */
export function sanitizeSyncPayload(
  payload: SyncPayload
): { payload: SyncPayload; skipped: number } {
  let skipped = 0
  const keep = <T>(
    arr: T[] | undefined,
    schema: { safeParse(data: unknown): { success: boolean } }
  ): T[] =>
    (arr ?? []).filter((rec) => {
      const res = schema.safeParse(rec)
      if (res.success) return true
      skipped++
      const issues = (res as { error?: { issues: { path: (string | number)[]; message: string }[] } })
        .error?.issues
      const issue = issues?.[0]
      console.warn(
        `[lime] sync: 跳过无效记录 ${issue?.path.join(".") || "(根)"}: ${issue?.message} (id=${String((rec as { id?: unknown } | null)?.id)})`
      )
      return false
    })
  const imagesOk =
    payload.images === undefined ||
    (payload.images !== null &&
      typeof payload.images === "object" &&
      Object.values(payload.images).every((v) => typeof v === "string"))
  return {
    payload: {
      ...payload,
      projects: keep(payload.projects, projectSchema),
      projectCards: keep(payload.projectCards, projectCardSchema),
      pdfCards: keep(payload.pdfCards, pdfCardSchema),
      todos: keep(payload.todos, todoCardSchema),
      reviews: keep(payload.reviews, reviewEntrySchema),
      pdfAnnotations: keep(payload.pdfAnnotations, pdfAnnotationSchema),
      pdfs: keep(payload.pdfs, pdfMetaSchema),
      readLater: keep(payload.readLater, readLaterSchema),
      images: imagesOk ? payload.images : undefined
    },
    skipped
  }
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
    // Content-Type only matters for PUT; harmless on GET but keep it off.
    contentType: options.method === "PUT" ? "application/pdf" : undefined,
    body: options.bodyBase64,
    binary: true
  })
}

/** Enumerate the remote /pdfs/ folder → the stored "<contentHash>.pdf" names. */
export async function listRemotePdfs(cred: SyncCredentials): Promise<string[]> {
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
  // MKCOL the pdfs/ collection; tolerate "already exists" (405/301/302), but
  // rethrow auth/network failures so the user sees the real cause.
  const mkcol = await bgFetch(cred, "/Apps/lime/pdfs/", {
    method: "MKCOL"
  }).catch(() => null)
  if (mkcol && !mkcol.ok && ![405, 301, 302].includes(mkcol.status)) {
    throw new Error(`创建云端 PDF 目录失败：HTTP ${mkcol.status}`)
  }
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
    if (!res.ok) throw new Error(`PDF 上传失败：HTTP ${res.status}`)
  }
}

/** Delete the remote /pdfs/ files the local no longer holds — propagates a
 *  local PDF deletion to the cloud (the metadata already leaves the sync file;
 *  this prunes the orphaned file). Tolerant of already-gone files and of
 *  per-file failures (a prune problem never fails the whole sync). */
export async function pruneRemotePdfs(
  cred: SyncCredentials,
  localPdfs: PdfFile[]
): Promise<void> {
  const localIds = new Set(localPdfs.map((p) => p.id))
  const remote = await listRemotePdfs(cred)
  for (const name of remote) {
    const id = name.slice(0, -".pdf".length)
    if (localIds.has(id)) continue
    const res = await bgFetchBinary(cred, `/Apps/lime/pdfs/${name}`, {
      method: "DELETE"
    }).catch(() => null)
    if (res && res.status === 404) continue
    if (res && !res.ok)
      console.warn("[lime] prune remote pdf failed:", name, res.status)
  }
}

/** Enumerate the remote /images/ folder → the stored "<contentHash>.png" names. */
async function listRemoteImages(cred: SyncCredentials): Promise<string[]> {
  const res = await bgFetch(cred, "/Apps/lime/images/", {
    method: "PROPFIND"
  })
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`读取云端图片列表失败：HTTP ${res.status}`)
  const doc = new DOMParser().parseFromString(res.body, "application/xml")
  const names = new Set<string>()
  for (const el of Array.from(doc.getElementsByTagName("*"))) {
    if (el.localName !== "href") continue
    const m = (el.textContent ?? "").match(/\/images\/([^/]+\.png)$/)
    if (m) names.add(m[1])
  }
  return [...names]
}

/** PUT every image the remote /images/ folder lacks — content-hash named so an
 *  unchanged image is uploaded once (deduped across records). */
export async function uploadImageFiles(
  cred: SyncCredentials,
  images: Map<string, string>,
  onStatus?: (status: string) => void
): Promise<void> {
  if (images.size === 0) return
  const mkcol = await bgFetch(cred, "/Apps/lime/images/", {
    method: "MKCOL"
  }).catch(() => null)
  if (mkcol && !mkcol.ok && ![405, 301, 302].includes(mkcol.status)) {
    throw new Error(`创建云端图片目录失败：HTTP ${mkcol.status}`)
  }
  const remote = new Set(await listRemoteImages(cred))
  let done = 0
  for (const [hash, dataUrl] of images) {
    if (remote.has(`${hash}.png`)) continue
    done++
    onStatus?.(`正在上传图片 (${done}/${images.size})…`)
    const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl
    if (!b64 || base64ToBytes(b64).length === 0) {
      console.warn("[lime] sync: skipping malformed image data-URL", hash)
      continue
    }
    const res = await bgFetchBinary(cred, `/Apps/lime/images/${hash}.png`, {
      method: "PUT",
      bodyBase64: bytesToBase64(base64ToBytes(b64))
    })
    if (!res.ok) throw new Error(`图片上传失败：HTTP ${res.status}`)
  }
}

/** DELETE the remote /images/ files referenced by NEITHER the current local
 *  images NOR the remote sync payload's refs — the union (A1). A local-only
 *  basis would delete files another device's payload still references the
 *  moment one device loses an image; with the union, propagation still works
 *  (a genuinely deleted/replaced image is gone from both) but a remote-referenced
 *  file survives a partial local state. */
export async function pruneRemoteImages(
  cred: SyncCredentials,
  images: Map<string, string>,
  remoteRefs: Set<string>,
  onStatus?: (status: string) => void
): Promise<void> {
  const remote = await listRemoteImages(cred)
  for (const name of remote) {
    const hash = name.slice(0, -".png".length)
    if (images.has(hash) || remoteRefs.has(hash)) continue
    onStatus?.("正在清理云端图片…")
    const res = await bgFetchBinary(cred, `/Apps/lime/images/${name}`, {
      method: "DELETE"
    }).catch(() => null)
    if (res && res.status === 404) continue
    if (res && !res.ok)
      console.warn("[lime] prune remote image failed:", name, res.status)
  }
}

/** Download the referenced image files the remote /images/ folder has that the
 *  local lacks — returns the content-hash → data-URL map for the hydration
 *  step, plus the hashes that couldn't be resolved (remote file 404 — a
 *  dangling ref). ANY other failure (5xx / network) THROWS so the caller aborts
 *  the download atomically instead of silently applying an imageless version
 *  of the records and letting the next prune delete the remote files too
 *  (A1 — the three-layer image-loss chain). */
export async function downloadImageFiles(
  cred: SyncCredentials,
  payload: SyncPayload,
  onStatus?: (status: string) => void
): Promise<{ files: Map<string, string>; unresolved: Set<string> }> {
  const refs = payload.images ?? {}
  const hashes = new Set(Object.values(refs))
  if (hashes.size === 0) return { files: new Map(), unresolved: new Set() }
  const remote = new Set(await listRemoteImages(cred))
  const files = new Map<string, string>()
  const unresolved = new Set<string>()
  let done = 0
  for (const hash of hashes) {
    if (!remote.has(`${hash}.png`)) {
      unresolved.add(hash)
      continue
    }
    done++
    onStatus?.(`正在下载图片 (${done}/${hashes.size})…`)
    const res = await bgFetchBinary(cred, `/Apps/lime/images/${hash}.png`, {
      method: "GET"
    })
    if (!res.ok) {
      if (res.status === 404) {
        unresolved.add(hash)
        continue
      }
      throw new Error(`图片下载失败：HTTP ${res.status}`)
    }
    files.set(hash, `data:image/png;base64,${res.body}`)
  }
  return { files, unresolved }
}

/** Restore the payload's stripped image fields from the downloaded files —
 *  v6 payloads (references) become local-form data-URLs; v5 payloads (the
 *  images already inline) pass through unchanged. */
export function hydratePayloadImages(
  payload: SyncPayload,
  imageFiles: Map<string, string>
): SyncPayload {
  const refs = payload.images ?? {}
  return {
    ...payload,
    projectCards: payload.projectCards.map((c) =>
      refs[c.id] && imageFiles.has(refs[c.id])
        ? { ...c, image: imageFiles.get(refs[c.id]) }
        : c
    ),
    pdfCards: payload.pdfCards.map((c) =>
      refs[c.id] && imageFiles.has(refs[c.id])
        ? { ...c, content: imageFiles.get(refs[c.id]) }
        : c
    ),
    pdfAnnotations: payload.pdfAnnotations.map((a) =>
      refs[a.id] && imageFiles.has(refs[a.id])
        ? { ...a, image: imageFiles.get(refs[a.id]) }
        : a
    )
  }
}

/** Download the PDF files the remote has that the local lacks (or only holds
 *  as a placeholder). Pass `onFile` to persist each file AS it downloads (the
 *  caller must not accumulate N large PDFs in memory); without it, the files
 *  are returned collected for the caller to persist. */
export async function downloadPdfFiles(
  cred: SyncCredentials,
  remotePdfs: PdfSyncMeta[],
  localPdfs: PdfFile[],
  onStatus?: (status: string) => void,
  onFile?: (meta: PdfSyncMeta, bytes: Blob) => void | Promise<void>
): Promise<{ meta: PdfSyncMeta; bytes: Blob }[]> {
  const local = new Map(localPdfs.map((p) => [p.id, p]))
  const remoteFiles = new Set(await listRemotePdfs(cred))
  const toFetch = remotePdfs.filter(
    (meta) => !local.get(meta.id)?.bytes && remoteFiles.has(`${meta.id}.pdf`)
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
    const bytes = new Blob([base64ToBytes(res.body)], {
      type: "application/pdf"
    })
    if (onFile) {
      await onFile(meta, bytes)
    } else {
      out.push({ meta, bytes })
    }
  }
  return out
}

// ---- Dirty-check helpers ----

async function hasChangesSince(lastSync: number): Promise<boolean> {
  const data = await chrome.storage.local.get([
    "_dbi",
    "_dbp",
    "_dbr",
    "_dbrl",
    "_dbt",
    "_dbpdf",
    "_dbpdfTouch"
  ])
  return (
    (data._dbi ?? 0) > lastSync ||
    (data._dbp ?? 0) > lastSync ||
    (data._dbr ?? 0) > lastSync ||
    (data._dbrl ?? 0) > lastSync ||
    (data._dbt ?? 0) > lastSync ||
    (data._dbpdf ?? 0) > lastSync ||
    // Metadata-only PDF writes (rename / topic) — without this the hashes
    // don't change and "无变化" skips the upload, so a rename never syncs
    // (A2).
    (data._dbpdfTouch ?? 0) > lastSync
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

/** Convert a v3/v4 legacy payload (monolithic `items`) into the v5 shape. A
 *  placed item becomes a pdfCard (keeping the old id) + a placement projectCard
 *  (new uuid, mutual references); reviews of placed items remap to the
 *  placement ids; legacy annotations carry itemId → cardId (the pdfCard id). */
function convertLegacyPayload(p: {
  version: number
  syncedAt: number
  contentHash: string
  deviceInfo: { version: string }
  items?: LegacyItem[]
  projects?: Project[]
  reviews?: ReviewEntry[]
  pdfAnnotations?: PdfAnnotation[]
  pdfs?: PdfSyncMeta[]
}): SyncPayload {
  const annType = new Map<string, string>()
  for (const ann of p.pdfAnnotations ?? []) {
    if (ann.id) annType.set(ann.id, ann.type)
  }
  const projectCards: ProjectCard[] = []
  const pdfCards: PdfCard[] = []
  const todos: TodoCard[] = []
  const reviewRemap = new Map<string, string>()
  const validProjectCardIds = new Set<string>()
  for (const item of p.items ?? []) {
    const split = splitLegacyItem(
      item,
      (annType.get(item.pdfRef?.annotationId ?? "") as
        | PdfAnnotation["type"]
        | undefined) ?? "highlight"
    )
    if (split.todo) todos.push(split.todo)
    if (split.pdfCard) {
      pdfCards.push(split.pdfCard)
      if (split.placement) {
        projectCards.push(split.placement)
        reviewRemap.set(split.pdfCard.id, split.placement.id)
        validProjectCardIds.add(split.placement.id)
      }
    }
    if (split.projectCard) {
      projectCards.push(split.projectCard)
      validProjectCardIds.add(split.projectCard.id)
    }
  }
  // Only project cards are reviewable — drop a legacy pdf-only/todo card's
  // review (a phantom that would inflate the badge + propagate).
  const reviews = (p.reviews ?? [])
    .filter((r) => reviewRemap.has(r.itemId) || validProjectCardIds.has(r.itemId))
    .map((r) => {
      const mapped = reviewRemap.get(r.itemId)
      return mapped ? { ...r, itemId: mapped } : r
    })
  const pdfAnnotations: PdfAnnotation[] = (p.pdfAnnotations ?? []).map((a) => {
    const legacy = a as PdfAnnotation & { itemId?: string }
    if (legacy.cardId) return a
    const normalized: PdfAnnotation = { ...a }
    if (legacy.itemId) normalized.cardId = legacy.itemId
    delete (normalized as unknown as Record<string, unknown>).itemId
    return normalized
  })
  return {
    version: 5,
    syncedAt: p.syncedAt,
    contentHash: p.contentHash,
    deviceInfo: p.deviceInfo,
    projectCards,
    pdfCards,
    todos,
    projects: p.projects ?? [],
    reviews,
    pdfs: p.pdfs ?? [],
    pdfAnnotations,
    readLater: []
  }
}

async function downloadSyncFile(
  cred: SyncCredentials
): Promise<SyncPayload | null> {
  const res = await bgFetch(cred, SYNC_PATH)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`下载失败：HTTP ${res.status}`)
  try {
    const payload = JSON.parse(res.body) as SyncPayload & {
      items?: LegacyItem[]
    }
    // Read v3/v4 (legacy cloud data) and v5/v6/v7; older/newer → prompt to
    // upgrade. The next upload writes v7, upgrading the cloud file.
    if (payload.version < 3 || payload.version > 7)
      throw new Error("云端数据版本不兼容，请升级扩展后重试")
    if (payload.version >= 5) {
      if (!Array.isArray(payload.projectCards))
        throw new Error("数据格式异常：缺少 projectCards 字段")
      return payload
    }
    // v3/v4 → convert the legacy items array into the three-store shape.
    if (!Array.isArray(payload.items))
      throw new Error("数据格式异常：缺少 items 字段")
    return convertLegacyPayload(payload)
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

/** Collect every image the sync must carry (image cards + region crops),
 *  keyed by the SHA-256 content hash of the data-URL — the image BYTES the
 *  upload layer PUTs to the remote /images/ folder. */
export async function collectImageFiles(
  projectCards: ProjectCard[],
  pdfAnnotations: PdfAnnotation[],
  pdfCards: PdfCard[] = []
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (const card of projectCards) {
    // card.image (the current model) or the legacy content data-URL.
    const img =
      card.image ||
      (card.type === "image" &&
      typeof card.content === "string" &&
      card.content.startsWith("data:image")
        ? card.content
        : undefined)
    if (!img) continue
    const hash = await computeItemHash(img, "")
    out.set(hash, img)
  }
  for (const ann of pdfAnnotations) {
    if (!ann.image) continue
    const hash = await computeItemHash(ann.image, "")
    out.set(hash, ann.image)
  }
  // Legacy region pdfCards whose frame lives in content (pre-image model).
  for (const card of pdfCards) {
    if (
      card.kind === "region" &&
      typeof card.content === "string" &&
      card.content.startsWith("data:image")
    ) {
      const hash = await computeItemHash(card.content, "")
      out.set(hash, card.content)
    }
  }
  return out
}

async function buildPayload(
  projectCards: ProjectCard[],
  pdfCards: PdfCard[],
  todos: TodoCard[],
  projects: Project[],
  reviews: ReviewEntry[],
  pdfAnnotations: PdfAnnotation[],
  pdfs: PdfSyncMeta[],
  readLater: ReadLater[]
): Promise<SyncPayload> {
  const byId = <T extends { id: string }>(arr: T[]) =>
    [...arr].sort((a, b) => a.id.localeCompare(b.id))
  // v6: the image data-URLs leave the JSON — the sync copies carry the image
  // field stripped and an `images` map (recordId → content-hash) references the
  // remote /images/ folder (the bytes are a multi-file layer, like the PDFs).
  const imageRefs: Record<string, string> = {}
  const stripProjectCards = await Promise.all(
    projectCards.map(async (c) => {
      // The current image field OR a legacy image card whose data-URL lives in
      // content (pre card-type-v2) — both leave the JSON for the /images/ layer.
      const legacyContent =
        c.type === "image" &&
        typeof c.content === "string" &&
        c.content.startsWith("data:image")
      const img = c.image || (legacyContent ? c.content : undefined)
      if (!img) return c
      imageRefs[c.id] = await computeItemHash(img, "")
      return {
        ...c,
        image: undefined,
        content: legacyContent ? "" : c.content
      }
    })
  )
  const stripPdfCards = await Promise.all(
    pdfCards.map(async (c) => {
      if (
        c.kind === "region" &&
        typeof c.content === "string" &&
        c.content.startsWith("data:image")
      ) {
        imageRefs[c.id] = await computeItemHash(c.content, "")
        return { ...c, content: "" }
      }
      return c
    })
  )
  const stripAnnotations = await Promise.all(
    pdfAnnotations.map(async (a) => {
      if (!a.image) return a
      imageRefs[a.id] = await computeItemHash(a.image, "")
      return { ...a, image: undefined }
    })
  )
  // R4: sort the image-ref keys so the content-hash doesn't depend on the
  // input array order (insertion order would drift across devices holding the
  // same data → false "conflict").
  const sortedImageRefs = Object.keys(imageRefs)
    .sort()
    .reduce<Record<string, string>>((acc, k) => {
      acc[k] = imageRefs[k]
      return acc
    }, {})
  const raw = JSON.stringify({
    projectCards: byId(stripProjectCards),
    pdfCards: byId(stripPdfCards),
    todos: byId(todos),
    projects: byId(projects),
    reviews: byId(reviews),
    pdfAnnotations: byId(stripAnnotations),
    pdfs: byId(pdfs),
    readLater: byId(readLater),
    images: sortedImageRefs
  })
  const contentHash = await computeItemHash(raw, "")
  return {
    version: 7,
    syncedAt: Date.now(),
    contentHash,
    deviceInfo: { version: "0.1.0" },
    projectCards: byId(stripProjectCards),
    pdfCards: byId(stripPdfCards),
    todos: byId(todos),
    projects: byId(projects),
    reviews: byId(reviews),
    pdfAnnotations: byId(stripAnnotations),
    pdfs: byId(pdfs),
    readLater: byId(readLater),
    images: sortedImageRefs
  }
}

export async function runSync(
  cred: SyncCredentials,
  projectCards: ProjectCard[],
  pdfCards: PdfCard[],
  todos: TodoCard[],
  projects: Project[],
  reviews: ReviewEntry[],
  pdfAnnotations: PdfAnnotation[],
  pdfs: PdfSyncMeta[],
  readLater: ReadLater[],
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
      projectCards,
      pdfCards,
      todos,
      projects,
      reviews,
      pdfAnnotations,
      pdfs,
      readLater
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

    // R1: a never-synced local with fewer records than the remote is a fresh
    // install about to overwrite the cloud — force a download instead of a wipe.
    if (wouldWipeRemote(lastSync, localPayload, remote)) {
      const remoteCount = countPayloadRecords(remote)
      return {
        success: false,
        direction: "error",
        message:
          `本机还没有数据，但云端已有 ${remoteCount} 条记录 —— ` +
          `首次使用请选择「下载」（「上传」会清空云端）。`
      }
    }

    onStatus?.("正在上传…")
    await uploadSyncFile(cred, localPayload)
    return {
      success: true,
      direction: "upload",
      message: "同步到云端",
      remoteImageRefs: remote.images
        ? new Set(Object.values(remote.images))
        : undefined
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
  projectCards: ProjectCard[],
  pdfCards: PdfCard[],
  todos: TodoCard[],
  projects: Project[],
  reviews: ReviewEntry[],
  pdfAnnotations: PdfAnnotation[],
  pdfs: PdfSyncMeta[],
  readLater: ReadLater[],
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
      projectCards,
      pdfCards,
      todos,
      projects,
      reviews,
      pdfAnnotations,
      pdfs,
      readLater
    )
    if (localPayload.contentHash === remote.contentHash) {
      // Include the payload even on noop: the caller still needs the remote
      // pdfs metadata to pull PDF files that were interrupted mid-download.
      return {
        success: true,
        direction: "noop",
        message: "数据无变化",
        payload: remote
      }
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
