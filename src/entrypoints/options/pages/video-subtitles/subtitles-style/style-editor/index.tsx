import { IconRotate } from "@tabler/icons-react"
import { deepmerge } from "deepmerge-ts"
import { useAtom } from "jotai"
import { Button } from "@/components/ui/base-ui/button"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import {
  DEFAULT_BACKGROUND_OPACITY,
  DEFAULT_DISPLAY_MODE,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SCALE,
  DEFAULT_FONT_WEIGHT,
  DEFAULT_SUBTITLE_COLOR,
  DEFAULT_TRANSLATION_POSITION,
} from "@/utils/constants/subtitles"
import { i18n } from "@/utils/i18n"
import { ConfigDetailSection } from "../../../../components/config-detail-section"
import { ConfigNavItem } from "../../../../components/config-nav-item"
import { PageLayout } from "../../../../components/page-layout"
import { GeneralSettings } from "./general-settings"
import { MainSubtitlesStyle } from "./main-subtitles-style"
import { SubtitlesPreview } from "./subtitles-preview"
import { TranslationSubtitlesStyle } from "./translation-subtitles-style"

/**
 * The subtitle style editor, drilled into from the Video Subtitles page: a live preview above
 * three panels — the layout, and one for each of the two lines.
 */
export function SubtitlesStylePage() {
  const [videoSubtitlesConfig, setVideoSubtitlesConfig] = useAtom(
    configFieldsAtomMap.videoSubtitles,
  )

  const handleResetAllSubtitlesStyle = () => {
    void setVideoSubtitlesConfig(
      deepmerge(videoSubtitlesConfig, {
        style: {
          displayMode: DEFAULT_DISPLAY_MODE,
          translationPosition: DEFAULT_TRANSLATION_POSITION,
          main: {
            fontFamily: DEFAULT_FONT_FAMILY,
            fontScale: DEFAULT_FONT_SCALE,
            color: DEFAULT_SUBTITLE_COLOR,
            fontWeight: DEFAULT_FONT_WEIGHT,
          },
          translation: {
            fontFamily: DEFAULT_FONT_FAMILY,
            fontScale: DEFAULT_FONT_SCALE,
            color: DEFAULT_SUBTITLE_COLOR,
            fontWeight: DEFAULT_FONT_WEIGHT,
          },
          container: {
            backgroundOpacity: DEFAULT_BACKGROUND_OPACITY,
          },
          customCSS: null,
        },
      }),
    )
  }

  return (
    <PageLayout
      title={i18n.t("options.videoSubtitles.title")}
      description={i18n.t("options.videoSubtitles.pageDescription")}
    >
      <ConfigDetailSection
        backTo="/video-subtitles"
        title={
          <div className="flex w-full items-center justify-between gap-4">
            <span id="subtitles-style">{i18n.t("options.videoSubtitles.style.title")}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetAllSubtitlesStyle}
              className="gap-1.5"
            >
              <IconRotate className="size-3.5" />
              恢复默认样式
            </Button>
          </div>
        }
      >
        <SubtitlesPreview />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <GeneralSettings />
          <MainSubtitlesStyle />
          <TranslationSubtitlesStyle />
        </div>
        <ConfigNavItem
          to="/video-subtitles/style/custom-css"
          title={i18n.t("options.videoSubtitles.style.customCSS.title")}
          description={i18n.t("options.videoSubtitles.style.customCSS.description")}
        />
      </ConfigDetailSection>
    </PageLayout>
  )
}
