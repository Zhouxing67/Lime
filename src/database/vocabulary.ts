import type {
  PdfVocabularyCard,
  Project,
  ProjectCard,
  VocabularyEntry,
  VocabularyOccurrence
} from "../types"
import { collectAll, tx, withStore } from "./core"
import { buildProjectCard } from "./projectCards"

export const VOCABULARY_PROJECT_ID = "lime-system-vocabulary"
export const VOCABULARY_PROJECT_NAME = "生词"

export function normalizeVocabularyTerm(term: string): string {
  return term.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase()
}

function requestValue<T>(request: IDBRequest): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(request.error)
  })
}

async function findVocabularyProject(
  store: IDBObjectStore
): Promise<Project | undefined> {
  return new Promise((resolve, reject) => {
    const request = store.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return resolve(undefined)
      const project = cursor.value as Project
      if (
        project.systemKind === "vocabulary" ||
        project.name === VOCABULARY_PROJECT_NAME
      ) {
        resolve(project)
        return
      }
      cursor.continue()
    }
    request.onerror = () => reject(request.error)
  })
}

async function ensureVocabularyProjectInStore(
  store: IDBObjectStore
): Promise<Project> {
  const existing = await findVocabularyProject(store)
  if (existing) {
    if (existing.systemKind !== "vocabulary") {
      const upgraded = { ...existing, systemKind: "vocabulary" as const }
      store.put(upgraded)
      return upgraded
    }
    return existing
  }
  const project: Project = {
    id: VOCABULARY_PROJECT_ID,
    name: VOCABULARY_PROJECT_NAME,
    systemKind: "vocabulary",
    createdAt: Date.now()
  }
  store.put(project)
  return project
}

export async function ensureVocabularyProject(): Promise<Project> {
  return tx({ projects: "readwrite" }, async (stores) =>
    ensureVocabularyProjectInStore(stores.projects)
  )
}

export async function getAllVocabularyCards(): Promise<PdfVocabularyCard[]> {
  return withStore("pdfVocabularyCards", "readonly", (store) =>
    collectAll<PdfVocabularyCard>(store)
  )
}

export async function getVocabularyCardByPdf(
  pdfId: string
): Promise<PdfVocabularyCard | undefined> {
  return withStore("pdfVocabularyCards", "readonly", (store) =>
    requestValue<PdfVocabularyCard>(store.index("byPdfId").get(pdfId))
  )
}

export async function addVocabularyCard(card: PdfVocabularyCard): Promise<void> {
  await withStore("pdfVocabularyCards", "readwrite", (store) => {
    store.put(card)
  })
}

/** Import a vocabulary aggregate and its system-project placement atomically.
 * If the PDF already has an aggregate, replace both sides of the old link so
 * the unique byPdfId index can never leave an orphan placement behind. */
export async function importVocabularyCardWithPlacement(
  card: PdfVocabularyCard,
  placement: ProjectCard
): Promise<void> {
  await tx(
    { pdfVocabularyCards: "readwrite", projectCards: "readwrite" },
    async (stores) => {
      const existing = await requestValue<PdfVocabularyCard>(
        stores.pdfVocabularyCards.index("byPdfId").get(card.pdfId)
      )
      if (existing && existing.id !== card.id) {
        stores.projectCards.delete(existing.projectCardId)
        stores.pdfVocabularyCards.delete(existing.id)
      }
      stores.projectCards.put({ ...placement, content: "" })
      stores.pdfVocabularyCards.put(card)
    }
  )
}

export interface AddVocabularyInput {
  pdfId: string
  page: number
  term: string
  translation: string
  rects: { x: number; y: number; w: number; h: number }[]
  startOffset?: number
  endOffset?: number
}

