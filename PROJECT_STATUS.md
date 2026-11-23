# 智译蛙 Smart Read Frog 状态摘要

- **版本/ID**：`1.61.1-smart.3`（manifest `1.61.1.3`），ID `fbjkcfaokdnppjoanibkkplgbloeooih`，Schema `128`。
- **路径**：源码 `C:\Users\Administrator\.gemini\antigravity\scratch\smart-read-frog`；运行目录 `D:\smart-read-frog-1.61.1-smart.2`（备份 `D:\smart-read-frog-1.61.1-smart.2-backup`）。
- **核心架构**：
  - 网页翻译默认微软极速引擎（独立并发/原生批量+视口优先+失败二分隔离），可选 Google/Gemini AI；「微软不可用时尝试 Google 翻译」默认关闭。
  - 完整保留 `src/utils/smart-translate/` 智能决策与中文局部「译文」标；按钮/导航原位替换；失败静默留原文并集中弹窗「重试未翻译内容」。
  - 设置页精简为「网页翻译」「视频字幕」「网站例外」，保留网页与字幕独立高级样式及完整视频字幕链路。
- **红线**：禁改扩展 ID 与 Schema 128；禁泄 Key；禁未授权调付费兜底；禁正文留错误/重试图标。
- **命令**：`pnpm type-check`、`pnpm test`、`pnpm build:edge`、`pnpm zip:edge`、`pnpm zip`。
