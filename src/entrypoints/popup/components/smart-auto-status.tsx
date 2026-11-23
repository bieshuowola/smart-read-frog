import type { TabSmartDecisionState } from "@/utils/smart-translate/types"
import { useAtom, useAtomValue } from "jotai"
import { useEffect, useState } from "react"
import { browser } from "#imports"
import { HelpTooltip } from "@/components/help-tooltip"
import { Badge } from "@/components/ui/base-ui/badge"
import { Button } from "@/components/ui/base-ui/button"
import { Switch } from "@/components/ui/base-ui/switch"
import { configAtom, configFieldsAtomMap } from "@/utils/atoms/config"
import { i18n } from "@/utils/i18n"
import { onMessage, sendMessage } from "@/utils/message"
import { hasAnyConfiguredLLMProvider } from "@/utils/smart-translate/ai-failover"

type BadgeMeta = {
  label: string
  className: string
}

function resolveStatusMeta(
  smartEnabled: boolean,
  decision: TabSmartDecisionState | null,
): BadgeMeta {
  if (!smartEnabled) {
    return {
      label: i18n.t("popup.smartAuto.disabled"),
      className: "bg-muted text-muted-foreground border-transparent",
    }
  }
  if (decision?.userSuppressed || decision?.reason === "user_suppressed") {
    return {
      label: i18n.t("popup.smartAuto.userSuppressed"),
      className: "bg-muted text-muted-foreground border-transparent",
    }
  }
  switch (decision?.mode) {
    case "full-auto":
      return {
        label: i18n.t("popup.smartAuto.fullAuto"),
        className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
      }
    case "partial-auto":
      return {
        label: i18n.t("popup.smartAuto.partialAuto"),
        className: "bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/25",
      }
    case "privacy-blocked":
      return {
        label: i18n.t("popup.smartAuto.privacyBlocked"),
        className: "bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/25",
      }
    case "skip":
    default:
      return {
        label: i18n.t("popup.smartAuto.skippedChinese"),
        className: "bg-muted text-muted-foreground border-transparent",
      }
  }
}

export function SmartAutoStatus() {
  const config = useAtomValue(configAtom)
  const [translateConfig, setTranslateConfig] = useAtom(configFieldsAtomMap.pageTranslation)
  const [decision, setDecision] = useState<TabSmartDecisionState | null>(null)
  const [activeTabUrl, setActiveTabUrl] = useState<string | null>(null)

  const smartAutoEnabled = translateConfig.page.smartAutoTranslate ?? true
  const hasReadyLLM = hasAnyConfiguredLLMProvider(config)

  useEffect(() => {
    let active = true

    const loadInitial = async () => {
      try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
        if (!active || !tab?.id) return
        setActiveTabUrl(tab.url ?? null)
        const state = await sendMessage("getSmartPageDecision", { tabId: tab.id })
        if (active && state) {
          setDecision(state)
        }
      } catch {
        // Ignore transient popup close / tab query errors
      }
    }

    void loadInitial()

    const unsubscribe = onMessage("smartPageDecisionChanged", ({ data }) => {
      if (!active || !data.decision) return
      if (activeTabUrl && data.decision.url !== activeTabUrl) return
      setDecision(data.decision)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [activeTabUrl])

  const statusMeta = resolveStatusMeta(smartAutoEnabled, decision)

  return (
    <div className="bg-muted/40 flex flex-col gap-2 rounded-lg border px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[13px] font-medium">
          {i18n.t("popup.smartAuto.title")}
          <HelpTooltip>{i18n.t("popup.smartAuto.description")}</HelpTooltip>
        </span>
        <Switch
          checked={smartAutoEnabled}
          onCheckedChange={(checked) => {
            void setTranslateConfig({
              page: {
                ...translateConfig.page,
                smartAutoTranslate: checked,
              },
            })
          }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <Badge variant="outline" className={statusMeta.className}>
          {statusMeta.label}
        </Badge>
        {!hasReadyLLM && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-0 text-xs text-amber-600 dark:text-amber-400"
            onClick={() => {
              void sendMessage("openOptionsPage", { route: "/api-providers" })
            }}
          >
            {i18n.t("popup.smartAuto.openProviders")}
          </Button>
        )}
      </div>
    </div>
  )
}
