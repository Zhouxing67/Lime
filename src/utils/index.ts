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

const TASK_RE = /^(\s*(?:[-*]|\d+\.)\s+)\[([ xX])\](.*)$/

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

const HEADING_RE = /^#{1,6}\s+/
const LIST_MARKER_RE = /^\s*(?:[-*]|\d+\.)\s+/

/**
 * Normalize a todo card's raw text into a Markdown task list: every non-blank,
 * non-heading line becomes a `- [ ]` task (any existing list marker is
 * stripped first). This means the user never has to type `- [ ]` manually and
 * completion is always derivable from the checkboxes.
 */
export function normalizeTodoContent(content: string): string {
  return content
    .split("\n")
    .map((line) => {
      if (!line.trim()) return line
      if (TASK_RE.test(line)) return line
      if (HEADING_RE.test(line)) return line
      return `- [ ] ${line.replace(LIST_MARKER_RE, "")}`
    })
    .join("\n")
}

export type DropPos = "before" | "after"

/**
 * Computes the insertion index for a dragged card relative to a target card
 * within the target section's ordered card list (dragged card excluded).
 */
export function computeDropIndex<T extends { id: string; order?: number }>(
  cards: T[],
  draggedId: string,
  targetId: string,
  pos: DropPos
): number {
  const sorted = cards
    .filter((c) => c.id !== draggedId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const targetIndex = sorted.findIndex((c) => c.id === targetId)
  if (targetIndex === -1) return sorted.length
  return pos === "after" ? targetIndex + 1 : targetIndex
}
