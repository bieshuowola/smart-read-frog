import type { LanguageTag } from "@read-frog/definitions"
import type { ContentScriptContext } from "#imports"
import type { Config } from "@/types/config/config"
import { storage } from "#imports"
import { configSchema } from "@/types/config/config"
import { getLocalConfig } from "@/utils/config/storage"
import {
  CONTENT_WRAPPER_CLASS,
  REACT_SHADOW_HOST_CLASS,
} from "@/utils/constants/dom-labels"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { detectPageLanguageLightweight } from "@/utils/content/page-language"
import { ensurePresetStyles } from "@/utils/host/translate/ui/style-injector"
import { createLogger } from "@/utils/logging/logger"
import { onMessage, sendMessage } from "@/utils/message"
import { clearEffectiveSiteControlUrl } from "@/utils/site-control"
import { detectSmartPageDecision } from "@/utils/smart-translate/page-decision"
import {
  clearCurrentPageSmartDecision,
  setCurrentPageSmartDecision,
} from "@/utils/smart-translate/page-mode-context"
import { areSamePageTranslationOrigin } from "@/utils/url"
import { bindTranslationHubShortcutKey } from "./bind-translation-hub-shortcut"
import { setupUrlChangeListener, URL_CHANGE_EVENT_NAME } from "./listen"
import { closePageDiagnosisPanel, togglePageDiagnosisPanel } from "./page-diagnosis"
import { bindTranslationModeShortcutKey } from "./translation-control/bind-translation-mode-shortcut"
import { bindTranslationShortcutKey } from "./translation-control/bind-translation-shortcut"
import { registerNodeTranslationTriggers } from "./translation-control/node-translation"
import { PageTranslationManager } from "./translation-control/page-translation"

const log = createLogger("content-runtime/host/runtime")

