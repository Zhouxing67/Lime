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
