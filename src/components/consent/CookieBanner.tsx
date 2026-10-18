"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { acceptAll, CONSENT_OPEN_EVENT, readConsent, rejectAll, saveConsent } from "@/lib/consent";
import s from "./CookieBanner.module.css";
import { usePresence } from "@/components/motion/usePresence";
import { useConsentText } from "@/lib/i18n/consent-client";
import { localeInfo } from "@/lib/i18n/locales";

/**
 * First-visit cookie choice. Non-modal (never traps focus or blocks the page), fixed-position (no layout shift),
 * placed first in the DOM so keyboard and screen-reader users reach it immediately. On /app it sits at the top so it never covers the composer; on /welcome it sits at the bottom right (the setup card is on the left) and, on narrow screens, waits until the next page (optional cookies stay off meanwhile). Re-opened from the footer and Settings via the `keplar:consent-open` event.
 */
export function CookieBanner() {
  const [open, setOpen] = useState(false);
  const banner = usePresence(open); // rises in, and sinks out after a choice instead of vanishing
  const [custom, setCustom] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [status, setStatus] = useState("");
  const path = usePathname() ?? "";
  const region = useRef<HTMLDivElement>(null);
  const wasOpenedByUser = useRef(false);
  // In the page's language (or the app's saved one); a non-English banner waits for its strings instead of flashing English.
  const { t, ready, locale } = useConsentText();

  useEffect(() => {
    const root = document.documentElement;
    const el = region.current;
    if (!el) {
      root.removeAttribute("data-consent-open");
      root.style.removeProperty("--consent-bar");
      return;
    }
    const apply = () => {
      root.setAttribute("data-consent-open", "");
      root.style.setProperty("--consent-bar", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    };
    apply();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(apply);
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.removeAttribute("data-consent-open");
      root.style.removeProperty("--consent-bar");
    };
  }, [banner.mounted, ready, custom, path]);

  useEffect(() => {
    const rec = readConsent();
    const t = window.setTimeout(() => {
      if (!rec) setOpen(true);
      else setAnalytics(rec.choices.analytics);
    }, 0);
    const reopen = () => {
      wasOpenedByUser.current = true;
      setAnalytics(readConsent()?.choices.analytics ?? false);
      setCustom(true);
      setOpen(true);
      window.setTimeout(() => region.current?.querySelector<HTMLElement>("input:not([disabled]), button")?.focus(), 30);
    };
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
    };
  }, []);

  const done = useCallback((choices: { analytics: boolean }, message: string) => {
    saveConsent(choices);
    setAnalytics(choices.analytics);
    setStatus(message);
    setOpen(false);
    setCustom(false);
  }, []);

  if (path === "/embed" || path.startsWith("/embed/")) return null; // framed widget on other sites: essential cookies only, no banner inside someone else's page
  if (!banner.mounted || !ready) return <p className={s.sr} role="status" aria-live="polite">{status}</p>;
  const info = localeInfo(locale);
  const onChat = path === "/" || path.startsWith("/app");
  const placement = onChat ? "bar" : path.startsWith("/welcome") ? "side" : "bottom";
  return (
    <div ref={region} className={s.banner} data-cookie-banner="" data-placement={placement} {...banner.motion("toast")} role="region" aria-labelledby="cookie-title" lang={info?.code ?? "en"} dir={info?.dir ?? "ltr"} onKeyDown={(e) => { if (e.key === "Escape" && wasOpenedByUser.current) setOpen(false); }}>
      <h2 id="cookie-title" className={s.title}>{t.title}</h2>
      <p className={s.text}>
        {t.text}{" "}
        <Link href="/privacy#cookies" className={s.link}>{t.details}</Link>
      </p>
      {custom ? (
        <fieldset className={s.cats}>
          <legend className={s.sr}>{t.categories}</legend>
          <label className={s.cat}>
            <input type="checkbox" checked disabled />
            <span><b>{t.essential}</b> {t.essentialDesc}</span>
          </label>
          <label className={s.cat}>
            <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} />
            <span><b>{t.analytics}</b> {t.analyticsDesc}</span>
          </label>
        </fieldset>
      ) : null}
      <div className={s.actions}>
        {custom ? (
          <button type="button" className={s.primary} onClick={() => done({ analytics }, t.saved)}>{t.save}</button>
        ) : (
          <>
            <button type="button" className={s.primary} onClick={() => done(acceptAll(), t.accepted)}>{t.acceptAll}</button>
            <button type="button" className={s.secondary} onClick={() => done(rejectAll(), t.rejected)}>{t.reject}</button>
            <button type="button" className={s.tertiary} onClick={() => setCustom(true)} aria-expanded={custom}>{t.customize}</button>
          </>
        )}
        {custom ? <button type="button" className={s.tertiary} onClick={() => done(rejectAll(), t.rejected)}>{t.reject}</button> : null}
      </div>
    </div>
  );
}
