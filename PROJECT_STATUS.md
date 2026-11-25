# 智译蛙 Smart Read Frog 状态摘要

- **版本/ID**：`1.61.1-smart.5`（manifest `1.61.1.5`），ID `fbjkcfaokdnppjoanibkkplgbloeooih`，Schema `128`。
- **路径**：源码 `C:\Users\Administrator\.gemini\antigravity\scratch\smart-read-frog`；运行目录 `D:\smart-read-frog-1.61.1-smart.2`（备份 `D:\smart-read-frog-1.61.1-smart.2-backup`）。
- **核心架构与 `smart.5`**：微软默认引擎 + Google/Gemini 可选；三页设置 + 独立样式 + 视频字幕；统一双语解截断、语义识别与作者保护（`element-context.ts` / `block-classifier.ts`）；**`smart.5` 新增**：
  - 复合命名标题可读放行（`code-and-tech-guard.ts` / `block-classifier.ts`）：在标题与外语页语义下识别首字母大写的 PascalCase / Title_Snake 标题（如 `SlenderMan V2`、`Warcelona_part2`）及多行中英混合标题（如 `订阅即可下载\nSlenderMan V2`），继续严格保护 `camelCase` / 小写 `snake_case` / `ALL_CAPS` / 代码 / 作者名。
  - 微软原文回显有界补救（`translation-queues.ts`）：对粘连复合标题自动执行单次词边界规范化微软重译；多词外语短语仅在用户启用 `microsoftGoogleFallback` 时允许最多 1 次免费 Google 备用翻译，单造词（如 `Glubtastic 5`）合理保留原文。
  - 缓存防固化（`page-translation.ts`）：机器翻译原文回显不写入 7 天 IndexedDB，读取到历史遗留原文回显缓存时自动清理重译。
- **红线**：禁改扩展 ID 与 Schema 128；禁泄 Key；禁未授权调付费兜底。
- **命令**：`pnpm type-check`、`pnpm test`、`pnpm build:edge`、`pnpm zip:edge`、`pnpm zip`。
