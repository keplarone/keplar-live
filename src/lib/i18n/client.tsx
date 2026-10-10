"use client";
/**
 * Client side of i18n. <I18nProvider> receives the active locale's (already merged) strings from the server layout, so only
 * that locale reaches the browser. Outside a provider (the English pages) the hooks return English.
 * The app (/app, no URL prefix) uses <AppI18n>, which lazy-loads the saved locale's chunk on the client.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import commonEn from "./messages/common/en";
import clientEn from "./messages/client/en";
import appEn from "./messages/app/en";
import { loaders as commonLoaders } from "./loaders/common";
import { loaders as appLoaders } from "./loaders/app";
import { withFallback } from "./merge";
import { DEFAULT_LOCALE, isLocale, localeInfo } from "./locales";
import { LOCALE_COOKIE } from "./detect";
import { splitLocale } from "./routing";
import type { AppMessages, ClientMessages, CommonMessages } from "./types";

type Ctx = { locale: string; common?: CommonMessages; client?: ClientMessages; app?: AppMessages };
const I18nCtx = createContext<Ctx | null>(null);

export function I18nProvider({ locale, common, client, app, children }: Ctx & { children: ReactNode }) {
  const outer = useContext(I18nCtx);
  return <I18nCtx.Provider value={{ locale, common: common ?? outer?.common, client: client ?? outer?.client, app: app ?? outer?.app }}>{children}</I18nCtx.Provider>;
}

/** Active locale: the provider's, else the URL prefix, else English. */
export function useLocale(): string {
  const ctx = useContext(I18nCtx);
  const path = usePathname() ?? "/";
  return ctx?.locale ?? splitLocale(path).locale;
}
export const useCommon = (): CommonMessages => useContext(I18nCtx)?.common ?? commonEn;
export const useClientText = (): ClientMessages => useContext(I18nCtx)?.client ?? clientEn;
export const useAppText = (): AppMessages => useContext(I18nCtx)?.app ?? appEn;

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[-.]/g, "\\$&")}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** Remember the visitor's language for a year (the picker; read first by detection and by the app). */
export function saveLocale(code: string) {
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(code)}; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  window.dispatchEvent(new CustomEvent("keplar:locale", { detail: { locale: code } }));
}

/** The saved choice (cookie), for surfaces without a URL locale. */
export const savedLocale = (): string => {
  const c = readCookie(LOCALE_COOKIE);
  return c && isLocale(c) ? c : DEFAULT_LOCALE;
};

export async function loadCommon(locale: string): Promise<CommonMessages> {
  if (locale === DEFAULT_LOCALE) return commonEn;
  const load = commonLoaders[locale];
  return withFallback(commonEn as CommonMessages, load ? (await load().catch(() => ({ default: {} }))).default : {});
}

async function loadApp(locale: string): Promise<{ app: AppMessages; common: CommonMessages }> {
  if (locale === DEFAULT_LOCALE) return { app: appEn, common: commonEn };
  const load = appLoaders[locale];
  const [a, common] = await Promise.all([load ? load().then((m) => m.default).catch(() => ({})) : Promise.resolve({}), loadCommon(locale)]);
  return { app: withFallback(appEn as AppMessages, a), common };
}

/**
 * The app's UI language: the saved choice (cookie). English renders at once; another locale's chunk loads after mount and the
 * strings swap in. <html lang/dir> follow, so Arabic, Hebrew and Urdu lay the app out right to left.
 */
export function AppI18n({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Ctx>({ locale: DEFAULT_LOCALE });
  useEffect(() => {
    let live = true;
    const apply = (code: string) => {
      const info = localeInfo(code);
      void loadApp(info.code).then((m) => {
        if (!live) return;
        setState({ locale: info.code, ...m });
        document.documentElement.lang = info.lang;
        document.documentElement.dir = info.dir;
      });
    };
    apply(savedLocale());
    const on = (e: Event) => apply((e as CustomEvent<{ locale: string }>).detail?.locale ?? savedLocale());
    window.addEventListener("keplar:locale", on);
    return () => {
      live = false;
      window.removeEventListener("keplar:locale", on);
      document.documentElement.lang = "en";
      document.documentElement.dir = "ltr";
    };
  }, []);
  return <I18nCtx.Provider value={state}>{children}</I18nCtx.Provider>;
}
