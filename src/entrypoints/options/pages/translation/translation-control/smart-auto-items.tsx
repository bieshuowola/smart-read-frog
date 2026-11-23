import { useAtom } from "jotai"
import { Switch } from "@/components/ui/base-ui/switch"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { i18n } from "@/utils/i18n"
import { ConfigItem } from "../../../components/config-item"

export function SmartAutoControlItems() {
  const [translateConfig, setTranslateConfig] = useAtom(configFieldsAtomMap.pageTranslation)
  const smartAutoTranslate = translateConfig.page.smartAutoTranslate ?? true
  const privacyGuardEnabled = translateConfig.page.privacyGuardEnabled ?? true

  return (
    <>
      <ConfigItem
        id="smart-auto-translate-toggle"
        title={i18n.t("options.translation.smartAuto.enabledTitle")}
        description={i18n.t("options.translation.smartAuto.enabledDescription")}
      >
        <Switch
          checked={smartAutoTranslate}
          onCheckedChange={(checked) => {
            void setTranslateConfig({
              page: {
                ...translateConfig.page,
                smartAutoTranslate: checked,
              },
            })
          }}
        />
      </ConfigItem>

      <ConfigItem
        id="privacy-guard-toggle"
        title={i18n.t("options.translation.smartAuto.privacyGuardTitle")}
        description={i18n.t("options.translation.smartAuto.privacyGuardDescription")}
      >
        <Switch
          checked={privacyGuardEnabled}
          onCheckedChange={(checked) => {
            void setTranslateConfig({
              page: {
                ...translateConfig.page,
                privacyGuardEnabled: checked,
              },
            })
          }}
        />
      </ConfigItem>
    </>
  )
}
