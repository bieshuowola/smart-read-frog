// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { detectSmartPageDecision } from "../page-decision"
import { evaluatePrivacyGuard } from "../privacy-guard"

function makeConfig(overrides: Partial<(typeof DEFAULT_CONFIG)["pageTranslation"]["page"]> = {}) {
  const cfg = structuredClone(DEFAULT_CONFIG)
  cfg.language.targetCode = "zh-Hans"
  cfg.pageTranslation.page = {
    ...cfg.pageTranslation.page,
    smartAutoTranslate: true,
    privacyGuardEnabled: true,
    ...overrides,
  }
  return cfg
}

function setDocumentHtml(html: string, title = "") {
  document.title = title
  document.body.innerHTML = html
}

describe("detectSmartPageDecision", () => {
  beforeEach(() => {
    document.title = ""
    document.body.innerHTML = ""
  })

  it("returns skip for Chinese-dominant articles containing English technical terms", () => {
    setDocumentHtml(
      `
      <article>
        <h1>关于 Codex 的 Agent 调度与 Context Window 排查总结</h1>
        <p>这次 Codex 的 Agent 调度出了问题，Context Window 消耗太快，建议检查 API 的 Token Usage。</p>
        <p>Apple Watch 的 WiFi Calling 功能存在兼容性问题，目前建议先关闭该选项。</p>
        <p>我们在 Docker 容器内运行 TypeScript 类型检查和 Vitest 单元测试，整体延迟降低了 40%。</p>
      </article>
      `,
      "Codex Agent 调度排查日志",
    )

    const decision = detectSmartPageDecision(document, "https://juejin.cn/post/12345", makeConfig())
    expect(decision.mode).toBe("skip")
    expect(decision.shouldAutoTranslate).toBe(false)
    expect(decision.reason).toBe("chinese_dominant_clean")
  })

  it("returns partial-auto for Chinese forum threads containing standalone EN/JA/KO comments", () => {
    setDocumentHtml(
      `
      <main>
        <p>大家最近用这套 AI 翻译工作流体验如何？欢迎分享测试结果。</p>
        <p>我在本地浏览器运行非常流畅，中文技术博客也不会被误翻。</p>
        <p>不过刚才在评论区看到一位海外开发者留下了英文和日文反馈：</p>
        <div class="comment">
          <p>We deployed the new streaming pipeline in production yesterday and latency dropped significantly.</p>
        </div>
        <div class="comment">
          <p>この設定を試してみたところ、コードブロックがそのまま保持されてとても読みやすくなりました。</p>
        </div>
        <div class="comment">
          <p>This API is deprecated，请尽快迁移。</p>
        </div>
      </main>
      `,
      "社区讨论帖",
    )

    const decision = detectSmartPageDecision(document, "https://v2ex.com/t/999999", makeConfig())
    expect(decision.mode).toBe("partial-auto")
    expect(decision.shouldAutoTranslate).toBe(true)
    expect(decision.reason).toBe("chinese_with_foreign_blocks")
    expect(decision.foreignBlocks).toBeGreaterThanOrEqual(3)
    expect(decision.chineseBlocks).toBeGreaterThanOrEqual(3)
  })

  it("returns full-auto for English, Japanese, Korean, and European pages while ignoring code blocks", () => {
    setDocumentHtml(
      `
      <main>
        <h1>API Migration Guide</h1>
        <p>When upgrading to version 2.0, you should update your authentication headers before sending requests.</p>
        <p>The legacy endpoint will remain active during the deprecation window for backward compatibility.</p>
        <pre><code>pnpm install smart-read-frog\npnpm build</code></pre>
      </main>
      `,
      "API Migration Guide",
    )

    const enDecision = detectSmartPageDecision(
      document,
      "https://docs.example.dev/guide/migration",
      makeConfig(),
    )
    expect(enDecision.mode).toBe("full-auto")
    expect(enDecision.shouldAutoTranslate).toBe(true)
    expect(enDecision.detectedLanguage).toBe("en")

    setDocumentHtml(
      `
      <main>
        <h1>公式ドキュメント</h1>
        <p>この拡張機能は、ページ上の外国語コンテンツを自動的に検出し、自然な簡体字中国語へ翻訳します。</p>
        <p>コードブロックやコマンドライン引数は翻訳せずに保護されます。</p>
      </main>
      `,
      "公式ドキュメント",
    )
    const jaDecision = detectSmartPageDecision(document, "https://example.jp/docs", makeConfig())
    expect(jaDecision.mode).toBe("full-auto")
    expect(jaDecision.shouldAutoTranslate).toBe(true)
    expect(jaDecision.detectedLanguage).toBe("ja")
  })

  it("blocks automatic upload on webmail, banking, payment, auth, and private messaging pages", () => {
    setDocumentHtml(`<p>Inbox message from your bank advisor regarding account transfer.</p>`)

    const sensitiveUrls = [
      "https://mail.google.com/mail/u/0/#inbox",
      "https://outlook.live.com/mail/0/",
      "https://www.paypal.com/myaccount/summary",
      "https://dashboard.stripe.com/payments",
      "https://accounts.google.com/signin/v2/identifier",
      "https://web.whatsapp.com/",
      "https://web.telegram.org/k/",
      "https://example.com/login?next=/dashboard",
      "https://example.com/checkout",
    ]

    for (const url of sensitiveUrls) {
      const privacy = evaluatePrivacyGuard(url, { enabled: true, doc: document })
      expect(privacy.isSensitive, `${url} should be guarded`).toBe(true)

      const decision = detectSmartPageDecision(document, url, makeConfig({ privacyGuardEnabled: true }))
      expect(decision.mode, `${url} decision mode`).toBe("privacy-blocked")
      expect(decision.shouldAutoTranslate).toBe(false)
    }

    // Also blocks login form even on a neutral URL path
    setDocumentHtml(`<form><input type="email"/><input type="password"/></form>`)
    const loginDomDecision = detectSmartPageDecision(
      document,
      "https://portal.example.com/account",
      makeConfig(),
    )
    expect(loginDomDecision.mode).toBe("privacy-blocked")
    expect(loginDomDecision.privacyReason).toBe("login_form")

    // Respects user disabling privacy guard
    const relaxedDecision = detectSmartPageDecision(
      document,
      "https://mail.google.com/mail/u/0/#inbox",
      makeConfig({ privacyGuardEnabled: false }),
    )
    expect(relaxedDecision.mode).not.toBe("privacy-blocked")
  })

  it("honors explicit neverAutoTranslatePatterns and autoTranslatePatterns", () => {
    setDocumentHtml(`<p>This is an English article about distributed systems and caching.</p>`)

    const neverDecision = detectSmartPageDecision(
      document,
      "https://docs.python.org/3/library/",
      makeConfig({ neverAutoTranslatePatterns: ["docs.python.org"] }),
    )
    expect(neverDecision.mode).toBe("skip")
    expect(neverDecision.reason).toBe("never_translate_pattern")

    const alwaysDecision = detectSmartPageDecision(
      document,
      "https://news.ycombinator.com/item?id=1",
      makeConfig({ autoTranslatePatterns: ["news.ycombinator.com"] }),
    )
    expect(alwaysDecision.mode).toBe("full-auto")
    expect(alwaysDecision.reason).toBe("always_translate_pattern")
  })
})
