import type { LanguageTag } from "@read-frog/definitions"
import type { Config } from "@/types/config/config"
import type { PageAutoDecision } from "@/utils/smart-translate/types"
import { isSameLanguage } from "@read-frog/definitions"
import { getFinalSourceCode } from "@/utils/config/languages"
import { evaluatePrivacyGuard } from "@/utils/smart-translate/privacy-guard"
import { urlMatchesPattern } from "@/utils/url-pattern"

export async function shouldEnableAutoTranslation(
  url: string,
  detectedCodeOrUnd: LanguageTag | "und",
  config: Config,
  smartDecision?: PageAutoDecision,
): Promise<boolean> {
  const autoTranslatePatterns = config?.pageTranslation.page.autoTranslatePatterns
  const neverAutoTranslatePatterns = config?.pageTranslation.page.neverAutoTranslatePatterns
  const autoTranslateLanguages = config?.pageTranslation.page.autoTranslateLanguages
  const smartAutoTranslate = config?.pageTranslation.page.smartAutoTranslate ?? false
  const privacyGuardEnabled = config?.pageTranslation.page.privacyGuardEnabled ?? true
  const { sourceCode } = config?.language || {}

  const doesMatchNeverTranslatePattern =
    neverAutoTranslatePatterns?.some((pattern) => urlMatchesPattern(url, pattern)) ?? false
  if (doesMatchNeverTranslatePattern) {
    return false
  }

  if (smartDecision?.mode === "privacy-blocked") {
    return false
  }
  if (privacyGuardEnabled && evaluatePrivacyGuard(url, { enabled: true }).isSensitive) {
    return false
  }

  const doesMatchPattern =
    autoTranslatePatterns?.some((pattern) => urlMatchesPattern(url, pattern)) ?? false
  if (doesMatchPattern) {
    return true
  }

  if (smartAutoTranslate && smartDecision) {
    return smartDecision.shouldAutoTranslate
  }

  let doesMatchLanguage = false
  if (detectedCodeOrUnd !== "und") {
    const pageLanguage = getFinalSourceCode(sourceCode, detectedCodeOrUnd)
    doesMatchLanguage =
      autoTranslateLanguages?.some((language) => isSameLanguage(language, pageLanguage)) ?? false
  }

  return doesMatchLanguage
}
