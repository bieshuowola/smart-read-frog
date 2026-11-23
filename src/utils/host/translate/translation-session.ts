/**
 * Identity of the current page-translation session in this frame. Module
 * scope is correct: exactly one PageTranslationManager exists per frame.
 *
 * Every page-translation request carries this id so the background can drain
 * the session's queued/in-flight requests when the user cancels (#1881). A
 * fresh id per session means cancelling an old wave can never affect a
 * restarted session's requests.
 *
 * The id is a correlation key, not cryptographic material — it deliberately
 * avoids getRandomUUID so sessions never consume from the same source as walk
 * ids. The random component keeps ids unique across frames of the same tab
 * (the background scopes by tab id + session id only).
 */
import type { HostedAiReasoning } from "@/utils/hosted-ai/types"
import type { SerializableProviderRef } from "@/utils/providers/provider-ref"

let currentPageTranslationSessionId: string | null = null
let sessionCounter = 0

/**
 * Provider ref resolved once by start()'s availability gate and reused for
 * every request of the session: per-paragraph serialization must not re-read
 * hosted status mid-page (a status blip would fail in-flight paragraphs, and
 * the model revision used for cache identity must stay stable per session).
 */
let currentSessionProviderRef: SerializableProviderRef | null = null
/**
 * The reasoning choice stored for the model when that ref was made. The
 * reasoning level is a user setting, not status, so it must not stay frozen:
 * a paragraph whose stored choice differs makes a new ref. The ref can't be
 * compared directly, because its level already falls back to the model's
 * default when the choice is unset or not one the model offers.
 */
let currentSessionReasoningChoice: HostedAiReasoning | undefined

// Viewport-first scheduling priorities keyed by intersected root element.
let priorityScheduleMap = new WeakMap<Element, number>()

export function setElementPriorityScheduleAt(element: Element, scheduleAt: number): void {
  priorityScheduleMap.set(element, scheduleAt)
}

export function getPriorityScheduleAtForNodes(nodes: readonly Node[]): number | undefined {
  for (const node of nodes) {
    let cur: Node | null = node
    let hops = 0
    while (cur && hops < 16) {
      if (cur instanceof Element) {
        const score = priorityScheduleMap.get(cur)
        if (score !== undefined) return score
      }
      cur = cur.parentNode
      hops++
    }
  }
  return undefined
}

// Per-session failure tracking for centralized popup diagnostics & targeted retry.
const failedTranslationTargets = new Map<Node, { nodes: ChildNode[]; errorMessage: string; timestamp: number }>()
let lastSessionFailureMessage: string | null = null
let inFlightTranslationCount = 0

function formatFailureMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name
  return typeof error === "string" ? error : "Translation failed"
}

export function incrementInFlightPageTranslation(): void {
  inFlightTranslationCount += 1
}

export function decrementInFlightPageTranslation(): void {
  inFlightTranslationCount = Math.max(0, inFlightTranslationCount - 1)
}

export function getInFlightPageTranslationCount(): number {
  return inFlightTranslationCount
}

export function reportPageTranslationNodeFailed(nodes: readonly ChildNode[], error: unknown): void {
  const connected = nodes.filter((n) => n.isConnected)
  if (connected.length === 0) return
  const key = connected[0]!
  const errorMessage = formatFailureMessage(error)
  lastSessionFailureMessage = errorMessage
  failedTranslationTargets.set(key, {
    nodes: connected,
    errorMessage,
    timestamp: Date.now(),
  })
}

export function clearPageTranslationNodeFailed(nodes: readonly ChildNode[]): void {
  for (const node of nodes) {
    failedTranslationTargets.delete(node)
  }
  // If all failed targets were cleared, reset the last failure banner message too.
  pruneDisconnectedFailedTargets()
  if (failedTranslationTargets.size === 0) {
    lastSessionFailureMessage = null
  }
}

function pruneDisconnectedFailedTargets(): void {
  for (const [key, entry] of failedTranslationTargets) {
    if (!key.isConnected || entry.nodes.every((n) => !n.isConnected)) {
      failedTranslationTargets.delete(key)
    }
  }
}

