const INLINE_BACKTICK_RE = /`[^`\n]+`/g
const URL_RE = /\b(?:https?|ftp|wss?):\/\/[^\s<>()]+|\bwww\.[^\s<>()]+/gi
const EMAIL_RE = /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi
const SCOPED_PACKAGE_RE = /(?:^|\s)@[a-z0-9-~][a-z0-9-._~]*\/[a-z0-9-~][a-z0-9-._~]*/gi
const HANDLE_RE = /(?:^|\s)@[a-zA-Z0-9_.-]{1,64}\b/g
const WINDOWS_PATH_RE = /\b[A-Za-z]:\\(?:[^\r\n\\/:*?"<>|]+\\)*[^\s\\/:*?"<>|]*/g
const UNIX_PATH_RE = /(?:^|[\s(])(?:~?\/[\w.@-]+)+(?:\/[\w.@-]*)*\b/g
const RELATIVE_PATH_RE = /(?:^|[\s(])(?:\.{1,2}\/)?(?:[\w.-]+\/){2,}[\w.-]+/g
const FILE_EXT_RE =
  /\b[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|swift|cpp|cc|c|h|hpp|cs|rb|php|json|yaml|yml|toml|ini|env|md|mdx|css|scss|html|xml|svg|png|jpg|webp|exe|dll|zip|crx|sh|ps1|bat|sql|lock)\b/gi
const CLI_FLAG_RE = /(?:^|\s)--?[a-zA-Z][\w-]*(?:=[^\s]+)?/g
const SEMVER_RE = /\bv?\d+\.\d+(?:\.\d+)*(?:-[0-9a-zA-Z.-]+)?\b/g
const HEX_OR_UUID_RE =
  /\b(?:0x[0-9a-fA-F]+|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\b/g
const NUMBER_WITH_UNIT_RE =
  /\b\d+(?:\.\d+)?(?:px|rem|em|vh|vw|ms|s|kb|mb|gb|tb|hz|khz|mhz|ghz|fps|dpi|rpm|rpd|tpm|tpd|%)\b/gi

// Code/API identifiers: foo.bar.baz, snake_case, camelCase, PascalCase internal caps, multi-segment kebab-case, ALL_CAPS
const DOT_IDENTIFIER_RE = /\b[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*){1,}\b/g
const SNAKE_CASE_RE = /\b[a-zA-Z][a-zA-Z0-9]*_[a-zA-Z0-9_]+\b/g
const CAMEL_OR_INTERNAL_CAPS_RE = /\b[a-z]+[A-Z][a-zA-Z0-9]*\b|\b[A-Z][a-z]+[A-Z][a-zA-Z0-9]*\b/g
const KEBAB_IDENTIFIER_RE = /\b[a-z0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\b/g
const ALL_CAPS_ACRONYM_RE = /\b[A-Z]{2,}(?:_[A-Z0-9]+)*\b/g
const LATIN_UPPER_VOWEL_RE = /[AEIOUY]/
const TECHNICAL_ALL_CAPS_WITH_VOWELS = new Set([
  "API",
  "AI",
  "UI",
  "UX",
  "IO",
  "OS",
  "ID",
  "IP",
  "URI",
  "GUID",
  "UUID",
  "CUDA",
  "WASM",
  "CORS",
  "CSRF",
  "REST",
  "SOAP",
  "YAML",
  "TOML",
  "ASCII",
  "UTF",
  "BIOS",
  "UEFI",
  "RAID",
  "SATA",
  "NVME",
  "OLED",
  "HDMI",
  "WIFI",
  "SIM",
  "RAM",
  "ROM",
  "SSD",
  "HDD",
  "USB",
  "LAN",
  "WAN",
  "MAC",
  "NPU",
  "TPU",
  "RAG",
  "LLM",
  "MCP",
  "IDE",
  "GUI",
  "EOF",
  "NAN",
  "NULL",
  "TRUE",
  "FALSE",
  "ETA",
  "CPU",
  "GPU",
  "NPU",
  "HUD",
  "FOV",
  "LOD",
  "LUA",
  "VFX",
  "SFX",
  "RTX",
  "AMD",
  "FAQ",
  "VIP",
  "URL",
  "OCR",
  "SSO",
  "IAM",
  "AES",
  "RSA",
  "SHA",
  "EXE",
  "MSI",
  "APK",
  "ISO",
  "CI",
  "CD",
  "QA",
])

function isTechnicalAcronym(token: string): boolean {
  if (/[_\d]/.test(token)) return true
  if (!LATIN_UPPER_VOWEL_RE.test(token)) return true
  return TECHNICAL_ALL_CAPS_WITH_VOWELS.has(token)
}

const CLI_PREFIX_RE =
  /^\s*(?:\$|>\s|#\s)?(?:npm|pnpm|yarn|bun|npx|pnpx|node|tsx|python|python3|pip|pip3|git|gh|curl|wget|docker|kubectl|helm|cargo|rustc|go|dotnet|wxt|vitest|eslint|oxlint|chmod|chown|mkdir|rm|cp|mv|ls|cd|cat|echo|export|set|schtasks|powershell|pwsh|sudo|apt|brew)\b/i

const CODE_KEYWORD_LINE_RE =
  /\b(?:const|let|var|function|async\s+function|export\s+(?:default|const|function|class|type|interface)|import\s+.+\s+from|return\s+[^,]|=>|===|!==|&&|\|\|)\b/

const CODE_PUNCTUATION_RE = /[{}[\];<>`\\]|=>|===|!==|::|->|\(\)/g

