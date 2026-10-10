"use client";

import { useEffect } from "react";
import { SEND_EVENT } from "@/lib/spatial/events";
import { seoTrack } from "@/lib/seo-events";

/** /welcome only reaches new accounts, so arriving here means a sign-up just finished. Reports it once (consent permitting). */
export function SignupBeacon() {
  useEffect(() => {
    seoTrack("signup_complete");
  }, []);
  return null;
}

/**
 * /app: reports the first question sent and the first synthesized answer shown. It listens to the app's own
 * `keplar:send` event (which carries no text) and to the answer element appearing; it never reads what was asked or answered.
 */
export function AppBeacon() {
  useEffect(() => {
    const onSend = () => seoTrack("first_prompt");
    window.addEventListener(SEND_EVENT, onSend);
    const root = document.getElementById("main");
    let obs: MutationObserver | null = null;
    if (root) {
      const check = () => {
        const done = root.querySelector('article[data-level]:not([aria-busy="true"])');
        if (done) seoTrack("synthesis_success", { level: done.getAttribute("data-level") ?? undefined });
      };
      obs = new MutationObserver(() => check());
      obs.observe(root, { childList: true, subtree: true });
    }
    return () => {
      window.removeEventListener(SEND_EVENT, onSend);
      obs?.disconnect();
    };
  }, []);
  return null;
}
