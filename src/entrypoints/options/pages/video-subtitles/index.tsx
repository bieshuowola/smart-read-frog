import type { SubtitlesDisplayMode } from "@/types/config/subtitles"
import { languageTagSchema } from "@read-frog/definitions"
import { deepmerge } from "deepmerge-ts"
import { useAtom } from "jotai"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/base-ui/select"
import { Switch } from "@/components/ui/base-ui/switch"
import { isAPIProviderConfig, isTranslateProviderConfig } from "@/types/config/provider"
import { subtitlesPlatformSchema } from "@/types/config/subtitles"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { i18n } from "@/utils/i18n"
import { getLanguageLabel } from "@/utils/language-labels"
import { cn } from "@/utils/styles/utils"
import { ConfigItem } from "../../components/config-item"
import { ConfigNavItem } from "../../components/config-nav-item"
import { ConfigSection } from "../../components/config-section"
import { InlineAPIProviderConfigCard } from "../../components/inline-api-provider-config"
import { PageLayout } from "../../components/page-layout"
import { SELECT_CONTENT_PROPS } from "../../components/select-content-props"
import { SubtitlesPlatformIcon } from "./preference/platform-icon"

const SUBTITLES_DISPLAY_MODES: Array<{ value: SubtitlesDisplayMode; label: string }> = [
  { value: "bilingual", label: "双语对照" },
  { value: "translationOnly", label: "仅译文" },
  { value: "originalOnly", label: "仅原文" },
]

