// @vitest-environment jsdom
import type { Config } from "@/types/config/config"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { BILINGUAL_WRAP_ATTRIBUTE, CONTENT_WRAPPER_CLASS, TRANSLATION_ONLY_ATTRIBUTE } from "@/utils/constants/dom-labels"
import { flushBatchedOperations } from "@/utils/host/dom/batch-dom"
import { walkAndLabelElement } from "@/utils/host/dom/traversal"
import { removeAllTranslatedWrapperNodes } from "@/utils/host/translate/dom/translation-cleanup"
import { decorateTranslationNode } from "@/utils/host/translate/ui/decorate-translation"
import {
  clearCurrentPageSmartDecision,
  setCurrentPageSmartDecision,
} from "@/utils/smart-translate/page-mode-context"
import { translateNodesBilingualMode, translateNodeTranslationOnlyMode } from "../translation-modes"
import { translateWalkedElement } from "../translation-walker"
import {
  beginPageTranslationSession,
  getPageTranslationFailureSummary,
  takeFailedTranslationRuns,
} from "../../translation-session"

const mocks = vi.hoisted(() => ({
  translateTextForPage: vi.fn<(...args: any[]) => any>(),
}))

vi.mock("@/utils/host/translate/translate-variants", () => ({
  translateTextForPage: mocks.translateTextForPage,
}))

vi.mock("@/utils/host/translate/target-language-skip", () => ({
  shouldSkipAsTargetLanguage: vi.fn<(...args: any[]) => any>().mockResolvedValue(false),
}))

vi.mock("@/utils/host/translate/filter-small-paragraph", () => ({
  shouldFilterSmallParagraph: vi.fn<(...args: any[]) => any>().mockResolvedValue(false),
}))

const BILINGUAL_MICROSOFT_CONFIG: Config = {
  ...DEFAULT_CONFIG,
  pageTranslation: {
    ...DEFAULT_CONFIG.pageTranslation,
    mode: "bilingual",
    page: {
      ...DEFAULT_CONFIG.pageTranslation.page,
      smartAutoTranslate: false,
    },
  },
}

const TRANSLATION_ONLY_MICROSOFT_CONFIG: Config = {
  ...DEFAULT_CONFIG,
  pageTranslation: {
    ...DEFAULT_CONFIG.pageTranslation,
    mode: "translationOnly",
    page: {
      ...DEFAULT_CONFIG.pageTranslation.page,
      smartAutoTranslate: false,
    },
  },
}

