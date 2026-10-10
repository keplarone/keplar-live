"use client";
/**
 * A quiet offer to switch language, never a redirect. Shown when the visitor's saved choice (keplar-locale) or, failing that,
 * their browser language (the proxy's keplar-lang-hint cookie from Accept-Language, else navigator.languages) differs from the
 * page they are on, and this page exists in that language. Written in the suggested language. "No thanks" remembers the answer.
 * Crawlers never get a hint cookie, and nothing here changes the URL by itself.
 */
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DISMISS_KEY, HINT_COOKIE, LOCALE_COOKIE, fromAcceptLanguage, isBot } from "@/lib/i18n/detect";
import { isLocale, localeInfo } from "@/lib/i18n/locales";
import { hasLocalizedVersion, localizedPath, splitLocale } from "@/lib/i18n/routing";
import { loadCommon, readCookie, saveLocale } from "@/lib/i18n/client";
import type { CommonMessages } from "@/lib/i18n/types";
import s from "./LocaleSuggest.module.css";

export function LocaleSuggest() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [offer, setOffer] = useState<{ code: string; text: CommonMessages["banner"] } | null>(null);

  useEffect(() => {
    if (isBot(navigator.userAgent)) return;
    const { locale: current, path } = splitLocale(pathname);
    if (!hasLocalizedVersion(path)) return;
    const saved = readCookie(LOCALE_COOKIE);
    const hint = readCookie(HINT_COOKIE);
    const want = saved && isLocale(saved) ? saved : hint && isLocale(hint) ? hint : fromAcceptLanguage(navigator.languages?.join(","));
    if (!want || want === current) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === want) return;
    } catch { /* storage blocked: still offer */ }
    let live = true;
    void loadCommon(want).then((m) => { if (live) setOffer({ code: want, text: m.banner }); });
    return () => { live = false; setOffer(null); };
  }, [pathname]);

  if (!offer) return null;
  const info = localeInfo(offer.code);
  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, offer.code); } catch { /* ignore */ }
    setOffer(null);
  };
  const go = () => {
    saveLocale(offer.code);
    setOffer(null);
    router.push(localizedPath(`${splitLocale(pathname).path}${location.search}${location.hash}`, offer.code));
  };
  return (
    <div className={s.bar} role="region" aria-label={offer.text.text} lang={info.lang} dir={info.dir}>
      <p className={s.text}>{offer.text.text}</p>
      <button type="button" className={s.go} onClick={go}>{offer.text.switch}</button>
      <button type="button" className={s.no} onClick={dismiss}>{offer.text.dismiss}</button>
    </div>
  );
}
