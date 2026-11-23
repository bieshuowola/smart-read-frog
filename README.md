# 智译蛙 · Smart Read Frog（私人智能版）

基于开源项目 [mengxi-ream/read-frog](https://github.com/mengxi-ream/read-frog) `v1.61.1`（GPL-3.0）开发的面向中文母语用户的 AI 智能网页翻译浏览器扩展。版本标识 `1.61.1-smart.1`（Chrome MV3 `version: 1.61.1.1`），已移除上游开发固定 `key`，与原版陪读蛙使用独立扩展 ID，支持同一浏览器内独立共存、互不覆盖配置。

## 核心重构与能力特性

1. **多语种「页面级 + 内容块级」联合智能决策**（`src/utils/smart-translate/`）
   - 支持简体中文母语用户默认目标语种 `zh-Hans`，源语言自动识别覆盖英语、日语（含汉字与假名区分）、韩语、法语、德语、西班牙语、葡萄牙语、意大利语、俄语、阿拉伯语等多语种，不将“非中文”简单等同于英语。
   - **外语为主网页（`full-auto`）**：打开后自动以 AI 翻译可阅读正文与标题。
   - **中文为主网页（`skip`）**：原样保留中文页面，不因 `Codex`、`Agent`、`Context Window`、`Token Usage`、`Apple Watch`、`WiFi Calling` 等英文专业术语或品牌词误触发整页翻译。
   - **中文页夹杂外语内容（`partial-auto`）**：中文页内出现独立外语评论、段落或混合外语从句（如 `This API is deprecated，请尽快迁移。`）时，仅局部翻译该外语内容，原有中文正文保持原样，且屏蔽 1~2 词导航标签误翻。
   - **技术文档保护**：基于语义与语法结构过滤代码块、CLI 命令（同时避免把 `"Python is..."` 等英文自然句误判为命令）、JSON 配置、文件路径、API 标识、版本号与 URL。
   - **SPA 与异步加载**：当页面初始判定为 `skip` 时，对新增 DOM 子树启用去抖 MutationObserver 重新评估（单页上限 12 次），适配论坛/GitHub/Reddit 异步加载评论；同时尊重用户主动点击“显示原文”的原点状态。
   - **隐私优先拦截（`privacy-blocked`）**：默认在网页邮箱、网银/支付、登录/认证及私人即时聊天页面阻止自动上传正文，仅允许用户主动手动触发。

2. **纯 AI 驱动与多模型故障切换**
   - 默认与自动故障切换仅使用大语言模型（`ai-failover.ts`），**绝不将传统机器翻译（Google/Microsoft 翻译等）作为默认或静默降级方案**。
   - 默认主引擎预置为 **GroqCloud**（`llama-3.3-70b-versatile`），默认备选链依次为 **Google Gemini**（`gemini-3.5-flash-lite`）、**OpenRouter**（`google/gemma-4-31b-it:free`）、**Cerebras**（`gpt-oss-120b`），并预置 **SiliconFlow**（`Qwen/Qwen3-Next-80B-A3B-Instruct`）、自定义 OpenAI-Compatible 与本地 **Ollama**（`gemma3:4b`）。
   - 主引擎遇到 HTTP 429 限流、413 超长、401/403 鉴权失败、超时或 5xx 时自动进入冷却窗口并切换至下一个已填写凭证且就绪的 AI 模型。
   - 保留原版双语对照/纯译文切换、批处理请求队列、术语库与提示词、选中文本工具栏、字幕翻译、缓存复用能力。

3. **安全边界与 API 凭据说明**
   - 仓库源码与构建安装包均不含任何内置个人 API Key 或 `.env` 密钥文件。
   - 您自行填写的 API Key 存储在浏览器扩展本地存储（`chrome.storage.local`）中直接请求所选模型服务端，**不具备服务器端密钥的保密隔离强度**，请妥善保管额度并设置消费限额。

## 安装与使用

### Windows 11（Chrome / Edge）
1. 从 GitHub Releases 下载对应压缩包（`read-frogextension-1.61.1-chrome.zip` 或 `read-frogextension-1.61.1-edge.zip`），或本地克隆后运行构建生成 `.output/chrome-mv3`。
2. 解压 ZIP 到独立本地目录（避免路径误删）。
3. 打开 `chrome://extensions/` 或 `edge://extensions/`，开启右上角 **开发者模式**，点击 **加载解压缩的扩展程序**，选择解压后的目录即可（已安装原版陪读蛙可共存）。
4. 在设置页「API 提供商」填入 GroqCloud / Google Gemini / OpenRouter / Cerebras 等免费 AI 密钥，并可在「AI 故障切换与免费备选链」勾选与排序备用模型。

### Android 16（Quetta 浏览器）兼容说明
- 构建包已针对移动端扩展环境对 `browser.action.getUserSettings`、`browser.contextMenus` 与 `sidePanel` 调用添加可选运行时守卫，并输出标准 Chromium MV3 包 `read-frogextension-1.61.1-chrome.zip`。
- **使用方式**：在 Android Quetta 浏览器扩展管理中启用扩展导入，选择 `read-frogextension-1.61.1-chrome.zip` 离线导入后在设置页填入 API Key。
- **验证边界声明**：本开发环境未连接真实 Android 16 物理设备，**Android Quetta 实机安装与运行尚未实测**，若个别移动端桌面接口差异导致局部面板不可用，以真机实测结果为准。

## 验证情况（基于实际执行输出）

- **静态类型与代码检查**：`pnpm type-check`（`oxlint --type-aware --type-check`）通过（0 warnings，0 errors，1812 files）。
- **自动化单元与集成测试**：`pnpm test`（Vitest）全部 **507 个测试文件 / 5473 个测试用例** 通过（含 `src/utils/smart-translate/__tests__/` 中多语种分类、中文术语保护、中英混合句、技术内容保护、隐私拦截、多 LLM 故障切换测试）。
- **生产构建与打包**：`pnpm build`、`pnpm zip`、`pnpm zip:edge` 均成功生成 `.output/chrome-mv3/manifest.json`（含独立 ID、无 hardcoded `key`）及 Chrome/Edge 发行包。
- **Windows 真机浏览器端到端实测**：在完全隔离的临时 `--user-data-dir` 中通过 Microsoft Edge 158（`158.0.4370.33`）加载 `.output/chrome-mv3`，对接本地模拟测试页面与双路 OpenAI 兼容服务端，全部 7 项端到端断言通过：
  1. 含 `Codex`、`Agent`、`Context Window`、`Token Usage`、`Apple Watch`、`WiFi Calling` 的中文页自动跳过（0 译文节点、0 API 请求）。
  2. `/login` 隐私认证页阻止自动上传（0 译文节点、0 API 请求）。
  3. 英文技术文档页自动双语翻译正文（含 `"Python is..."` 段落），代码块 CLI 命令与 JSON 配置保持原样。
  4. 二次返回已翻译页面直接命中缓存（0 新增 API 请求）。
  5. 日、韩、法、德、俄多语种页面自动翻译通过。
  6. 中文讨论帖触发 `partial-auto` 局部模式：中文主楼层不翻，独立英/日评论、`"This API is deprecated，请尽快迁移。"` 及按钮异步追加的新评论均正确翻译且无重复包裹。
  7. 主用 AI 接口返回 HTTP `429` 时自动切换至备用 AI 完成翻译，未触及任何传统机器翻译。

## 本地开发命令

```powershell
pnpm install
pnpm type-check
pnpm test
pnpm build
pnpm zip
pnpm zip:edge
```

## 开源许可与致谢

本项目基于 [mengxi-ream/read-frog](https://github.com/mengxi-ream/read-frog) 遵循 **GNU General Public License v3.0 (GPL-3.0)** 协议发布与修改，保留全部原始开源许可说明（见 [LICENSE](./LICENSE)）。
