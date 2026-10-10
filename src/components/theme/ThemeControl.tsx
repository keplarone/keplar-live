"use client";

import { useEffect, useState } from "react";
import { applyTheme, readThemePref, saveThemePref, storedThemePref, THEME_KEY, isThemePref, type ThemePref } from "@/lib/theme";
import s from "./ThemeControl.module.css";

const OPTIONS: { id: ThemePref; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "auto", label: "Auto" },
];

function Glyph({ id }: { id: ThemePref }) {
  if (id === "dark")
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1Z" fill="currentColor" />
      </svg>
    );
  if (id === "light")
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <circle cx="8" cy="8" r="3" fill="currentColor" stroke="none" />
        <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
      </svg>
    );
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 2a6 6 0 0 1 0 12Z" fill="currentColor" />
    </svg>
  );
}

/**
 * Dark / Light / Auto segmented control. `compact` shows icons only (labels
 * stay available to assistive tech); the full variant shows text.
 */
export function ThemeControl({ compact = false, className }: { compact?: boolean; className?: string }) {
  // The inline head script already applied the stored preference; mirror it after mount.
  const [pref, setPref] = useState<ThemePref | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => setPref(readThemePref()), 0);
    return () => window.clearTimeout(t);
  }, []);

  const choose = (p: ThemePref) => {
    saveThemePref(p);
    setPref(p);
  };

  return (
    <div className={`${s.group} ${compact ? s.compact : ""} ${className ?? ""}`} role="radiogroup" aria-label="Theme">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={pref === o.id}
          className={s.option}
          onClick={() => choose(o.id)}
          title={compact ? `${o.label} theme${o.id === "auto" ? " (follows your system)" : ""}` : undefined}
        >
          <Glyph id={o.id} />
          <span className={compact ? "visually-hidden" : undefined}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Keeps Auto in sync with the OS and other tabs. Mounted once in the root layout. */
export function ThemeWatcher() {
  useEffect(() => {
    // The saved choice wins: on a client-rendered document (dynamic not-found pages) the head script never ran and data-theme-pref is the server default.
    applyTheme(storedThemePref() ?? readThemePref()); // also fixes meta theme-color once it exists
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onOs = () => {
      if (readThemePref() === "auto") applyTheme("auto");
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY && isThemePref(e.newValue)) applyTheme(e.newValue);
    };
    mq.addEventListener("change", onOs);
    window.addEventListener("storage", onStorage);
    return () => {
      mq.removeEventListener("change", onOs);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return null;
}
