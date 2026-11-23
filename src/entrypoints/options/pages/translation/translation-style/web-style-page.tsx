import type { WebTranslationFontFamily } from "@/types/config/translate"
import { IconRotate } from "@tabler/icons-react"
import { useAtom } from "jotai"
import { useState } from "react"
import { DebouncedColorPicker } from "@/components/debounced-color-picker"
import { Button } from "@/components/ui/base-ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/base-ui/select"
import { SliderComfortable } from "@/components/ui/base-ui/slider"
import { Switch } from "@/components/ui/base-ui/switch"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { DEFAULT_TRANSLATION_NODE_STYLE } from "@/utils/constants/translation-node-style"
import { i18n } from "@/utils/i18n"
import { ConfigDetailSection } from "../../../components/config-detail-section"
import { ConfigItem } from "../../../components/config-item"
import { ConfigNavItem } from "../../../components/config-nav-item"
import { ConfigSection } from "../../../components/config-section"
import { PageLayout } from "../../../components/page-layout"
import { SELECT_CONTENT_PROPS } from "../../../components/select-content-props"
import { PresetStyleSelect } from "./preset-style-select"
import { StylePreview } from "./style-preview"

const FONT_FAMILY_OPTIONS: Array<{ value: WebTranslationFontFamily; label: string }> = [
  { value: "inherit", label: "跟随网页（默认）" },
  { value: "system", label: "系统界面字体" },
  { value: "sans", label: "无衬线 (PingFang / 微软雅黑)" },
  { value: "serif", label: "衬线字体 (宋体 / Serif)" },
  { value: "mono", label: "等宽字体 (Monospace)" },
]

