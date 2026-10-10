/**
 * Locale-aware URLs. English stays at the root with no prefix; every other locale lives at /<code>/... (e.g. /es/pricing).
 * Only the pages listed in LOCALIZED_PATHS have localized versions; any other link keeps its English URL.
 */
import { ALL_LOCALES, DEFAULT_LOCALE, INDEXABLE, isLocale, localeInfo } from "./locales";

/** Pages that exist in every locale. Auth pages are localized but never indexed. */
export const LOCALIZED_PATHS = ["/", "/features", "/pricing", "/showcase", "/roadmap", "/developers", "/signin", "/signup"] as const;
export const INDEXABLE_PATHS = LOCALIZED_PATHS.filter((p) => p !== "/signin" && p !== "/signup");
const LOCALIZED = new Set<string>(LOCALIZED_PATHS);

const split = (href: string) => {
  const i = href.search(/[?#]/);
  return i < 0 ? [href, ""] : [href.slice(0, i), href.slice(i)];
};

/** `/es/pricing` → { locale: "es", path: "/pricing" }; `/pricing` → { locale: "en", path: "/pricing" }. */
export function splitLocale(pathname: string): { locale: string; path: string } {
  const seg = pathname.split("/")[1] ?? "";
  if (seg !== DEFAULT_LOCALE && isLocale(seg)) {
    const rest = pathname.slice(seg.length + 1);
    return { locale: seg, path: rest === "" ? "/" : rest };
  }
  return { locale: DEFAULT_LOCALE, path: pathname || "/" };
}

/** The locale a pathname is in ("en" outside the localized prefixes). */
export const localeOfPath = (pathname: string) => splitLocale(pathname).locale;

export const hasLocalizedVersion = (href: string) => LOCALIZED.has(split(href)[0] || "/");

/**
 * The URL of `href` in `locale`. Pages without a localized version keep their English URL, so a localized page never links to a 404.
 * Query and hash are kept: localizedPath("/#demo", "ja") === "/ja#demo".
 */
export function localizedPath(href: string, locale: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const [path, tail] = split(href);
  const bare = splitLocale(path || "/").path;
  if (locale === DEFAULT_LOCALE || !isLocale(locale) || !LOCALIZED.has(bare)) return `${bare}${tail}`;
  return `/${locale}${bare === "/" ? "" : bare}${tail}`;
}

/** hreflang map for a localized page: every indexable locale plus x-default (the English URL). Paths are relative to metadataBase. */
export function hreflangFor(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of INDEXABLE) out[l.hreflang] = localizedPath(path, l.code);
  out["x-default"] = path;
  return out;
}

/** Alternates block for page metadata: a self-canonical in the page's own locale, and hreflang when the locale is indexable. */
export function localeAlternates(path: string, locale: string): { canonical: string; languages?: Record<string, string> } {
  const canonical = localizedPath(path, locale);
  if (!INDEXABLE_PATHS.includes(path as (typeof INDEXABLE_PATHS)[number]) || localeInfo(locale).status !== "stable") return { canonical };
  return { canonical, languages: hreflangFor(path) };
}

/** Static params for the [locale] segment (every non-English locale). */
export const localeParams = () => ALL_LOCALES.filter((l) => l.code !== DEFAULT_LOCALE).map((l) => ({ locale: l.code }));
