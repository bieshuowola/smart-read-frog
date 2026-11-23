import type { Config } from "@/types/config/config"
import type { LLMProviderConfig, ProviderConfig } from "@/types/config/provider"
import type { PromptResolver } from "@/utils/host/translate/api/ai"
import { isLLMProviderConfig } from "@/types/config/provider"
import { executeTranslate } from "@/utils/host/translate/execute-translate"
import { createLogger } from "@/utils/logging/logger"
import { resolveModelId } from "@/utils/providers/model-id"
import { attachRequestErrorMeta, getRequestErrorMeta } from "@/utils/request/retry-policy"

const log = createLogger("smart-translate/ai-failover")

export type ProviderBillingTier = "free-tier" | "local-free" | "paid-or-unknown"

// Verified standing zero-cost cloud models (no credit card / no billing account auto-charge).
const GROQ_FREE_TEXT_MODELS = new Set([
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
])

const GEMINI_FREE_TEXT_MODELS = new Set([
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
])

const NON_TRANSIENT_FAILOVER_REASONS = new Set([
  "auth_or_access_denied",
  "model_unavailable",
  "billing_or_quota_blocked",
  "quota_exhausted",
])

function isLoopbackEndpointUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl?.trim()) return false
  try {
    const { hostname } = new URL(rawUrl.trim())
    const normalized = hostname.toLowerCase()
    return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "[::1]" || normalized === "::1"
  } catch {
    return false
  }
}

export function getProviderBillingTier(provider: LLMProviderConfig): ProviderBillingTier {
  if (provider.provider === "ollama") {
    return "local-free"
  }

  const endpointUrl = "baseURL" in provider ? provider.baseURL : "url" in provider ? provider.url : undefined
  if (
    (provider.provider === "openai-compatible" || provider.provider === "open-responses") &&
    isLoopbackEndpointUrl(endpointUrl)
  ) {
    return "local-free"
  }

  const modelId = resolveModelId(provider.model) ?? ""

  if (provider.provider === "groq") {
    if (isLoopbackEndpointUrl(endpointUrl)) {
      return "local-free"
    }
    return GROQ_FREE_TEXT_MODELS.has(modelId) ? "free-tier" : "paid-or-unknown"
  }

  if (provider.provider === "google") {
    if (isLoopbackEndpointUrl(endpointUrl)) {
      return "local-free"
    }
    return GEMINI_FREE_TEXT_MODELS.has(modelId) ? "free-tier" : "paid-or-unknown"
  }

  if (provider.provider === "openrouter") {
    if (isLoopbackEndpointUrl(endpointUrl)) {
      return "local-free"
    }
    return modelId === "openrouter/free" || modelId.endsWith(":free")
      ? "free-tier"
      : "paid-or-unknown"
  }

  return "paid-or-unknown"
}

export function isZeroCostFailoverProvider(
  provider: ProviderConfig,
): provider is LLMProviderConfig {
  return isLLMProviderConfig(provider) && getProviderBillingTier(provider) !== "paid-or-unknown"
}

export interface FailoverCooldownRecord {
  until: number
  reason: string
}

const RATE_LIMIT_COOLDOWN_MS = 60_000
const AUTH_OR_QUOTA_COOLDOWN_MS = 5 * 60_000
const TRANSIENT_COOLDOWN_MS = 30_000

const providerCooldowns = new Map<string, FailoverCooldownRecord>()

export function clearProviderCooldowns(): void {
  providerCooldowns.clear()
}

export function getProviderCooldown(providerId: string, now = Date.now()): FailoverCooldownRecord | null {
  const record = providerCooldowns.get(providerId)
  if (!record) return null
  if (record.until <= now) {
    providerCooldowns.delete(providerId)
    return null
  }
  return record
}

export function isProviderReadyForFailover(provider: ProviderConfig): provider is LLMProviderConfig {
  if (!provider.enabled || !isLLMProviderConfig(provider)) {
    return false
  }
  // Never auto-route to traditional machine translators or unconfigured cloud keys.
  if (provider.provider === "ollama") {
    return true
  }
  if (provider.provider === "openai-compatible") {
    const hasCustomEndpoint =
      Boolean(provider.baseURL?.trim()) && provider.baseURL !== "https://api.example.com/v1"
    return Boolean(provider.apiKey?.trim()) || hasCustomEndpoint
  }
  if (provider.provider === "open-responses") {
    const hasCustomEndpoint =
      Boolean(provider.url?.trim()) && provider.url !== "https://api.example.com/v1/responses"
    return Boolean(provider.apiKey?.trim()) || hasCustomEndpoint
  }
  return Boolean(provider.apiKey?.trim())
}

