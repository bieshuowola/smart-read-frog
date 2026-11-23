import type { Config } from "@/types/config/config"
import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { DEFAULT_PROVIDER_CONFIG } from "@/utils/constants/providers"
import { repairDeprecatedFreeDefaults } from "../config-upgrade"

describe("repairDeprecatedFreeDefaults", () => {
  it("returns unchanged config when already on verified defaults", () => {
    const cfg = structuredClone(DEFAULT_CONFIG)
    const result = repairDeprecatedFreeDefaults(cfg)

    expect(result.changed).toBe(false)
    expect(result.config).toBe(cfg)
  })

  it("upgrades legacy groq-default llama-3.3-70b-versatile to qwen/qwen3.8-27b while preserving API keys", () => {
    const cfg = structuredClone(DEFAULT_CONFIG)
    cfg.providersConfig = cfg.providersConfig.map((p) => {
      if (p.id !== "groq-default") return p
      const clone = structuredClone(p)
      if (clone.provider === "groq") {
        clone.apiKey = "gsk_user_secret_key"
        clone.model = {
          model: "llama-3.3-70b-versatile",
          isCustomModel: false,
          customModel: null,
        }
        delete clone.providerOptions
      }
      return clone
    })
    cfg.providersConfig.push(structuredClone(DEFAULT_PROVIDER_CONFIG.cerebras))
    cfg.pageTranslation.fallbackProviderIds = [
      "google-default",
      "openrouter-default",
      "cerebras-default",
    ]
    cfg.pageTranslation.page.neverAutoTranslatePatterns = ["intranet.local"]

    const result = repairDeprecatedFreeDefaults(cfg)

    expect(result.changed).toBe(true)
    const groq = result.config.providersConfig.find((p) => p.id === "groq-default")
    expect(groq).toEqual(
      expect.objectContaining({
        apiKey: "gsk_user_secret_key",
        model: {
          model: "qwen/qwen3.8-27b",
          isCustomModel: false,
          customModel: null,
        },
        providerOptions: {
          reasoningEffort: "none",
        },
      }),
    )
    expect(result.config.pageTranslation.fallbackProviderIds).toEqual([
      "google-default",
      "openrouter-default",
    ])
    expect(result.config.pageTranslation.page.neverAutoTranslatePatterns).toEqual(["intranet.local"])

    // Idempotent on second call
    const second = repairDeprecatedFreeDefaults(result.config)
    expect(second.changed).toBe(false)
  })

  it("does not overwrite user-selected custom groq models", () => {
    const cfg: Config = structuredClone(DEFAULT_CONFIG)
    cfg.providersConfig = cfg.providersConfig.map((p) => {
      if (p.id !== "groq-default" || p.provider !== "groq") return p
      return {
        ...p,
        apiKey: "gsk_custom",
        model: {
          model: "llama-3.3-70b-versatile",
          isCustomModel: true,
          customModel: "my-org/custom-groq-model",
        },
      }
    })

    const result = repairDeprecatedFreeDefaults(cfg)
    expect(result.changed).toBe(false)
    const groq = result.config.providersConfig.find((p) => p.id === "groq-default")
    expect(groq).toEqual(
      expect.objectContaining({
        provider: "groq",
        model: expect.objectContaining({
          customModel: "my-org/custom-groq-model",
        }),
      }),
    )
  })
})