export async function bootstrapHostContent(
  ctx: ContentScriptContext,
  initialConfig: Config | null,
) {
  ensurePresetStyles(document)

  // No toast surface of its own: the selection UI renders the content
  // runtime's toasts (see content-runtime/selection/app.tsx).
  const cleanupUrlListener = setupUrlChangeListener()

  const teardownNodeTranslation = registerNodeTranslationTriggers()

  const preloadConfig =
    initialConfig?.pageTranslation.page.preload ?? DEFAULT_CONFIG.pageTranslation.page.preload
  let detectedPageLanguage: { url: string; code: LanguageTag | "und" } | undefined
  let detectionGeneration = 0
  const manager = new PageTranslationManager(
    {
      root: null,
      rootMargin: `${preloadConfig.margin}px`,
      threshold: preloadConfig.threshold,
    },
    (url) => (detectedPageLanguage?.url === url ? detectedPageLanguage.code : undefined),
  )

  const cleanupPageTranslationTriggers = manager.registerPageTranslationTriggers()

  // The tab-title switch applies to an already-translated page at once. Only
  // the top frame owns the title, so iframes skip parsing every config write.
  const cleanupTitleTranslationWatch =
    window === window.top
      ? storage.watch<Config>(`local:${CONFIG_STORAGE_KEY}`, (config) => {
          const parsedConfig = configSchema.safeParse(config)
          if (parsedConfig.success) {
            manager.setTitleTranslationEnabled(
              parsedConfig.data.pageTranslation.page.translateTitle,
            )
          }
        })
      : () => {}

  const cleanupTranslationShortcut = await bindTranslationShortcutKey(manager)

  const cleanupTranslationModeShortcut = await bindTranslationModeShortcutKey()

  const cleanupTranslationHubShortcut = await bindTranslationHubShortcutKey()

  let skipReevalObserver: MutationObserver | null = null
  let skipReevalTimer: ReturnType<typeof setTimeout> | null = null
  let skipReevalUrl = ""
  let skipReevalCount = 0

  const stopSkipReevalObserver = () => {
    if (skipReevalTimer !== null) {
      clearTimeout(skipReevalTimer)
      skipReevalTimer = null
    }
    if (skipReevalObserver) {
      skipReevalObserver.disconnect()
      skipReevalObserver = null
    }
  }

  const ensureSkipReevalObserver = (url: string) => {
    if (window !== window.top || manager.isActive || !document.body) return
    if (skipReevalUrl !== url) {
      skipReevalUrl = url
      skipReevalCount = 0
    }
    if (skipReevalObserver || skipReevalCount >= 12) return

    skipReevalObserver = new MutationObserver((mutations) => {
      if (manager.isActive || skipReevalCount >= 12) {
        stopSkipReevalObserver()
        return
      }

      let hasSubstantialNewText = false
      for (const mutation of mutations) {
        for (const added of mutation.addedNodes) {
          if (added.nodeType === Node.ELEMENT_NODE) {
            const el = added as Element
            if (
              el.closest(`.${CONTENT_WRAPPER_CLASS}, .${REACT_SHADOW_HOST_CLASS}`) ||
              el.classList.contains(CONTENT_WRAPPER_CLASS) ||
              el.classList.contains(REACT_SHADOW_HOST_CLASS)
            ) {
              continue
            }
            if ((el.textContent ?? "").trim().length >= 16) {
              hasSubstantialNewText = true
              break
            }
          } else if (added.nodeType === Node.TEXT_NODE && (added.textContent ?? "").trim().length >= 16) {
            hasSubstantialNewText = true
            break
          }
        }
        if (hasSubstantialNewText) break
      }

      if (!hasSubstantialNewText) return

      if (skipReevalTimer !== null) clearTimeout(skipReevalTimer)
      skipReevalTimer = setTimeout(() => {
        skipReevalTimer = null
        if (manager.isActive || skipReevalCount >= 12) return
        skipReevalCount += 1
        void detectAndReportPageLanguage(window.location.href)
      }, 800)
    })

    skipReevalObserver.observe(document.body, { childList: true, subtree: true })
  }

  const detectAndReportPageLanguage = async (url: string) => {
    const generation = ++detectionGeneration
    detectedPageLanguage = undefined

    const activeConfig = await getLocalConfig().catch(() => null)
    if (activeConfig?.pageTranslation.page.smartAutoTranslate) {
      const smartDecision = detectSmartPageDecision(document, url, activeConfig)
      if (generation === detectionGeneration && url === window.location.href) {
        detectedPageLanguage = { url, code: smartDecision.detectedLanguage }
        setCurrentPageSmartDecision(url, smartDecision)
        if (smartDecision.mode === "skip" && !manager.isActive) {
          ensureSkipReevalObserver(url)
        } else {
          stopSkipReevalObserver()
        }
      }
      void sendMessage("reportDetectedPageLanguage", {
        url,
        detectedCodeOrUnd: smartDecision.detectedLanguage,
        smartDecision,
      })
      return
    }

    clearCurrentPageSmartDecision()
    stopSkipReevalObserver()
    const { detectedCodeOrUnd } = await detectPageLanguageLightweight()
    if (generation === detectionGeneration && url === window.location.href) {
      detectedPageLanguage = { url, code: detectedCodeOrUnd }
    }
    void sendMessage("reportDetectedPageLanguage", { url, detectedCodeOrUnd })
  }

  // For late-loading iframes: check if translation is already enabled for this tab
  let translationEnabled = false
  try {
    translationEnabled = await sendMessage("getEnablePageTranslationFromContentScript", undefined)
  } catch (error) {
    // Extension context may be invalidated during update, proceed without auto-start
    log.error("Failed to check translation state", { error })
  }
  if (translationEnabled) {
    void manager.start()
  }

  const handleUrlChange = async (from: string, to: string) => {
    if (from !== to) {
      detectionGeneration += 1
      detectedPageLanguage = undefined
      log.debug("URL changed", { from, to })
      if (manager.isActive) {
        if (areSamePageTranslationOrigin(from, to)) {
          // Same-document route change: keep the session and wrappers
          // mounted — the MutationObserver walks the new route's DOM as the
          // router inserts it. Site CSS is swapped for the new path;
          // persistent DOM keeps its old walk decisions (accepted tradeoff,
          // see refreshSiteRuleCSS).
          await manager.refreshSiteRuleCSS()
        } else {
          manager.stop()
        }
      }
      // Only the top frame should detect and set language to avoid race conditions from iframes
      if (window === window.top) {
        await detectAndReportPageLanguage(to)
      }
    }
  }

  const handleExtensionUrlChange = (e: any) => {
    const { from, to } = e.detail
    void handleUrlChange(from, to)
  }
  window.addEventListener(URL_CHANGE_EVENT_NAME, handleExtensionUrlChange)

  // Listen for translation state changes from background
  const cleanupTranslationStateListener = onMessage("askManagerToTogglePageTranslation", (msg) => {
    const { enabled, analyticsContext } = msg.data
    if (enabled === manager.isActive) return
    if (enabled) {
      void manager.start(window === window.top ? analyticsContext : undefined)
    } else {
      // Invariant: every sender of askManagerToTogglePageTranslation with
      // enabled=false is a user surface (popup button, floating button,
      // context menu) — the auto-translation path only ever sends
      // enabled=true — so a disable here is always user-initiated.
      manager.stop({ userInitiated: true })
    }
  })

  const cleanupFrameTranslationStateListener =
    window === window.top
      ? () => {}
      : onMessage("notifyTranslationStateChanged", (msg) => {
          const { enabled } = msg.data
          if (enabled === manager.isActive) return
          if (enabled) {
            void manager.start()
          } else {
            manager.stop()
          }
        })

  const cleanupDetectedLanguageRefreshListener =
    window === window.top
      ? onMessage("refreshDetectedPageLanguage", () => {
          void detectAndReportPageLanguage(window.location.href)
        })
      : () => {}

  // The popup sends this to the top frame only. Frames translate on their own and
  // keep their own verdicts, so the panel covers the top frame and says so.
  const cleanupPageDiagnosisListener =
    window === window.top
      ? onMessage("togglePageTranslationDiagnostics", () => togglePageDiagnosisPanel())
      : () => {}

  ctx.onInvalidated(() => {
    cleanupUrlListener()
    teardownNodeTranslation()
    cleanupPageTranslationTriggers()
    cleanupTitleTranslationWatch()
    cleanupTranslationShortcut()
    cleanupTranslationModeShortcut()
    cleanupTranslationHubShortcut()
    cleanupTranslationStateListener()
    cleanupFrameTranslationStateListener()
    cleanupDetectedLanguageRefreshListener()
    cleanupPageDiagnosisListener()
    closePageDiagnosisPanel()
    stopSkipReevalObserver()
    clearCurrentPageSmartDecision()
    window.removeEventListener(URL_CHANGE_EVENT_NAME, handleExtensionUrlChange)
    window.__READ_FROG_HOST_INJECTED__ = false
    clearEffectiveSiteControlUrl()
  })

  // Only the top frame should detect and set language to avoid race conditions from iframes
  if (window === window.top) {
    await detectAndReportPageLanguage(window.location.href)
  }
}
