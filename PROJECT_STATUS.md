# PROJECT_STATUS - Smart Read Frog

## 版本与功能
- `1.61.1-smart.1`（MV3 `1.61.1.1`），Fork 自 `mengxi-ream/read-frog` `v1.61.1`（GPL-3.0），移除 `key` 独立共存。
- 页面+块级多语种识别；跳过中文及术语/代码/CLI/JSON；局部译中文页外语段与混合句；隐私页拦截；SPA 重评。
- 默认 Groq + Gemini/OpenRouter/Cerebras 免费链与 Ollama，429/超时切换，禁传统机翻降级。

## 核心文件
- 引擎：`src/utils/smart-translate/`
- 接线与 UI：`auto-translation.ts`、`target-language-skip.ts`、`runtime.ts`、`translation-signal.ts`、`translation-queues.ts`、`smart-auto-status.tsx`、`failover-chain.tsx`

## 红线与状态
- 红线：保持 Schema `v128` 与 `"1.61.1"` 三位版本号；禁传统机翻降级；禁改用户浏览器配置。
- 验证：`type-check` 0 错；`test` 507 文件/5473 用例过；Edge E2E 7 项与截图通过；Quetta 未实机测。
- 命令：`pnpm type-check` / `pnpm test` / `pnpm build` / `pnpm zip` / `pnpm zip:edge`。
