import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import {
  DEFAULT_PROVIDER_CONFIG,
  GOOGLE_TRANSLATE_PROVIDER_ID,
  MICROSOFT_TRANSLATE_PROVIDER_ID,
} from "@/utils/constants/providers"
import {
  getTranslationOnlyBlockedReason,
  providerSupportsTranslationOnlyMode,
} from "../translation-only-gate"

// `@/utils/i18n` is globally mocked to echo the key, so the reason's wording is
// unassertable here — only whether one is produced. The rendered sentence is
// verified in the browser.

describe("providerSupportsTranslationOnlyMode", () => {
  it("supports Microsoft Translate via in-place swap alongside markup-preserving providers", () => {
    expect(providerSupportsTranslationOnlyMode("microsoft-translate")).toBe(true)
    expect(providerSupportsTranslationOnlyMode("google-translate")).toBe(true)
    expect(providerSupportsTranslationOnlyMode("deeplx")).toBe(true)
  })
})

describe("getTranslationOnlyBlockedReason", () => {
  it("allows Microsoft default profile as well as Google and LLM profiles in translationOnly mode", () => {
    expect(getTranslationOnlyBlockedReason(DEFAULT_CONFIG)).toBeNull()

    const microsoftConfig = {
      ...DEFAULT_CONFIG,
      providersConfig: [
        ...DEFAULT_CONFIG.providersConfig,
        DEFAULT_PROVIDER_CONFIG["microsoft-translate"],
      ],
      pageTranslation: {
        ...DEFAULT_CONFIG.pageTranslation,
        providerId: MICROSOFT_TRANSLATE_PROVIDER_ID,
      },
    }
    expect(getTranslationOnlyBlockedReason(microsoftConfig)).toBeNull()
  })

  it("clears once page translation moves to a provider that keeps markup", () => {
    const config = {
      ...DEFAULT_CONFIG,
      providersConfig: [
        ...DEFAULT_CONFIG.providersConfig,
        DEFAULT_PROVIDER_CONFIG["google-translate"],
      ],
      pageTranslation: {
        ...DEFAULT_CONFIG.pageTranslation,
        providerId: GOOGLE_TRANSLATE_PROVIDER_ID,
      },
    }

    expect(getTranslationOnlyBlockedReason(config)).toBeNull()
  })

  it("stays out of the way when the assigned provider no longer exists", () => {
    const config = {
      ...DEFAULT_CONFIG,
      pageTranslation: { ...DEFAULT_CONFIG.pageTranslation, providerId: "deleted-provider" },
    }

    expect(getTranslationOnlyBlockedReason(config)).toBeNull()
  })
})