export function takeFailedTranslationRuns(): ChildNode[][] {
  pruneDisconnectedFailedTargets()
  const runs = [...failedTranslationTargets.values()].map((entry) =>
    entry.nodes.filter((n) => n.isConnected),
  )
  failedTranslationTargets.clear()
  lastSessionFailureMessage = null
  return runs.filter((run) => run.length > 0)
}

export function getPageTranslationFailureSummary(): {
  failedCount: number
  inFlightCount: number
  lastErrorMessage: string | null
} {
  pruneDisconnectedFailedTargets()
  return {
    failedCount: failedTranslationTargets.size,
    inFlightCount: inFlightTranslationCount,
    lastErrorMessage: failedTranslationTargets.size > 0 ? lastSessionFailureMessage : null,
  }
}

export function beginPageTranslationSession(): string {
  sessionCounter += 1
  currentSessionProviderRef = null
  currentSessionReasoningChoice = undefined
  priorityScheduleMap = new WeakMap()
  failedTranslationTargets.clear()
  lastSessionFailureMessage = null
  inFlightTranslationCount = 0
  currentPageTranslationSessionId = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}-${sessionCounter}`
  return currentPageTranslationSessionId
}

export function endPageTranslationSession(): string | null {
  const endedSessionId = currentPageTranslationSessionId
  currentPageTranslationSessionId = null
  currentSessionProviderRef = null
  currentSessionReasoningChoice = undefined
  priorityScheduleMap = new WeakMap()
  failedTranslationTargets.clear()
  lastSessionFailureMessage = null
  inFlightTranslationCount = 0
  return endedSessionId
}

export function getPageTranslationSessionId(): string | null {
  return currentPageTranslationSessionId
}

/**
 * `reasoningChoice` must be read before the ref was made, never after. Then a
 * change made while the ref was being made is newer than the recorded choice,
 * and the next paragraph makes a ref again instead of keeping the old level.
 */
export function setPageTranslationSessionProviderRef(
  providerRef: SerializableProviderRef,
  reasoningChoice: HostedAiReasoning | undefined,
): void {
  currentSessionProviderRef = providerRef
  currentSessionReasoningChoice = reasoningChoice
}

export function getPageTranslationSessionProviderRef(): {
  providerRef: SerializableProviderRef
  reasoningChoice: HostedAiReasoning | undefined
} | null {
  return currentSessionProviderRef
    ? { providerRef: currentSessionProviderRef, reasoningChoice: currentSessionReasoningChoice }
    : null
}

const requestFailureListeners = new Set<(error: unknown) => void>()

/**
 * Called with each error a paragraph's translation shows in place of its text. The
 * paragraph handles the error on its own; this lets the session respond to the page as a
 * whole, such as asking once to upgrade when the pool runs dry, instead of leaving a page
 * of identical inline errors. Returns the unsubscribe.
 */
export function onPageTranslationRequestFailed(listener: (error: unknown) => void): () => void {
  requestFailureListeners.add(listener)
  return () => {
    requestFailureListeners.delete(listener)
  }
}

export function reportPageTranslationRequestFailed(error: unknown): void {
  requestFailureListeners.forEach((listener) => listener(error))
}

/** Failures a page-translation session has answered for; see `claimPageTranslationRequestFailure`. */
const claimedRequestFailures = new WeakSet<object>()

/**
 * Marks a reported failure as one the page-translation session answers for, as with the
 * one upgrade prompt it shows when Built-in AI's pool runs dry. Hover translation shares
 * the session's reports and stays quiet about a failure the session claimed.
 */
export function claimPageTranslationRequestFailure(error: unknown): void {
  if (typeof error === "object" && error !== null) {
    claimedRequestFailures.add(error)
  }
}

export function isPageTranslationRequestFailureClaimed(error: unknown): boolean {
  return typeof error === "object" && error !== null && claimedRequestFailures.has(error)
}
