import { useAtom, useAtomValue } from "jotai"
import { ArrowDown, ArrowUp } from "lucide-react"
import { useMemo } from "react"
import { Badge } from "@/components/ui/base-ui/badge"
import { Button } from "@/components/ui/base-ui/button"
import { Switch } from "@/components/ui/base-ui/switch"
import { configAtom, configFieldsAtomMap } from "@/utils/atoms/config"
import { getLLMProvidersConfig } from "@/utils/config/helpers"
import { i18n } from "@/utils/i18n"
import { isProviderReadyForFailover } from "@/utils/smart-translate/ai-failover"
import { ConfigItem } from "../../components/config-item"
import { ConfigSection } from "../../components/config-section"

export function FailoverChainConfig() {
  const config = useAtomValue(configAtom)
  const [translateConfig, setTranslateConfig] = useAtom(configFieldsAtomMap.pageTranslation)

  const primaryId = translateConfig.providerId
  const fallbackIds = useMemo(
    () => translateConfig.fallbackProviderIds ?? [],
    [translateConfig.fallbackProviderIds],
  )
  const enabledLLMProviders = useMemo(
    () => getLLMProvidersConfig(config.providersConfig).filter((provider) => provider.enabled),
    [config.providersConfig],
  )

  const backupCandidates = useMemo(() => {
    const nonPrimary = enabledLLMProviders.filter((provider) => provider.id !== primaryId)
    const fallbackOrder = new Map(fallbackIds.map((id, index) => [id, index]))

    return [...nonPrimary].sort((a, b) => {
      const rankA = fallbackOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER
      const rankB = fallbackOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER
      return rankA - rankB
    })
  }, [enabledLLMProviders, fallbackIds, primaryId])

  const updateFallbackIds = (nextIds: string[]) => {
    void setTranslateConfig({
      fallbackProviderIds: nextIds,
    })
  }

  const toggleFallback = (providerId: string, enabled: boolean) => {
    const cleanCurrent = fallbackIds.filter((id) => id !== primaryId)
    if (enabled) {
      if (!cleanCurrent.includes(providerId)) {
        updateFallbackIds([...cleanCurrent, providerId])
      }
      return
    }
    updateFallbackIds(cleanCurrent.filter((id) => id !== providerId))
  }

  const moveFallback = (providerId: string, direction: -1 | 1) => {
    const active = fallbackIds.filter((id) => id !== primaryId)
    const currentIndex = active.indexOf(providerId)
    if (currentIndex === -1) return
    const nextIndex = currentIndex + direction
    if (nextIndex < 0 || nextIndex >= active.length) return
    const next = [...active]
    const [item] = next.splice(currentIndex, 1)
    if (item) {
      next.splice(nextIndex, 0, item)
      updateFallbackIds(next)
    }
  }

  const primaryProvider = enabledLLMProviders.find((p) => p.id === primaryId)

  return (
    <ConfigSection title={i18n.t("options.apiProviders.failover.title")}>
      <p className="text-muted-foreground text-xs leading-relaxed">
        {i18n.t("options.apiProviders.failover.description")}
      </p>
      {primaryProvider && (
        <ConfigItem
          title={
            <span className="flex items-center gap-2">
              {primaryProvider.name}
              <Badge variant="default">{i18n.t("options.apiProviders.failover.primaryBadge")}</Badge>
            </span>
          }
          description={primaryProvider.model.customModel ?? primaryProvider.model.model}
        >
          <Badge
            variant="outline"
            className={
              isProviderReadyForFailover(primaryProvider)
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            }
          >
            {isProviderReadyForFailover(primaryProvider)
              ? i18n.t("options.apiProviders.failover.readyBadge")
              : i18n.t("options.apiProviders.failover.missingKeyBadge")}
          </Badge>
        </ConfigItem>
      )}

      <div className="flex flex-col gap-2">
        {backupCandidates.map((provider) => {
          const isSelected = fallbackIds.includes(provider.id)
          const activeIndex = fallbackIds.filter((id) => id !== primaryId).indexOf(provider.id)
          const totalActive = fallbackIds.filter((id) => id !== primaryId).length
          const ready = isProviderReadyForFailover(provider)

          return (
            <div
              key={provider.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{provider.name}</span>
                  <Badge
                    variant="outline"
                    className={
                      ready
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border-muted-foreground/25 text-muted-foreground"
                    }
                  >
                    {ready
                      ? i18n.t("options.apiProviders.failover.readyBadge")
                      : i18n.t("options.apiProviders.failover.missingKeyBadge")}
                  </Badge>
                </div>
                <span className="text-muted-foreground truncate text-xs">
                  {provider.model.customModel ?? provider.model.model}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {isSelected && (
                  <>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      disabled={activeIndex <= 0}
                      aria-label={i18n.t("options.apiProviders.failover.moveUp")}
                      onClick={() => moveFallback(provider.id, -1)}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      disabled={activeIndex === -1 || activeIndex >= totalActive - 1}
                      aria-label={i18n.t("options.apiProviders.failover.moveDown")}
                      onClick={() => moveFallback(provider.id, 1)}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                  </>
                )}
                <Switch
                  checked={isSelected}
                  onCheckedChange={(checked) => toggleFallback(provider.id, checked)}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="bg-muted/40 text-muted-foreground flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-xs leading-relaxed">
        <p>{i18n.t("options.apiProviders.failover.freeTierHint")}</p>
        <p>{i18n.t("options.apiProviders.failover.securityBoundaryHint")}</p>
      </div>
    </ConfigSection>
  )
}