export function hasAnyConfiguredLLMProvider(config: Config): boolean {
  const primaryId = config.pageTranslation.providerId
  const primaryProvider = config.providersConfig.find((p) => p.id === primaryId)
  if (primaryProvider && isProviderReadyForFailover(primaryProvider)) {
    return true
  }

  const fallbackIds = config.pageTranslation.fallbackProviderIds ?? []
  for (const id of fallbackIds) {
    if (id === primaryId) continue
    const found = config.providersConfig.find((p) => p.id === id)
    if (found && isProviderReadyForFailover(found) && isZeroCostFailoverProvider(found)) {
      return true
    }
  }
  return false
}

/**
 * Build ordered, deduplicated list of eligible LLM candidates for failover.
 * Strictly enforces AI-only translation: NEVER includes Google/Microsoft Translate, DeepL/DeepLX,
 * or paid/unverified cloud models in the automatic fallback chain.
 */
export function buildLLMFailoverChain(
  primaryProvider: ProviderConfig,
  config: Config | null | undefined,
  now = Date.now(),
): LLMProviderConfig[] {
  if (!isLLMProviderConfig(primaryProvider)) {
    return []
  }

  const allCandidates: LLMProviderConfig[] = []
  const seenIds = new Set<string>()

  const addIfEligible = (
    provider: ProviderConfig | undefined,
    requireReady: boolean,
    requireZeroCostFallback: boolean,
  ) => {
    if (!provider || seenIds.has(provider.id)) return
    if (!isLLMProviderConfig(provider) || !provider.enabled) return
    if (requireReady && !isProviderReadyForFailover(provider)) return
    if (requireZeroCostFallback && !isZeroCostFailoverProvider(provider)) return
    seenIds.add(provider.id)
    allCandidates.push(provider)
  }

  // Primary can be tried even if requireReady is false, EXCEPT when primary is missing credentials
  // and at least one ready zero-cost fallback provider already exists — in that case skip straight to ready ones.
  const hasReadyFallback =
    config?.pageTranslation.fallbackProviderIds?.some((id) => {
      if (id === primaryProvider.id) return false
      const found = config.providersConfig.find((p) => p.id === id)
      return found ? isProviderReadyForFailover(found) && isZeroCostFailoverProvider(found) : false
    }) ?? false

  if (isProviderReadyForFailover(primaryProvider) || !hasReadyFallback) {
    addIfEligible(primaryProvider, false, false)
  }

  if (config) {
    const fallbackIds = config.pageTranslation.fallbackProviderIds ?? []
    for (const fallbackId of fallbackIds) {
      const candidate = config.providersConfig.find((p) => p.id === fallbackId)
      addIfEligible(candidate, true, true)
    }
  }

  // Partition into healthy (not in cooldown) first, cooled-down last as final backstop
  const healthy: LLMProviderConfig[] = []
  const cooledDown: LLMProviderConfig[] = []
  for (const candidate of allCandidates) {
    if (getProviderCooldown(candidate.id, now)) {
      cooledDown.push(candidate)
    } else {
      healthy.push(candidate)
    }
  }

  return [...healthy, ...cooledDown]
}

