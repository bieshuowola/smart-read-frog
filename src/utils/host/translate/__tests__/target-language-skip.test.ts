// @vitest-environment jsdom
import type { Config } from "@/types/config/config"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { flushBatchedOperations } from "@/utils/host/dom/batch-dom"
import {
  clearCurrentPageSmartDecision,
  setCurrentPageSmartDecision,
} from "@/utils/smart-translate/page-mode-context"
import { translateNodes } from "../core/translation-modes"
import { shouldSkipAsTargetLanguage } from "../target-language-skip"

const mocks = vi.hoisted(() => ({
  translateTextForPage: vi.fn<(...args: any[]) => any>(),
  detectLanguage: vi.fn<(...args: any[]) => any>(),
}))

vi.mock("@/utils/host/translate/translate-variants", () => ({
  translateTextForPage: mocks.translateTextForPage,
}))

vi.mock("@/utils/content/language", () => ({
  detectLanguage: mocks.detectLanguage,
}))

const LONG_CHINESE =
  "这是一个足够长的中文段落，用来触发语言检测逻辑，长度必须超过五十个字符才可以，所以这里再补充一些文字凑够长度。"
const LONG_ENGLISH =
  "This is a sufficiently long English paragraph used to trigger the language detection logic in tests."

function createConfig({
  mode = "bilingual",
  enableSkip = true,
  smartAutoTranslate = false,
  targetCode = "zh-Hans",
}: {
  mode?: Config["pageTranslation"]["mode"]
  enableSkip?: boolean
  smartAutoTranslate?: boolean
  targetCode?: Config["language"]["targetCode"]
} = {}): Config {
  const config = structuredClone(DEFAULT_CONFIG)
  config.pageTranslation.mode = mode
  config.pageTranslation.page.enableTargetLanguageSkip = enableSkip
  config.pageTranslation.page.smartAutoTranslate = smartAutoTranslate
  config.pageTranslation.page.minCharactersPerNode = 0
  config.pageTranslation.page.minWordsPerNode = 0
  config.language.targetCode = targetCode
  return config
}

beforeEach(() => {
  document.body.replaceChildren()
  mocks.translateTextForPage.mockReset().mockResolvedValue(undefined)
  mocks.detectLanguage.mockReset().mockResolvedValue(null)
})

afterEach(() => {
  flushBatchedOperations()
})