/**
 * Strip technical tokens (code, URLs, emails, paths, identifiers, versions)
 * so language & prose analysis inspects only natural-language text.
 */
export function stripTechnicalTokens(text: string): string {
  return text
    .replace(INLINE_BACKTICK_RE, " ")
    .replace(URL_RE, " ")
    .replace(EMAIL_RE, " ")
    .replace(SCOPED_PACKAGE_RE, " ")
    .replace(HANDLE_RE, " ")
    .replace(WINDOWS_PATH_RE, " ")
    .replace(UNIX_PATH_RE, " ")
    .replace(RELATIVE_PATH_RE, " ")
    .replace(FILE_EXT_RE, " ")
    .replace(CLI_FLAG_RE, " ")
    .replace(HEX_OR_UUID_RE, " ")
    .replace(SEMVER_RE, " ")
    .replace(NUMBER_WITH_UNIT_RE, " ")
    .replace(DOT_IDENTIFIER_RE, " ")
    .replace(SNAKE_CASE_RE, " ")
    .replace(CAMEL_OR_INTERNAL_CAPS_RE, " ")
    .replace(KEBAB_IDENTIFIER_RE, " ")
    .replace(ALL_CAPS_ACRONYM_RE, (token) => (isTechnicalAcronym(token) ? " " : token))
    .replace(/\s+/g, " ")
    .trim()
}

function isLikelyJsonOrConfigBlock(trimmed: string): boolean {
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (parsed !== null && typeof parsed === "object") {
        return true
      }
    } catch {
      // Partial / JSON5 / object literal check
      if (/["'][\w.-]+["']\s*:/.test(trimmed) && /[{}[\]]/.test(trimmed)) {
        return true
      }
    }
  }
  return false
}

const PROSE_AFTER_COMMAND_RE =
  /^\s*(?:python|git|docker|node|npm|pnpm|yarn|bun|cargo|go|curl|wget|powershell|pwsh|make)\s+(?:is|are|was|were|has|have|had|can|could|will|would|should|may|might|must|does|doesn't|isn't|aren't|makes?|allows?|provides?|helps?|runs?|uses?|needs?|supports?|offers?|works?|means?|reminds?|lets?)\b/i

function isLikelyCliCommand(trimmed: string): boolean {
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return false
  const cliLines = lines.filter((line) => CLI_PREFIX_RE.test(line))
  if (cliLines.length === lines.length) {
    // Make sure normal English prose sentences like "Python is one of...", "Go to the settings page...",
    // "Set up your provider...", or "Docker makes deployment easier." are NOT misread as CLI commands.
    if (lines.length === 1) {
      const line = lines[0]!
      if (/^go\s+(?:to|ahead|back|through|over|on)\b/i.test(line)) {
        return false
      }
      if (/^set\s+(?:up|the|a|an|your|this|it|out)\b/i.test(line)) {
        return false
      }
      if (/^export\s+(?:the|your|all|this|my)\b/i.test(line)) {
        return false
      }
      if (PROSE_AFTER_COMMAND_RE.test(line)) {
        return false
      }
    }
    return true
  }
  return false
}

/**
 * Determine if an entire block is code, CLI command, JSON config, file path,
 * URL, or non-natural-language technical token list that must NEVER be translated.
 */
export function isPureTechnicalOrCodeBlock(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return true

  if (isLikelyJsonOrConfigBlock(trimmed)) return true
  if (isLikelyCliCommand(trimmed)) return true

  const stripped = stripTechnicalTokens(trimmed)
  const strippedLetters = stripped.match(/\p{L}/gu)?.length ?? 0

  // If stripping technical tokens leaves almost no letters (<= 2 letters),
  // the block consists purely of URLs, paths, flags, identifiers, or numbers.
  if (strippedLetters <= 2) return true

  // Multi-line or single-line source code detection (only when NO non-Latin prose dominates)
  const nonLatinLetters = trimmed.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}]/gu)?.length ?? 0
  if (nonLatinLetters === 0) {
    const codeSyntaxMatches = trimmed.match(CODE_PUNCTUATION_RE)?.length ?? 0
    if (CODE_KEYWORD_LINE_RE.test(trimmed) && (codeSyntaxMatches >= 2 || /;\s*$/.test(trimmed))) {
      return true
    }
    if (codeSyntaxMatches >= 4 && codeSyntaxMatches / Math.max(1, strippedLetters) >= 0.14) {
      return true
    }
  }

  return false
}