export function classifyFailoverError(error: unknown): {
  shouldFailover: boolean
  cooldownMs: number
  reason: string
} {
  const meta = getRequestErrorMeta(error)
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()

  if (meta.statusCode === 402 || /payment required|insufficient[_ ]credits?/i.test(message)) {
    return {
      shouldFailover: true,
      cooldownMs: AUTH_OR_QUOTA_COOLDOWN_MS,
      reason: "billing_or_quota_blocked",
    }
  }

  if (
    meta.statusCode === 429 ||
    meta.kind === "rate-limit" ||
    /429|rate[ -]?limit|too many requests|quota|exhausted|insufficient_quota|credit/.test(message)
  ) {
    const isQuotaExhausted = /quota|exhausted|insufficient_quota|credit/.test(message)
    return {
      shouldFailover: true,
      cooldownMs: isQuotaExhausted ? AUTH_OR_QUOTA_COOLDOWN_MS : RATE_LIMIT_COOLDOWN_MS,
      reason: isQuotaExhausted ? "quota_exhausted" : "rate_limit",
    }
  }

  if (/billing/i.test(message)) {
    return {
      shouldFailover: true,
      cooldownMs: AUTH_OR_QUOTA_COOLDOWN_MS,
      reason: "billing_or_quota_blocked",
    }
  }

  if (meta.statusCode === 413 || /request too large|context length|payload too large/.test(message)) {
    return {
      shouldFailover: true,
      cooldownMs: TRANSIENT_COOLDOWN_MS,
      reason: "payload_too_large",
    }
  }

  if (meta.statusCode === 401 || meta.statusCode === 403 || meta.kind === "access-denied") {
    return {
      shouldFailover: true,
      cooldownMs: AUTH_OR_QUOTA_COOLDOWN_MS,
      reason: "auth_or_access_denied",
    }
  }

  if (
    meta.statusCode === 404 ||
    (meta.statusCode === 400 &&
      /model|decommissioned|deprecated|retired|not supported|not available|free tier|no access|invalid_request_error/i.test(
        message,
      )) ||
    /model.*not found|does not exist|decommissioned|not available on the free tier|no access to model|model.*deprecated|model.*retired/.test(
      message,
    )
  ) {
    return {
      shouldFailover: true,
      cooldownMs: AUTH_OR_QUOTA_COOLDOWN_MS,
      reason: "model_unavailable",
    }
  }

  if (
    meta.kind === "timeout" ||
    meta.kind === "network" ||
    meta.statusCode === 408 ||
    (meta.statusCode !== undefined && meta.statusCode >= 500) ||
    /timeout|timed out|failed to fetch|network|econnrefused|econnreset|502|503|504/.test(message)
  ) {
    return {
      shouldFailover: true,
      cooldownMs: TRANSIENT_COOLDOWN_MS,
      reason: meta.kind ?? "transient_error",
    }
  }

  return {
    shouldFailover: false,
    cooldownMs: 0,
    reason: "non_failover_error",
  }
}

export class AllAIProvidersFailedError extends Error {
  constructor(
    message: string,
    readonly attempts: Array<{ providerId: string; provider: string; error: unknown }>,
    readonly lastError: unknown,
  ) {
    super(message)
    this.name = "AllAIProvidersFailedError"
  }
}

export async function executeTranslateWithFailover<TContext>(
  text: string,
  langConfig: Config["language"],
  primaryProvider: ProviderConfig,
  config: Config | null | undefined,
  promptResolver: PromptResolver<TContext>,
  options?: Parameters<typeof executeTranslate<TContext>>[4] & {
    onProviderSwitch?: (fromId: string, toId: string, reason: string) => void
  },
): Promise<string> {
  // Traditional/non-LLM providers (if ever manually picked by user) bypass LLM failover
  if (!isLLMProviderConfig(primaryProvider)) {
    return executeTranslate(text, langConfig, primaryProvider, promptResolver, options)
  }

  const candidates = buildLLMFailoverChain(primaryProvider, config)
  if (candidates.length === 0) {
    return executeTranslate(text, langConfig, primaryProvider, promptResolver, options)
  }

  const attempts: Array<{ providerId: string; provider: string; reason: string; error: unknown }> = []
  let lastError: unknown

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]!
    if (options?.signal?.aborted) {
      throw lastError ?? new DOMException("Aborted", "AbortError")
    }

    try {
      return await executeTranslate(text, langConfig, candidate, promptResolver, options)
    } catch (error) {
      lastError = error
      const classification = classifyFailoverError(error)
      attempts.push({
        providerId: candidate.id,
        provider: candidate.provider,
        reason: classification.reason,
        error,
      })

      if (!classification.shouldFailover) {
        throw error
      }

      providerCooldowns.set(candidate.id, {
        until: Date.now() + classification.cooldownMs,
        reason: classification.reason,
      })

      const nextCandidate = candidates[i + 1]
      if (nextCandidate) {
        log.warn("AI provider failed; switching to fallback LLM provider", {
          fromProviderId: candidate.id,
          fromProvider: candidate.provider,
          toProviderId: nextCandidate.id,
          toProvider: nextCandidate.provider,
          reason: classification.reason,
        })
        options?.onProviderSwitch?.(candidate.id, nextCandidate.id, classification.reason)
      }
    }
  }

  if (attempts.length > 1) {
    const lastMessage = lastError instanceof Error ? lastError.message : String(lastError)
    const allNonTransient = attempts.every((attempt) =>
      NON_TRANSIENT_FAILOVER_REASONS.has(attempt.reason),
    )
    const aggregatedError = new AllAIProvidersFailedError(
      `All configured AI providers failed (${attempts.map((a) => a.providerId).join(" -> ")}): ${lastMessage}`,
      attempts.map(({ providerId, provider, error }) => ({ providerId, provider, error })),
      lastError,
    )
    throw attachRequestErrorMeta(
      aggregatedError,
      allNonTransient ? { kind: "access-denied", isRetryable: false } : getRequestErrorMeta(lastError),
    )
  }

  throw lastError
}
