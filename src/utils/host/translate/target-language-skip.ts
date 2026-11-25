import type { Config } from "@/types/config/config"
import type { TransNode } from "@/types/dom"
import type { BlockElementRole } from "@/utils/smart-translate/element-context"
import { isSameLanguage } from "@read-frog/definitions"
import { detectLanguage } from "@/utils/content/language"
import { classifyTextBlock } from "@/utils/smart-translate/block-classifier"
import { inferElementBlockRole } from "@/utils/smart-translate/element-context"
import { getCurrentBlockContextMode } from "@/utils/smart-translate/page-mode-context"
import { prepareTranslationText } from "./text-preparation"

export const MIN_LENGTH_FOR_TARGET_LANG_DETECTION = 50

const MAX_PREVERIFIED_TEXTS = 500
const preverifiedDomTexts = new Map<string, number>()

function markPreverifiedDomText(prepared: string): void {
  if (preverifiedDomTexts.size >= MAX_PREVERIFIED_TEXTS) {
    preverifiedDomTexts.clear()
  }
  preverifiedDomTexts.set(prepared, (preverifiedDomTexts.get(prepared) ?? 0) + 1)
}

function consumePreverifiedDomText(prepared: string): boolean {
  const count = preverifiedDomTexts.get(prepared)
  if (!count || count <= 0) return false
  if (count === 1) preverifiedDomTexts.delete(prepared)
  else preverifiedDomTexts.set(prepared, count - 1)
  return true
}

/**
 * Local check for text that should be skipped before inserting wrappers/spinners.
 *
 * When smart auto-translation is enabled (default), uses script-aware + technical-guard
 * block classification across all languages without a 50-char blind spot, protecting
 * Chinese prose, Chinese+English tech terms, author/username identifiers, and code/CLI/JSON blocks
 * while keeping foreign natural language, headings, comments, categories, and mixed clauses translatable.
 */
export async function shouldSkipAsTargetLanguage(
  text: string,
  config: Config,
  nodes?: readonly TransNode[],
  options?: { elementRole?: BlockElementRole },
): Promise<boolean> {
  if (!config.pageTranslation.page.enableTargetLanguageSkip) return false
  const prepared = prepareTranslationText(text)
  if (!prepared) return true

  if (config.pageTranslation.page.smartAutoTranslate) {
    if (nodes === undefined && !options?.elementRole && consumePreverifiedDomText(prepared)) {
      return false
    }

    const url = typeof window !== "undefined" ? window.location?.href : undefined
    const contextMode = getCurrentBlockContextMode(url)
    const elementRole = options?.elementRole ?? inferElementBlockRole(nodes)
    const classification = classifyTextBlock(prepared, {
      targetCode: config.language.targetCode,
      contextMode,
      elementRole,
    })
    if (classification.shouldTranslate && nodes !== undefined) {
      markPreverifiedDomText(prepared)
    }
    return !classification.shouldTranslate
  }

  if (prepared.length < MIN_LENGTH_FOR_TARGET_LANG_DETECTION) return false
  const detected = await detectLanguage(prepared, { enableLLM: false })
  return detected !== null && isSameLanguage(detected, config.language.targetCode)
}