export function WebTranslationStylePage() {
  const [translateConfig, setTranslateConfig] = useAtom(configFieldsAtomMap.pageTranslation)
  const style = translateConfig.translationNodeStyle

  const fontFamily = style.fontFamily ?? "inherit"
  const fontSizeScale = style.fontSizeScale ?? 100
  const paragraphSpacing = style.paragraphSpacing ?? 8
  const fontWeight = style.fontWeight ?? 400
  const lineHeight = style.lineHeight ?? 1.5
  const hasCustomColor = Boolean(style.color?.trim())

  const [draftFontSizeScale, setDraftFontSizeScale] = useState<number | null>(null)
  const [draftSpacing, setDraftSpacing] = useState<number | null>(null)
  const [draftFontWeight, setDraftFontWeight] = useState<number | null>(null)
  const [draftLineHeight, setDraftLineHeight] = useState<number | null>(null)

  const patchStyle = (patch: Partial<typeof style>) => {
    void setTranslateConfig({
      translationNodeStyle: {
        ...style,
        ...patch,
      },
    })
  }

  const handleResetDefaults = () => {
    setDraftFontSizeScale(null)
    setDraftSpacing(null)
    setDraftFontWeight(null)
    setDraftLineHeight(null)
    patchStyle({
      preset: DEFAULT_TRANSLATION_NODE_STYLE,
      isCustom: false,
      fontFamily: "inherit",
      fontSizeScale: 100,
      color: null,
      lineHeight: 1.5,
      fontWeight: 400,
      paragraphSpacing: 8,
    })
  }

  return (
    <PageLayout
      title={i18n.t("options.translation.title")}
      description="独立调整网页译文的排版与外观，不影响视频字幕样式。"
      innerClassName="flex flex-col gap-8"
    >
      <ConfigDetailSection
        backTo="/page-translation"
        title={
          <div className="flex w-full items-center justify-between gap-4">
            <span>网页译文外观</span>
            <Button variant="outline" size="sm" onClick={handleResetDefaults} className="gap-1.5">
              <IconRotate className="size-3.5" />
              恢复默认样式
            </Button>
          </div>
        }
      >
        <StylePreview />

        <ConfigSection title="基础排版">
          <ConfigItem
            title="显示风格预设"
            description="默认使用「无」以自然融入原网页配色，避免高饱和干扰阅读。"
          >
            <PresetStyleSelect />
          </ConfigItem>

          <ConfigItem title="译文字体" description="默认跟随原网页字体，也可指定统一阅读字体。">
            <Select
              value={fontFamily}
              onValueChange={(value) => {
                if (value) patchStyle({ fontFamily: value })
              }}
            >
              <SelectTrigger size="sm" className="min-w-44">
                <SelectValue>
                  {FONT_FAMILY_OPTIONS.find((item) => item.value === fontFamily)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent {...SELECT_CONTENT_PROPS}>
                <SelectGroup>
                  {FONT_FAMILY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </ConfigItem>

          <ConfigItem title="译文字号缩放" description="相对原段落字号的比例。">
            <div className="w-48">
              <SliderComfortable
                variant="scrubber"
                aria-label="译文字号缩放"
                min={75}
                max={150}
                step={5}
                value={draftFontSizeScale ?? fontSizeScale}
                onChange={setDraftFontSizeScale}
                onCommit={(value) => {
                  setDraftFontSizeScale(null)
                  patchStyle({ fontSizeScale: value })
                }}
                formatValue={(v) => `${v}%`}
              />
            </div>
          </ConfigItem>

          <ConfigItem
            title="文字颜色"
            description="默认跟随网页原有深浅色主题，需要区分时可开启自定义颜色。"
          >
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={!hasCustomColor}
                  onCheckedChange={(followPage) => {
                    patchStyle({ color: followPage ? null : "#374151" })
                  }}
                />
                跟随网页
              </label>
              {hasCustomColor && (
                <DebouncedColorPicker
                  value={style.color ?? "#374151"}
                  onCommit={(color) => patchStyle({ color })}
                  triggerClassName="h-8"
                />
              )}
            </div>
          </ConfigItem>

          <ConfigItem title="原文与译文间距" description="双语对照模式下译文段落的上下外边距。">
            <div className="w-48">
              <SliderComfortable
                variant="scrubber"
                aria-label="原文与译文间距"
                min={0}
                max={24}
                step={2}
                value={draftSpacing ?? paragraphSpacing}
                onChange={setDraftSpacing}
                onCommit={(value) => {
                  setDraftSpacing(null)
                  patchStyle({ paragraphSpacing: value })
                }}
                formatValue={(v) => `${v}px`}
              />
            </div>
          </ConfigItem>

          <ConfigItem title="字重" description="调整中文译文笔画粗细（默认 400）。">
            <div className="w-48">
              <SliderComfortable
                variant="scrubber"
                aria-label="字重"
                min={300}
                max={700}
                step={100}
                value={draftFontWeight ?? fontWeight}
                onChange={setDraftFontWeight}
                onCommit={(value) => {
                  setDraftFontWeight(null)
                  patchStyle({ fontWeight: value })
                }}
              />
            </div>
          </ConfigItem>

          <ConfigItem title="行高" description="调整多行译文的行间距（默认 1.5）。">
            <div className="w-48">
              <SliderComfortable
                variant="scrubber"
                aria-label="行高"
                min={11}
                max={24}
                step={1}
                value={draftLineHeight ?? Math.round(lineHeight * 10)}
                onChange={setDraftLineHeight}
                onCommit={(value) => {
                  setDraftLineHeight(null)
                  patchStyle({ lineHeight: Number((value / 10).toFixed(1)) })
                }}
                formatValue={(v) => (v / 10).toFixed(1)}
              />
            </div>
          </ConfigItem>
        </ConfigSection>

        <ConfigSection title="高级样式 (自定义 CSS)">
          <ConfigItem
            title={i18n.t("options.translation.translationStyle.useCustomStyle")}
            description={i18n.t("options.translation.translationStyle.useCustomStyleDescription")}
          >
            <Switch
              checked={style.isCustom}
              onCheckedChange={(isCustom) => {
                patchStyle({ isCustom })
              }}
            />
          </ConfigItem>
          <ConfigNavItem
            to="/page-translation/custom-css"
            title={i18n.t("options.translation.translationStyle.cssEditor")}
            description="编写并实时预览自定义 CSS 样式规则。"
          />
        </ConfigSection>
      </ConfigDetailSection>
    </PageLayout>
  )
}
