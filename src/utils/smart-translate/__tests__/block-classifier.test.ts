import { describe, expect, it } from "vitest"
import { classifyTextBlock } from "../block-classifier"
import { isPureTechnicalOrCodeBlock, stripTechnicalTokens } from "../code-and-tech-guard"

describe("code-and-tech-guard", () => {
  it("protects CLI commands, JSON configs, paths, and identifiers", () => {
    expect(isPureTechnicalOrCodeBlock("pnpm build && pnpm zip")).toBe(true)
    expect(isPureTechnicalOrCodeBlock("npm install --save-dev vitest")).toBe(true)
    expect(isPureTechnicalOrCodeBlock('{"smartAutoTranslate": true, "providerId": "groq-default"}')).toBe(
      true,
    )
    expect(isPureTechnicalOrCodeBlock("src/utils/host/translate/auto-translation.ts")).toBe(true)
    expect(isPureTechnicalOrCodeBlock("D:\\Windows Dock\\MacDock\\Reload-Dev.ps1")).toBe(true)
    expect(isPureTechnicalOrCodeBlock("https://github.com/mengxi-ream/read-frog")).toBe(true)
    expect(isPureTechnicalOrCodeBlock("v1.61.1-smart.1")).toBe(true)
    expect(isPureTechnicalOrCodeBlock("const result = await executeTranslateWithFailover(text);")).toBe(
      true,
    )
    expect(isPureTechnicalOrCodeBlock("useCallback handleProviderChange snake_case_id")).toBe(true)
  })

  it("does NOT misclassify English prose sentences starting with tool names as CLI commands", () => {
    expect(
      isPureTechnicalOrCodeBlock(
        "Python is one of the world's easiest and most popular programming languages.",
      ),
    ).toBe(false)
    expect(
      isPureTechnicalOrCodeBlock("Docker makes container deployment reproducible across teams."),
    ).toBe(false)
    expect(isPureTechnicalOrCodeBlock("Go to the Settings page and add your API key.")).toBe(false)
  })

  it("strips technical tokens without deleting surrounding natural language", () => {
    const stripped = stripTechnicalTokens(
      "这次 Codex 的 `useEffect` 在 src/main.tsx v1.61.1 调用 https://api.groq.com 报错了",
    )
    expect(stripped).toContain("这次")
    expect(stripped).toContain("Codex")
    expect(stripped).toContain("报错了")
    expect(stripped).not.toContain("src/main.tsx")
    expect(stripped).not.toContain("https://api.groq.com")
  })
})

