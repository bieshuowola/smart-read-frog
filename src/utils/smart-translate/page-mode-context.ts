import type { BlockContextMode } from "./block-classifier"
import type { PageAutoDecision } from "./types"

interface DocumentDecisionContext {
  url: string
  decision: PageAutoDecision
}

let currentDocumentDecision: DocumentDecisionContext | null = null

export function setCurrentPageSmartDecision(url: string, decision: PageAutoDecision): void {
  currentDocumentDecision = { url, decision }
}

export function getCurrentPageSmartDecision(url?: string): PageAutoDecision | null {
  if (!currentDocumentDecision) return null
  if (url && currentDocumentDecision.url !== url) return null
  return currentDocumentDecision.decision
}

export function clearCurrentPageSmartDecision(): void {
  currentDocumentDecision = null
}

/**
 * Resolve block classification strictness for the current document:
 * - "partial-auto" for Chinese-dominant pages with isolated foreign blocks (strict on stray UI tags)
 * - "full-auto" for foreign-dominant pages (translates headings and short foreign prose)
 * - "standalone" otherwise
 */
export function getCurrentBlockContextMode(url?: string): BlockContextMode {
  const decision = getCurrentPageSmartDecision(url)
  if (!decision) return "standalone"
  if (decision.mode === "partial-auto") return "partial-auto"
  if (decision.mode === "full-auto") return "full-auto"
  return "standalone"
}
