import { useAtom } from "jotai"
import { usePatternList } from "@/hooks/use-pattern-list"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { i18n } from "@/utils/i18n"
import { ConfigSection } from "../../components/config-section"
import { PageLayout } from "../../components/page-layout"
import { PatternsTable } from "../../components/patterns-table"

export function SiteExceptionsPage() {
  const [translateConfig, setTranslateConfig] = useAtom(configFieldsAtomMap.pageTranslation)
  const { addPattern, removePattern } = usePatternList(
    translateConfig.page.neverAutoTranslatePatterns,
    (neverAutoTranslatePatterns) => {
      void setTranslateConfig({
        page: { ...translateConfig.page, neverAutoTranslatePatterns },
      })
    },
  )

  return (
    <PageLayout
      title="网站例外"
      description="正常网页默认由智能决策算法自动判断，无需维护白名单。以下网站将始终跳过自动翻译。"
      innerClassName="flex flex-col gap-6"
    >
      <ConfigSection title="不自动翻译的网站">
        <div className="py-1">
          <PatternsTable
            patterns={translateConfig.page.neverAutoTranslatePatterns}
            onAddPattern={addPattern}
            onRemovePattern={removePattern}
            placeholderText={i18n.t(
              "options.translation.translationControl.neverAutoTranslateWebsite.enterUrlPattern",
            )}
            tableHeaderText={i18n.t(
              "options.translation.translationControl.neverAutoTranslateWebsite.urlPattern",
            )}
            rowsClassName="max-h-none"
          />
        </div>
      </ConfigSection>
    </PageLayout>
  )
}
