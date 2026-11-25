import type { LanguageTag } from "@read-frog/definitions"

export interface ScriptCounts {
  han: number
  hiragana: number
  katakana: number
  hangul: number
  latin: number
  cyrillic: number
  arabic: number
  greek: number
  thai: number
  devanagari: number
  hebrew: number
  otherLetters: number
  digits: number
  totalLetters: number
}

export type BlockClassificationReason =
  | "empty_or_non_prose"
  | "pure_code_or_tech"
  | "target_chinese"
  | "chinese_with_tech_terms"
  | "japanese_kana"
  | "korean_hangul"
  | "non_latin_foreign_script"
  | "foreign_latin_prose"
  | "mixed_with_foreign_clause"
  | "already_target_language"
  | "ambiguous_conservative_skip"
  | "author_or_username_protected"

export interface BlockClassificationResult {
  shouldTranslate: boolean
  detectedLanguage: LanguageTag | "mixed" | "und"
  reason: BlockClassificationReason
  confidence: number
  hasForeignNaturalClause: boolean
  foreignProseWords: number
  scripts: ScriptCounts
}

export type PageAutoDecisionMode = "full-auto" | "partial-auto" | "skip" | "privacy-blocked"

export type PageDecisionReason =
  | "disabled"
  | "never_translate_pattern"
  | "always_translate_pattern"
  | "privacy_sensitive_page"
  | "insufficient_readable_content"
  | "chinese_dominant_clean"
  | "chinese_with_foreign_blocks"
  | "foreign_dominant_page"
  | "multilingual_foreign_page"
  | "user_suppressed"

export interface PageAutoDecision {
  mode: PageAutoDecisionMode
  shouldAutoTranslate: boolean
  detectedLanguage: LanguageTag | "und"
  reason: PageDecisionReason
  privacyReason?: string
  totalBlocks: number
  foreignBlocks: number
  chineseBlocks: number
  technicalBlocks: number
  foreignLanguages: LanguageTag[]
}

export interface TabSmartDecisionState extends PageAutoDecision {
  url: string
  updatedAt: number
  userSuppressed?: boolean
}
