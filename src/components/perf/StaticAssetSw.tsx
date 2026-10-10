"use client";

import { useEffect } from "react";
import { afterPaint } from "@/lib/perf/after-paint";

/**
 * Registers the static-asset service worker (/sw.js) after first paint.
 * The worker only caches hashed /_next/static, /icons, /fonts, /fx — never HTML, /api, or Set-Cookie responses —
 * so auth sessions and HTML navigations stay network-fresh. On unsupported browsers or Secure-context failures it no-ops.
 */
export function StaticAssetSw() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    // Only on the real product hosts (and localhost for QA). Customer custom domains must not get our SW.
    const host = window.location.hostname;
    if (!(host === "keplar.one" || host === "www.keplar.one" || host === "docs.keplar.one" || host === "localhost" || host.endsWith(".vercel.app"))) return;
    return afterPaint(() => {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }, { timeout: 4000, minDelay: 500 });
  }, []);
  return null;
}
