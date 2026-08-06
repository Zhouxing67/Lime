import type { PdfCard, Project, ProjectCard, Section } from "../types"
import { resolveCardContent } from "./cards"
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
  card: ProjectCard,
  level: number,
  skipped: { count: number },
  pdfById: Map<string, PdfCard>
): string {
  const parts: string[] = []
  // A placed card carries NO content (reference model) — the effective body
  // comes from its linked pdfCard; non-placed cards render their own fields.
  const resolved = resolveCardContent(card, pdfById)
  const title = resolved.title?.trim()
  if (title) parts.push(`${"#".repeat(level)} ${title}`)

  if (card.type === "image") {
    if (resolved.content.startsWith("data:image")) {
      // data-URL images would bloat the file — skip and let the caller count.
      skipped.count++
      return ""
    }
    parts.push(`![图片](${resolved.content})`)
  } else {
    const body = transformContent(resolved.content).trim()
    if (body) parts.push(body)
    // Legacy pre-Markdown images (card.images) not yet embedded in content.
    const embedded = new Set(extractMarkdownImages(resolved.content))
    for (const url of card.images ?? []) {
      if (embedded.has(url)) continue
      if (url.startsWith("data:image")) {
        skipped.count++
        continue
      }
      parts.push(`![图片](${url})`)
    }
  }

  if (card.source?.url) {
    const label = card.source.title || prettyUrl(card.source.url)
    parts.push(`> 来源：[${label}](${card.source.url})`)
  }
  return parts.join("\n\n")
}

export interface ExportSectionGroup {
  id: string
  title: string
  items: ProjectCard[]
  children: ExportSectionGroup[]
}

/** The scope's render data — carries the pdfById map so placed cards resolve
 *  their quote from the linked pdfCard at render time. */
export interface ExportScopeData {
  rootTitle: string
  groups: ExportSectionGroup[]
  flatItems: ProjectCard[]
  pdfById: Map<string, PdfCard>
}

function buildGroups(
  sections: Section[],
  cards: ProjectCard[],
  parentId: string | null
): ExportSectionGroup[] {
  return sections
    .filter((s) => s.parentId === parentId)
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      id: s.id,
      title: s.title,
      items: cards.filter((i) => i.sectionId === s.id),
      children: buildGroups(sections, cards, s.id)
    }))
}

export function buildProjectMarkdown(opts: ExportScopeData): {
  markdown: string
  skippedImages: number
} {
  const skipped = { count: 0 }
  const { pdfById } = opts

  const renderCards = (cards: ProjectCard[], level: number): string =>
    cards
      .map((i) => renderCard(i, level, skipped, pdfById))
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
    .map((i) => renderCard(i, 2, skipped, pdfById))
    .filter((s) => s !== "")
  if (flat.length) lines.push(flat.join("\n\n"))

  return {
    markdown: lines.filter((s) => s.trim() !== "").join("\n\n") + "\n",
    skippedImages: skipped.count
  }
}

/** Build the root title + section groups + flat (未分类) cards for a scope.
 *  scopeSectionId === null exports the whole project; otherwise the section.
 *  `pdfCards` (optional) resolves placed cards' content via their pdfCard. */
export function buildScopeData(
  project: Project,
  allCards: ProjectCard[],
  scopeSectionId: string | null,
  pdfCards?: PdfCard[]
): ExportScopeData {
  const sections = project.sections ?? []
  const projectCards = allCards.filter((i) => i.projectId === project.id)
  const pdfById = new Map((pdfCards ?? []).map((c) => [c.id, c]))

  const scope = (scopeSectionId: string | null): ExportScopeData => {
    if (!scopeSectionId) {
      const validIds = new Set(sections.map((s) => s.id))
      return {
        rootTitle: project.name,
        groups: buildGroups(sections, projectCards, null),
        flatItems: projectCards.filter(
          (i) => !i.sectionId || !validIds.has(i.sectionId)
        ),
        pdfById
      }
    }

    const target = sections.find((s) => s.id === scopeSectionId)
    if (!target) {
      // Stale section id (deleted since the menu was rendered) — fall back to
      // the whole project so the export is never empty.
      const validIds = new Set(sections.map((s) => s.id))
      return {
        rootTitle: project.name,
        groups: buildGroups(sections, projectCards, null),
        flatItems: projectCards.filter(
          (i) => !i.sectionId || !validIds.has(i.sectionId)
        ),
        pdfById
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
        groups: buildGroups(sections, projectCards, target.id),
        flatItems: projectCards.filter((i) => i.sectionId === target.id),
        pdfById
      }
    }
    return {
      rootTitle: breadcrumb.join(" / "),
      groups: [],
      flatItems: projectCards.filter((i) => i.sectionId === target.id),
      pdfById
    }
  }

  return scope(scopeSectionId)
}
