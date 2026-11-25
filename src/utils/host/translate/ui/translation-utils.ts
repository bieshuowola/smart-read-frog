import type { Config } from "@/types/config/config"
import type { TransNode } from "@/types/dom"
import { getEffectiveTagSet, isHTMLElement } from "../../dom/filter"

// Pattern matches numbers with optional thousand separators and decimal points
// Examples: "123", "1,234", "1,234.56", "1 234", "1.234,56" (European format)
const NUMERIC_PATTERN = /^[\d\s,.-]+$/
const CONTAINS_DIGIT_RE = /\d/
const LINE_BREAK_PATTERN = /[\r\n]/
const SHORT_INLINE_MAX_CHARACTERS = 24
const SHORT_INLINE_MAX_WORDS = 4
const COMPACT_UI_MAX_CHARACTERS = 44

const COMPACT_ROLE_SET = new Set([
  "button",
  "tab",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "switch",
])

const TITLE_OR_HEADING_TOKEN_SET = new Set(["title", "heading", "headline", "subject"])

function hasTitleOrHeadingToken(el: HTMLElement): boolean {
  const role = el.getAttribute("role")?.toLowerCase()
  if (role === "heading") return true
  const raw = `${typeof el.className === "string" ? el.className : ""} ${el.id || ""}`
  if (!raw.trim()) return false
  const tokens = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
  return tokens.some((token) => TITLE_OR_HEADING_TOKEN_SET.has(token))
}

function hasHeadingOrTitleAncestor(el: HTMLElement): boolean {
  let current: HTMLElement | null = el
  for (let depth = 0; current && depth < 4; depth++) {
    if (hasTitleOrHeadingToken(current)) return true
    current = current.parentElement
  }
  return false
}

const COMPACT_INTERACTIVE_TAG_SET = new Set(["BUTTON", "OPTION", "SUMMARY"])
const COMPACT_NAV_ANCESTOR_SELECTOR =
  'nav, header, menu, [role="navigation"], [role="menubar"], [role="tablist"], [role="menu"], [role="toolbar"]'
const NARROW_OR_CARD_ANCESTOR_SELECTOR =
  'aside, td, th, [role="gridcell"], [role="columnheader"], [role="rowheader"]'

// Helper function to check if content is purely numeric
export function isNumericContent(text: string): boolean {
  const cleanedText = text.trim()
  if (!cleanedText) return false

  if (!NUMERIC_PATTERN.test(cleanedText)) return false

  return CONTAINS_DIGIT_RE.test(cleanedText)
}

export function isShortInlineTranslationText(text: string): boolean {
  if (LINE_BREAK_PATTERN.test(text)) return false

  const cleanedText = text.trim()
  if (!cleanedText) return false

  const wordCount = cleanedText.split(/\s+/u).length
  return cleanedText.length <= SHORT_INLINE_MAX_CHARACTERS && wordCount <= SHORT_INLINE_MAX_WORDS
}

export function isForceInlineTranslation(
  targetNode: TransNode,
  display?: string,
  config?: Config,
): boolean {
  if (isHTMLElement(targetNode)) {
    return (
      getEffectiveTagSet(config, "forceInlineTranslationTags").has(targetNode.tagName) ||
      (display ?? window.getComputedStyle(targetNode).display).includes("flex")
    )
  }
  return false
}

/**
 * Detect whether a translation run represents a compact interactive UI element
 * (buttons, tabs, navigation links, menu items, badges, single-line clipped controls)
 * that should be translated cleanly in-place even in bilingual mode so second lines
 * do not break fixed heights, toolbars, or icon alignments.
 */
export function findCompactInteractiveHost(
  nodes: readonly TransNode[],
  sourceText: string,
): HTMLElement | null {
  const trimmed = sourceText.trim()
  if (!trimmed || LINE_BREAK_PATTERN.test(trimmed) || trimmed.length > COMPACT_UI_MAX_CHARACTERS) {
    return null
  }

  const first = nodes[0]
  if (!first) return null

  const candidate = isHTMLElement(first) ? first : first.parentElement
  if (!candidate) return null

  // Never turn full prose blocks / headings / titles / labels / content regions into in-place swaps
  // unless directly inside an explicit compact interactive trigger (button, tab, menuitem).
  const insideExplicitCompactTrigger = Boolean(
    candidate.closest('button, [role="button"], [role="tab"], [role="menuitem"]'),
  )
  if (!insideExplicitCompactTrigger) {
    if (
      nodes.length === 1 &&
      isHTMLElement(first) &&
      /^(P|H1|H2|H3|H4|H5|H6|BLOCKQUOTE|ARTICLE|SECTION|ASIDE|MAIN|LABEL)$/.test(first.tagName)
    ) {
      return null
    }
    if (
      candidate.closest(
        'h1, h2, h3, h4, h5, h6, p, blockquote, article, aside, main, label, [role="heading"]',
      ) ||
      hasHeadingOrTitleAncestor(candidate)
    ) {
      return null
    }
  }

  // 1. Explicit interactive button / tab / menuitem / option / summary host
  const explicitControl = candidate.closest<HTMLElement>(
    'button, option, summary, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="switch"]',
  )
  if (explicitControl && explicitControl.textContent?.trim().length <= COMPACT_UI_MAX_CHARACTERS + 16) {
    return explicitControl
  }

  if (COMPACT_INTERACTIVE_TAG_SET.has(candidate.tagName)) {
    return candidate
  }

  const role = candidate.getAttribute("role")?.toLowerCase()
  if (role && COMPACT_ROLE_SET.has(role)) {
    return candidate
  }

  // 2. Short links/items inside navigation bars, headers, toolbars, or tablists (outside main/article/aside content)
  if (
    (candidate.tagName === "A" || candidate.tagName === "SPAN" || candidate.tagName === "LI") &&
    candidate.closest(COMPACT_NAV_ANCESTOR_SELECTOR) &&
    !candidate.closest("main, article, aside") &&
    trimmed.length <= 36
  ) {
    return candidate
  }

  return null
}

/**
 * Whether a block translation sits inside a narrow/structured region (sidebar, table cell,
 * card/compact column) where full-width block flow prevents inline-block overflow or stranding.
 */
export function isCompactBlockLayoutContext(layoutSource: TransNode): boolean {
  const el = isHTMLElement(layoutSource) ? layoutSource : layoutSource.parentElement
  if (!el) return false
  if (el.closest(NARROW_OR_CARD_ANCESTOR_SELECTOR)) return true

  // Avoid extra layout query unless the element is an HTMLElement inside a likely column/card
  const rect = el.getBoundingClientRect?.()
  if (rect && rect.width > 0 && rect.width < 340) {
    return true
  }
  return false
}
