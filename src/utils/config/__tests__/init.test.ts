import type { Config } from "@/types/config/config"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { isAPIProviderConfig } from "@/types/config/provider"
import { CONFIG_SCHEMA_VERSION, DEFAULT_CONFIG } from "@/utils/constants/config"

const getItemMock = vi.fn<(...args: any[]) => any>()
const getMetaMock = vi.fn<(...args: any[]) => any>()
const setItemMock = vi.fn<(...args: any[]) => any>()
const setMetaMock = vi.fn<(...args: any[]) => any>()
const runMigrationMock = vi.fn<(...args: any[]) => any>()

vi.mock("#imports", () => ({
  storage: {
    getItem: getItemMock,
    getMeta: getMetaMock,
    setItem: setItemMock,
    setMeta: setMetaMock,
  },
}))

vi.mock("wxt/utils/storage", () => ({
  storage: {
    getItem: getItemMock,
    getMeta: getMetaMock,
    setItem: setItemMock,
    setMeta: setMetaMock,
  },
}))

vi.mock("../migration", () => ({
  runMigration: runMigrationMock,
}))

function buildStableConfig(): Config {
  const config = structuredClone(DEFAULT_CONFIG)
  // In DEV mode, beta experience is enabled. Keep it true so no extra write is introduced.
  config.betaExperience.enabled = true
  config.providersConfig = config.providersConfig.map((providerConfig) => {
    if (!isAPIProviderConfig(providerConfig)) {
      return providerConfig
    }

    const apiKeyEnvName = `WXT_${providerConfig.provider.toUpperCase()}_API_KEY`
    const envApiKey = import.meta.env[apiKeyEnvName] as string | undefined
    if (!envApiKey) {
      return providerConfig
    }

    return {
      ...providerConfig,
      apiKey: envApiKey,
    }
  })
  return config
}

