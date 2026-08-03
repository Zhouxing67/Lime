import type { Item, Project, Section } from "../types"
import { extractMarkdownImages, prettyUrl } from "./index"

/** Heading-to-bold transform for card content inside the exported document:
 *  heading lines render as bold, everything else (paragraphs, lists, code
 *  blocks, images) is preserved as Markdown. Fenced code blocks are left
 *  untouched so `#`-looking lines inside them are not mangled. */
function transformContent(content: string): string {
  const lines = content.split("\n")
  const out: string[] = []
  let inCode = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inCode = !inCode
      out.push(line)
      continue
    }
    if (inCode) {
      out.push(line)
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    out.push(heading ? `**${heading[2]}**` : line)
  }
  return out.join("\n")
}

function renderCard(
  item: Item,
  level: number,
  skipped: { count: number }
): string {
  const parts: string[] = []
  const title = item.title?.trim()
  if (title) parts.push(`${"#".repeat(level)} ${title}`)

  if (item.type === "image") {
    if (item.content.startsWith("data:image")) {
      // data-URL images would bloat the file — skip and let the caller count.
      skipped.count++
      return ""
    }
    parts.push(`![图片](${item.content})`)
  } else {
    const body = transformContent(item.content).trim()
    if (body) parts.push(body)
    // Legacy pre-Markdown images (item.images) not yet embedded in content.
    const embedded = new Set(extractMarkdownImages(item.content))
    for (const url of item.images ?? []) {
      if (embedded.has(url)) continue
      if (url.startsWith("data:image")) {
        skipped.count++
        continue
      }
      parts.push(`![图片](${url})`)
    }
  }

  if (item.source?.url) {
    const label = item.source.title || prettyUrl(item.source.url)
    parts.push(`> 来源：[${label}](${item.source.url})`)
  }
  return parts.join("\n\n")
}

export interface ExportSectionGroup {
  id: string
  title: string
  items: Item[]
  children: ExportSectionGroup[]
}

function buildGroups(
  sections: Section[],
  items: Item[],
  parentId: string | null
): ExportSectionGroup[] {
  return sections
    .filter((s) => s.parentId === parentId)
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      id: s.id,
      title: s.title,
      items: items.filter((i) => i.sectionId === s.id),
      children: buildGroups(sections, items, s.id)
    }))
}

export function buildProjectMarkdown(opts: {
  rootTitle: string
  groups: ExportSectionGroup[]
  flatItems: Item[]
}): { markdown: string; skippedImages: number } {
  const skipped = { count: 0 }

  const renderCards = (items: Item[], level: number): string =>
    items
      .map((i) => renderCard(i, level, skipped))
      .filter((s) => s !== "")
      .join("\n\n")

  const renderGroup = (g: ExportSectionGroup, level: number): string => {
    const parts = [`${"#".repeat(level)} ${g.title}`]
    const cards = renderCards(g.items, level + 1)
    if (cards) parts.push(cards)
    for (const child of g.children) {
      parts.push(renderGroup(child, level + 1))
    }
    return parts.join("\n\n")
  }

  const lines = [`# ${opts.rootTitle}`]
  for (const g of opts.groups) {
    lines.push(renderGroup(g, 2))
  }
  const flat = opts.flatItems
    .map((i) => renderCard(i, 2, skipped))
    .filter((s) => s !== "")
  if (flat.length) lines.push(flat.join("\n\n"))

  return {
    markdown: lines.filter((s) => s.trim() !== "").join("\n\n") + "\n",
    skippedImages: skipped.count
  }
}

/** Build the root title + section groups + flat (未分类) cards for a scope.
 *  scopeSectionId === null exports the whole project; otherwise the section. */
export function buildScopeData(
  project: Project,
  allItems: Item[],
  scopeSectionId: string | null
): { rootTitle: string; groups: ExportSectionGroup[]; flatItems: Item[] } {
  const sections = project.sections ?? []
  const projectItems = allItems.filter((i) => i.projectId === project.id)

  if (!scopeSectionId) {
    const validIds = new Set(sections.map((s) => s.id))
    return {
      rootTitle: project.name,
      groups: buildGroups(sections, projectItems, null),
      flatItems: projectItems.filter(
        (i) => !i.sectionId || !validIds.has(i.sectionId)
      )
    }
  }

  const target = sections.find((s) => s.id === scopeSectionId)
  if (!target) {
    // Stale section id (deleted since the menu was rendered) — fall back to
    // the whole project so the export is never empty.
    const validIds = new Set(sections.map((s) => s.id))
    return {
      rootTitle: project.name,
      groups: buildGroups(sections, projectItems, null),
      flatItems: projectItems.filter(
        (i) => !i.sectionId || !validIds.has(i.sectionId)
      )
    }
  }

  // Breadcrumb root: 项目 / 一级 / 二级.
  const breadcrumb: string[] = [project.name, target.title]
  if (target.level === 2 && target.parentId) {
    const parent = sections.find((s) => s.id === target.parentId)
    if (parent) breadcrumb.splice(1, 0, parent.title)
  }

  if (target.level === 1) {
    return {
      rootTitle: breadcrumb.join(" / "),
      groups: buildGroups(sections, projectItems, target.id),
      flatItems: projectItems.filter((i) => i.sectionId === target.id)
    }
  }
  return {
    rootTitle: breadcrumb.join(" / "),
    groups: [],
    flatItems: projectItems.filter((i) => i.sectionId === target.id)
  }
}