export function VideoSubtitlesPage() {
  const [videoSubtitlesConfig, setVideoSubtitlesConfig] = useAtom(
    configFieldsAtomMap.videoSubtitles,
  )
  const [language, setLanguage] = useAtom(configFieldsAtomMap.language)
  const [providersConfig] = useAtom(configFieldsAtomMap.providersConfig)

  const selectableProviders = providersConfig.filter(
    (p) => p.enabled && isTranslateProviderConfig(p),
  )
  const selectedProvider = providersConfig.find((p) => p.id === videoSubtitlesConfig.providerId)
  const needsInlineProviderConfig = Boolean(
    selectedProvider && isAPIProviderConfig(selectedProvider),
  )

  const activePlatformsCount = subtitlesPlatformSchema.options.filter(
    (platform) => videoSubtitlesConfig.platforms[platform] !== "off",
  ).length

  const setAllPlatformsAuto = (enableAuto: boolean) => {
    const nextPlatforms = { ...videoSubtitlesConfig.platforms }
    for (const platform of subtitlesPlatformSchema.options) {
      nextPlatforms[platform] = enableAuto ? "auto" : "manual"
    }
    void setVideoSubtitlesConfig({ platforms: nextPlatforms })
  }

  return (
    <PageLayout
      title={i18n.t("options.videoSubtitles.title")}
      description="独立管理视频字幕翻译、支持网站、自动启动、目标语言与双语字幕外观。"
      innerClassName="flex flex-col gap-8"
    >
      <ConfigSection title="平台与自动启动">
        <ConfigNavItem
          to="/video-subtitles/sites"
          title={
            <span className="flex flex-wrap items-center gap-2">
              <span>支持网站与启动方式</span>
              <span className="flex items-center gap-1.5">
                {subtitlesPlatformSchema.options.map((platform) => (
                  <SubtitlesPlatformIcon
                    key={platform}
                    platform={platform}
                    className={cn(
                      "size-3.5",
                      videoSubtitlesConfig.platforms[platform] === "off" && "opacity-30 grayscale",
                    )}
                  />
                ))}
              </span>
            </span>
          }
          description={`已启用 ${activePlatformsCount}/${subtitlesPlatformSchema.options.length} 个视频平台（YouTube、Bilibili、Netflix、X 等），可逐站设为自动启动或手动开启。`}
        />

        <ConfigItem
          title="全平台字幕自动启动"
          description="开启后视频加载即自动启用字幕翻译；关闭后恢复为播放器内手动点击启动。"
        >
          <Switch
            checked={subtitlesPlatformSchema.options.every(
              (platform) => videoSubtitlesConfig.platforms[platform] === "auto",
            )}
            onCheckedChange={setAllPlatformsAuto}
          />
        </ConfigItem>

        <ConfigItem
          id="subtitles-ai-segmentation"
          title={i18n.t("options.videoSubtitles.preference.aiSegmentation.title")}
          description={i18n.t("options.videoSubtitles.preference.aiSegmentation.description")}
        >
          <Switch
            checked={videoSubtitlesConfig.aiSegmentation}
            onCheckedChange={(aiSegmentation) => {
              void setVideoSubtitlesConfig({ aiSegmentation })
            }}
          />
        </ConfigItem>

        <ConfigItem
          id="subtitles-pause-on-hover"
          title={i18n.t("options.videoSubtitles.preference.pauseOnHover.title")}
          description={i18n.t("options.videoSubtitles.preference.pauseOnHover.description")}
        >
          <Switch
            checked={videoSubtitlesConfig.pauseOnHover}
            onCheckedChange={(pauseOnHover) => {
              void setVideoSubtitlesConfig({ pauseOnHover })
            }}
          />
        </ConfigItem>
      </ConfigSection>

      <ConfigSection title="字幕翻译引擎与显示">
        <ConfigItem
          id="subtitles-provider"
          title="字幕翻译引擎"
          description="独立于网页翻译主引擎，支持微软翻译、Google 翻译及各类 AI 模型。"
        >
          <Select
            value={videoSubtitlesConfig.providerId}
            onValueChange={(nextId) => {
              if (!nextId) return
              void setVideoSubtitlesConfig({ providerId: nextId })
            }}
          >
            <SelectTrigger size="sm" className="min-w-48">
              <SelectValue>
                {selectedProvider?.name ?? videoSubtitlesConfig.providerId}
              </SelectValue>
            </SelectTrigger>
            <SelectContent {...SELECT_CONTENT_PROPS}>
              <SelectGroup>
                {selectableProviders.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </ConfigItem>

        <ConfigItem
          id="subtitles-target-language"
          title="目标语言"
          description="字幕翻译的目标输出语言（默认简体中文）。"
        >
          <Select
            value={language.targetCode}
            onValueChange={(nextCode) => {
              if (!nextCode) return
              void setLanguage({ targetCode: nextCode })
            }}
          >
            <SelectTrigger size="sm" className="min-w-48">
              <SelectValue>{getLanguageLabel(language.targetCode)}</SelectValue>
            </SelectTrigger>
            <SelectContent {...SELECT_CONTENT_PROPS}>
              <SelectGroup>
                {languageTagSchema.options.map((code) => (
                  <SelectItem key={code} value={code}>
                    {getLanguageLabel(code)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </ConfigItem>

        <ConfigItem
          id="subtitles-display-mode"
          title="字幕显示模式"
          description="设置播放器上字幕的默认展示方式。"
        >
          <Select
            value={videoSubtitlesConfig.style.displayMode}
            onValueChange={(nextMode) => {
              if (!nextMode) return
              void setVideoSubtitlesConfig(
                deepmerge(videoSubtitlesConfig, {
                  style: { displayMode: nextMode },
                }),
              )
            }}
          >
            <SelectTrigger size="sm" className="min-w-40">
              <SelectValue>
                {
                  SUBTITLES_DISPLAY_MODES.find(
                    (m) => m.value === videoSubtitlesConfig.style.displayMode,
                  )?.label
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent {...SELECT_CONTENT_PROPS}>
              <SelectGroup>
                {SUBTITLES_DISPLAY_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </ConfigItem>
      </ConfigSection>

      {needsInlineProviderConfig && selectedProvider && (
        <InlineAPIProviderConfigCard
          providerId={selectedProvider.id}
          title={`${selectedProvider.name} 字幕模型与密钥`}
          description="所选字幕引擎需要配置对应的接口凭据或模型，保存在本地安全存储中。"
        />
      )}

      <ConfigSection title="视频字幕外观">
        <ConfigNavItem
          to="/video-subtitles/style"
          title="字幕样式与自定义 CSS"
          description="独立设置原文/译文字体、字号缩放、字重、颜色、位置、上下排列、背景透明度与实时预览。"
        />
      </ConfigSection>
    </PageLayout>
  )
}
