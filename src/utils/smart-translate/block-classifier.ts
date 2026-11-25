import type { LanguageTag } from "@read-frog/definitions"
import type { BlockElementRole } from "./element-context"
import type { BlockClassificationResult } from "./types"
import { resolveLanguage } from "@read-frog/definitions"
import { franc } from "franc"
import { isPureTechnicalOrCodeBlock, stripTechnicalTokens } from "./code-and-tech-guard"
import {
  analyzeScripts,
  getDominantNonLatinForeignScript,
  hasSignificantJapaneseKana,
  hasSignificantKoreanHangul,
  isChineseTargetTag,
} from "./script-analyzer"

export type BlockContextMode = "standalone" | "full-auto" | "partial-auto"

export interface ClassifyBlockOptions {
  targetCode?: LanguageTag
  contextMode?: BlockContextMode
  elementRole?: BlockElementRole
}

// Foreign grammatical function words / copulas / modals / pronouns / prepositions
// across English and major European languages (FR, DE, ES, PT, IT, NL).
// Deliberately excludes generic nouns/brand words so embedded Title-Cased terms
// like "Context Window", "Token Usage", "Apple Watch", "WiFi Calling" never match.
const STRONG_CLAUSE_MARKERS = new Set([
  // English copulas, auxiliaries, modals, pronouns, demonstratives, negations, imperatives
  "i",
  "you",
  "we",
  "they",
  "he",
  "she",
  "it",
  "me",
  "us",
  "them",
  "my",
  "your",
  "our",
  "their",
  "this",
  "that",
  "these",
  "those",
  "is",
  "are",
  "was",
  "were",
  "am",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "shall",
  "should",
  "can",
  "could",
  "may",
  "might",
  "must",
  "not",
  "cannot",
  "don't",
  "doesn't",
  "didn't",
  "can't",
  "won't",
  "shouldn't",
  "isn't",
  "aren't",
  "please",
  "deprecated",
  "because",
  "although",
  "unless",
  "until",
  "while",
  "before",
  "after",
  "without",
  "between",
  "through",
  "about",
  "should",
  // French
  "je",
  "tu",
  "il",
  "elle",
  "nous",
  "vous",
  "ils",
  "elles",
  "ce",
  "cette",
  "ces",
  "est",
  "sont",
  "être",
  "avoir",
  "pas",
  "ne",
  "avec",
  "pour",
  "dans",
  "veuillez",
  "merci",
  // German
  "ich",
  "du",
  "wir",
  "sie",
  "ist",
  "sind",
  "war",
  "sein",
  "haben",
  "wird",
  "werden",
  "nicht",
  "kein",
  "keine",
  "mit",
  "für",
  "bitte",
  "aber",
  "weil",
  "wenn",
  // Spanish
  "yo",
  "tú",
  "él",
  "nosotros",
  "ellos",
  "es",
  "son",
  "está",
  "están",
  "ser",
  "estar",
  "tiene",
  "tienen",
  "para",
  "por",
  "con",
  "sin",
  "porque",
  "cuando",
  "favor",
  // Portuguese
  "eu",
  "você",
  "nós",
  "eles",
  "é",
  "são",
  "está",
  "estão",
  "não",
  "com",
  "sem",
  "obrigado",
  "obrigada",
  // Italian
  "io",
  "noi",
  "voi",
  "loro",
  "è",
  "sono",
  "essere",
  "avere",
  "non",
  "per",
  "con",
  "senza",
  "questo",
  "questa",
  "grazie",
])

const GENERAL_FUNCTION_WORDS = new Set([
  ...STRONG_CLAUSE_MARKERS,
  // Articles & basic connectors (not sufficient alone on a 2-word Title Case phrase
  // like "League of Legends", so checked alongside lowercase / length rules)
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "if",
  "of",
  "in",
  "on",
  "at",
  "to",
  "from",
  "by",
  "for",
  "as",
  "with",
  "into",
  "over",
  "under",
  "all",
  "some",
  "any",
  "no",
  "more",
  "most",
  "le",
  "la",
  "les",
  "un",
  "une",
  "des",
  "du",
  "au",
  "aux",
  "et",
  "ou",
  "der",
  "die",
  "das",
  "ein",
  "eine",
  "und",
  "oder",
  "el",
  "los",
  "las",
  "una",
  "del",
  "o",
  "os",
  "as",
  "um",
  "uma",
  "do",
  "da",
  "dos",
  "das",
  "il",
  "lo",
  "gli",
  "che",
])