describe("classifyTextBlock", () => {
  it("skips pure Chinese and the user's Chinese+tech-terms examples", () => {
    const cases = [
      "你好",
      "这是一段正常的简体中文说明文字，用于测试本地语言识别准确性。",
      "这次 Codex 的 Agent 调度出了问题，Context Window 消耗太快，建议检查 API 的 Token Usage。",
      "Apple Watch 的 WiFi Calling 功能存在兼容性问题。",
      "我们在 React 19 中通过 TypeScript Strict Mode 重构了 State Management 模块。",
      "建议把 Groq API Key 填入 Settings 面板中的 Providers 配置项。",
    ]

    for (const text of cases) {
      const result = classifyTextBlock(text, { targetCode: "zh-Hans", contextMode: "standalone" })
      expect(result.shouldTranslate, `Expected skip for: ${text}`).toBe(false)
    }
  })

  it("translates mixed Chinese blocks that contain a genuine foreign natural-language clause", () => {
    const englishMixed = classifyTextBlock("This API is deprecated，请尽快迁移。", {
      targetCode: "zh-Hans",
      contextMode: "standalone",
    })
    expect(englishMixed.shouldTranslate).toBe(true)
    expect(englishMixed.hasForeignNaturalClause).toBe(true)

    const frenchMixed = classifyTextBlock("Veuillez redémarrer le service après la mise à jour，然后刷新页面。", {
      targetCode: "zh-Hans",
      contextMode: "standalone",
    })
    expect(frenchMixed.shouldTranslate).toBe(true)
    expect(frenchMixed.hasForeignNaturalClause).toBe(true)

    const germanMixed = classifyTextBlock("Diese Funktion ist veraltet und wird bald entfernt，建议升级。", {
      targetCode: "zh-Hans",
      contextMode: "standalone",
    })
    expect(germanMixed.shouldTranslate).toBe(true)
    expect(germanMixed.hasForeignNaturalClause).toBe(true)
  })

  it("translates natural foreign prose across 10+ non-Chinese languages", () => {
    const samples: Array<{ lang: string; text: string; expectedTagPrefix: string }> = [
      {
        lang: "English",
        text: "Python is widely used for data engineering, machine learning, and automation workflows.",
        expectedTagPrefix: "en",
      },
      {
        lang: "Japanese (Kanji-heavy)",
        text: "日本語の新機能について詳しく説明します。",
        expectedTagPrefix: "ja",
      },
      {
        lang: "Japanese (katakana + kanji)",
        text: "システム設定からAPIキーを入力してください。",
        expectedTagPrefix: "ja",
      },
      {
        lang: "Korean",
        text: "새로운 AI 번역 엔진이 자동으로 웹페이지의 언어를 감지합니다.",
        expectedTagPrefix: "ko",
      },
      {
        lang: "French",
        text: "Cette extension détecte automatiquement la langue de la page et la traduit en chinois.",
        expectedTagPrefix: "fr",
      },
      {
        lang: "German",
        text: "Diese Erweiterung erkennt die Sprache der Webseite automatisch und übersetzt den Inhalt.",
        expectedTagPrefix: "de",
      },
      {
        lang: "Spanish",
        text: "Esta extensión detecta automáticamente el idioma de la página y traduce el texto principal.",
        expectedTagPrefix: "es",
      },
      {
        lang: "Portuguese",
        text: "Esta extensão detecta automaticamente o idioma da página e traduz o conteúdo para você.",
        expectedTagPrefix: "pt",
      },
      {
        lang: "Italian",
        text: "Questa estensione rileva automaticamente la lingua della pagina e traduce i paragrafi.",
        expectedTagPrefix: "it",
      },
      {
        lang: "Russian",
        text: "Это расширение автоматически определяет язык веб-страницы и переводит основной текст.",
        expectedTagPrefix: "ru",
      },
      {
        lang: "Arabic",
        text: "تقوم هذه الإضافة باكتشاف لغة صفحة الويب تلقائيا وترجمة المحتوى الأساسي.",
        expectedTagPrefix: "ar",
      },
    ]

    for (const sample of samples) {
      const result = classifyTextBlock(sample.text, {
        targetCode: "zh-Hans",
        contextMode: "standalone",
      })
      expect(result.shouldTranslate, `${sample.lang} should translate`).toBe(true)
      expect(
        result.detectedLanguage.startsWith(sample.expectedTagPrefix),
        `${sample.lang} detected ${result.detectedLanguage}, expected prefix ${sample.expectedTagPrefix}`,
      ).toBe(true)
    }
  })

  it("guards Chinese pages in partial-auto mode against short UI badges while translating real foreign comments", () => {
    for (const badge of ["Dark Mode", "Pull Requests", "Context Window", "API Key", "Read Frog"]) {
      const result = classifyTextBlock(badge, {
        targetCode: "zh-Hans",
        contextMode: "partial-auto",
      })
      expect(result.shouldTranslate, `Badge "${badge}" should skip in partial-auto`).toBe(false)
    }

    const realComment = classifyTextBlock(
      "Thanks for sharing this benchmark! We hit the exact same bottleneck last week.",
      {
        targetCode: "zh-Hans",
        contextMode: "partial-auto",
      },
    )
    expect(realComment.shouldTranslate).toBe(true)

    const japaneseComment = classifyTextBlock("これはとても参考になりました！ありがとうございます。", {
      targetCode: "zh-Hans",
      contextMode: "partial-auto",
    })
    expect(japaneseComment.shouldTranslate).toBe(true)
    expect(japaneseComment.detectedLanguage).toBe("ja")
  })

  it("translates standalone headings in full-auto foreign pages", () => {
    for (const heading of ["Introduction", "Background", "References", "Solution", "Output"]) {
      const result = classifyTextBlock(heading, {
        targetCode: "zh-Hans",
        contextMode: "full-auto",
      })
      expect(result.shouldTranslate, `Heading "${heading}" should translate in full-auto`).toBe(true)
    }
  })
})