describe("Microsoft translationOnly & compact interactive UI adaptation", () => {
  beforeEach(() => {
    beginPageTranslationSession()
    document.body.replaceChildren()
    clearCurrentPageSmartDecision()
    mocks.translateTextForPage.mockReset().mockImplementation(async (text: string) => `译:${text}`)
  })

  afterEach(() => {
    removeAllTranslatedWrapperNodes(document)
    flushBatchedOperations()
    clearCurrentPageSmartDecision()
  })

  it("translates compact interactive controls (button, nav link, menuitem, tab) in-place even in bilingual mode", async () => {
    const button = document.createElement("button")
    button.textContent = "Subscribe Now"

    const nav = document.createElement("nav")
    const navLink = document.createElement("a")
    navLink.href = "/workshop"
    navLink.textContent = "Browse Mods"
    navLink.setAttribute("title", "Custom existing tooltip")
    nav.append(navLink)

    const menuItem = document.createElement("div")
    menuItem.setAttribute("role", "menuitem")
    menuItem.textContent = "Settings"

    const tab = document.createElement("div")
    tab.setAttribute("role", "tab")
    tab.textContent = "Discussions"

    document.body.append(button, nav, menuItem, tab)

    await translateNodesBilingualMode([button], "walk-ui-1", BILINGUAL_MICROSOFT_CONFIG)
    await translateNodesBilingualMode([navLink], "walk-ui-1", BILINGUAL_MICROSOFT_CONFIG)
    await translateNodesBilingualMode([menuItem], "walk-ui-1", BILINGUAL_MICROSOFT_CONFIG)
    await translateNodesBilingualMode([tab], "walk-ui-1", BILINGUAL_MICROSOFT_CONFIG)
    flushBatchedOperations()

    // No multi-line wrapper duplication on compact UI controls
    expect(document.querySelectorAll(`.${CONTENT_WRAPPER_CLASS}`)).toHaveLength(0)
    expect(button.textContent).toBe("译:Subscribe Now")
    expect(button.getAttribute("title")).toBe("Subscribe Now")
    expect(button.hasAttribute(TRANSLATION_ONLY_ATTRIBUTE)).toBe(true)

    expect(navLink.textContent).toBe("译:Browse Mods")
    // Must not clobber author-provided title tooltip
    expect(navLink.getAttribute("title")).toBe("Custom existing tooltip")

    expect(menuItem.textContent).toBe("译:Settings")
    expect(tab.textContent).toBe("译:Discussions")

    // Restore cleanly
    removeAllTranslatedWrapperNodes(document)
    flushBatchedOperations()
    expect(button.textContent).toBe("Subscribe Now")
    expect(navLink.textContent).toBe("Browse Mods")
    expect(menuItem.textContent).toBe("Settings")
    expect(tab.textContent).toBe("Discussions")
  })

  it("suppresses partial-auto badge inside compact controls while applying typography vars on prose wrappers", async () => {
    setCurrentPageSmartDecision(window.location.href, {
      mode: "partial-auto",
      shouldAutoTranslate: true,
      detectedLanguage: "zh-Hans",
      reason: "chinese_with_foreign_blocks",
      totalBlocks: 4,
      foreignBlocks: 1,
      chineseBlocks: 3,
      technicalBlocks: 0,
      foreignLanguages: ["en"],
    })

    const button = document.createElement("button")
    const buttonWrapper = document.createElement("span")
    button.append(buttonWrapper)

    const prose = document.createElement("p")
    const proseWrapper = document.createElement("span")
    prose.append(proseWrapper)
    document.body.append(button, prose)

    const styleConfig = {
      ...DEFAULT_CONFIG.pageTranslation.translationNodeStyle,
      fontFamily: "serif" as const,
      fontSizeScale: 95,
      color: "#333333",
      lineHeight: 1.65,
      fontWeight: 500,
      paragraphSpacing: 12,
    }

    await decorateTranslationNode(buttonWrapper, styleConfig)
    await decorateTranslationNode(proseWrapper, styleConfig)

    expect(buttonWrapper.dataset.readFrogPartialTranslation).toBeUndefined()
    expect(proseWrapper.dataset.readFrogPartialTranslation).toBe("true")
    expect(proseWrapper.style.getPropertyValue("--rf-web-font-size")).toBe("95%")
    expect(proseWrapper.style.getPropertyValue("--rf-web-color")).toBe("#333333")
    expect(proseWrapper.style.getPropertyValue("--rf-web-line-height")).toBe("1.65")
    expect(proseWrapper.style.getPropertyValue("--rf-web-font-weight")).toBe("500")
    expect(proseWrapper.style.getPropertyValue("--rf-web-spacing")).toBe("12px")
  })

  it("swaps nested Microsoft translationOnly text nodes + attributes in place and records only failed units for retry", async () => {
    const failedPara = document.createElement("p")
    failedPara.textContent = "This paragraph fails initially"

    const okPara = document.createElement("p")
    const link = document.createElement("a")
    link.href = "/docs"
    link.setAttribute("title", "Read Docs")
    const strong = document.createElement("strong")
    strong.textContent = "API Reference"
    link.append(strong)
    okPara.append(document.createTextNode("Open the "), link)

    document.body.append(failedPara, okPara)

    mocks.translateTextForPage.mockImplementation(async (text: string) => {
      if (text === "This paragraph fails initially") {
        throw new Error("Microsoft HTTP 500")
      }
      return `中文(${text})`
    })

    await translateNodeTranslationOnlyMode([failedPara], "walk-ms-1", TRANSLATION_ONLY_MICROSOFT_CONFIG)
    await translateNodeTranslationOnlyMode([okPara], "walk-ms-1", TRANSLATION_ONLY_MICROSOFT_CONFIG)
    flushBatchedOperations()

    // Failed paragraph keeps intact original text and leaves zero wrappers or error icons
    expect(failedPara.textContent).toBe("This paragraph fails initially")
    expect(document.querySelectorAll(`.${CONTENT_WRAPPER_CLASS}`)).toHaveLength(0)

    // Succeeded paragraph preserves <a> and <strong> nodes and translates attribute + text in-place
    expect(okPara.firstChild?.textContent).toBe("中文(Open the) ")
    expect(strong.textContent).toBe("中文(API Reference)")
    expect(link.getAttribute("title")).toBe("中文(Read Docs)")
    expect(okPara.contains(link)).toBe(true)

    // Centralized summary tracks only the 1 failed target for targeted retry
    const summary = getPageTranslationFailureSummary()
    expect(summary.failedCount).toBe(1)
    expect(summary.lastErrorMessage).toContain("500")

    const retryRuns = takeFailedTranslationRuns()
    expect(retryRuns).toHaveLength(1)
    expect(retryRuns[0]![0]).toBe(failedPara)

    // Retry only translates the failed paragraph when network recovers
    mocks.translateTextForPage.mockClear()
    mocks.translateTextForPage.mockResolvedValue("修复后的译文")
    await translateNodeTranslationOnlyMode(retryRuns[0]!, "walk-ms-2", TRANSLATION_ONLY_MICROSOFT_CONFIG)
    flushBatchedOperations()

    expect(mocks.translateTextForPage).toHaveBeenCalledTimes(1)
    expect(failedPara.textContent).toBe("修复后的译文")
    expect(getPageTranslationFailureSummary().failedCount).toBe(0)

    // Toggle/restore returns everything identically
    removeAllTranslatedWrapperNodes(document)
    flushBatchedOperations()
    expect(failedPara.textContent).toBe("This paragraph fails initially")
    expect(strong.textContent).toBe("API Reference")
    expect(link.getAttribute("title")).toBe("Read Docs")
  })

  it("keeps short and long card/list/sidebar titles consistently bilingual and unwraps nowrap ellipsis hosts", async () => {
    const shortTitle = document.createElement("div")
    shortTitle.className = "workshopItemTitle ellipsis"
    shortTitle.style.whiteSpace = "nowrap"
    shortTitle.textContent = "Clean UI"

    const longTitle = document.createElement("div")
    longTitle.className = "workshopItemTitle ellipsis"
    longTitle.style.whiteSpace = "nowrap"
    longTitle.textContent = "Expanded Framework For Large Modpacks and Overhauls"

    const sidebarTreeCategory = document.createElement("div")
    sidebarTreeCategory.setAttribute("role", "treeitem")
    sidebarTreeCategory.style.whiteSpace = "nowrap"
    sidebarTreeCategory.textContent = "Models"

    document.body.append(shortTitle, longTitle, sidebarTreeCategory)
    walkAndLabelElement(document.body, "walk-bilingual-1", BILINGUAL_MICROSOFT_CONFIG)

    await translateNodesBilingualMode([shortTitle], "walk-bilingual-1", BILINGUAL_MICROSOFT_CONFIG)
    await translateNodesBilingualMode([longTitle], "walk-bilingual-1", BILINGUAL_MICROSOFT_CONFIG)
    await translateNodesBilingualMode(
      [sidebarTreeCategory],
      "walk-bilingual-1",
      BILINGUAL_MICROSOFT_CONFIG,
    )
    flushBatchedOperations()

    // None of them may be swapped in-place in bilingual mode
    expect(document.querySelectorAll(`[${TRANSLATION_ONLY_ATTRIBUTE}]`)).toHaveLength(0)
    expect(shortTitle.querySelector(`.${CONTENT_WRAPPER_CLASS}`)).not.toBeNull()
    expect(longTitle.querySelector(`.${CONTENT_WRAPPER_CLASS}`)).not.toBeNull()
    expect(sidebarTreeCategory.querySelector(`.${CONTENT_WRAPPER_CLASS}`)).not.toBeNull()

    // Nowrap ellipsis hosts receive the unwrap marker so both lines remain visible
    expect(shortTitle.getAttribute(BILINGUAL_WRAP_ATTRIBUTE)).toBe("true")
    expect(longTitle.getAttribute(BILINGUAL_WRAP_ATTRIBUTE)).toBe("true")
    expect(sidebarTreeCategory.getAttribute(BILINGUAL_WRAP_ATTRIBUTE)).toBe("true")

    removeAllTranslatedWrapperNodes(document)
    flushBatchedOperations()

    expect(shortTitle.hasAttribute(BILINGUAL_WRAP_ATTRIBUTE)).toBe(false)
    expect(longTitle.hasAttribute(BILINGUAL_WRAP_ATTRIBUTE)).toBe(false)
    expect(sidebarTreeCategory.hasAttribute(BILINGUAL_WRAP_ATTRIBUTE)).toBe(false)
    expect(shortTitle.textContent).toBe("Clean UI")
  })

  it("descends through inline anchors wrapping block titles without inserting outside title wrappers", async () => {
    document.body.innerHTML = `
      <div class="workshopItem">
        <a id="card-link" href="#m1"><div id="card-title" class="workshopItemTitle">Clean UI</div></a>
        <div class="workshopItemAuthorName">作者：<a href="/profiles/1">Sarg Bjornson</a></div>
      </div>
    `
    const card = document.querySelector<HTMLElement>(".workshopItem")!
    const link = document.getElementById("card-link")!
    const title = document.getElementById("card-title")!

    walkAndLabelElement(document.body, "walk-inline-block-1", BILINGUAL_MICROSOFT_CONFIG)
    await translateWalkedElement(card, "walk-inline-block-1", BILINGUAL_MICROSOFT_CONFIG)
    flushBatchedOperations()

    expect(link.hasAttribute("data-read-frog-inline-node")).toBe(true)
    expect(title.querySelector(`.${CONTENT_WRAPPER_CLASS}`)).not.toBeNull()
    expect(
      [...card.children].some((child) => child.classList.contains(CONTENT_WRAPPER_CLASS)),
    ).toBe(false)
  })
})
