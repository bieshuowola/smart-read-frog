import type { TransNode } from "@/types/dom"
import { isHTMLElement } from "@/utils/host/dom/filter"

export type BlockElementRole = "heading" | "comment" | "category" | "author" | "control" | "generic"

const PROFILE_HREF_RE = /(?:^|\/)(?:profiles|id|users?|u|members?|authors?)\/[^/?#]+/i

const AUTHOR_TOKENS = new Set([
  "author",
  "authors",
  "username",
  "user",
  "nickname",
  "nick",
  "screenname",
  "byline",
  "creator",
  "uploader",
  "handle",
])
const AUTHOR_COMPOUND_NEGATIVE = new Set(["comment", "content", "bio", "description", "about", "date", "time", "badge", "title"])
const COMMENT_TOKENS = new Set(["comment", "comments", "commenttext", "review", "reply", "replies", "postcontent", "forum"])
const HEADING_TOKENS = new Set(["title", "heading", "headline", "subject"])
const CATEGORY_TOKENS = new Set(["tag", "tags", "category", "categories", "filter", "facet", "taxonomy", "sidebar", "option"])

function tokenizeIdentity(el: Element): string[] {
  const cls = typeof (el as HTMLElement).className === "string" ? (el as HTMLElement).className : ""
  const id = el.id || ""
  const raw = `${cls} ${id}`.trim()
  if (!raw) return []
  return raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function isProfileOverlayAnchor(anchor: Element): boolean {
  if (anchor.tagName !== "A") return false
  const href = anchor.getAttribute("href") ?? ""
  if (!PROFILE_HREF_RE.test(href)) return false
  return (anchor.textContent ?? "").trim().length === 0
}

function isStandaloneProfileLinkElement(el: Element): boolean {
  if (el.tagName === "A") {
    const href = el.getAttribute("href") ?? ""
    return PROFILE_HREF_RE.test(href) && (el.textContent ?? "").trim().length > 0
  }
  const ownText = (el.textContent ?? "").replace(/\s+/g, " ").trim()
  if (!ownText) return false
  const anchors = [...el.querySelectorAll("a[href]")]
  if (anchors.length !== 1) return false
  const a = anchors[0]!
  const href = a.getAttribute("href") ?? ""
  if (!PROFILE_HREF_RE.test(href)) return false
  const anchorText = (a.textContent ?? "").replace(/\s+/g, " ").trim()
  return anchorText.length > 0 && anchorText.length >= ownText.length * 0.6
}

function hasAuthorTokens(tokens: readonly string[]): boolean {
  if (tokens.some((t) => AUTHOR_COMPOUND_NEGATIVE.has(t))) return false
  if (
    tokens.some(
      (t) =>
        t === "author" ||
        t === "username" ||
        t === "nickname" ||
        t === "byline" ||
        t === "uploader" ||
        t === "screenname" ||
        t === "poster" ||
        t === "commenter" ||
        t === "reviewer",
    )
  ) {
    return true
  }
  if (
    tokens.includes("op") &&
    (tokens.includes("forum") ||
      tokens.includes("topic") ||
      tokens.includes("thread") ||
      tokens.includes("post") ||
      tokens.includes("author"))
  ) {
    return true
  }
  if (tokens.includes("creator") && (tokens.includes("name") || tokens.includes("friend") || tokens.includes("block"))) {
    return true
  }
  if (tokens.includes("user") && (tokens.includes("name") || tokens.includes("id") || tokens.includes("handle"))) {
    return true
  }
  return false
}

function isExplicitAuthorElement(el: Element): boolean {
  if (el.getAttribute("rel")?.toLowerCase().split(/\s+/).includes("author")) return true
  if (el.getAttribute("itemprop")?.toLowerCase() === "author") return true
  if (el.hasAttribute("data-author") || el.hasAttribute("data-username") || el.hasAttribute("data-user-id")) {
    return true
  }
  if (isStandaloneProfileLinkElement(el)) return true

  let cur: Element | null = el
  for (let depth = 0; cur && depth < 2; depth++) {
    if (cur.tagName === "BODY" || cur.tagName === "MAIN" || cur.tagName === "ARTICLE") break
    if (cur !== el && (cur.hasAttribute("data-author") || cur.getAttribute("itemprop") === "author")) {
      return true
    }
    const tokens = tokenizeIdentity(cur)
    if (hasAuthorTokens(tokens)) return true
    if (
      depth === 1 &&
      [...cur.children].some((child) => child !== el && isProfileOverlayAnchor(child))
    ) {
      return true
    }
    cur = cur.parentElement
  }

  return false
}

function unwrapSingleElementChild(el: Element): Element {
  let current = el
  for (let depth = 0; depth < 6; depth++) {
    if (current.children.length !== 1) break
    const hasOwnText = [...current.childNodes].some(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
    )
    if (hasOwnText) break
    current = current.children[0]!
  }
  return current
}

/**
 * Infer a generic, zero-reflow semantic role from the DOM context around `nodes`.
 * Used strictly as a hint alongside script/prose classification — never encodes
 * domain-specific selectors or site allowlists.
 */
export function inferElementBlockRole(nodes?: readonly TransNode[]): BlockElementRole {
  if (!nodes || nodes.length === 0) return "generic"

  const elements: Element[] = []
  for (const node of nodes) {
    const rawEl = isHTMLElement(node) ? node : node.parentElement
    if (!rawEl) continue
    const el = unwrapSingleElementChild(rawEl)
    if (!elements.includes(el)) elements.push(el)
  }
  if (elements.length === 0) return "generic"

  const primary = elements[0]!
  if (primary.closest("code, pre, kbd, samp")) return "generic"

  // 1. Author / username identifiers take precedence even inside comment/card wrappers
  if (elements.some((el) => isExplicitAuthorElement(el))) {
    return "author"
  }

  // 2. Comment / review / forum reply bodies
  let cur: Element | null = primary
  for (let depth = 0; cur && depth < 3; depth++) {
    if (cur.tagName === "BODY" || cur.tagName === "MAIN") break
    if (cur.getAttribute("role")?.toLowerCase() === "comment" || cur.tagName === "BLOCKQUOTE") {
      return "comment"
    }
    const tokens = tokenizeIdentity(cur)
    if (
      tokens.some((t) => COMMENT_TOKENS.has(t)) &&
      !tokens.some((t) => AUTHOR_TOKENS.has(t))
    ) {
      return "comment"
    }
    cur = cur.parentElement
  }

  // 3. Headings / card & item titles (exclude site header/nav chrome)
  if (!primary.closest("nav, header, footer")) {
    cur = primary
    for (let depth = 0; cur && depth < 3; depth++) {
      if (cur.tagName === "BODY" || cur.tagName === "MAIN" || cur.tagName === "ARTICLE") break
      if (/^H[1-6]$/.test(cur.tagName) || cur.getAttribute("role")?.toLowerCase() === "heading") {
        return "heading"
      }
      const tokens = tokenizeIdentity(cur)
      if (tokens.some((t) => HEADING_TOKENS.has(t))) {
        return "heading"
      }
      cur = cur.parentElement
    }
  }

  // 4. Categories / sidebar filters / checkboxes / facet tags
  if (
    primary.tagName === "LABEL" ||
    primary.closest('label, [role="option"], [role="checkbox"], [role="treeitem"]')
  ) {
    return "category"
  }
  cur = primary
  for (let depth = 0; cur && depth < 3; depth++) {
    if (cur.tagName === "BODY" || cur.tagName === "MAIN" || cur.tagName === "ARTICLE") break
    const tokens = tokenizeIdentity(cur)
    if (
      tokens.some((t) => CATEGORY_TOKENS.has(t)) ||
      (tokens.includes("browse") && (tokens.includes("option") || tokens.includes("options")))
    ) {
      return "category"
    }
    cur = cur.parentElement
  }

  // 5. Explicit interactive buttons (e.g. Subscribe / Reply / Load more)
  if (
    primary.tagName === "BUTTON" ||
    primary.getAttribute("role")?.toLowerCase() === "button" ||
    !!primary.closest('button, [role="button"]')
  ) {
    return "control"
  }

  return "generic"
}
