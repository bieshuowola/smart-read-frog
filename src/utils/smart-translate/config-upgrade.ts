import type { Config } from "@/types/config/config"
import { isLLMProviderConfig } from "@/types/config/provider"
import {
  DEFAULT_PROVIDER_CONFIG,
  GOOGLE_TRANSLATE_PROVIDER_ID,
  MICROSOFT_TRANSLATE_PROVIDER_ID,
} from "@/utils/constants/providers"
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

export const MICROSOFT_DEFAULT_MIGRATION_STORAGE_KEY = "smartReadFrogMicrosoftDefaultMigratedV3"

/**
 * One-time safe upgrade migration switching webpage translation's default engine to
 * Microsoft Translate (`microsoft-translate-default`) while strictly preserving every
 * existing API key, custom model, subtitle config, exclusion rule, and node style.
 */
export function upgradePageTranslationToMicrosoftDefault(
  config: Config,
  options?: { alreadyMigrated?: boolean },
): { config: Config; changed: boolean } {
  let changed = false
  let nextProvidersConfig = config.providersConfig

  const ensureBuiltInProviderEnabled = (
    providerKey: "microsoft-translate" | "google-translate",
    targetId: string,
  ) => {
    const idx = nextProvidersConfig.findIndex((p) => p.id === targetId)
    if (idx === -1) {
      nextProvidersConfig = [...nextProvidersConfig, structuredClone(DEFAULT_PROVIDER_CONFIG[providerKey])]
      changed = true
    } else if (!nextProvidersConfig[idx]!.enabled) {
      nextProvidersConfig = nextProvidersConfig.map((p, i) =>
        i === idx ? { ...p, enabled: true } : p,
      )
      changed = true
    }
  }

  ensureBuiltInProviderEnabled("microsoft-translate", MICROSOFT_TRANSLATE_PROVIDER_ID)
  ensureBuiltInProviderEnabled("google-translate", GOOGLE_TRANSLATE_PROVIDER_ID)

  if (options?.alreadyMigrated) {
    return changed
      ? { config: { ...config, providersConfig: nextProvidersConfig }, changed: true }
      : { config, changed: false }
  }

  let nextPageTranslation = config.pageTranslation
  // Persist the marker (`microsoftGoogleFallback`) on the first upgrade pass
  // so subsequent startups know the one-time migration already completed.
  changed = true
  if (nextPageTranslation.providerId !== MICROSOFT_TRANSLATE_PROVIDER_ID) {
    nextPageTranslation = {
      ...nextPageTranslation,
      providerId: MICROSOFT_TRANSLATE_PROVIDER_ID,
      microsoftGoogleFallback: nextPageTranslation.microsoftGoogleFallback ?? false,
    }
  }

  // Disable retired auxiliary page overlays on the one-time upgrade so users no longer
  // see floating buttons / selection popovers whose settings pages were intentionally removed.
  let nextFloatingButton = config.floatingButton
  if (nextFloatingButton.enabled) {
    nextFloatingButton = { ...nextFloatingButton, enabled: false }
    changed = true
  }

  let nextSelectionToolbar = config.selectionToolbar
  if (nextSelectionToolbar.enabled) {
    nextSelectionToolbar = { ...nextSelectionToolbar, enabled: false }
    changed = true
  }

  let nextInputTranslation = config.inputTranslation
  if (nextInputTranslation.enabled) {
    nextInputTranslation = { ...nextInputTranslation, enabled: false }
    changed = true
  }

  if (!changed) {
    return { config, changed: false }
  }

  return {
    config: {
      ...config,
      providersConfig: nextProvidersConfig,
      pageTranslation: nextPageTranslation,
      floatingButton: nextFloatingButton,
      selectionToolbar: nextSelectionToolbar,
      inputTranslation: nextInputTranslation,
    },
    changed: true,
  }
}