describe("shouldSkipAsTargetLanguage", () => {
  it("returns false without calling detection when the skip flag is off", async () => {
    await expect(
      shouldSkipAsTargetLanguage(LONG_CHINESE, createConfig({ enableSkip: false })),
    ).resolves.toBe(false)
    expect(mocks.detectLanguage).not.toHaveBeenCalled()
  })

  it("returns false without calling detection for short text in legacy mode", async () => {
    await expect(shouldSkipAsTargetLanguage("你好", createConfig())).resolves.toBe(false)
    expect(mocks.detectLanguage).not.toHaveBeenCalled()
  })

  it("returns true when the detected language matches the target", async () => {
    mocks.detectLanguage.mockResolvedValue("zh-Hans")
    await expect(shouldSkipAsTargetLanguage(LONG_CHINESE, createConfig())).resolves.toBe(true)
    expect(mocks.detectLanguage).toHaveBeenCalledWith(expect.any(String), { enableLLM: false })
  })

  it("returns false when the detected language differs or is unknown", async () => {
    mocks.detectLanguage.mockResolvedValue("en")
    await expect(shouldSkipAsTargetLanguage(LONG_ENGLISH, createConfig())).resolves.toBe(false)
    mocks.detectLanguage.mockResolvedValue(null)
    await expect(shouldSkipAsTargetLanguage(LONG_ENGLISH, createConfig())).resolves.toBe(false)
  })

  it("skips short Chinese and Chinese+tech-terms while translating mixed clauses and foreign languages in smart mode", async () => {
    const smartCfg = createConfig({ smartAutoTranslate: true })
    await expect(shouldSkipAsTargetLanguage("你好", smartCfg)).resolves.toBe(true)
    await expect(
      shouldSkipAsTargetLanguage(
        "这次 Codex 的 Agent 调度出了问题，Context Window 消耗太快，建议检查 API 的 Token Usage。",
        smartCfg,
      ),
    ).resolves.toBe(true)
    await expect(
      shouldSkipAsTargetLanguage("Apple Watch 的 WiFi Calling 功能存在兼容性问题。", smartCfg),
    ).resolves.toBe(true)
    await expect(
      shouldSkipAsTargetLanguage("This API is deprecated，请尽快迁移。", smartCfg),
    ).resolves.toBe(false)
    await expect(
      shouldSkipAsTargetLanguage("Bonjour tout le monde, ceci est une documentation technique.", smartCfg),
    ).resolves.toBe(false)
    await expect(
      shouldSkipAsTargetLanguage("こんにちは、新しいドキュメントをご覧ください。", smartCfg),
    ).resolves.toBe(false)
  })

  it("honors DOM elementRole in partial-auto and preserves approval across the immediately following backstop check", async () => {
    const smartCfg = createConfig({ smartAutoTranslate: true })
    setCurrentPageSmartDecision(window.location.href, {
      mode: "partial-auto",
      shouldAutoTranslate: true,
      detectedLanguage: "zh-Hans",
      reason: "chinese_with_foreign_blocks",
      totalBlocks: 10,
      foreignBlocks: 2,
      chineseBlocks: 8,
      technicalBlocks: 0,
      foreignLanguages: ["en"],
    })

    try {
      const heading = document.createElement("div")
      heading.className = "workshopItemTitle"
      heading.textContent = "Vanilla Expanded Framework"

      const comment = document.createElement("div")
      comment.className = "commentthread_comment_text"
      comment.textContent = "Nice"

      const category = document.createElement("label")
      category.textContent = "Models"

      const author = document.createElement("a")
      author.href = "https://example.com/id/Kasodus"
      author.className = "commentthread_author_link"
      author.textContent = "Kasodus"

      document.body.append(heading, comment, category, author)

      // 1. Author handle is skipped
      await expect(shouldSkipAsTargetLanguage("Kasodus", smartCfg, [author])).resolves.toBe(true)

      // 2. Title, short comment, and category approved with nodes stay approved on immediate node-less backstop
      await expect(
        shouldSkipAsTargetLanguage("Vanilla Expanded Framework", smartCfg, [heading]),
      ).resolves.toBe(false)
      await expect(shouldSkipAsTargetLanguage("Vanilla Expanded Framework", smartCfg)).resolves.toBe(
        false,
      )

      await expect(shouldSkipAsTargetLanguage("Nice", smartCfg, [comment])).resolves.toBe(false)
      await expect(shouldSkipAsTargetLanguage("Nice", smartCfg)).resolves.toBe(false)

      await expect(shouldSkipAsTargetLanguage("Models", smartCfg, [category])).resolves.toBe(false)
      await expect(shouldSkipAsTargetLanguage("Models", smartCfg)).resolves.toBe(false)
    } finally {
      clearCurrentPageSmartDecision()
    }
  })
})

describe.each(["bilingual", "translationOnly"] as const)("%s translation", (mode) => {
  it("never inserts a wrapper for an already-target-language paragraph", async () => {
    mocks.detectLanguage.mockImplementation(async (text: string) =>
      /[一-鿿]/.test(text) ? "zh-Hans" : "en",
    )
    const container = document.createElement("div")
    const textNode = document.createTextNode(LONG_CHINESE)
    container.appendChild(textNode)
    document.body.appendChild(container)

    await translateNodes([textNode], "walk-id", false, createConfig({ mode }))
    flushBatchedOperations()

    expect(mocks.translateTextForPage).not.toHaveBeenCalled()
    // The old behavior inserted a wrapper+spinner and then removed it; now the
    // DOM must never contain one at all.
    expect(document.querySelectorAll(".read-frog-translated-content-wrapper").length).toBe(0)
  })

  it("still requests a translation for a different-language paragraph", async () => {
    mocks.detectLanguage.mockImplementation(async (text: string) =>
      /[一-鿿]/.test(text) ? "zh-Hans" : "en",
    )
    const container = document.createElement("div")
    const textNode = document.createTextNode(LONG_ENGLISH)
    container.appendChild(textNode)
    document.body.appendChild(container)

    await translateNodes([textNode], "walk-id", false, createConfig({ mode }))

    expect(mocks.translateTextForPage).toHaveBeenCalledOnce()
  })
})
