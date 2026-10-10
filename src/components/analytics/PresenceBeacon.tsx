"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { routeOf } from "@/lib/traffic/route";
import { HEARTBEAT_MS } from "@/lib/traffic/presence-config";

/**
 * Anonymous "on the site now" heartbeat. No cookies, no ids: the server derives a daily code from the connection itself.
 * Starts only after the page has loaded and the browser is idle (never competes with first paint, so Lighthouse is unaffected),
 * beats every 15 s while the tab is visible, pauses when it is hidden, and sends a leave beacon on pagehide. It never runs on
 * admin, API or other private paths (same list as the visit counter), for Do Not Track / Global Privacy Control, or in automated browsers.
 */
export function PresenceBeacon() {
  const pathname = usePathname();
  const active = routeOf(pathname || "/") !== null;

  useEffect(() => {
    if (!active) return;
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl || nav.webdriver) return;

    let timer: number | undefined;
    let began = false;
    let stopped = false;
    const send = (body: "hb" | "bye") => {
      try {
        if (typeof nav.sendBeacon === "function" && nav.sendBeacon("/api/presence", body)) return;
        void fetch("/api/presence", { method: "POST", body, keepalive: true, credentials: "omit" }).catch(() => undefined);
      } catch {
        /* presence must never break a page */
      }
    };
    const tick = () => {
      if (document.visibilityState === "visible") send("hb");
    };
    const run = () => {
      if (timer === undefined) timer = window.setInterval(tick, HEARTBEAT_MS);
    };
    const pause = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    const begin = () => {
      if (stopped) return;
      began = true;
      if (document.visibilityState === "visible") {
        tick();
        run();
      }
    };
    const onVisibility = () => {
      if (!began || stopped) return;
      if (document.visibilityState === "visible") {
        tick();
        run();
      } else pause();
    };
    const onPageHide = () => {
      pause();
      send("bye");
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) onVisibility();
    };
    const boot = () => {
      const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) ric(begin, { timeout: 5000 });
      else window.setTimeout(begin, 3000);
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    if (document.readyState === "complete") boot();
    else window.addEventListener("load", boot, { once: true });
    return () => {
      stopped = true;
      pause();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("load", boot);
      if (began) send("bye");
    };
  }, [active]);

  return null;
}
