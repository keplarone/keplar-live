"use client";

import { useSyncExternalStore } from "react";
import { KeplarSymbol } from "@/components/brand";
import { OPEN_PALETTE_EVENT } from "@/lib/nav/commands";
import s from "./DesktopTitleBar.module.css";

const onDesktop = (cb: () => void) => {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-desktop"] });
  return () => obs.disconnect();
};
const isDesktop = () => document.documentElement.getAttribute("data-desktop") === "1";
const noSubscribe = () => () => {};
const isMac = () => /Mac/.test(navigator.platform || navigator.userAgent);

/**
 * The desktop app's own title bar (html[data-desktop], src/lib/desktop.ts): a draggable band above the app with back and
 * forward, the app name and a search field that opens the command palette. The window controls (Windows) or traffic lights
 * (macOS) sit in the band too, outside env(titlebar-area-*), so nothing in the app ever slides under them.
 * Renders nothing in a browser.
 */
export function DesktopTitleBar() {
  const on = useSyncExternalStore(onDesktop, isDesktop, () => false);
  const mac = useSyncExternalStore(noSubscribe, isMac, () => false);
  if (!on) return null;
  return (
    <div className={s.bar} data-keplar-drag="" data-desktop-titlebar="" data-mac={mac || undefined}>
      <div className={s.left}>
        <span className={s.brand} aria-hidden="true">
          <KeplarSymbol size={14} />
          <span>Keplar</span>
        </span>
        <button type="button" className={s.nav} onClick={() => history.back()} aria-label="Back" title={mac ? "Back (⌘[)" : "Back (Alt ←)"}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <button type="button" className={s.nav} onClick={() => history.forward()} aria-label="Forward" title={mac ? "Forward (⌘])" : "Forward (Alt →)"}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
      <button type="button" className={s.search} onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))} aria-keyshortcuts="Control+K Meta+K">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <span>Search Keplar</span>
        <kbd>{mac ? "⌘K" : "Ctrl K"}</kbd>
      </button>
      <div className={s.right} />
    </div>
  );
}
