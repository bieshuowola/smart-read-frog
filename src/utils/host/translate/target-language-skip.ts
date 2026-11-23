import type { Config } from "@/types/config/config"
import { isSameLanguage } from "@read-frog/definitions"
import { detectLanguage } from "@/utils/content/language"
import { classifyTextBlock } from "@/utils/smart-translate/block-classifier"
import { getCurrentBlockContextMode } from "@/utils/smart-translate/page-mode-context"
import { prepareTranslationText } from "./text-preparation"

export const MIN_LENGTH_FOR_TARGET_LANG_DETECTION = 50

/**
 * Local check for text that should be skipped before inserting wrappers/spinners.
 *
 * When smart auto-translation is enabled (default), uses script-aware + technical-guard
 * block classification across all languages without a 50-char blind spot, protecting
 * Chinese prose, Chinese+English tech terms, and code/CLI/JSON blocks while keeping
 * foreign natural language and mixed foreign clauses translatable.
 */
export async function shouldSkipAsTargetLanguage(text: string, config: Config): Promise<boolean> {
  if (!config.pageTranslation.page.enableTargetLanguageSkip) return false
  const prepared = prepareTranslationText(text)
  if (!prepared) return true

  if (config.pageTranslation.page.smartAutoTranslate) {
    const url = typeof window !== "undefined" ? window.location?.href : undefined
    const contextMode = getCurrentBlockContextMode(url)
    const classification = classifyTextBlock(prepared, {
      targetCode: config.language.targetCode,
      contextMode,
    })
    return !classification.shouldTranslate
  }

  if (prepared.length < MIN_LENGTH_FOR_TARGET_LANG_DETECTION) return false
  const detected = await detectLanguage(prepared, { enableLLM: false })
  return detected !== null && isSameLanguage(detected, config.language.targetCode)
}
