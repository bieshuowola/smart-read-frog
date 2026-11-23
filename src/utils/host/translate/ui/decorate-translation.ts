import type { TranslationNodeStyleConfig, WebTranslationFontFamily } from "@/types/config/translate"
import { camelCase } from "case-anything"
import { translationNodeStylePresetSchema } from "@/types/config/translate"
import { CUSTOM_TRANSLATION_NODE_ATTRIBUTE } from "@/utils/constants/translation-node-style"
import { getCurrentBlockContextMode } from "@/utils/smart-translate/page-mode-context"
import { getContainingShadowRoot, getOwnerDocument } from "../../dom/node"
import { clearCustomCSS, ensureCustomCSS, ensurePresetStyles } from "./style-injector"

const customTranslationNodeAttribute = camelCase(CUSTOM_TRANSLATION_NODE_ATTRIBUTE)

const COMPACT_UI_ANCESTOR_SELECTOR =
  'button, nav, header, menu, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="navigation"], [role="menubar"], [role="tablist"], [role="toolbar"]'

const WEB_FONT_FAMILY_MAP: Record<Exclude<WebTranslationFontFamily, "inherit">, string> = {
  system:
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif',
  sans: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", "Segoe UI", Helvetica, Arial, sans-serif',
  serif: '"Noto Serif SC", "Songti SC", "SimSun", Georgia, serif',
  mono: '"JetBrains Mono", "Cascadia Mono", Consolas, "Microsoft YaHei", monospace',
}

function applyTypographyVariables(
  translatedNode: HTMLElement,
  styleConfig: TranslationNodeStyleConfig,
): void {
  const { fontFamily, fontSizeScale, color, lineHeight, fontWeight, paragraphSpacing } = styleConfig

  if (fontFamily && fontFamily !== "inherit") {
    translatedNode.style.setProperty("--rf-web-font-family", WEB_FONT_FAMILY_MAP[fontFamily])
  } else {
    translatedNode.style.removeProperty("--rf-web-font-family")
  }

  if (fontSizeScale !== undefined && fontSizeScale !== 100) {
    translatedNode.style.setProperty("--rf-web-font-size", `${fontSizeScale}%`)
  } else {
    translatedNode.style.removeProperty("--rf-web-font-size")
  }

  if (color?.trim()) {
    translatedNode.style.setProperty("--rf-web-color", color.trim())
  } else {
    translatedNode.style.removeProperty("--rf-web-color")
  }

  if (lineHeight !== undefined) {
    translatedNode.style.setProperty("--rf-web-line-height", String(lineHeight))
  } else {
    translatedNode.style.removeProperty("--rf-web-line-height")
  }

  if (fontWeight !== undefined && fontWeight !== 400) {
    translatedNode.style.setProperty("--rf-web-font-weight", String(fontWeight))
  } else {
    translatedNode.style.removeProperty("--rf-web-font-weight")
  }

  if (paragraphSpacing !== undefined && paragraphSpacing !== 8) {
    translatedNode.style.setProperty("--rf-web-spacing", `${paragraphSpacing}px`)
  } else {
    translatedNode.style.removeProperty("--rf-web-spacing")
  }
}

export async function decorateTranslationNode(
  translatedNode: HTMLElement,
  styleConfig: TranslationNodeStyleConfig,
): Promise<void> {
  if (translationNodeStylePresetSchema.safeParse(styleConfig.preset).error) return

  // The node's own document rather than the ambient one: on a real page the two are the same, but
  // the options page previews this inside an iframe, and the styling has to land in the frame that
  // holds the node instead of on the settings page around it.
  const ownerDoc = getOwnerDocument(translatedNode)
  const root = getContainingShadowRoot(translatedNode) ?? ownerDoc
  const isPartialAuto = getCurrentBlockContextMode(ownerDoc.location?.href) === "partial-auto"
  const isInsideCompactUI =
    typeof translatedNode.closest === "function" &&
    Boolean(translatedNode.closest(COMPACT_UI_ANCESTOR_SELECTOR))

  if (isPartialAuto && !isInsideCompactUI) {
    translatedNode.dataset.readFrogPartialTranslation = "true"
  } else {
    delete translatedNode.dataset.readFrogPartialTranslation
  }

  applyTypographyVariables(translatedNode, styleConfig)

  if (styleConfig.isCustom && styleConfig.customCSS) {
    translatedNode.dataset[customTranslationNodeAttribute] = "custom"
    await ensureCustomCSS(root, styleConfig.customCSS)
    return
  }

  translatedNode.dataset[customTranslationNodeAttribute] = styleConfig.preset
  ensurePresetStyles(root)
  // The attribute alone is not enough to go back to a preset: custom CSS from an earlier call is
  // still adopted on this root, and anything the preset does not set — `border` sets no colour, for
  // one — is still wearing it.
  await clearCustomCSS(root)
}
