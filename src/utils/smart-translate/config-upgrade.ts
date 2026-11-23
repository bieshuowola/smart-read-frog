import type { Config } from "@/types/config/config"
import { isLLMProviderConfig } from "@/types/config/provider"
import { getProviderBillingTier } from "./ai-failover"

const RETIRED_GROQ_FREE_MODELS = new Set([
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "qwen/qwen3.6-27b",
])

/**
 * Idempotent upgrade repair for persisted Smart Read Frog configs migrating from earlier
 * defaults (`llama-3.3-70b-versatile` on `groq-default` or unconfigured `cerebras-default`
 * in automatic fallback). Preserves all user API keys, custom models, and rules.
 */
export function repairDeprecatedFreeDefaults(config: Config): { config: Config; changed: boolean } {
  let providersChanged = false
  const nextProvidersConfig = config.providersConfig.map((provider) => {
    if (
      provider.id === "groq-default" &&
      provider.provider === "groq" &&
      !provider.model.isCustomModel &&
      RETIRED_GROQ_FREE_MODELS.has(provider.model.model)
    ) {
      providersChanged = true
      return {
        ...provider,
        model: {
          model: "qwen/qwen3.8-27b" as const,
          isCustomModel: false,
          customModel: null,
        },
        ...(provider.providerOptions === undefined
          ? { providerOptions: { reasoningEffort: "none" } }
          : {}),
      }
    }
    return provider
  })

  const currentFallbackIds = config.pageTranslation.fallbackProviderIds
  let fallbackChanged = false
  let nextFallbackIds = currentFallbackIds

  if (currentFallbackIds) {
    const filtered = currentFallbackIds.filter((fallbackId) => {
      const target = nextProvidersConfig.find((p) => p.id === fallbackId)
      if (!target || !isLLMProviderConfig(target)) {
        return false
      }
      if (
        getProviderBillingTier(target) === "paid-or-unknown" &&
        (target.id === "cerebras-default" || !target.apiKey?.trim())
      ) {
        // Drop legacy unverified default `cerebras-default` and any unconfigured paid fallback.
        return false
      }
      return true
    })

    if (filtered.length !== currentFallbackIds.length) {
      fallbackChanged = true
      nextFallbackIds = filtered
    }
  }

  if (!providersChanged && !fallbackChanged) {
    return { config, changed: false }
  }

  return {
    config: {
      ...config,
      ...(providersChanged ? { providersConfig: nextProvidersConfig } : {}),
      ...(fallbackChanged
        ? {
            pageTranslation: {
              ...config.pageTranslation,
              fallbackProviderIds: nextFallbackIds,
            },
          }
        : {}),
    },
    changed: true,
  }
}
