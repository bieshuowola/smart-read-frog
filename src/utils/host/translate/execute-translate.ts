import type { PromptResolver } from "./api/ai"
import type { Config } from "@/types/config/config"
import type { ProviderConfig } from "@/types/config/provider"
import type { TranslationTextFormat } from "@/types/config/translate"
import type { MatchedTerm } from "@/utils/glossary/types"
import { LANGUAGE_ENGLISH_NAMES } from "@read-frog/definitions"
import { isLLMProviderConfig, isNonAPIProvider, isPureAPIProvider } from "@/types/config/provider"
import { aiTranslate } from "./api/ai"
import { deeplTranslate } from "./api/deepl"
import { deeplxTranslate } from "./api/deeplx"
import { googleTranslate } from "./api/google"
import {
  toGoogleLanguageCode,
  toGoogleSourceCode,
  toMicrosoftLanguageCode,
  toMicrosoftSourceCode,
} from "./api/language-codes"
import { microsoftTranslate } from "./api/microsoft"
import { prepareTranslationText } from "./text-preparation"
import { normalizeTranslationOutput } from "./translation-output-normalization"

export async function executeTranslate<TContext>(
  text: string,
  langConfig: Config["language"],
  providerConfig: ProviderConfig,
  promptResolver: PromptResolver<TContext>,
  options?: {
    isBatch?: boolean
    context?: TContext
    textFormat?: TranslationTextFormat
    // Only Google needs protection: its translateHtml transport collapses
    // "\n" as HTML whitespace. Microsoft preserves newlines in both textTypes
    // (live-verified); LLM prompts already mandate format preservation.
    preserveLineBreaks?: boolean
    signal?: AbortSignal
    glossaryTerms?: readonly MatchedTerm[]
  },
) {
  const preparedText = prepareTranslationText(text)
  if (preparedText === "") {
    return ""
  }

  const { provider } = providerConfig
  let translatedText = ""

  if (isNonAPIProvider(provider)) {
    const google = provider === "google-translate"
    const sourceLang = (google ? toGoogleSourceCode : toMicrosoftSourceCode)(langConfig.sourceCode)
    const targetLang = (google ? toGoogleLanguageCode : toMicrosoftLanguageCode)(
      langConfig.targetCode,
    )
    if (provider === "google-translate") {
      translatedText = await googleTranslate(preparedText, sourceLang, targetLang, {
        textFormat: options?.textFormat,
        preserveLineBreaks: options?.preserveLineBreaks,
        signal: options?.signal,
      })
    } else if (provider === "microsoft-translate") {
      translatedText = await microsoftTranslate(preparedText, sourceLang, targetLang, {
        textFormat: options?.textFormat,
        signal: options?.signal,
      })
    }
  } else if (isPureAPIProvider(provider)) {
    const { sourceCode, targetCode } = langConfig
    if (provider === "deeplx") {
      translatedText = await deeplxTranslate(preparedText, sourceCode, targetCode, providerConfig, {
        textFormat: options?.textFormat,
        signal: options?.signal,
      })
    } else if (provider === "deepl") {
      translatedText = await deeplTranslate(text, sourceCode, targetCode, providerConfig, {
        textFormat: options?.textFormat,
        signal: options?.signal,
      })
    }
  } else if (isLLMProviderConfig(providerConfig)) {
    const targetLangName = LANGUAGE_ENGLISH_NAMES[langConfig.targetCode]
    translatedText = await aiTranslate(
      preparedText,
      targetLangName,
      providerConfig,
      promptResolver,
      options,
    )
  } else {
    throw new Error(`Unknown provider: ${provider}`)
  }

  return normalizeTranslationOutput(providerConfig, translatedText).trim()
}

/**
 * Native batch execution for Microsoft Translate's bare JSON string array API.
 * Translates up to 20 paragraphs in a single HTTP round trip without artificial delimiters.
 */
export async function executeMicrosoftBatchTranslate(
  texts: readonly string[],
  langConfig: Config["language"],
  providerConfig: ProviderConfig,
  options?: {
    signal?: AbortSignal
  },
): Promise<string[]> {
  if (texts.length === 0) return []
  if (providerConfig.provider !== "microsoft-translate") {
    throw new Error(`executeMicrosoftBatchTranslate called with unsupported provider: ${providerConfig.provider}`)
  }

  const prepared = texts.map((text) => prepareTranslationText(text))
  const nonEmptyIndices: number[] = []
  const nonEmptyTexts: string[] = []
  for (let i = 0; i < prepared.length; i++) {
    if (prepared[i] !== "") {
      nonEmptyIndices.push(i)
      nonEmptyTexts.push(prepared[i]!)
    }
  }

  const results = new Array<string>(texts.length).fill("")
  if (nonEmptyTexts.length === 0) return results

  const sourceLang = toMicrosoftSourceCode(langConfig.sourceCode)
  const targetLang = toMicrosoftLanguageCode(langConfig.targetCode)
  const translated = await microsoftTranslate(nonEmptyTexts, sourceLang, targetLang, {
    textFormat: "plain",
    signal: options?.signal,
  })

  for (let idx = 0; idx < nonEmptyIndices.length; idx++) {
    const targetIndex = nonEmptyIndices[idx]!
    const raw = translated[idx] ?? ""
    results[targetIndex] = normalizeTranslationOutput(providerConfig, raw).trim()
  }
  return results
}
