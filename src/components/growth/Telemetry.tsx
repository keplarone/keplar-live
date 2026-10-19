"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CONSENT_EVENT, consentAllows } from "@/lib/consent";
import { captureUtm } from "@/lib/utm";
import { captureLanding } from "@/lib/seo-events";

/**
 * Marketing pages and the chat home (never /app). Page views, Web Vitals and campaign tags run ONLY after the visitor allowed
 * Analytics in the cookie banner; before that (and after "Reject") no analytics script is loaded or called.
 */
export function Telemetry() {
  const [on, setOn] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    const sync = () => setOn(consentAllows("analytics"));
    sync();
    window.addEventListener(CONSENT_EVENT, sync);
    return () => window.removeEventListener(CONSENT_EVENT, sync);
  }, []);
  useEffect(() => {
    if (!on) return;
    captureUtm();
    captureLanding(pathname, window.location.search); // first-party landing-page attribution (src/lib/seo-events.ts)
  }, [on, pathname]);
  if (!on) return null;
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
