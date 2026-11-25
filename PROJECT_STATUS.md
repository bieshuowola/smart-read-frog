# 智译蛙 Smart Read Frog 状态摘要

- **版本/ID**：`1.61.1-smart.4`（manifest `1.61.1.4`），ID `fbjkcfaokdnppjoanibkkplgbloeooih`，Schema `128`。
- **路径**：源码 `C:\Users\Administrator\.gemini\antigravity\scratch\smart-read-frog`；运行目录 `D:\smart-read-frog-1.61.1-smart.2`（备份 `D:\smart-read-frog-1.61.1-smart.2-backup`）。
- **核心架构与 `smart.4`**：微软默认引擎 + Google/Gemini 可选；三页设置 + 独立样式 + 视频字幕；统一双语解截断（`translation-utils.ts` / `translation-node-preset.css`）、语义识别与作者保护（`element-context.ts` / `block-classifier.ts`）、内联包块递归（`translation-walker.ts`）及 `runtime.ts` 模式切换重译。
- **红线**：禁改扩展 ID 与 Schema 128；禁泄 Key；禁未授权调付费兜底。
- **命令**：`pnpm type-check`、`pnpm test`、`pnpm build:edge`、`pnpm zip:edge`、`pnpm zip`。