export async function addVocabularyEntry(input: AddVocabularyInput): Promise<{
  card: PdfVocabularyCard
  entry: VocabularyEntry
  duplicateTranslation: boolean
  duplicateOccurrence: boolean
}> {
  const term = input.term.normalize("NFKC").trim().replace(/\s+/g, " ")
  const translation = input.translation.trim()
  if (!term) throw new Error("生词不能为空")
  if (!translation) throw new Error("翻译不能为空")
  const normalizedTerm = normalizeVocabularyTerm(term)
  const now = Date.now()

  return tx(
    {
      projects: "readwrite",
      projectCards: "readwrite",
      pdfVocabularyCards: "readwrite"
    },
    async (stores) => {
      const project = await ensureVocabularyProjectInStore(stores.projects)
      const existing = await requestValue<PdfVocabularyCard>(
        stores.pdfVocabularyCards.index("byPdfId").get(input.pdfId)
      )
      let card = existing
      if (!card) {
        const cardId = crypto.randomUUID()
        const placement = buildProjectCard({
          type: "placed",
          title: "生词卡",
          content: "",
          projectId: project.id,
          pdfVocabularyCardId: cardId
        })
        card = {
          id: cardId,
          pdfId: input.pdfId,
          projectCardId: placement.id,
          entries: [],
          createdAt: now
        }
        stores.projectCards.put(placement)
      }

      const entries = [...card.entries]
      let entry = entries.find((item) => item.normalizedTerm === normalizedTerm)
      const normalizedTranslation = translation.normalize("NFKC").trim()
      const duplicateTranslation = Boolean(
        entry?.translations.some(
          (item) => item.text.normalize("NFKC").trim() === normalizedTranslation
        )
      )
      const occurrenceKey = JSON.stringify({
        page: input.page,
        startOffset: input.startOffset,
        endOffset: input.endOffset,
        rects: input.rects
      })
      const duplicateOccurrence = Boolean(
        entry?.occurrences.some(
          (item) =>
            JSON.stringify({
              page: item.page,
              startOffset: item.startOffset,
              endOffset: item.endOffset,
              rects: item.rects
            }) === occurrenceKey
        )
      )
      const occurrence: VocabularyOccurrence = {
        id: crypto.randomUUID(),
        page: input.page,
        text: term,
        rects: input.rects,
        ...(input.startOffset !== undefined
          ? { startOffset: input.startOffset }
          : {}),
        ...(input.endOffset !== undefined ? { endOffset: input.endOffset } : {}),
        createdAt: now
      }

      if (!entry) {
        entry = {
          id: crypto.randomUUID(),
          term,
          normalizedTerm,
          translations: [
            {
              id: crypto.randomUUID(),
              text: translation,
              occurrenceId: occurrence.id,
              createdAt: now
            }
          ],
          occurrences: [occurrence],
          createdAt: now
        }
        entries.push(entry)
      } else {
        const updated: VocabularyEntry = {
          ...entry,
          translations: duplicateTranslation
            ? entry.translations
            : [
                ...entry.translations,
                {
                  id: crypto.randomUUID(),
                  text: translation,
                  occurrenceId: occurrence.id,
                  createdAt: now
                }
              ],
          occurrences: duplicateOccurrence
            ? entry.occurrences
            : [...entry.occurrences, occurrence],
          updatedAt: now
        }
        entries[entries.findIndex((item) => item.id === entry!.id)] = updated
        entry = updated
      }

      const updatedCard = { ...card, entries, updatedAt: now }
      stores.pdfVocabularyCards.put(updatedCard)
      return { card: updatedCard, entry, duplicateTranslation, duplicateOccurrence }
    }
  )
}

export async function deleteVocabularyEntry(
  cardId: string,
  entryId: string
): Promise<void> {
  await tx(
    { pdfVocabularyCards: "readwrite", projectCards: "readwrite" },
    async (stores) => {
      const card = await requestValue<PdfVocabularyCard>(
        stores.pdfVocabularyCards.get(cardId)
      )
      if (!card) return false
      const entries = card.entries.filter((entry) => entry.id !== entryId)
      if (entries.length === card.entries.length) return false
      if (entries.length === 0) {
        stores.pdfVocabularyCards.delete(card.id)
        stores.projectCards.delete(card.projectCardId)
      } else {
        stores.pdfVocabularyCards.put({ ...card, entries, updatedAt: Date.now() })
      }
    }
  )
}

export async function updateVocabularyTranslation(
  cardId: string,
  entryId: string,
  translationId: string,
  text: string
): Promise<boolean> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error("翻译不能为空")
  return withStore("pdfVocabularyCards", "readwrite", async (store) => {
    const card = await requestValue<PdfVocabularyCard>(store.get(cardId))
    if (!card) return false
    const entryIndex = card.entries.findIndex((entry) => entry.id === entryId)
    if (entryIndex < 0) return false
    const entry = card.entries[entryIndex]
    const translationIndex = entry.translations.findIndex(
      (translation) => translation.id === translationId
    )
    if (translationIndex < 0) return false
    if (
      entry.translations.some(
        (translation) =>
          translation.id !== translationId &&
          translation.text.normalize("NFKC").trim() ===
            trimmed.normalize("NFKC")
      )
    ) {
      throw new Error("该翻译已经存在")
    }
    const translations = [...entry.translations]
    translations[translationIndex] = {
      ...translations[translationIndex],
      text: trimmed
    }
    const entries = [...card.entries]
    entries[entryIndex] = { ...entry, translations, updatedAt: Date.now() }
    store.put({ ...card, entries, updatedAt: Date.now() })
    return true
  })
}

export async function deleteVocabularyTranslation(
  cardId: string,
  entryId: string,
  translationId: string
): Promise<boolean> {
  return withStore("pdfVocabularyCards", "readwrite", async (store) => {
    const card = await requestValue<PdfVocabularyCard>(store.get(cardId))
    if (!card) return false
    const entryIndex = card.entries.findIndex((entry) => entry.id === entryId)
    if (entryIndex < 0) return false
    const entry = card.entries[entryIndex]
    if (entry.translations.length <= 1) {
      throw new Error("至少保留一个翻译；如不再需要，请删除整个词条")
    }
    const translations = entry.translations.filter(
      (translation) => translation.id !== translationId
    )
    if (translations.length === entry.translations.length) return false
    const entries = [...card.entries]
    entries[entryIndex] = { ...entry, translations, updatedAt: Date.now() }
    store.put({ ...card, entries, updatedAt: Date.now() })
    return true
  })
}
