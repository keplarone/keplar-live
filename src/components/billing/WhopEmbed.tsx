"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { onThemeChange, currentTheme } from "@/lib/theme";
import { parseUtm } from "@/lib/utm";
import { track } from "@/lib/analytics";
import s from "./embed.module.css";

export const WHOP_ELEMENTS_SRC = "https://cdn.whop.com/elements/amber/elements.js";

type Appearance = { theme: { appearance: "light" | "dark" } };
type Handle = { create: (kind: "checkout") => { mount: (target: string | HTMLElement) => void }; update?: (o: { appearance: Appearance }) => void; destroy: () => void };
type Factory = () => { checkout: { create: (o: Record<string, unknown>) => Handle } };
declare global {
  interface Window {
    WhopElements?: Factory;
  }
}

export type EmbedConfig = { planId: string; metadata: Record<string, string>; returnUrl: string };
type Props = { config: EmbedConfig; planName: string; onPaid: () => void; onFallback?: () => void };

const appearance = (): Appearance => ({ theme: { appearance: currentTheme() === "light" ? "light" : "dark" } });
const LOAD_TIMEOUT_MS = 20_000;

/**
 * Whop's embedded checkout (Elements). The script is loaded with next/script; the checkout is created and mounted in
 * an effect and destroyed on unmount. Loading, failure (script blocked or offline) and success are all handled, the
 * colour scheme follows the site theme (including live changes), and the container reserves its height so the page
 * doesn't jump. The buyer pays inside Whop's frame: card data never touches Keplar. Fulfilment comes from webhooks.
 */
export function WhopEmbed({ config, planName, onPaid, onFallback }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<Handle | null>(null);
  const [scriptReady, setScriptReady] = useState(() => typeof window !== "undefined" && Boolean(window.WhopElements));
  const [scriptFailed, setScriptFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const paidRef = useRef(onPaid);
  useEffect(() => {
    paidRef.current = onPaid;
  }, [onPaid]);

  const failed = scriptFailed || error;

  // Give up if the embed never becomes ready (blocked script, flaky network).
  useEffect(() => {
    if (!loading || failed) return;
    const t = window.setTimeout(() => setError("The secure checkout is taking too long to load."), LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [loading, failed, attempt]);

  useEffect(() => {
    if (!scriptReady || !window.WhopElements || !mountRef.current) return;
    const el = mountRef.current;
    let cancelled = false;
    try {
      const u = parseUtm((() => { try { return sessionStorage.getItem("keplar_utm") ?? ""; } catch { return ""; } })());
      const handle = window.WhopElements().checkout.create({
        plan: config.planId,
        metadata: config.metadata,
        returnUrl: config.returnUrl,
        appearance: appearance(),
        ...(Object.keys(u).length ? { attribution: { utmSource: u.utm_source, utmMedium: u.utm_medium, utmCampaign: u.utm_campaign, utmTerm: u.utm_term, utmContent: u.utm_content, source: "keplar.one" } } : {}),
        onLoadingChange: (l: boolean) => !cancelled && setLoading(l),
        onComplete: (p: { result?: string }) => {
          if (cancelled || p?.result !== "payment") return;
          track("checkout_complete", { plan: planName });
          paidRef.current();
        },
      });
      handle.create("checkout").mount(el);
      handleRef.current = handle;
    } catch {
      queueMicrotask(() => !cancelled && setError("The secure checkout couldn't start."));
    }
    const stopTheme = onThemeChange(() => {
      try {
        handleRef.current?.update?.({ appearance: appearance() });
      } catch {
        /* ignore: the frame keeps its current theme */
      }
    });
    return () => {
      cancelled = true;
      stopTheme();
      try {
        handleRef.current?.destroy();
      } catch {
        /* already gone */
      }
      handleRef.current = null;
      el.replaceChildren();
    };
  }, [scriptReady, config, attempt, planName]);

  const retry = useCallback(() => {
    setError(null);
    setScriptFailed(false);
    setLoading(true);
    setAttempt((n) => n + 1);
  }, []);

  return (
    <div className={s.wrap}>
      <Script
        src={WHOP_ELEMENTS_SRC}
        strategy="afterInteractive"
        data-whop-elements=""
        onReady={() => setScriptReady(Boolean(window.WhopElements) || false)}
        onError={() => setScriptFailed(true)}
      />
      {failed ? (
        <div className={s.fail} role="alert">
          <p>{scriptFailed ? "The secure checkout couldn't load. An ad or tracking blocker, or a network problem, may be blocking it." : error}</p>
          <div className={s.row}>
            <button type="button" className={s.btn} onClick={retry}>Try again</button>
            {onFallback ? <button type="button" className={`${s.btn} ${s.ghost}`} onClick={onFallback}>Use the hosted checkout instead</button> : null}
          </div>
        </div>
      ) : null}
      {loading && !failed ? (
        <div className={s.skeleton} role="status" aria-live="polite">
          <span className={s.pulse} />
          Loading secure checkout for {planName}…
        </div>
      ) : null}
      <div ref={mountRef} className={s.mount} data-ready={!loading && !failed ? "" : undefined} hidden={Boolean(failed)} />
    </div>
  );
}