const TITLE_CASE_MINOR_CONNECTORS = new Set(["of", "for", "and", "in", "on", "to", "de", "du", "von", "the"])

const HAN_BREAK_RE = /[\p{Script=Han}\u3000-\u303F\uFF01-\uFF5E\r\n]+/gu
const LATIN_WORD_RE = /\p{Script=Latin}+(?:['’]\p{Script=Latin}+)*/gu
const VOWEL_RE = /[aeiouyàáâãäåæçèéêëìíîïñòóôõöøùúûüýÿ]/i

// Common tech words that frequently appear lowercase or standalone in Chinese dev articles
const TECH_TERM_WORDS = new Set([
  "api",
  "sdk",
  "cli",
  "gui",
  "ui",
  "ux",
  "ai",
  "llm",
  "rag",
  "mcp",
  "dom",
  "css",
  "html",
  "json",
  "yaml",
  "xml",
  "http",
  "https",
  "url",
  "uri",
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "node",
  "git",
  "github",
  "gitlab",
  "docker",
  "kubernetes",
  "linux",
  "windows",
  "macos",
  "android",
  "ios",
  "chrome",
  "edge",
  "firefox",
  "quetta",
  "react",
  "vue",
  "vite",
  "typescript",
  "javascript",
  "python",
  "rust",
  "golang",
  "token",
  "tokens",
  "codex",
  "wifi",
  "apple",
  "google",
  "groq",
  "gemini",
  "openrouter",
  "cerebras",
  "siliconflow",
  "ollama",
  "async",
  "await",
])

function isTitleCaseWord(word: string): boolean {
  return /^[A-Z\p{Lu}]/u.test(word)
}

function isLikelyTitleCaseNounPhrase(words: string[]): boolean {
  if (words.length === 0 || words.length > 5) return false
  return words.every(
    (w) => isTitleCaseWord(w) || TITLE_CASE_MINOR_CONNECTORS.has(w.toLowerCase()),
  )
}

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/^['’]+|['’]+$/g, "")
}

/**
 * Inspect contiguous Latin segments inside a Han-dominant (or mixed) paragraph.
 * Returns whether at least one segment expresses genuine foreign natural-language prose/clause.
 */
function analyzeMixedLatinSegments(strippedText: string): {
  hasForeignClause: boolean
  totalLatinWords: number
  maxSegmentProseWords: number
} {
  const segments = strippedText
    .split(HAN_BREAK_RE)
    .map((s) => s.trim())
    .filter(Boolean)

  let totalLatinWords = 0
  let maxSegmentProseWords = 0
  let hasForeignClause = false

  for (const segment of segments) {
    const words = segment.match(LATIN_WORD_RE) ?? []
    if (words.length === 0) continue

    totalLatinWords += words.length
    if (words.length > maxSegmentProseWords) {
      maxSegmentProseWords = words.length
    }

    const lowerWords = words.map(normalizeWord)
    const strongMarkerCount = lowerWords.filter((w) => STRONG_CLAUSE_MARKERS.has(w)).length
    const generalFunctionCount = lowerWords.filter((w) => GENERAL_FUNCTION_WORDS.has(w)).length
    const lowercaseCount = words.filter((w) => w === w.toLowerCase()).length
    const nonTechWordsCount = lowerWords.filter((w) => !TECH_TERM_WORDS.has(w)).length
    const hasTitleNounOnly = isLikelyTitleCaseNounPhrase(words)

    // E.g. "Context Window", "Token Usage", "Apple Watch", "WiFi Calling", "Server Components"
    if (hasTitleNounOnly && strongMarkerCount === 0) {
      continue
    }

    // E.g. "This API is deprecated" -> stripped becomes "This is deprecated" (3 words, strong markers "this", "is")
    if (words.length >= 3 && strongMarkerCount >= 1 && nonTechWordsCount >= 1) {
      hasForeignClause = true
      continue
    }

    // E.g. 2-word imperative/copula clause with strong markers & lowercase verb/adj ("It works", "Please wait")
    if (
      words.length === 2 &&
      strongMarkerCount >= 1 &&
      lowercaseCount >= 1 &&
      nonTechWordsCount >= 1 &&
      /[.!?,;:]/.test(segment)
    ) {
      hasForeignClause = true
      continue
    }

    // Longer prose phrase (>= 4 words) containing grammatical function words & non-tech vocabulary
    if (
      words.length >= 4 &&
      generalFunctionCount >= 1 &&
      lowercaseCount >= 2 &&
      nonTechWordsCount >= 2
    ) {
      hasForeignClause = true
      continue
    }

    // Long Latin prose (>= 6 words) even without recognized function word (covers unsupported European languages)
    if (words.length >= 6 && lowercaseCount >= 3 && nonTechWordsCount >= 3) {
      hasForeignClause = true
    }
  }

  return { hasForeignClause, totalLatinWords, maxSegmentProseWords }
}

