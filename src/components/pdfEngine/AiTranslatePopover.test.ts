import { isVocabularyCandidate } from "./AiTranslatePopover"

describe("isVocabularyCandidate", () => {
  it("accepts words and short phrases", () => {
    expect(isVocabularyCandidate("robustness")).toBe(true)
    expect(isVocabularyCandidate("gradient boosting tree")).toBe(true)
    expect(isVocabularyCandidate("梯度提升树")).toBe(true)
  })

  it("keeps sentences as temporary translations", () => {
    expect(isVocabularyCandidate("This is a complete sentence.")).toBe(false)
    expect(isVocabularyCandidate("这是一个完整的句子。 ")).toBe(false)
    expect(isVocabularyCandidate("one two three four five six seven eight nine ten eleven twelve thirteen")).toBe(false)
  })
})
