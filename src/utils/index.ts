export type MergeSeparator = "rule" | "ordered" | "unordered" | "none"

/** Join several cards' content per the chosen separator. */
export function buildMergedContent(
  items: { title?: string; content: string }[],
  separator: MergeSeparator
): string {
  if (separator === "ordered" || separator === "unordered") {
    return items
      .map((item, idx) => {
        const marker = separator === "ordered" ? `${idx + 1}. ` : "- "
        const label = item.title ? `**${item.title}**：` : ""
        return `${marker}${label}${item.content}`
      })
      .join("\n")
  }
  const parts = items.map((item) => {
    const header = item.title ? `## ${item.title}\n` : ""
    return `${header}${item.content}`
  })
  return parts.join(separator === "rule" ? "\n\n---\n\n" : "\n\n")
}

export async function sha256(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest("SHA-256", enc)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
  return hashHex
}

export async function computeItemHash(
  content: string,
  url: string,
  images?: string[]
): Promise<string> {
  const imgs = images && images.length > 0 ? `\u0000${images.join("\n")}` : ""
  return sha256(`${url}|${content}${imgs}`)
}

export function prettyUrl(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname
    let path = u.pathname
    if (path === "/") path = ""
    const shortPath = path.length > 32 ? path.slice(0, 32) + "…" : path
    return shortPath ? `${host}${shortPath}` : host
  } catch {
    return url
  }
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + "..."
}

/**
 * Extracts image URLs from Markdown content (`![alt](url)`), deduplicated,
 * preserving order. Used to derive cover thumbnails and inline-image inputs
 * from the content itself (images are embedded as Markdown, not stored in a
 * separate array).
 */
export function extractMarkdownImages(content: string): string[] {
  const urls: string[] = []
  const re = /!\[[^\]]*\]\(([^)\s]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const url = m[1]
    if (url && !urls.includes(url)) urls.push(url)
  }
  return urls
}

/**
 * Removes a single image's Markdown token (`![...](url)`) from content.
 */
export function removeMarkdownImage(content: string, url: string): string {
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return content.replace(new RegExp(`!\\[[^\\]]*\\]\\(${escaped}\\)`, "g"), "")
}

/**
 * Appends an image as a Markdown token to the end of content.
 */
export function appendMarkdownImage(
  content: string,
  url: string,
  alt = "图片"
): string {
  const token = `![${alt}](${url})`
  if (content.includes(token)) return content
  return `${content.trimEnd()}\n\n${token}\n`
}

// ---- Markdown task lists (todo cards) ----

export const TASK_RE = /^(\s*(?:[-*]|\d+\.)\s+)\[([ xX])\](.*)$/

export interface MarkdownTask {
  lineIndex: number
  checked: boolean
}

/** Parses task-list lines (`- [ ]` / `- [x]` / `1. [ ]`) in document order. */
export function markdownTasks(content: string): MarkdownTask[] {
  const tasks: MarkdownTask[] = []
  const lines = content.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const m = TASK_RE.exec(lines[i])
    if (m) tasks.push({ lineIndex: i, checked: m[2].toLowerCase() === "x" })
  }
  return tasks
}

/** Toggles the index-th task's checkbox, returning the new content. */
export function toggleMarkdownTask(content: string, index: number): string {
  const lines = content.split("\n")
  let count = 0
  for (let i = 0; i < lines.length; i++) {
    const m = TASK_RE.exec(lines[i])
    if (!m) continue
    if (count === index) {
      const checked = m[2].toLowerCase() === "x"
      lines[i] = `${m[1]}[${checked ? " " : "x"}]${m[3]}`
      return lines.join("\n")
    }
    count++
  }
  return content
}

export function markdownTaskCount(content: string): number {
  return markdownTasks(content).length
}

export function markdownCompletedCount(content: string): number {
  return markdownTasks(content).filter((t) => t.checked).length
}

/** A todo is complete when it has at least one task and all are checked. */
export function isTodoComplete(content: string): boolean {
  const tasks = markdownTasks(content)
  return tasks.length > 0 && tasks.every((t) => t.checked)
}

/** Local date as "YYYY-MM-DD" (machine-local, not UTC). */
export function todayLocalDate(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}

function dateDaysAgo(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const dt = new Date(y, m - 1, d + n)
  const mm = String(dt.getMonth() + 1).padStart(2, "0")
  const dd = String(dt.getDate()).padStart(2, "0")
  return `${dt.getFullYear()}-${mm}-${dd}`
}

function diffDays(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number)
  const [yb, mb, db] = b.split("-").map(Number)
  return Math.round(
    (new Date(yb, mb - 1, db).getTime() - new Date(ya, ma - 1, da).getTime()) /
      86400000
  )
}

export type DueStatus = "none" | "overdue" | "today" | "tomorrow" | "future"

export const DAY_MS = 86400000

/** Three review levels: label + subdued semantic color (不认识/模糊/认识). */
export const RATING_META = [
  { label: "不认识", color: "#b2705a" },
  { label: "模糊", color: "#b5945b" },
  { label: "认识", color: "#6f9476" }
] as const

/** Due semantics: a day-based task expires at 00:00 of the NEXT day. */
export function dueStatus(dueDate: string | undefined, today: string): DueStatus {
  if (!dueDate) return "none"
  if (dueDate < today) return "overdue"
  if (dueDate === today) return "today"
  if (dueDate === dateDaysAgo(today, 1)) return "tomorrow"
  return "future"
}

function labelFromStatus(
  dueDate: string | undefined,
  status: DueStatus,
  today: string
): string {
  switch (status) {
    case "none":
      return ""
    case "overdue":
      return `已过期 ${diffDays(dueDate!, today)} 天`
    case "today":
      return "今天"
    case "tomorrow":
      return "明天"
    default: {
      const [, m, d] = dueDate!.split("-")
      return `${+m}月${+d}日`
    }
  }
}

/** Short human label for a due date, e.g. "今天" / "已过期 2 天". */
export function dueLabel(dueDate: string | undefined, today: string): string {
  return labelFromStatus(dueDate, dueStatus(dueDate, today), today)
}

/** Status + label in one pass (avoids computing dueStatus twice). */
export function dueInfo(
  dueDate: string | undefined,
  today: string
): { status: DueStatus; label: string } {
  const status = dueStatus(dueDate, today)
  return { status, label: labelFromStatus(dueDate, status, today) }
}

export type DropPos = "before" | "after"

/** Order-first card comparator (order asc, then createdAt asc). */
export function compareCards<T extends { order?: number; createdAt?: number }>(
  a: T,
  b: T
): number {
  return (a.order ?? 0) - (b.order ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0)
}

/** Highest order currently in the given scope (sectionId or unclassified). */
export function maxScopeOrder<T extends { order?: number; sectionId?: string }>(
  items: T[],
  sectionId: string | undefined
): number {
  return items.reduce((acc, i) => {
    const inScope = sectionId ? i.sectionId === sectionId : !i.sectionId
    return inScope ? Math.max(acc, i.order ?? -1) : acc
  }, -1)
}

/**
 * Computes the insertion index for a dragged card relative to a target card
 * within the target section's ordered card list (dragged card excluded).
 */
export function computeDropIndex<T extends { id: string; order?: number; createdAt?: number }>(
  cards: T[],
  draggedId: string,
  targetId: string,
  pos: DropPos
): number {
  const sorted = cards
    .filter((c) => c.id !== draggedId)
    .sort(compareCards)
  const targetIndex = sorted.findIndex((c) => c.id === targetId)
  if (targetIndex === -1) return sorted.length
  return pos === "after" ? targetIndex + 1 : targetIndex
}
