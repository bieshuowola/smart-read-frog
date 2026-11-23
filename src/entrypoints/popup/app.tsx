import type { PageTranslationDiagnostics } from "@/utils/message"
import type { TabSmartDecisionState } from "@/utils/smart-translate/types"
import { Icon } from "@iconify/react"
import { useAtom, useAtomValue } from "jotai"
import { useCallback, useEffect, useState } from "react"
import { browser } from "#imports"
import { Badge } from "@/components/ui/base-ui/badge"
import { Button } from "@/components/ui/base-ui/button"
import { Switch } from "@/components/ui/base-ui/switch"
import { ANALYTICS_FEATURE, ANALYTICS_SURFACE } from "@/types/analytics"
import { createFeatureUsageContext } from "@/utils/analytics"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import {
  GOOGLE_TRANSLATE_PROVIDER_ID,
  MICROSOFT_TRANSLATE_PROVIDER_ID,
} from "@/utils/constants/providers"
import { onMessage, sendMessage } from "@/utils/message"
import { openOptionsPage } from "@/utils/navigation"
import { sitePatternForHost, urlMatchesPattern } from "@/utils/url-pattern"
import { isPageTranslatedAtom } from "./atoms/auto-translate"
import { isIgnoreTabAtom } from "./atoms/ignore"

function getEngineLabel(providerId: string, providersConfig: Array<{ id: string; name: string }>): string {
  if (providerId === MICROSOFT_TRANSLATE_PROVIDER_ID) return "微软翻译"
  if (providerId === GOOGLE_TRANSLATE_PROVIDER_ID) return "Google 翻译"
  if (providerId === "google-default") return "Gemini AI"
  return providersConfig.find((p) => p.id === providerId)?.name ?? providerId
}

function getDecisionLabel(
  smartEnabled: boolean,
  isPageTranslated: boolean,
  decision: TabSmartDecisionState | null,
): { text: string; tone: "active" | "partial" | "muted" | "warn" } {
  if (isPageTranslated) {
    if (decision?.mode === "partial-auto") {
      return { text: "局部外语已开启翻译", tone: "partial" }
    }
    return { text: "当前页面已开启翻译", tone: "active" }
  }
  if (!smartEnabled) {
    return { text: "智能自动翻译已关闭", tone: "muted" }
  }
  if (decision?.userSuppressed || decision?.reason === "user_suppressed") {
    return { text: "已手动显示原文", tone: "muted" }
  }
  switch (decision?.mode) {
    case "full-auto":
      return { text: "检测到外语页面", tone: "active" }
    case "partial-auto":
      return { text: "检测到中文页局部外语", tone: "partial" }
    case "privacy-blocked":
      return { text: "隐私敏感页面已保护", tone: "warn" }
    case "skip":
      return { text: "中文页面已自动跳过", tone: "muted" }
    default:
      return { text: "等待翻译", tone: "muted" }
  }
}

const BADGE_CLASS_BY_TONE = {
  active: "border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  partial: "border-sky-500/25 bg-sky-500/12 text-sky-700 dark:text-sky-300",
  warn: "border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300",
  muted: "border-transparent bg-muted text-muted-foreground",
} as const

