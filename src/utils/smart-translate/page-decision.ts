import type { LanguageTag } from "@read-frog/definitions"
import type { Config } from "@/types/config/config"
import type { PageAutoDecision } from "./types"
import { urlMatchesPattern } from "@/utils/url-pattern"
import { classifyTextBlock } from "./block-classifier"
import { evaluatePrivacyGuard } from "./privacy-guard"
import { isChineseTargetTag } from "./script-analyzer"

const EXCLUDED_SAMPLE_ANCESTOR_SELECTOR = [
  "nav",
  "header",
  "footer",
  "aside",
  "code",
  "pre",
  "kbd",
  "samp",
  "script",
  "style",
  "noscript",
  "svg",
  "template",
  "[hidden]",
  '[aria-hidden="true"]',
  ".notranslate",
  ".read-frog-translated-content-wrapper",
  ".read-frog-react-shadow-host",
].join(",")

const READABLE_CANDIDATE_SELECTOR =
  "p, h1, h2, h3, h4, li, blockquote, dd, dt, td, th, figcaption, article, main, div, span"

const BLOCK_CHILD_SELECTOR = "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, article, section, div, table"

const MAX_SAMPLED_BLOCKS = 80
const MAX_SAMPLED_CHARS = 14000

function isElementHiddenCheap(el: Element): boolean {
  if (el.hasAttribute("hidden")) return true
  if (el.getAttribute("aria-hidden") === "true") return true
  const inlineStyle = el.getAttribute("style")
  if (inlineStyle && /display\s*:\s*none|visibility\s*:\s*hidden/i.test(inlineStyle)) {
    return true
  }
  return false
}

function getDirectProseText(el: Element): string {
  let text = ""
  for (const child of el.childNodes) {
    if (child.nodeType === 3) {
      text += child.textContent ?? ""
    }
  }
  return text.replace(/\s+/g, " ").trim()
}

/**
 * Sample readable natural-language blocks from the document without triggering expensive layout reflows.
 */
export function collectReadablePageBlocks(
  doc: Document,
  maxBlocks = MAX_SAMPLED_BLOCKS,
): string[] {
  const root = doc.body ?? doc.documentElement
  if (!root || typeof root.querySelectorAll !== "function") {
    const fallback = (doc.body?.textContent ?? "").replace(/\s+/g, " ").trim()
    return fallback ? [fallback] : []
  }

  const blocks: string[] = []
  const seenText = new Set<string>()
  let totalChars = 0

  const candidates = root.querySelectorAll(READABLE_CANDIDATE_SELECTOR)

  for (const el of candidates) {
    if (blocks.length >= maxBlocks || totalChars >= MAX_SAMPLED_CHARS) break
    if (isElementHiddenCheap(el)) continue
    if (typeof el.closest === "function" && el.closest(EXCLUDED_SAMPLE_ANCESTOR_SELECTOR)) {
      continue
    }

    const tag = el.tagName.toUpperCase()
    let text: string

    if (tag === "DIV" || tag === "ARTICLE" || tag === "MAIN" || tag === "SPAN") {
      // For generic containers, only capture leaf-like prose or direct text nodes
      // so we don't concatenate an entire page into a single giant string.
      const hasBlockDescendants =
        tag !== "SPAN" && typeof el.querySelector === "function" && Boolean(el.querySelector(BLOCK_CHILD_SELECTOR))
      if (hasBlockDescendants) {
        text = getDirectProseText(el)
      } else if (tag === "SPAN") {
        // Only take spans that are not nested inside an already-captured paragraph/heading/list item
        if (typeof el.closest === "function" && el.closest("p, h1, h2, h3, h4, li, blockquote")) {
          continue
        }
        text = (el.textContent ?? "").replace(/\s+/g, " ").trim()
      } else {
        text = (el.textContent ?? "").replace(/\s+/g, " ").trim()
      }
    } else {
      // Semantic prose blocks (p, h1..h4, li, blockquote, etc.)
      if (tag === "LI" && typeof el.querySelector === "function" && el.querySelector("p, ul, ol")) {
        text = getDirectProseText(el)
      } else {
        text = (el.textContent ?? "").replace(/\s+/g, " ").trim()
      }
    }

    if (text.length < 4) continue
    const dedupKey = text.slice(0, 160)
    if (seenText.has(dedupKey)) continue
    seenText.add(dedupKey)

    blocks.push(text)
    totalChars += text.length
  }

  if (blocks.length === 0) {
    const rawBody = (doc.body?.textContent ?? "").replace(/\s+/g, " ").trim()
    if (rawBody) {
      blocks.push(rawBody.slice(0, 4000))
    }
  }

  return blocks
}

