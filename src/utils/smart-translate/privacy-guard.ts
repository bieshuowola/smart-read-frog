export interface PrivacyGuardResult {
  isSensitive: boolean
  reason?: string
}

const SENSITIVE_PROTOCOLS = new Set([
  "chrome:",
  "chrome-extension:",
  "edge:",
  "about:",
  "moz-extension:",
  "devtools:",
  "view-source:",
  "data:",
  "blob:",
])

const SENSITIVE_HOST_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // Webmail
  {
    pattern:
      /(?:^|\.)(?:mail\.google\.com|outlook\.live\.com|outlook\.office\.com|outlook\.office365\.com|mail\.yahoo\.com|mail\.qq\.com|mail\.163\.com|mail\.126\.com|mail\.yeah\.net|mail\.sina\.com(?:\.cn)?|mail\.proton\.me|proton\.me|protonmail\.com|app\.tuta\.com|fastmail\.com|webmail\..+|mail\..+)$/i,
    reason: "webmail",
  },
  // Private messaging & team chat
  {
    pattern:
      /(?:^|\.)(?:web\.whatsapp\.com|web\.telegram\.org|messages\.google\.com|app\.slack\.com|teams\.microsoft\.com|teams\.live\.com|wx\.qq\.com|filehelper\.weixin\.qq\.com|im\.dingtalk\.com|messenger\.com)$/i,
    reason: "private_messaging",
  },
  // Banking, payments, brokerage & crypto exchanges
  {
    pattern:
      /(?:^|\.)(?:paypal\.com|pay\.alipay\.com|auth\.alipay\.com|pay\.weixin\.qq\.com|pay\.qq\.com|dashboard\.stripe\.com|chase\.com|bankofamerica\.com|wellsfargo\.com|citibank\.com|citi\.com|hsbc\.com|icbc\.com\.cn|ccb\.com|boc\.cn|abchina\.com|cmbchina\.com|bankcomm\.com|coinbase\.com|binance\.com|okx\.com|kraken\.com)$/i,
    reason: "financial_or_payment",
  },
  {
    pattern: /(?:^|[.-])(?:ebank|onlinebank|netbank|banking|webmail)(?:[.-]|$)/i,
    reason: "financial_or_webmail",
  },
]

const SENSITIVE_HOST_PATH_RULES: Array<{ hostPattern: RegExp; pathPattern: RegExp; reason: string }> = [
  {
    hostPattern: /(?:^|\.)discord\.com$/i,
    pathPattern: /^\/channels(?:\/|$)/i,
    reason: "private_messaging",
  },
  {
    hostPattern: /(?:^|\.)icloud\.com$/i,
    pathPattern: /^\/mail(?:\/|$)/i,
    reason: "webmail",
  },
  {
    hostPattern: /(?:^|\.)(?:feishu\.cn|larksuite\.com)$/i,
    pathPattern: /^\/(?:messenger|mail|drive)(?:\/|$)/i,
    reason: "private_workspace",
  },
  {
    hostPattern: /(?:^|\.)(?:accounts\.google\.com|login\.microsoftonline\.com|login\.live\.com|appleid\.apple\.com|id\.atlassian\.com)$/i,
    pathPattern: /.*/,
    reason: "authentication",
  },
]

const SENSITIVE_PATH_PREFIX_RE =
  /^\/(?:login|signin|sign-in|signup|sign-up|auth|oauth2?|sso|2fa|mfa|checkout|payment|payments|billing|wallet|inbox|messages|direct|dm)(?:\/|$)/i

/**
 * Privacy-first guard: blocks AUTOMATIC page upload on webmail, banking, payment,
 * login/auth, and private messaging pages unless the user explicitly triggers manual translation.
 */
export function evaluatePrivacyGuard(
  urlString: string,
  options: { enabled?: boolean; doc?: Document } = {},
): PrivacyGuardResult {
  if (options.enabled === false) {
    return { isSensitive: false }
  }

  let parsed: URL
  try {
    parsed = new URL(urlString)
  } catch {
    return { isSensitive: true, reason: "invalid_url" }
  }

  if (SENSITIVE_PROTOCOLS.has(parsed.protocol)) {
    return { isSensitive: true, reason: "internal_browser_page" }
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:" && parsed.protocol !== "file:") {
    return { isSensitive: true, reason: "unsupported_protocol" }
  }

  const host = parsed.hostname.toLowerCase()
  const path = parsed.pathname.toLowerCase()

  for (const rule of SENSITIVE_HOST_PATTERNS) {
    if (rule.pattern.test(host)) {
      return { isSensitive: true, reason: rule.reason }
    }
  }

  for (const rule of SENSITIVE_HOST_PATH_RULES) {
    if (rule.hostPattern.test(host) && rule.pathPattern.test(path)) {
      return { isSensitive: true, reason: rule.reason }
    }
  }

  if (SENSITIVE_PATH_PREFIX_RE.test(path)) {
    return { isSensitive: true, reason: "auth_or_private_route" }
  }

  if (options.doc) {
    const hasPasswordInput = Boolean(options.doc.querySelector('input[type="password"]'))
    const hasCreditCardInput = Boolean(
      options.doc.querySelector(
        'input[autocomplete*="cc-number"], input[autocomplete*="cc-csc"], input[name*="cardnumber" i]',
      ),
    )
    if (hasCreditCardInput) {
      return { isSensitive: true, reason: "payment_form" }
    }
    if (hasPasswordInput) {
      const bodyTextLength = (options.doc.body?.textContent ?? "").trim().length
      // Short login modal/form pages (not long articles that happen to have a header login modal)
      if (bodyTextLength < 1200) {
        return { isSensitive: true, reason: "login_form" }
      }
    }
  }

  return { isSensitive: false }
}
