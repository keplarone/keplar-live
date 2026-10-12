"use client";
/**
 * useConsentText(): the cookie banner's strings in the language the visitor is reading. The banner lives in the root layout, outside
 * the localized pages' I18nProvider, so the language comes from the URL prefix (/pt-br/...) or, in the app (/app, no prefix), from
 * the saved language choice, the same one the app's own UI follows. Each language is its own small chunk, cached per page load.
 */
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { CONSENT_EN, loadConsent } from "./consent";
import { savedLocale } from "./client";
import { DEFAULT_LOCALE } from "./locales";
import { splitLocale } from "./routing";
import type { ConsentMessages } from "./types";

const cache = new Map<string, ConsentMessages>([[DEFAULT_LOCALE, CONSENT_EN]]);

/** Which language the banner speaks on `path`: the page's prefix, or for the app the saved choice. */
export function consentLocale(path: string, saved: () => string = savedLocale): string {
  const fromPath = splitLocale(path).locale;
  if (fromPath !== DEFAULT_LOCALE) return fromPath;
  return /^\/app(?:\/|$)/.test(path) ? saved() : DEFAULT_LOCALE;
}

/** `ready` is false while a non-English catalog loads, so the banner can wait instead of flashing English first. */
export function useConsentText(): { t: ConsentMessages; ready: boolean; locale: string } {
  const path = usePathname() ?? "/";
  // On the server there is no cookie, so this is the URL's language there; the banner renders nothing on the server anyway.
  const locale = useMemo(() => consentLocale(path), [path]);
  const [loaded, setLoaded] = useState<{ code: string; m: ConsentMessages } | null>(null);
  useEffect(() => {
    if (cache.has(locale)) return;
    let live = true;
    void loadConsent(locale).then((m) => {
      cache.set(locale, m);
      if (live) setLoaded({ code: locale, m });
    });
    return () => { live = false; };
  }, [locale]);
  const hit = cache.get(locale) ?? (loaded?.code === locale ? loaded.m : undefined);
  return { t: hit ?? CONSENT_EN, ready: hit !== undefined, locale };
}
