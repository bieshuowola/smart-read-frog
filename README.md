# 智译蛙 · Smart Read Frog（私人智能版）

基于开源项目 [mengxi-ream/read-frog](https://github.com/mengxi-ream/read-frog) `v1.61.1`（GPL-3.0）开发的面向中文母语用户的 AI 智能网页翻译浏览器扩展。

- **当前版本**：`1.61.1-smart.2`（Chromium MV3 `manifest.version: "1.61.1.2"`）
- **固定独立扩展 ID**：`fbjkcfaokdnppjoanibkkplgbloeooih`（通过专用 SPKI 公钥 `key` 锁定，与官方陪读蛙 `modkelfkcfjpgbfmnbnllalkiogfofhb` 完全隔离共存，且后续覆盖升级/更换解压目录均不改变 ID、不丢失配置与缓存）

## 核心特性

1. **多语种「页面级 + 内容块级」联合智能决策**（`src/utils/smart-translate/`）
   - 默认目标语言为简体中文（`zh-Hans`），源语言自动检测支持英语、日语、韩语、法语、德语、西班牙语、葡萄牙语、意大利语、俄语、阿拉伯语等。
   - **`full-auto`**：外语为主网页自动调用 AI 翻译可阅读正文与标题。
   - **`skip`**：中文为主网页原样保留，不因 `Codex`、`Agent`、`Context Window`、`Token Usage`、`Apple Watch`、`WiFi Calling` 等英文专业术语或品牌词误触整页翻译。
   - **`partial-auto`**：中文讨论帖/文章中夹杂独立外语段落、评论或混合从句（如 `This API is deprecated，请尽快迁移。`）时，仅局部翻译外语内容，原有中文正文不干扰。
   - **技术内容与隐私保护**：屏蔽代码块、CLI 命令、JSON 配置、路径、API 标识与 URL；对网页邮箱、网银/支付、登录认证与私人聊天页面默认阻止自动上传，仅允许手动触发；支持 SPA 与滚动加载异步评论。

2. **纯 AI 零费用故障切换与已核实模型矩阵**（2026-11 核实）
   - **严禁传统机翻兜底**：默认与自动故障切换仅使用 AI 大语言模型（`ai-failover.ts`），绝不静默切换至 Google/Microsoft 传统机器翻译，也不会自动切换至付费模型或需绑卡试用服务。
   - **默认主用与零费用备选链**：
     | 角色 | 提供商 | 默认/推荐模型 | 官方规则与限额 | 状态核实方式 |
     | :--- | :--- | :--- | :--- | :--- |
     | **主用** | **GroqCloud** | `qwen/qwen3.8-27b` | Free Plan：30 RPM / 1K RPD / 8K TPM / 200K TPD；已默认下发 `reasoningEffort: "none"` 关闭思考消耗 | 官方 Models/Rate Limits/Reasoning 文档 + `@ai-sdk/groq` 抓包验证 |
     | 备用 1 | **Google Gemini** | `gemini-3.5-flash-lite` | Free Tier 免费（超限返回 429，不自动扣费；旧 `gemini-2.5-flash` 已弃用并路由至此） | 官方 Pricing/Models/Rate Limits 文档 + `@ai-sdk/google` 载荷验证 |
     | 备用 2 | **OpenRouter** | `google/gemma-4-31b-it:free` / `openrouter/free` | Prompt/Completion 均为 `$0`（无余额账号 20 RPM / 50 RPD） | OpenRouter 公开实时模型 API 实测查询（2026-11-23） |
     | 本地备用 | **Ollama** | `qwen2.5:3b` / `gemma4:e4b` 等 | 本地零费用运行；建议环境变量配置 `OLLAMA_ORIGINS="chrome-extension://*"` 允许扩展直连 | Edge 158 + 本机 Ollama `qwen2.5:3b` **真实端到端翻译实测** |
   - **已移除/屏蔽的失效或非零费用默认项**：
     - 已移除 **Groq `llama-3.3-70b-versatile`** 与 `llama-3.1-8b-instant`（Groq 已于 `2026-08-16` 停止免费与自助开发者调用，仅限 Enterprise 合约，继续调用会返回 404）；老版本升级时会自动无损迁移至 `qwen/qwen3.8-27b` 并保留您原有的 API Key。
     - 已从默认列表和自动备选链移除 **Cerebras**（需绑定支付方式领取 30 天 $5 试用金，非永久免费层）与 **SiliconFlow** 默认付费模型 `Qwen/Qwen3-Next-80B-A3B-Instruct`。
     - `ai-failover.ts` 与「API 提供商 -> 免费备选链」UI 均已加锁：除 `free-tier` / `local-free` 之外的服务（如 OpenAI、DeepSeek、非 `:free` OpenRouter 模型）不可开启自动故障切换。

3. **安全边界说明**
   - 源码与 Release ZIP 不含任何内置私钥（仅含固定扩展 ID 所需 RSA-2048 公钥）及个人 API Key。
   - 用户填写的 API Key 存储在本地 `chrome.storage.local`，请配合各云端控制台设置消费限额或仅保留免费账号。

## 安装与升级指南

### Windows 11（Chrome / Edge）
1. **全新安装**：从 Releases 下载 `smart-read-frog-1.61.1-smart.2-chrome.zip` 或 `smart-read-frog-1.61.1-smart.2-edge.zip`，解压至固定目录（例如 `D:\Extensions\smart-read-frog`）。打开 `chrome://extensions/` 或 `edge://extensions/`，开启右上角 **开发者模式**，点击 **加载解压缩的扩展程序** 选择该目录（可与原版陪读蛙同时启用）。
2. **覆盖升级（从 `v1.61.1-smart.2` 起永久保留数据）**：下载新版压缩包覆盖解压到同一目录（或解压到新目录重新加载），扩展 ID 始终保持为 `fbjkcfaokdnppjoanibkkplgbloeooih`，原有 API Key、排除规则、术语库及 IndexedDB 翻译缓存完整保留。
3. **一次性迁移提示（从 `v1.61.1-smart.1` 升级）**：由于旧版 `v1.61.1-smart.1` 未固定 `manifest.key`，升级至 `smart.2` 这一次会被浏览器视为新 ID 扩展；建议先在扩展设置页导出/复制备份您的 API Key 与规则后再卸载 `smart.1`（如旧配置仍带 `llama-3.3-70b-versatile` 备份导入，`smart.2` 初始化时会自动升级为 `qwen/qwen3.8-27b`）。
4. **使用本机 Ollama**：为避免浏览器扩展 `Origin: chrome-extension://...` 被 Ollama 返回 403，请设置系统环境变量 `OLLAMA_ORIGINS=chrome-extension://*` 后重启 Ollama。

### Android 16（Quetta 浏览器）兼容说明
- 构建包已针对移动端对 `browser.action.getUserSettings`、`browser.contextMenus` 与 `sidePanel` 添加可选守卫。可在 Quetta 扩展管理离线导入 `smart-read-frog-1.61.1-smart.2-chrome.zip`。
- **实测边界声明**：本环境无真实 Android 16 物理设备，**Android Quetta 实机运行与交互尚未实测**，保留未验证状态。

## 实测验证结果与局限（2026-11-23）

- **静态检查与单元测试**：`pnpm type-check`（0 errors / 0 warnings，1814 files）；`pnpm test` 全部 **508 个测试文件 / 5480 个测试用例**通过（含 `ai-failover.test.ts` 与 `config-upgrade.test.ts`）。
- **真实本地 LLM 浏览器端到端实测（Edge 158 + 本机 Ollama `qwen2.5:3b`，无 Mock）**：
  - 验证英文技术文档双语翻译（代码块/JSON 原样保留，延迟 ~84ms–560ms）、二次访问零请求缓存命中、含 `Codex`/`Apple Watch` 中文术语页全跳过（0 请求）、日/韩/法/德/西多语种自动检测翻译、以及中文讨论帖局部翻译 + `#load-more` 动态评论自动翻译（`This API is deprecated，请尽快迁移。` -> `这个API已废弃，请尽快迁移。`）。
  - **客观局限观察**：`qwen2.5:3b` 等小参数本地量化模型在原版 `{{NO_TRANSLATION_NEEDED}}` 批量哨兵规则下，偶尔会漏翻极短标题（如 `API Migration Guide`）、个别非中文单句或夹杂少量英文词（如在一次多语种测试中 5/5 全过、另一次德语/法语段落被 3B 模型跳过或回显）；日常高频高质量翻译建议使用默认的 Groq `qwen/qwen3.8-27b`、Gemini 或 OpenRouter `:free` 大模型。
- **故障切换与零付费守护实测（Edge 158 + 本地故障注入端点 -> 真实 Ollama 备用）**：
  - 主引擎返回 HTTP `429` 或 `404`（模型已下线）时自动切至可用零费用备用 AI；主引擎与 Ollama 均不可用（`503`）时仅渲染错误提示控件、插入 0 条译文节点，已配置付费 `openai-default` 探测端收到 `0` 请求，传统机器翻译 `0` 调用。
- **扩展 ID 持久化与升级验证实测（Edge 158）**：
  - 验证 `1.61.1.2 -> 1.61.1.3` 原地覆盖升级及迁移全新目录加载后，扩展 ID 始终保持 `fbjkcfaokdnppjoanibkkplgbloeooih`，API Key、自定义规则与 `ReadFrogDB` IndexedDB 缓存行数 100% 保留，且旧版 `llama-3.3-70b-versatile` 与 `cerebras-default` 自动完成升级修复与清理。
- **云端真实 API 验证边界**：本环境未配置用户私人云端 Key（需要 `GROQ_API_KEY`、`GEMINI_API_KEY`、`OPENROUTER_API_KEY`），因此云端服务商仅通过官方文档、OpenRouter 公开模型目录 API、AI SDK 实际请求载荷检查及本地故障注入验证完成，**未使用真实云端 API Key 实发译文请求**。

## 开源许可

本项目基于 [mengxi-ream/read-frog](https://github.com/mengxi-ream/read-frog) 遵循 **GNU General Public License v3.0 (GPL-3.0)** 协议发布与修改，保留全部原始许可说明（见 [LICENSE](./LICENSE)）。
