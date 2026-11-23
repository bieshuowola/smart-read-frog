# PROJECT_STATUS - Smart Read Frog

## 版本与扩展身份
- `1.61.1-smart.2`（MV3 `1.61.1.2`），Fork 自 `mengxi-ream/read-frog` `v1.61.1`（GPL-3.0）。
- `wxt.config.ts` 固定专用 SPKI 公钥，锁定 ID `fbjkcfaokdnppjoanibkkplgbloeooih`，不冲突且升级保留数据。

## 默认 AI 与切流
- 主用 Groq `qwen/qwen3.8-27b`（禁思考）；备选 Gemini `gemini-3.5-flash-lite`、OpenRouter `:free` 与 Ollama。
- 移除停免 `llama-3.3-70b-versatile`、绑卡试用的 Cerebras 及付费 SiliconFlow 默认项；`config-upgrade.ts` 自动迁移旧配置。

## 红线、验证与命令
- 红线：保 Schema `v128` 与 `"1.61.1"`；禁传统机翻及付费兜底；禁内置私钥/API Key。
- 已验：`type-check` 0 错；`test` 508 文件/5480 用例；Edge 158 实测 Ollama、429/404/503 切流与升级保数据过。云端 Key 与 Quetta 未实测。
- 命令：`pnpm type-check` / `pnpm test` / `pnpm build` / `pnpm zip` / `pnpm zip:edge`。
