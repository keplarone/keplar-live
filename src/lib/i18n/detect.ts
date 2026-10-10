/**
 * Locale detection, for SUGGESTING a language only. Keplar never redirects on language: a visitor always gets the URL they
 * asked for, and crawlers get no hint at all (each locale is its own URL, discovered through hreflang and the sitemap).
 *
 * Order: the saved choice (keplar-locale cookie, set by the language picker) first, then the browser's Accept-Language.
 * The proxy turns the result into a short-lived hint cookie; the LocaleSuggest banner reads it and offers a quiet, dismissible switch.
 */
import { DEFAULT_LOCALE, isLocale, LOCALES } from "./locales";

export const LOCALE_COOKIE = "keplar-locale";
export const HINT_COOKIE = "keplar-lang-hint";
export const DISMISS_KEY = "keplar-lang-banner-dismissed";

/** Old or alternative tags browsers still send. */
const ALIASES: Record<string, string> = {
  pt: "pt-br", zh: "zh-cn", "zh-hans": "zh-cn", "zh-sg": "zh-cn", "zh-hant": "zh-tw", "zh-hk": "zh-tw", "zh-mo": "zh-tw",
  tl: "fil", iw: "he", in: "id", ji: "yi", no: "nb", nn: "nb", "ku-arab": "ckb",
};

/** Best registry code for one BCP 47 tag ("es-MX" → "es", "pt-PT" → "pt-pt", "en-GB" → "en"), or null. */
export function matchLocale(tag: string): string | null {
  const t = tag.trim().toLowerCase().replace(/_/g, "-");
  if (!t || t === "*") return null;
  if (t === DEFAULT_LOCALE || t.startsWith("en-")) return DEFAULT_LOCALE;
  if (isLocale(t)) return t;
  if (ALIASES[t]) return ALIASES[t];
  const parts = t.split("-");
  for (let i = parts.length - 1; i > 0; i--) {
    const head = parts.slice(0, i).join("-");
    if (ALIASES[head]) return ALIASES[head];
    if (isLocale(head)) return head;
  }
  return null;
}

/** Accept-Language tags by quality, highest first (ties keep header order). */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .slice(0, 20)
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim(), q: Number.isFinite(quality) ? quality : 0, i };
    })
    .filter((x) => x.tag && x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i)
    .map((x) => x.tag);
}

export function fromAcceptLanguage(header: string | null | undefined): string | null {
  for (const tag of parseAcceptLanguage(header)) {
    const m = matchLocale(tag);
    if (m) return m;
  }
  return null;
}

const BOT = /bot\b|crawler|spider|crawling|slurp|bingpreview|mediapartners|facebookexternalhit|embedly|quora link preview|whatsapp|telegrambot|discordbot|slackbot|twitterbot|linkedinbot|pinterest|vkshare|w3c_validator|lighthouse|chrome-lighthouse|headlesschrome|petalbot|yandex|baiduspider|duckduckgo|applebot|gptbot|claudebot|claude-|perplexity|oai-searchbot|chatgpt-user|google-extended|googleother|google-inspectiontool|ahrefs|semrush|mj12bot|dotbot|bytespider|amazonbot|ccbot|curl\/|wget\/|python-requests|node-fetch|undici|go-http-client|okhttp|axios/i;
/** Crawlers, link unfurlers and scripts: no locale hint, ever. An empty user agent counts as a bot. */
export const isBot = (ua: string | null | undefined) => !ua || BOT.test(ua);

/**
 * The locale to suggest to this visitor, or null. Never a redirect: callers only show an offer.
 * `current` is the locale of the page being viewed (no suggestion when it already matches); omit it to get the preference itself.
 */
export function suggestLocale(input: { cookie?: string | null; acceptLanguage?: string | null; userAgent?: string | null; current?: string }): string | null {
  if (isBot(input.userAgent)) return null;
  const saved = input.cookie && isLocale(input.cookie) ? input.cookie : null;
  const want = saved ?? fromAcceptLanguage(input.acceptLanguage);
  if (!want || (input.current !== undefined && want === input.current)) return null;
  return want;
}

/** Number of non-English locales the detector can point at (used by tests). */
export const DETECTABLE = LOCALES.length;