describe("initializeConfig", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    setItemMock.mockResolvedValue(undefined)
    setMetaMock.mockResolvedValue(undefined)
    runMigrationMock.mockImplementation(async (_nextVersion: number, config: Config) => config)
  })

  function translateProviderIdsOf(config: Config) {
    return [
      config.pageTranslation.providerId,
      config.selectionToolbar.features.translate.providerId,
      config.inputTranslation.providerId,
      config.videoSubtitles.providerId,
    ]
  }

  it("does not write when config and meta are already up to date", async () => {
    const config = buildStableConfig()
    getItemMock.mockResolvedValueOnce(config)
    getMetaMock.mockResolvedValueOnce({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      lastModifiedAt: 123,
    })

    const { initializeConfig } = await import("../init")
    await initializeConfig()

    expect(runMigrationMock).not.toHaveBeenCalled()
    expect(setItemMock).not.toHaveBeenCalled()
    expect(setMetaMock).not.toHaveBeenCalled()
  })

  it("writes config and meta when config is missing", async () => {
    getItemMock.mockResolvedValueOnce(null)
    getMetaMock.mockResolvedValueOnce(null)

    const { initializeConfig } = await import("../init")
    await initializeConfig()

    expect(setItemMock).toHaveBeenCalledTimes(1)
    expect(setItemMock).toHaveBeenCalledWith("local:config", expect.any(Object))
    const freshConfig = setItemMock.mock.calls[0]?.[1] as Config
    for (const providerId of ["groq-default", "google-default", "deepseek-default"]) {
      expect(freshConfig.providersConfig.find((provider) => provider.id === providerId)).toEqual(
        expect.objectContaining({ description: expect.any(String) }),
      )
    }
    expect(setMetaMock).toHaveBeenCalledTimes(1)
    expect(setMetaMock).toHaveBeenCalledWith(
      "local:config",
      expect.objectContaining({
        schemaVersion: CONFIG_SCHEMA_VERSION,
        lastModifiedAt: expect.any(Number),
      }),
    )
  })

  it("starts every translate feature on default AI provider", async () => {
    getItemMock.mockResolvedValueOnce(null)
    getMetaMock.mockResolvedValueOnce(null)

    const { initializeConfig } = await import("../init")
    const { isFreshInstall } = await initializeConfig()

    expect(isFreshInstall).toBe(true)
    const freshConfig = setItemMock.mock.calls[0]?.[1] as Config
    expect(translateProviderIdsOf(freshConfig)).toEqual([
      DEFAULT_CONFIG.pageTranslation.providerId,
      DEFAULT_CONFIG.selectionToolbar.features.translate.providerId,
      DEFAULT_CONFIG.inputTranslation.providerId,
      DEFAULT_CONFIG.videoSubtitles.providerId,
    ])
  })

  it("does not report a fresh install when a stored config is reused", async () => {
    const config = buildStableConfig()
    getItemMock.mockResolvedValueOnce(config)
    getMetaMock.mockResolvedValueOnce({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      lastModifiedAt: 123,
    })

    const { initializeConfig } = await import("../init")
    const { isFreshInstall } = await initializeConfig()

    expect(isFreshInstall).toBe(false)
  })

  it("reports recovery from an unparseable config as a fresh install so the provider probe reruns", async () => {
    getItemMock.mockResolvedValueOnce({ not: "a config" })
    getMetaMock.mockResolvedValueOnce({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      lastModifiedAt: 123,
    })

    const { initializeConfig } = await import("../init")
    const { isFreshInstall } = await initializeConfig()

    expect(isFreshInstall).toBe(true)
  })

  it("runs migration and persists migrated config once", async () => {
    const config = buildStableConfig()
    const migrated = {
      ...config,
      contextMenu: {
        ...config.contextMenu,
        enabled: false,
      },
    }
    getItemMock.mockResolvedValueOnce(config)
    getMetaMock.mockResolvedValueOnce({
      schemaVersion: CONFIG_SCHEMA_VERSION - 1,
      lastModifiedAt: 888,
    })
    runMigrationMock.mockResolvedValueOnce(migrated)

    const { initializeConfig } = await import("../init")
    await initializeConfig()

    expect(runMigrationMock).toHaveBeenCalledWith(CONFIG_SCHEMA_VERSION, config)
    expect(setItemMock).toHaveBeenCalledTimes(1)
    expect(setItemMock).toHaveBeenCalledWith("local:config", migrated)
    expect(setMetaMock).toHaveBeenCalledTimes(1)
    expect(setMetaMock).toHaveBeenCalledWith("local:config", {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      lastModifiedAt: 888,
    })
  })

  it("stores the migrated config as parsed, with the toolbar's order and pins in step", async () => {
    const config = buildStableConfig()
    const migrated = {
      ...config,
      selectionToolbar: {
        ...config.selectionToolbar,
        order: ["speak", "gone"],
        unpinned: ["gone", "speak"],
      },
    }
    getItemMock.mockResolvedValueOnce(config)
    getMetaMock.mockResolvedValueOnce({
      schemaVersion: CONFIG_SCHEMA_VERSION - 1,
      lastModifiedAt: 888,
    })
    runMigrationMock.mockResolvedValueOnce(migrated)

    const { initializeConfig } = await import("../init")
    await initializeConfig()

    const stored = setItemMock.mock.calls[0]?.[1] as Config
    expect(stored.selectionToolbar.order).toEqual([
      "speak",
      "translate",
      "default-dictionary",
      "default-sentence-analysis",
      "default-improve-writing",
    ])
    expect(stored.selectionToolbar.unpinned).toEqual(["speak"])
  })

  it("only updates meta when config is unchanged but lastModifiedAt is missing", async () => {
    const config = buildStableConfig()
    getItemMock.mockResolvedValueOnce(config)
    getMetaMock.mockResolvedValueOnce({
      schemaVersion: CONFIG_SCHEMA_VERSION,
    })

    const { initializeConfig } = await import("../init")
    await initializeConfig()

    expect(setItemMock).not.toHaveBeenCalled()
    expect(setMetaMock).toHaveBeenCalledTimes(1)
    expect(setMetaMock).toHaveBeenCalledWith(
      "local:config",
      expect.objectContaining({
        schemaVersion: CONFIG_SCHEMA_VERSION,
        lastModifiedAt: expect.any(Number),
      }),
    )
  })

  it("migrates legacy v128 config (without microsoftGoogleFallback) once to Microsoft while preserving keys/styles and stays idempotent", async () => {
    const legacyConfig = buildStableConfig() as Record<string, any>
    delete legacyConfig.pageTranslation.microsoftGoogleFallback
    legacyConfig.pageTranslation.providerId = "google-default"
    legacyConfig.pageTranslation.page.neverAutoTranslatePatterns = ["keep-me.example"]
    legacyConfig.pageTranslation.translationNodeStyle.customCSS = ".test { color: red; }"
    legacyConfig.providersConfig = legacyConfig.providersConfig.filter(
      (p: any) => p.id !== "microsoft-translate-default" && p.id !== "google-translate-default",
    )
    const gemini = legacyConfig.providersConfig.find((p: any) => p.id === "google-default")
    gemini.apiKey = "AIzaSyKeepUserGeminiKey123"
    gemini.model = {
      model: "gemini-3.5-flash-lite",
      isCustomModel: true,
      customModel: "gemini-custom-test",
    }

    getItemMock.mockResolvedValueOnce(legacyConfig)
    getMetaMock.mockResolvedValueOnce({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      lastModifiedAt: 999,
    })

    const { initializeConfig } = await import("../init")
    const first = await initializeConfig()
    expect(first.isFreshInstall).toBe(false)
    expect(setItemMock).toHaveBeenCalledTimes(1)

    const upgraded = setItemMock.mock.calls[0]?.[1] as Config
    expect(upgraded.pageTranslation.providerId).toBe("microsoft-translate-default")
    expect(upgraded.pageTranslation.microsoftGoogleFallback).toBe(false)
    expect(upgraded.pageTranslation.page.neverAutoTranslatePatterns).toEqual(["keep-me.example"])
    expect(upgraded.pageTranslation.translationNodeStyle.customCSS).toBe(".test { color: red; }")
    const upgradedGemini = upgraded.providersConfig.find((p) => p.id === "google-default")
    expect(upgradedGemini && isAPIProviderConfig(upgradedGemini) ? upgradedGemini.apiKey : null).toBe(
      "AIzaSyKeepUserGeminiKey123",
    )
    expect(upgraded.providersConfig.some((p) => p.id === "microsoft-translate-default")).toBe(true)

    // User switches back to Gemini AI later -> restart keeps Gemini AI cleanly
    setItemMock.mockClear()
    const userReselected = structuredClone(upgraded)
    userReselected.pageTranslation.providerId = "google-default"
    getItemMock.mockResolvedValueOnce(userReselected)
    getMetaMock.mockResolvedValueOnce({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      lastModifiedAt: 1000,
    })

    await initializeConfig()
    expect(setItemMock).not.toHaveBeenCalled()
  })
})
