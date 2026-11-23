import type { LanguageTag } from "@read-frog/definitions"
import type { ScriptCounts } from "./types"

const HAN_RE = /\p{Script=Han}/gu
const HIRAGANA_RE = /\p{Script=Hiragana}/gu
const KATAKANA_RE = /[\p{Script=Katakana}\u30FC]/gu
const HANGUL_RE = /\p{Script=Hangul}/gu
const LATIN_RE = /\p{Script=Latin}/gu
const CYRILLIC_RE = /\p{Script=Cyrillic}/gu
const ARABIC_RE = /\p{Script=Arabic}/gu
const GREEK_RE = /\p{Script=Greek}/gu
const THAI_RE = /\p{Script=Thai}/gu
const DEVANAGARI_RE = /\p{Script=Devanagari}/gu
const HEBREW_RE = /\p{Script=Hebrew}/gu
const ALL_LETTERS_RE = /\p{L}/gu
const DIGITS_RE = /\p{Nd}/gu

// Simplified-only or high-frequency Chinese-exclusive functional characters
// used only as a guard against a stray single katakana/hiragana typo like "の"
// inside an otherwise long Chinese sentence.
const CHINESE_EXCLUSIVE_HINT_RE = /[这们为国发师说时请问题过对么个没还]/u

function countMatches(text: string, re: RegExp): number {
  const matches = text.match(re)
  return matches ? matches.length : 0
}

export function analyzeScripts(text: string): ScriptCounts {
  const han = countMatches(text, HAN_RE)
  const hiragana = countMatches(text, HIRAGANA_RE)
  const katakana = countMatches(text, KATAKANA_RE)
  const hangul = countMatches(text, HANGUL_RE)
  const latin = countMatches(text, LATIN_RE)
  const cyrillic = countMatches(text, CYRILLIC_RE)
  const arabic = countMatches(text, ARABIC_RE)
  const greek = countMatches(text, GREEK_RE)
  const thai = countMatches(text, THAI_RE)
  const devanagari = countMatches(text, DEVANAGARI_RE)
  const hebrew = countMatches(text, HEBREW_RE)
  const totalLetters = countMatches(text, ALL_LETTERS_RE)
  const digits = countMatches(text, DIGITS_RE)

  const known =
    han +
    hiragana +
    katakana +
    hangul +
    latin +
    cyrillic +
    arabic +
    greek +
    thai +
    devanagari +
    hebrew

  const otherLetters = Math.max(0, totalLetters - known)

  return {
    han,
    hiragana,
    katakana,
    hangul,
    latin,
    cyrillic,
    arabic,
    greek,
    thai,
    devanagari,
    hebrew,
    otherLetters,
    digits,
    totalLetters,
  }
}

export function hasSignificantJapaneseKana(text: string, scripts: ScriptCounts): boolean {
  const kanaCount = scripts.hiragana + scripts.katakana
  if (kanaCount === 0) return false
  if (kanaCount >= 2) return true
  // Single kana character (e.g. "家で" vs "我喜欢的の奶茶")
  if (scripts.han > 4 && CHINESE_EXCLUSIVE_HINT_RE.test(text)) {
    return false
  }
  return scripts.hiragana >= 1 || (scripts.katakana >= 1 && scripts.han <= 6)
}

export function hasSignificantKoreanHangul(scripts: ScriptCounts): boolean {
  if (scripts.hangul >= 2) return true
  return scripts.hangul === 1 && scripts.han <= 4 && scripts.latin <= 10
}

export type NonLatinForeignScript =
  | "cyrillic"
  | "arabic"
  | "greek"
  | "thai"
  | "devanagari"
  | "hebrew"
  | "other"

export function getDominantNonLatinForeignScript(
  scripts: ScriptCounts,
): { script: NonLatinForeignScript; count: number; fallbackTag: LanguageTag | "und" } | null {
  const candidates: Array<{
    script: NonLatinForeignScript
    count: number
    fallbackTag: LanguageTag | "und"
  }> = [
    { script: "cyrillic", count: scripts.cyrillic, fallbackTag: "ru" },
    { script: "arabic", count: scripts.arabic, fallbackTag: "ar" },
    { script: "thai", count: scripts.thai, fallbackTag: "th" },
    { script: "greek", count: scripts.greek, fallbackTag: "el" },
    { script: "devanagari", count: scripts.devanagari, fallbackTag: "hi" },
    { script: "hebrew", count: scripts.hebrew, fallbackTag: "he" },
    { script: "other", count: scripts.otherLetters, fallbackTag: "und" },
  ]

  let best: (typeof candidates)[number] | null = null
  for (const item of candidates) {
    if (item.count >= 2 && (!best || item.count > best.count)) {
      best = item
    }
  }
  return best
}

export function isChineseTargetTag(tag: LanguageTag): boolean {
  return tag === "zh-Hans" || tag === "zh-Hant" || tag === "yue"
}
