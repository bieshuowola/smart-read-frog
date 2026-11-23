import type { Config } from "@/types/config/config"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { DEFAULT_PROVIDER_CONFIG } from "@/utils/constants/providers"
import {
  AllAIProvidersFailedError,
  buildLLMFailoverChain,
  clearProviderCooldowns,
  executeTranslateWithFailover,
  getProviderCooldown,
  isProviderReadyForFailover,
} from "../ai-failover"

const executeTranslateMock = vi.fn<(...args: any[]) => Promise<string>>()

vi.mock("@/utils/host/translate/execute-translate", () => ({
  executeTranslate: (...args: any[]) => executeTranslateMock(...args),
}))

function createTestConfig(): Config {
  const cfg = structuredClone(DEFAULT_CONFIG)
  cfg.providersConfig = [
    {
      ...structuredClone(DEFAULT_PROVIDER_CONFIG.groq),
      id: "groq-primary",
      apiKey: "gsk_test_primary",
    },
    {
      ...structuredClone(DEFAULT_PROVIDER_CONFIG.google),
      id: "gemini-backup",
      apiKey: "AIza_test_backup",
    },
    {
      ...structuredClone(DEFAULT_PROVIDER_CONFIG.openrouter),
      id: "openrouter-backup",
      apiKey: "sk-or-test-backup",
    },
    {
      ...structuredClone(DEFAULT_PROVIDER_CONFIG.cerebras),
      id: "cerebras-unconfigured",
      apiKey: "",
    },
    structuredClone(DEFAULT_PROVIDER_CONFIG["google-translate"]),
    structuredClone(DEFAULT_PROVIDER_CONFIG["microsoft-translate"]),
  ]
  cfg.pageTranslation.providerId = "groq-primary"
  cfg.pageTranslation.fallbackProviderIds = [
    "gemini-backup",
    "openrouter-backup",
    "cerebras-unconfigured",
    "google-translate-default",
    "microsoft-translate-default",
  ]
  return cfg
}

describe("ai-failover", () => {
  beforeEach(() => {
    clearProviderCooldowns()
    executeTranslateMock.mockReset()
  })

  it("never includes traditional machine translators or unconfigured cloud keys in failover chain", () => {
    const cfg = createTestConfig()
    const primary = cfg.providersConfig.find((p) => p.id === "groq-primary")!
    const chain = buildLLMFailoverChain(primary, cfg)

    expect(chain.map((p) => p.id)).toEqual(["groq-primary", "gemini-backup", "openrouter-backup"])
    expect(isProviderReadyForFailover(DEFAULT_PROVIDER_CONFIG["google-translate"])).toBe(false)
    expect(isProviderReadyForFailover(DEFAULT_PROVIDER_CONFIG["microsoft-translate"])).toBe(false)
    expect(isProviderReadyForFailover(DEFAULT_PROVIDER_CONFIG.ollama)).toBe(true)
  })

  it("returns primary result immediately when primary LLM succeeds", async () => {
    const cfg = createTestConfig()
    const primary = cfg.providersConfig.find((p) => p.id === "groq-primary")!
    executeTranslateMock.mockResolvedValueOnce("主模型译文")

    const result = await executeTranslateWithFailover(
      "Hello world",
      cfg.language,
      primary,
      cfg,
      async () => ({ systemPrompt: "sys", prompt: "user" }),
    )

    expect(result).toBe("主模型译文")
    expect(executeTranslateMock).toHaveBeenCalledTimes(1)
    expect(executeTranslateMock.mock.calls[0]?.[2]?.id).toBe("groq-primary")
  })

  it("automatically fails over to next free/configured LLM on 429 rate limit or timeout and puts failed one in cooldown", async () => {
    const cfg = createTestConfig()
    const primary = cfg.providersConfig.find((p) => p.id === "groq-primary")!
    const switched: Array<{ from: string; to: string; reason: string }> = []

    const err429 = Object.assign(new Error("Too Many Requests"), { statusCode: 429 })
    executeTranslateMock
      .mockRejectedValueOnce(err429)
      .mockResolvedValueOnce("备用 Gemini 译文")

    const result = await executeTranslateWithFailover(
      "Hello failover",
      cfg.language,
      primary,
      cfg,
      async () => ({ systemPrompt: "sys", prompt: "user" }),
      {
        onProviderSwitch: (from, to, reason) => {
          switched.push({ from, to, reason })
        },
      },
    )

    expect(result).toBe("备用 Gemini 译文")
    expect(executeTranslateMock).toHaveBeenCalledTimes(2)
    expect(executeTranslateMock.mock.calls[0]?.[2]?.id).toBe("groq-primary")
    expect(executeTranslateMock.mock.calls[1]?.[2]?.id).toBe("gemini-backup")
    expect(switched).toEqual([{ from: "groq-primary", to: "gemini-backup", reason: "rate_limit" }])
    expect(getProviderCooldown("groq-primary")?.reason).toBe("rate_limit")

    // Next request while primary is on cooldown should try healthy gemini-backup first
    const nextChain = buildLLMFailoverChain(primary, cfg)
    expect(nextChain[0]?.id).toBe("gemini-backup")
    expect(nextChain[nextChain.length - 1]?.id).toBe("groq-primary")
  })

  it("throws AllAIProvidersFailedError when every configured LLM fails without falling back to traditional MT", async () => {
    const cfg = createTestConfig()
    const primary = cfg.providersConfig.find((p) => p.id === "groq-primary")!

    executeTranslateMock
      .mockRejectedValueOnce(Object.assign(new Error("Quota exceeded"), { statusCode: 429 }))
      .mockRejectedValueOnce(new Error("Request timed out"))
      .mockRejectedValueOnce(Object.assign(new Error("Service Unavailable"), { statusCode: 503 }))

    await expect(
      executeTranslateWithFailover(
        "Hello failure",
        cfg.language,
        primary,
        cfg,
        async () => ({ systemPrompt: "sys", prompt: "user" }),
      ),
    ).rejects.toThrow(AllAIProvidersFailedError)

    // Attempted ONLY the 3 configured LLM providers — never Google/Microsoft Translate
    expect(executeTranslateMock).toHaveBeenCalledTimes(3)
    expect(executeTranslateMock.mock.calls.map((c) => c[2]?.id)).toEqual([
      "groq-primary",
      "gemini-backup",
      "openrouter-backup",
    ])
  })
})