const FR_HINT_RE = /\b(?:le|la|les|des|est|sont|vous|nous|avec|pour|dans|cette|veuillez|merci|bonjour)\b|[àâçéèêëîïôùûüœ]/i
const DE_HINT_RE = /\b(?:der|die|das|ein|eine|ist|sind|und|nicht|mit|für|ich|wir|sie|bitte|hallo)\b|[äöüß]/i
const ES_HINT_RE = /\b(?:el|la|los|las|una|es|son|está|para|con|por|qué|cómo|hola|gracias)\b|[ñ¿¡]/i
const PT_HINT_RE = /\b(?:não|você|são|está|para|com|uma|obrigado|obrigada|olá|tudo)\b|[ãõ]/i
const IT_HINT_RE = /\b(?:il|lo|la|che|non|per|con|una|sono|è|questo|questa|grazie|ciao)\b/i
const EN_HINT_RE = /\b(?:the|is|are|was|were|this|that|these|those|with|from|for|and|you|we|they|can|will|should|please|deprecated|hello|welcome)\b/i

function detectLatinLanguage(text: string): LanguageTag | "und" {
  const cleaned = text.replace(/\s+/g, " ").trim()
  if (!cleaned) return "und"

  // Heuristic hints are much more accurate than franc on short Latin strings (< 45 chars),
  // and prevent franc misclassifying short English/French/German into Scots/Latin/etc.
  const enScore = (cleaned.match(new RegExp(EN_HINT_RE.source, "gi")) ?? []).length
  const frScore = (cleaned.match(new RegExp(FR_HINT_RE.source, "gi")) ?? []).length
  const deScore = (cleaned.match(new RegExp(DE_HINT_RE.source, "gi")) ?? []).length
  const esScore = (cleaned.match(new RegExp(ES_HINT_RE.source, "gi")) ?? []).length
  const ptScore = (cleaned.match(new RegExp(PT_HINT_RE.source, "gi")) ?? []).length
  const itScore = (cleaned.match(new RegExp(IT_HINT_RE.source, "gi")) ?? []).length

  if (cleaned.length >= 25) {
    const francCode = franc(cleaned)
    if (francCode !== "und") {
      const resolved = resolveLanguage(francCode)
      if (resolved) {
        // Override common franc short-text quirks on major languages
        if (cleaned.length < 60 && resolved !== "en" && enScore >= 2 && frScore === 0 && deScore === 0 && esScore === 0) {
          return "en"
        }
        if ((resolved as string) === "gl" && cleaned.length < 140 && ptScore >= 1) {
          return "pt-BR"
        }
        return resolved
      }
    }
  }

  const scores: Array<[LanguageTag, number]> = [
    ["fr", frScore],
    ["de", deScore],
    ["es", esScore],
    ["pt-BR", ptScore],
    ["it", itScore],
    ["en", enScore],
  ]
  scores.sort((a, b) => b[1] - a[1])
  if (scores[0]![1] > 0) {
    return scores[0]![0]
  }

  // Conservative fallback: Latin natural-language prose whose exact language isn't certain
  return "und"
}

