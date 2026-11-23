import { useAtom, useAtomValue } from "jotai"
import { useState } from "react"
import { Button } from "@/components/ui/base-ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/base-ui/select"
import { Switch } from "@/components/ui/base-ui/switch"
import { toastManager } from "@/components/ui/base-ui/toast"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import {
  DEFAULT_PROVIDER_CONFIG,
  GOOGLE_TRANSLATE_PROVIDER_ID,
  MICROSOFT_TRANSLATE_PROVIDER_ID,
} from "@/utils/constants/providers"
import { i18n } from "@/utils/i18n"
import { sendMessage } from "@/utils/message"
import { ConfigItem } from "../../components/config-item"
import { ConfigNavItem } from "../../components/config-nav-item"
import { ConfigSection } from "../../components/config-section"
import { InlineAPIProviderConfigCard } from "../../components/inline-api-provider-config"
import { PageLayout } from "../../components/page-layout"
import { SELECT_CONTENT_PROPS } from "../../components/select-content-props"
import { TranslationModeSelect } from "./preference/translation-mode-select"

const GEMINI_DEFAULT_ID = DEFAULT_PROVIDER_CONFIG.google.id

const WEB_TRANSLATION_ENGINE_OPTIONS = [
  { id: MICROSOFT_TRANSLATE_PROVIDER_ID, label: "微软翻译（默认，极速）" },
  { id: GOOGLE_TRANSLATE_PROVIDER_ID, label: "Google 翻译" },
  { id: GEMINI_DEFAULT_ID, label: "Gemini AI" },
] as const

function describeStyleSummary(style: {
  isCustom: boolean
  preset: string
  fontSizeScale?: number
  color?: string | null
}): string {
  if (style.isCustom) return "已启用自定义 CSS"
  const parts: string[] = []
  parts.push(
    style.preset === "default"
      ? "风格：无（自然继承）"
      : `风格：${i18n.t(`options.translation.translationStyle.style.${style.preset}` as never)}`,
  )
  parts.push(`字号 ${style.fontSizeScale ?? 100}%`)
  parts.push(style.color ? "自定义颜色" : "颜色跟随网页")
  return parts.join(" · ")
}

export function TranslationPage() {
  const [translateConfig, setTranslateConfig] = useAtom(configFieldsAtomMap.pageTranslation)
  const [providersConfig, setProvidersConfig] = useAtom(configFieldsAtomMap.providersConfig)
  const language = useAtomValue(configFieldsAtomMap.language)
  const [isClearingCache, setIsClearingCache] = useState(false)

  const currentProviderId = translateConfig.providerId
  const isMicrosoft = currentProviderId === MICROSOFT_TRANSLATE_PROVIDER_ID
  const isGemini =
    currentProviderId === GEMINI_DEFAULT_ID ||
    providersConfig.find((p) => p.id === currentProviderId)?.provider === "google"

  const selectedProviderEntry = providersConfig.find((p) => p.id === currentProviderId)
  const knownOption = WEB_TRANSLATION_ENGINE_OPTIONS.find((opt) => opt.id === currentProviderId)

  const handleEngineChange = (nextId: string | null) => {
    if (!nextId) return
    if (nextId === GEMINI_DEFAULT_ID && !providersConfig.some((p) => p.id === GEMINI_DEFAULT_ID)) {
      void setProvidersConfig([...providersConfig, structuredClone(DEFAULT_PROVIDER_CONFIG.google)])
    }
    void setTranslateConfig({ providerId: nextId })
  }

  const handleClearCache = async () => {
    setIsClearingCache(true)
    try {
      await sendMessage("clearAllTranslationRelatedCache")
      toastManager.add({ type: "success", title: "已清空翻译缓存" })
    } catch {
      toastManager.add({ type: "error", title: "清空缓存失败" })
    } finally {
      setIsClearingCache(false)
    }
  }

  const engineLabel =
    knownOption?.label ?? selectedProviderEntry?.name ?? currentProviderId

  return (
    <PageLayout
      title="网页翻译"
      description="围绕智能翻译决策与极速阅读体验优化，打开外语网页即可自然阅读中文。"
      innerClassName="flex flex-col gap-8"
    >
      <ConfigSection title="翻译核心">
        <ConfigItem
          id="smart-auto-translate"
          title="智能自动翻译"
          description="自动识别外语页面与中文页中的独立外语段落，跳过中文正文、代码与专业术语。"
        >
          <Switch
            checked={translateConfig.page.smartAutoTranslate}
            onCheckedChange={(smartAutoTranslate) => {
              void setTranslateConfig({
                page: { ...translateConfig.page, smartAutoTranslate },
              })
            }}
          />
        </ConfigItem>

        <ConfigItem
          id="webpage-translation-engine"
          title="翻译引擎"
          description="默认使用微软翻译，兼顾首屏响应速度与译文质量；可选 Google 或 Gemini AI。"
        >
          <Select value={currentProviderId} onValueChange={handleEngineChange}>
            <SelectTrigger size="sm" className="min-w-48">
              <SelectValue>{engineLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent {...SELECT_CONTENT_PROPS}>
              <SelectGroup>
                {WEB_TRANSLATION_ENGINE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.label}
                  </SelectItem>
                ))}
                {!knownOption && selectedProviderEntry && (
                  <SelectItem value={selectedProviderEntry.id}>
                    {selectedProviderEntry.name}
                  </SelectItem>
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
        </ConfigItem>

        <ConfigItem
          id="translation-mode"
          title="显示模式"
          description="正文自动采用自然双语或仅译文；按钮、导航、菜单等紧凑控件保持原位防挤压。"
        >
          <TranslationModeSelect />
        </ConfigItem>

        {isMicrosoft && (
          <ConfigItem
            id="microsoft-google-fallback"
            title="备用翻译：微软不可用时尝试 Google 翻译"
            description="默认关闭。开启后仅在微软接口请求失败时自动尝试 Google 翻译，绝不调用付费服务。"
          >
            <Switch
              checked={translateConfig.microsoftGoogleFallback ?? false}
              onCheckedChange={(microsoftGoogleFallback) => {
                void setTranslateConfig({ microsoftGoogleFallback })
              }}
            />
          </ConfigItem>
        )}
      </ConfigSection>

      {isGemini && (
        <InlineAPIProviderConfigCard
          providerId={
            providersConfig.some((p) => p.id === currentProviderId)
              ? currentProviderId
              : GEMINI_DEFAULT_ID
          }
          title="Gemini AI 配置"
          description="已保存的 API Key 与模型设置会自动保留；仅切换为 Gemini 时用于网页翻译。"
        />
      )}

      <ConfigSection title="网页译文外观">
        <ConfigNavItem
          to="/page-translation/style"
          title="译文外观与自定义 CSS"
          description={describeStyleSummary(translateConfig.translationNodeStyle)}
        />
      </ConfigSection>

      <ConfigSection title="运行状态">
        <ConfigItem
          title="目标语言与恢复策略"
          description={`默认译为 ${language.targetCode === "zh-Hans" ? "简体中文 (zh-Hans)" : language.targetCode}；遇临时失败自动有限重试，异常内容不干扰正文，可在扩展弹窗一键重试未翻译项。`}
        >
          <Button
            variant="outline"
            size="sm"
            disabled={isClearingCache}
            onClick={() => void handleClearCache()}
          >
            {isClearingCache ? "清空中…" : "清空缓存"}
          </Button>
        </ConfigItem>
      </ConfigSection>
    </PageLayout>
  )
}
