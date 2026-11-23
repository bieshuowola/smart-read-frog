import { createEnv } from "@t3-oss/env-core"
import { createExtensionClientEnvSchema, resolveExtensionEnv } from "./shared"

// Private standalone edition runs without official Read Frog telemetry / OAuth env vars by default.
const shouldSkipRequiredProductionEnv =
  import.meta.env.WXT_REQUIRE_OFFICIAL_TELEMETRY !== "true"
const extensionClientEnvSchema = createExtensionClientEnvSchema(
  import.meta.env.PROD,
  shouldSkipRequiredProductionEnv,
)

export const env = createEnv({
  clientPrefix: "WXT_",
  client: extensionClientEnvSchema,
  runtimeEnv: resolveExtensionEnv(import.meta.env),
  emptyStringAsUndefined: true,
})