function detectNonLatinLanguage(
  text: string,
  fallbackTag: LanguageTag | "und",
): LanguageTag | "und" {
  const cleaned = text.replace(/\s+/g, " ").trim()
  if (cleaned.length >= 16) {
    const francCode = franc(cleaned)
    if (francCode !== "und") {
      const resolved = resolveLanguage(francCode)
      if (resolved && !isChineseTargetTag(resolved)) {
        return resolved
      }
    }
  }
  return fallbackTag
}

/**
 * Local zero-network classifier deciding whether a text block contains non-Chinese
 * natural language that should be translated to Simplified Chinese (or configured targetCode).
 */
export function classifyTextBlock(
  text: string,
  options: ClassifyBlockOptions = {},
): BlockClassificationResult {
  const targetCode = options.targetCode ?? "zh-Hans"
  const contextMode = options.contextMode ?? "standalone"
  const trimmed = text.trim()
  const scripts = analyzeScripts(trimmed)

  if (!trimmed || scripts.totalLetters === 0) {
    return {
      shouldTranslate: false,
      detectedLanguage: "und",
      reason: "empty_or_non_prose",
      confidence: 1,
      hasForeignNaturalClause: false,
      foreignProseWords: 0,
      scripts,
    }
  }

  // 1. Protect pure code, CLI commands, JSON configs, paths, URLs, pure identifiers
  if (isPureTechnicalOrCodeBlock(trimmed)) {
    return {
      shouldTranslate: false,
      detectedLanguage: "und",
      reason: "pure_code_or_tech",
      confidence: 0.95,
      hasForeignNaturalClause: false,
      foreignProseWords: 0,
      scripts,
    }
  }

  // 1b. Protect short non-sentence author / username / handle identifiers
  if (options.elementRole === "author" && trimmed.length <= 48) {
    const strippedForAuthor = stripTechnicalTokens(trimmed)
    const authorWords = (strippedForAuthor.match(LATIN_WORD_RE) ?? []).map(normalizeWord)
    const hasAuthorClause = authorWords.some((w) => STRONG_CLAUSE_MARKERS.has(w))
    const tokenCount = trimmed.split(/\s+/).filter(Boolean).length
    if (tokenCount <= 4 && !/[.?!。？！]/.test(trimmed) && !hasAuthorClause) {
      return {
        shouldTranslate: false,
        detectedLanguage: "und",
        reason: "author_or_username_protected",
        confidence: 0.94,
        hasForeignNaturalClause: false,
        foreignProseWords: 0,
        scripts,
      }
    }
  }

  // 2. Japanese detection (must precede Han/Chinese check so Kanji-heavy Japanese is never misread as Chinese!)
  if (hasSignificantJapaneseKana(trimmed, scripts)) {
    const isTargetJa = targetCode === "ja"
    return {
      shouldTranslate: !isTargetJa,
      detectedLanguage: "ja",
      reason: isTargetJa ? "already_target_language" : "japanese_kana",
      confidence: 0.98,
      hasForeignNaturalClause: true,
      foreignProseWords: Math.max(1, Math.round((scripts.hiragana + scripts.katakana + scripts.han) / 2)),
      scripts,
    }
  }

  // 3. Korean detection (Hangul)
  if (hasSignificantKoreanHangul(scripts)) {
    const isTargetKo = targetCode === "ko"
    return {
      shouldTranslate: !isTargetKo,
      detectedLanguage: "ko",
      reason: isTargetKo ? "already_target_language" : "korean_hangul",
      confidence: 0.98,
      hasForeignNaturalClause: true,
      foreignProseWords: Math.max(1, Math.round(scripts.hangul / 2)),
      scripts,
    }
  }

  // 4. Other non-Latin foreign scripts (Cyrillic/Russian, Arabic, Thai, Greek, Devanagari, Hebrew, etc.)
  const nonLatinForeign = getDominantNonLatinForeignScript(scripts)
  if (nonLatinForeign && nonLatinForeign.count >= Math.max(2, scripts.han)) {
    const detectedLanguage = detectNonLatinLanguage(trimmed, nonLatinForeign.fallbackTag)
    const sameAsTarget = detectedLanguage !== "und" && detectedLanguage === targetCode
    return {
      shouldTranslate: !sameAsTarget,
      detectedLanguage,
      reason: sameAsTarget ? "already_target_language" : "non_latin_foreign_script",
      confidence: 0.95,
      hasForeignNaturalClause: true,
      foreignProseWords: Math.max(1, Math.round(nonLatinForeign.count / 4)),
      scripts,
    }
  }

  const stripped = stripTechnicalTokens(trimmed)
  const strippedScripts = analyzeScripts(stripped)

  // 5. Text with Chinese Han characters (pure Chinese OR Han + Latin mixed)
  if (scripts.han > 0) {
    const mixedAnalysis = analyzeMixedLatinSegments(stripped)
    const isTargetZh = isChineseTargetTag(targetCode)

    // Case 5a: Foreign paragraph containing only a small Chinese parenthetical/term
    // e.g. "Read Frog (陪读蛙) is an open-source browser extension..."
    if (
      mixedAnalysis.maxSegmentProseWords >= 5 &&
      (mixedAnalysis.hasForeignClause || strippedScripts.latin > strippedScripts.han * 1.8)
    ) {
      const detectedLanguage = detectLatinLanguage(stripped)
      return {
        shouldTranslate: true,
        detectedLanguage,
        reason: "foreign_latin_prose",
        confidence: 0.92,
        hasForeignNaturalClause: true,
        foreignProseWords: mixedAnalysis.totalLatinWords,
        scripts,
      }
    }

    // Case 5b: Chinese + genuine foreign natural-language clause
    // e.g. "This API is deprecated，请尽快迁移。"
    if (mixedAnalysis.hasForeignClause) {
      const latinOnly = (stripped.match(LATIN_WORD_RE) ?? []).join(" ")
      const detectedLanguage = detectLatinLanguage(latinOnly)
      return {
        shouldTranslate: true,
        detectedLanguage: detectedLanguage === "und" ? "mixed" : detectedLanguage,
        reason: "mixed_with_foreign_clause",
        confidence: 0.9,
        hasForeignNaturalClause: true,
        foreignProseWords: mixedAnalysis.totalLatinWords,
        scripts,
      }
    }

    // Case 5c: Pure Chinese or Chinese with embedded technical terms / brand names
    return {
      shouldTranslate: false,
      detectedLanguage: isTargetZh ? targetCode : "zh-Hans",
      reason: scripts.latin > 0 ? "chinese_with_tech_terms" : "target_chinese",
      confidence: 0.96,
      hasForeignNaturalClause: false,
      foreignProseWords: 0,
      scripts,
    }
  }

  // 6. Pure Latin (no Han, no Kana, no Hangul, no Cyrillic/Arabic)
  const latinWords = stripped.match(LATIN_WORD_RE) ?? []
  const vowelWords = latinWords.filter((w) => w.length >= 2 && VOWEL_RE.test(w))
  const lowerLatinWords = latinWords.map(normalizeWord)
  const nonTechLatinWords = lowerLatinWords.filter((w) => !TECH_TERM_WORDS.has(w))
  const hasClauseMarker = lowerLatinWords.some((w) => STRONG_CLAUSE_MARKERS.has(w))
  const hasFunctionWord = lowerLatinWords.some((w) => GENERAL_FUNCTION_WORDS.has(w))
  const hasSentencePunctuation = /[.!?。！？]/.test(trimmed)

  // Conservative checks to avoid translating stray single tech tags / gibberish / UI badges on Chinese sites
  if (latinWords.length === 0 || vowelWords.length === 0) {
    return {
      shouldTranslate: false,
      detectedLanguage: "und",
      reason: "pure_code_or_tech",
      confidence: 0.9,
      hasForeignNaturalClause: false,
      foreignProseWords: 0,
      scripts,
    }
  }

  if (contextMode === "partial-auto") {
    // On a Chinese-dominant page, adapt strictness to element semantics: headings, comments,
    // categories, and natural exclamations translate reliably while stray UI/tech badges stay skipped.
    const elementRole = options.elementRole ?? "generic"
    const hasExclamationOrQuestion = /[!?！？]/.test(trimmed)
    let isPartialTranslatable: boolean

    if (elementRole === "heading") {
      isPartialTranslatable =
        (latinWords.length >= 2 && vowelWords.length >= 1 && nonTechLatinWords.length >= 1) ||
        (latinWords.length === 1 &&
          nonTechLatinWords.length === 1 &&
          vowelWords.length === 1 &&
          latinWords[0].length >= 4)
    } else if (elementRole === "comment" || elementRole === "category") {
      isPartialTranslatable =
        latinWords.length >= 1 &&
        vowelWords.length >= 1 &&
        nonTechLatinWords.length >= 1 &&
        (latinWords.length >= 2 || (latinWords[0]?.length ?? 0) >= 3)
    } else if (elementRole === "control") {
      isPartialTranslatable =
        latinWords.length >= 1 &&
        vowelWords.length >= 1 &&
        nonTechLatinWords.length >= 1 &&
        (latinWords.length >= 2 || (latinWords[0]?.length ?? 0) >= 4)
    } else {
      isPartialTranslatable =
        (latinWords.length >= 4 && vowelWords.length >= 3 && nonTechLatinWords.length >= 2) ||
        (latinWords.length >= 3 && hasClauseMarker && nonTechLatinWords.length >= 1) ||
        (latinWords.length >= 2 && hasClauseMarker && hasSentencePunctuation) ||
        (hasExclamationOrQuestion &&
          nonTechLatinWords.some((w) => w.length >= 3) &&
          vowelWords.length >= 1)
    }

    if (!isPartialTranslatable) {
      return {
        shouldTranslate: false,
        detectedLanguage: "und",
        reason: "ambiguous_conservative_skip",
        confidence: 0.85,
        hasForeignNaturalClause: false,
        foreignProseWords: latinWords.length,
        scripts,
      }
    }
  } else if (contextMode === "standalone") {
    // Standalone / foreign-page fallback mode: pure code/acronyms/tech identifiers were already
    // stripped above, so translate real natural-language phrases and standalone words (>= 4 chars,
    // not technical vocabulary) while staying conservative on tiny 1-2 char UI noise.
    const looksLikeStandaloneProse =
      latinWords.length >= 3 ||
      (latinWords.length === 2 &&
        vowelWords.length >= 2 &&
        (hasFunctionWord || hasSentencePunctuation || nonTechLatinWords.length >= 2)) ||
      (latinWords.length === 1 &&
        nonTechLatinWords.length === 1 &&
        vowelWords.length === 1 &&
        latinWords[0].length >= 4)

    if (!looksLikeStandaloneProse) {
      return {
        shouldTranslate: false,
        detectedLanguage: "und",
        reason: "ambiguous_conservative_skip",
        confidence: 0.8,
        hasForeignNaturalClause: false,
        foreignProseWords: latinWords.length,
        scripts,
      }
    }
  } else {
    // full-auto mode (page already confirmed foreign): translate 2+ words or meaningful natural headings (>= 3 chars)
    const looksLikeForeignNode =
      latinWords.length >= 2 ||
      (latinWords.length === 1 &&
        nonTechLatinWords.length === 1 &&
        latinWords[0].length >= 3 &&
        vowelWords.length === 1)

    if (!looksLikeForeignNode) {
      return {
        shouldTranslate: false,
        detectedLanguage: "und",
        reason: "ambiguous_conservative_skip",
        confidence: 0.8,
        hasForeignNaturalClause: false,
        foreignProseWords: latinWords.length,
        scripts,
      }
    }
  }

  const detectedLanguage = detectLatinLanguage(stripped)
  const sameAsTarget = detectedLanguage !== "und" && detectedLanguage === targetCode

  return {
    shouldTranslate: !sameAsTarget,
    detectedLanguage,
    reason: sameAsTarget ? "already_target_language" : "foreign_latin_prose",
    confidence: detectedLanguage === "und" ? 0.72 : 0.9,
    hasForeignNaturalClause: true,
    foreignProseWords: latinWords.length,
    scripts,
  }
}
