import type { APIProviderConfig, LLMProviderConfig } from "@/types/config/provider"
import { IconEye, IconEyeOff } from "@tabler/icons-react"
import { useAtomValue, useSetAtom } from "jotai"
import { useState } from "react"
import { Button } from "@/components/ui/base-ui/button"
import { Card } from "@/components/ui/base-ui/card"
import { Field, FieldLabel } from "@/components/ui/base-ui/field"
import { Input } from "@/components/ui/base-ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/base-ui/select"
import { Switch } from "@/components/ui/base-ui/switch"
import { isAPIProviderConfig, isLLMProviderConfig } from "@/types/config/provider"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { patchProviderConfigAtom } from "@/utils/atoms/entity-config"
import { LLM_PROVIDER_MODELS } from "@/utils/constants/models"
import { PROVIDER_ITEMS, PROVIDER_URL_PLACEHOLDERS } from "@/utils/constants/providers"
import { ConnectionTestButton } from "../pages/api-providers/providers-config/provider-config-form/components/connection-button"
import { SELECT_CONTENT_PROPS } from "./select-content-props"

/**
 * Compact inline editor for an API/LLM provider's key, optional base URL, and model.
 * Keeps existing credentials intact and updates only the targeted provider entry.
 */
export function InlineAPIProviderConfigCard({
  providerId,
  title,
  description,
}: {
  providerId: string
  title?: string
  description?: string
}) {
  const providersConfig = useAtomValue(configFieldsAtomMap.providersConfig)
  const patchProvider = useSetAtom(patchProviderConfigAtom)
  const providerConfig = providersConfig.find((item) => item.id === providerId)

  const [showKey, setShowKey] = useState(false)
  const [apiKeyDraft, setApiKeyDraft] = useState<string | null>(null)
  const [baseUrlDraft, setBaseUrlDraft] = useState<string | null>(null)
  const [customModelDraft, setCustomModelDraft] = useState<string | null>(null)

  if (!providerConfig || !isAPIProviderConfig(providerConfig)) {
    return null
  }

  const storedApiKey = providerConfig.apiKey ?? ""
  const storedBaseUrl = "baseURL" in providerConfig ? (providerConfig.baseURL ?? "") : ""
  const isLLM = isLLMProviderConfig(providerConfig)
  const storedCustomModel = isLLM ? (providerConfig.model.customModel ?? "") : ""

  const apiKeyValue = apiKeyDraft ?? storedApiKey
  const baseUrlValue = baseUrlDraft ?? storedBaseUrl
  const customModelValue = customModelDraft ?? storedCustomModel

  const providerMeta = PROVIDER_ITEMS[providerConfig.provider]
  const supportsCustomEndpoint =
    providerConfig.provider === "ollama" ||
    providerConfig.provider === "openai-compatible" ||
    "baseURL" in providerConfig
  const urlPlaceholder = PROVIDER_URL_PLACEHOLDERS[providerConfig.provider]

  const commitPatch = (changes: Partial<APIProviderConfig>) => {
    void patchProvider({ id: providerConfig.id, changes })
  }

  const availableModels = isLLM
    ? (LLM_PROVIDER_MODELS[providerConfig.provider] ?? [])
    : []
  const isCustomOnly =
    providerConfig.provider === "openai-compatible" || providerConfig.provider === "open-responses"

  return (
    <Card className="flex flex-col gap-4 rounded-xl border bg-card/70 p-4 shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <div className="text-sm font-medium">
            {title ?? `${providerMeta?.name ?? providerConfig.name} 配置`}
          </div>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {providerMeta?.apiKeyUrl && (
            <a
              href={providerMeta.apiKeyUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary hover:underline"
            >
              获取 API Key
            </a>
          )}
          <ConnectionTestButton providerConfig={providerConfig} />
        </div>
      </div>

      {providerConfig.provider !== "ollama" && (
        <Field>
          <FieldLabel htmlFor={`inline-apikey-${providerConfig.id}`}>API Key</FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              id={`inline-apikey-${providerConfig.id}`}
              type={showKey ? "text" : "password"}
              value={apiKeyValue}
              placeholder="输入 API Key（仅保存在本地扩展配置中）"
              onChange={(e) => setApiKeyDraft(e.target.value)}
              onBlur={() => {
                if (apiKeyDraft !== null && apiKeyDraft !== storedApiKey) {
                  commitPatch({ apiKey: apiKeyDraft })
                }
                setApiKeyDraft(null)
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}
              onClick={() => setShowKey((prev) => !prev)}
            >
              {showKey ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
            </Button>
          </div>
        </Field>
      )}

      {supportsCustomEndpoint && (
        <Field>
          <FieldLabel htmlFor={`inline-baseurl-${providerConfig.id}`}>接口地址 (Base URL)</FieldLabel>
          <Input
            id={`inline-baseurl-${providerConfig.id}`}
            type="url"
            value={baseUrlValue}
            placeholder={urlPlaceholder ?? "https://..."}
            onChange={(e) => setBaseUrlDraft(e.target.value)}
            onBlur={() => {
              if (baseUrlDraft !== null && baseUrlDraft.trim() !== storedBaseUrl) {
                commitPatch({ baseURL: baseUrlDraft.trim() || undefined })
              }
              setBaseUrlDraft(null)
            }}
          />
        </Field>
      )}

      {isLLM && (
        <div className="flex flex-col gap-3">
          {!isCustomOnly && availableModels.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">模型</span>
                <span className="text-xs text-muted-foreground">选择预设模型或切换为自定义模型 ID</span>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                  <Switch
                    checked={providerConfig.model.isCustomModel}
                    onCheckedChange={(checked) => {
                      commitPatch({
                        model: {
                          ...providerConfig.model,
                          isCustomModel: checked,
                        },
                      } as Partial<LLMProviderConfig>)
                    }}
                  />
                  自定义模型
                </label>
                {!providerConfig.model.isCustomModel && (
                  <Select
                    value={providerConfig.model.model}
                    onValueChange={(nextModel) => {
                      if (!nextModel) return
                      commitPatch({
                        model: {
                          ...providerConfig.model,
                          model: nextModel as LLMProviderConfig["model"]["model"],
                          isCustomModel: false,
                        },
                      } as Partial<LLMProviderConfig>)
                    }}
                  >
                    <SelectTrigger size="sm" className="min-w-44">
                      <SelectValue>{providerConfig.model.model}</SelectValue>
                    </SelectTrigger>
                    <SelectContent {...SELECT_CONTENT_PROPS}>
                      <SelectGroup>
                        {availableModels.map((modelId) => (
                          <SelectItem key={modelId} value={modelId}>
                            {modelId}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          )}

          {(isCustomOnly || providerConfig.model.isCustomModel) && (
            <Field>
              <FieldLabel htmlFor={`inline-custom-model-${providerConfig.id}`}>模型 ID</FieldLabel>
              <Input
                id={`inline-custom-model-${providerConfig.id}`}
                value={customModelValue}
                placeholder="例如：gemini-3.5-flash-lite"
                onChange={(e) => setCustomModelDraft(e.target.value)}
                onBlur={() => {
                  const trimmed = customModelDraft?.trim() || null
                  if (customModelDraft !== null && trimmed !== (providerConfig.model.customModel ?? null)) {
                    commitPatch({
                      model: {
                        ...providerConfig.model,
                        customModel: trimmed,
                      },
                    } as Partial<LLMProviderConfig>)
                  }
                  setCustomModelDraft(null)
                }}
              />
            </Field>
          )}
        </div>
      )}
    </Card>
  )
}