export default function App() {
  const [translateConfig, setTranslateConfig] = useAtom(configFieldsAtomMap.pageTranslation)
  const providersConfig = useAtomValue(configFieldsAtomMap.providersConfig)
  const [isPageTranslated, setIsPageTranslated] = useAtom(isPageTranslatedAtom)
  const isIgnoreTab = useAtomValue(isIgnoreTabAtom)

  const [tabId, setTabId] = useState<number | null>(null)
  const [tabUrl, setTabUrl] = useState<string>("")
  const [decision, setDecision] = useState<TabSmartDecisionState | null>(null)
  const [diagnostics, setDiagnostics] = useState<PageTranslationDiagnostics | null>(null)
  const [isRetrying, setIsRetrying] = useState(false)

  const refreshTabStatus = useCallback(async (targetTabId: number) => {
    const [nextDecision, nextDiag] = await Promise.all([
      sendMessage("getSmartPageDecision", { tabId: targetTabId }).catch(() => null),
      sendMessage("getPageTranslationDiagnostics", { tabId: targetTabId }).catch(() => null),
    ])
    if (nextDecision) setDecision(nextDecision)
    if (nextDiag) {
      setDiagnostics(nextDiag)
      setIsPageTranslated(nextDiag.isActive)
    }
  }, [setIsPageTranslated])

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setInterval> | null = null

    const init = async () => {
      const explicitId = Number(new URLSearchParams(window.location.search).get("tabId"))
      const tab =
        Number.isInteger(explicitId) && explicitId > 0
          ? await browser.tabs.get(explicitId).catch(() => undefined)
          : (await browser.tabs.query({ active: true, currentWindow: true }))[0]
      if (!active || !tab?.id) return
      setTabId(tab.id)
      setTabUrl(tab.url ?? "")
      await refreshTabStatus(tab.id)
      if (!active) return
      timer = setInterval(() => {
        if (active && tab.id) void refreshTabStatus(tab.id)
      }, 1200)
    }

    void init()

    const unsubscribe = onMessage("smartPageDecisionChanged", ({ data }) => {
      if (active && data.decision) setDecision(data.decision)
    })

    return () => {
      active = false
      if (timer !== null) clearInterval(timer)
      unsubscribe()
    }
  }, [refreshTabStatus])

  const hostname = (() => {
    try {
      return tabUrl ? new URL(tabUrl).hostname : ""
    } catch {
      return ""
    }
  })()

  const isSiteExcluded =
    Boolean(tabUrl) &&
    translateConfig.page.neverAutoTranslatePatterns.some((pattern) =>
      urlMatchesPattern(tabUrl, pattern),
    )

  const handleToggleTranslate = async () => {
    if (!tabId || isIgnoreTab) return
    const nextEnabled = !isPageTranslated
    setIsPageTranslated(nextEnabled)
    await sendMessage("tryToSetEnablePageTranslationByTabId", {
      tabId,
      enabled: nextEnabled,
      analyticsContext: nextEnabled
        ? createFeatureUsageContext(ANALYTICS_FEATURE.PAGE_TRANSLATION, ANALYTICS_SURFACE.POPUP)
        : undefined,
    })
    setTimeout(() => {
      if (tabId) void refreshTabStatus(tabId)
    }, 350)
  }

  const handleRetryFailed = async () => {
    if (!tabId || isRetrying) return
    setIsRetrying(true)
    try {
      await sendMessage("retryFailedPageTranslations", { tabId })
      await new Promise((r) => setTimeout(r, 300))
      await refreshTabStatus(tabId)
    } finally {
      setIsRetrying(false)
    }
  }

  const handleToggleSiteException = (exclude: boolean) => {
    if (!tabUrl || !hostname) return
    const current = translateConfig.page.neverAutoTranslatePatterns
    const hostPattern = sitePatternForHost(hostname)
    const nextPatterns = exclude
      ? current.some((p) => urlMatchesPattern(tabUrl, p))
        ? current
        : [...current, hostPattern]
      : current.filter((p) => !urlMatchesPattern(tabUrl, p))
    void setTranslateConfig({
      page: { ...translateConfig.page, neverAutoTranslatePatterns: nextPatterns },
    })
  }

  const engineLabel = getEngineLabel(translateConfig.providerId, providersConfig)
  const statusInfo = getDecisionLabel(
    translateConfig.page.smartAutoTranslate ?? true,
    isPageTranslated,
    decision,
  )
  const failedCount = diagnostics?.failedCount ?? 0

  return (
    <div className="flex flex-col bg-background text-foreground">
      <div className="flex flex-col gap-3.5 px-4 pt-4 pb-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight">智译蛙</span>
            <Badge variant="outline" className="text-[11px] font-normal">
              {engineLabel}
            </Badge>
          </div>
          <Badge variant="outline" className={`text-[11px] ${BADGE_CLASS_BY_TONE[statusInfo.tone]}`}>
            {statusInfo.text}
          </Badge>
        </div>

        <Button
          onClick={() => void handleToggleTranslate()}
          disabled={isIgnoreTab || tabId === null}
          variant={isPageTranslated ? "outline" : "default"}
          className="h-9 w-full font-medium"
        >
          <Icon
            icon={isPageTranslated ? "tabler:eye" : "tabler:language"}
            className="mr-1.5 size-4"
          />
          {isPageTranslated ? "显示原文" : "翻译当前网页"}
        </Button>

        <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-muted/60 p-1">
          <button
            type="button"
            className={`cursor-pointer rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
              translateConfig.mode === "bilingual"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => void setTranslateConfig({ mode: "bilingual" })}
          >
            双语对照
          </button>
          <button
            type="button"
            className={`cursor-pointer rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
              translateConfig.mode === "translationOnly"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => void setTranslateConfig({ mode: "translationOnly" })}
          >
            仅译文
          </button>
        </div>

        {failedCount > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                {failedCount} 处内容未完成翻译
              </span>
              {diagnostics?.inFlightCount ? (
                <span className="text-[11px] text-muted-foreground">正在处理…</span>
              ) : null}
            </div>
            {diagnostics?.lastErrorMessage && (
              <p className="line-clamp-2 text-[11px] text-muted-foreground">
                {diagnostics.lastErrorMessage}
              </p>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={isRetrying}
              onClick={() => void handleRetryFailed()}
              className="h-7 w-full text-xs"
            >
              <Icon icon="tabler:refresh" className="mr-1 size-3.5" />
              {isRetrying ? "正在重试…" : "重试未翻译内容"}
            </Button>
          </div>
        )}

        {!isIgnoreTab && hostname && (
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <span className="truncate text-xs text-muted-foreground" title={hostname}>
              不自动翻译此网站 ({hostname})
            </span>
            <Switch
              checked={isSiteExcluded}
              onCheckedChange={handleToggleSiteException}
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t bg-muted/40 px-3 py-2">
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
          onClick={() => {
            void openOptionsPage({ route: "/page-translation" })
          }}
        >
          <Icon icon="tabler:settings" className="size-3.5" />
          <span>设置</span>
        </button>
        <span className="text-[11px] text-muted-foreground">1.61.1-smart.3</span>
      </div>
    </div>
  )
}