export interface EvaluatePageDecisionInput {
  url: string
  blocks: string[]
  title?: string
  doc?: Document
  config: Config
}

export function evaluatePageTranslationDecision(
  input: EvaluatePageDecisionInput,
): PageAutoDecision {
  const { url, blocks, title, doc, config } = input
  const targetCode = config.language.targetCode
  const pageConfig = config.pageTranslation.page
  const smartAutoTranslate = pageConfig.smartAutoTranslate ?? true
  const privacyGuardEnabled = pageConfig.privacyGuardEnabled ?? true

  const baseEmpty: Omit<PageAutoDecision, "mode" | "shouldAutoTranslate" | "detectedLanguage" | "reason"> = {
    totalBlocks: blocks.length,
    foreignBlocks: 0,
    chineseBlocks: 0,
    technicalBlocks: 0,
    foreignLanguages: [],
  }

  // 1. Explicit user never-translate pattern always wins
  if (pageConfig.neverAutoTranslatePatterns.some((pattern) => urlMatchesPattern(url, pattern))) {
    return {
      ...baseEmpty,
      mode: "skip",
      shouldAutoTranslate: false,
      detectedLanguage: "und",
      reason: "never_translate_pattern",
    }
  }

  // 2. Privacy-first guard blocks automatic uploading on sensitive pages
  const privacy = evaluatePrivacyGuard(url, { enabled: privacyGuardEnabled, doc })
  if (privacy.isSensitive) {
    return {
      ...baseEmpty,
      mode: "privacy-blocked",
      shouldAutoTranslate: false,
      detectedLanguage: "und",
      reason: "privacy_sensitive_page",
      privacyReason: privacy.reason,
    }
  }

  // 3. Explicit user always-translate site pattern
  if (pageConfig.autoTranslatePatterns.some((pattern) => urlMatchesPattern(url, pattern))) {
    const sampleClassification = classifyTextBlock(blocks.slice(0, 10).join("\n"), {
      targetCode,
      contextMode: "standalone",
    })
    return {
      ...baseEmpty,
      mode: "full-auto",
      shouldAutoTranslate: true,
      detectedLanguage:
        sampleClassification.detectedLanguage !== "mixed"
          ? sampleClassification.detectedLanguage
          : "en",
      reason: "always_translate_pattern",
    }
  }

  // 4. Smart auto-translation disabled -> return skip (caller may still check legacy rules)
  if (!smartAutoTranslate) {
    return {
      ...baseEmpty,
      mode: "skip",
      shouldAutoTranslate: false,
      detectedLanguage: "und",
      reason: "disabled",
    }
  }

  let chineseBlocks = 0
  let foreignBlocks = 0
  let technicalBlocks = 0
  let chineseCharWeight = 0
  let foreignCharWeight = 0
  let strongPartialForeignBlocks = 0

  const languageScores = new Map<LanguageTag, number>()

  for (const block of blocks) {
    const result = classifyTextBlock(block, {
      targetCode,
      contextMode: "standalone",
    })

    if (result.reason === "pure_code_or_tech" || result.reason === "empty_or_non_prose") {
      technicalBlocks += 1
      continue
    }

    if (result.shouldTranslate) {
      foreignBlocks += 1
      foreignCharWeight += block.length

      if (
        result.foreignProseWords >= 4 ||
        result.reason === "japanese_kana" ||
        result.reason === "korean_hangul" ||
        result.reason === "non_latin_foreign_script" ||
        result.reason === "mixed_with_foreign_clause"
      ) {
        strongPartialForeignBlocks += 1
      }

      if (result.detectedLanguage !== "und" && result.detectedLanguage !== "mixed") {
        languageScores.set(
          result.detectedLanguage,
          (languageScores.get(result.detectedLanguage) ?? 0) + Math.max(1, block.length),
        )
      }
      continue
    }

    if (
      result.reason === "target_chinese" ||
      result.reason === "chinese_with_tech_terms" ||
      result.reason === "already_target_language"
    ) {
      chineseBlocks += 1
      chineseCharWeight += block.length
    }
  }

  // If readable body blocks yielded nothing conclusive, check document title as fallback signal
  if (foreignBlocks === 0 && chineseBlocks === 0 && title?.trim()) {
    const titleResult = classifyTextBlock(title, { targetCode, contextMode: "standalone" })
    if (titleResult.shouldTranslate && titleResult.foreignProseWords >= 3) {
      foreignBlocks = 1
      strongPartialForeignBlocks = 1
      foreignCharWeight = title.length
      if (titleResult.detectedLanguage !== "und" && titleResult.detectedLanguage !== "mixed") {
        languageScores.set(titleResult.detectedLanguage, title.length)
      }
    } else if (
      titleResult.reason === "target_chinese" ||
      titleResult.reason === "chinese_with_tech_terms"
    ) {
      chineseBlocks = 1
      chineseCharWeight = title.length
    }
  }

  const foreignLanguages = [...languageScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang)

  const primaryForeignLanguage: LanguageTag | "und" = foreignLanguages[0] ?? "und"

  if (foreignBlocks === 0) {
    return {
      mode: "skip",
      shouldAutoTranslate: false,
      detectedLanguage: chineseBlocks > 0 ? (isChineseTargetTag(targetCode) ? targetCode : "zh-Hans") : "und",
      reason: chineseBlocks > 0 ? "chinese_dominant_clean" : "insufficient_readable_content",
      totalBlocks: blocks.length,
      foreignBlocks,
      chineseBlocks,
      technicalBlocks,
      foreignLanguages,
    }
  }

  // Foreign-dominant page: no Chinese blocks, or foreign prose clearly dominates page
  if (
    chineseBlocks === 0 ||
    (foreignBlocks >= chineseBlocks * 1.5 && foreignCharWeight >= chineseCharWeight)
  ) {
    return {
      mode: "full-auto",
      shouldAutoTranslate: true,
      detectedLanguage: primaryForeignLanguage,
      reason: foreignLanguages.length > 1 ? "multilingual_foreign_page" : "foreign_dominant_page",
      totalBlocks: blocks.length,
      foreignBlocks,
      chineseBlocks,
      technicalBlocks,
      foreignLanguages,
    }
  }

  // Chinese-dominant page containing standalone foreign paragraphs/comments/clauses
  if (strongPartialForeignBlocks > 0) {
    return {
      mode: "partial-auto",
      shouldAutoTranslate: true,
      detectedLanguage: isChineseTargetTag(targetCode) ? targetCode : "zh-Hans",
      reason: "chinese_with_foreign_blocks",
      totalBlocks: blocks.length,
      foreignBlocks,
      chineseBlocks,
      technicalBlocks,
      foreignLanguages,
    }
  }

  // Conservative fallback: tiny ambiguous tokens inside a Chinese page stay untranslated
  return {
    mode: "skip",
    shouldAutoTranslate: false,
    detectedLanguage: isChineseTargetTag(targetCode) ? targetCode : "zh-Hans",
    reason: "chinese_dominant_clean",
    totalBlocks: blocks.length,
    foreignBlocks,
    chineseBlocks,
    technicalBlocks,
    foreignLanguages,
  }
}

export function detectSmartPageDecision(doc: Document, url: string, config: Config): PageAutoDecision {
  const blocks = collectReadablePageBlocks(doc)
  return evaluatePageTranslationDecision({
    url,
    blocks,
    title: doc.title,
    doc,
    config,
  })
}
