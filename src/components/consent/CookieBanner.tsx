"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { acceptAll, CONSENT_OPEN_EVENT, readConsent, rejectAll, saveConsent } from "@/lib/consent";
import s from "./CookieBanner.module.css";
import { usePresence } from "@/components/motion/usePresence";

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
  if (!banner.mounted) return <p className={s.sr} role="status" aria-live="polite">{status}</p>;
  const placement = path.startsWith("/app") ? "top" : path.startsWith("/welcome") ? "side" : "bottom";
  return (
    <div ref={region} className={s.banner} data-placement={placement} {...banner.motion(placement === "top" ? "drop" : "toast")} role="region" aria-labelledby="cookie-title" onKeyDown={(e) => { if (e.key === "Escape" && wasOpenedByUser.current) setOpen(false); }}>
      <h2 id="cookie-title" className={s.title}>Cookies</h2>
      <p className={s.text}>
        Keplar always uses the cookies it needs to work: sign-in, security, your plan and usage counts, and your theme. Optional page-view and speed analytics stay off unless you allow them. Keplar also counts visits and who is online now on its own server without cookies or storing your IP address.{" "}
        <Link href="/privacy#cookies" className={s.link}>Details</Link>
      </p>
      {custom ? (
        <fieldset className={s.cats}>
          <legend className={s.sr}>Cookie categories</legend>
          <label className={s.cat}>
            <input type="checkbox" checked disabled />
            <span><b>Essential</b> Always on. Sign-in session, security, plan and usage counters, theme, and this choice.</span>
          </label>
          <label className={s.cat}>
            <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} />
            <span><b>Analytics</b> Page views, button clicks and page speed on the public site (Vercel), plus which page a visit started on and whether it led to a sign-up or answer. Never your questions. No ads, no cross-site tracking.</span>
          </label>
        </fieldset>
      ) : null}
      <div className={s.actions}>
        {custom ? (
          <button type="button" className={s.primary} onClick={() => done({ analytics }, "Cookie choices saved.")}>Save choices</button>
        ) : (
          <>
            <button type="button" className={s.primary} onClick={() => done(acceptAll(), "All cookies accepted.")}>Accept all</button>
            <button type="button" className={s.secondary} onClick={() => done(rejectAll(), "Only essential cookies in use.")}>Reject non-essential</button>
            <button type="button" className={s.tertiary} onClick={() => setCustom(true)} aria-expanded={custom}>Customize</button>
          </>
        )}
        {custom ? <button type="button" className={s.tertiary} onClick={() => done(rejectAll(), "Only essential cookies in use.")}>Reject non-essential</button> : null}
      </div>
    </div>
  );
}
