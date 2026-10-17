"use client";

import { useSyncExternalStore } from "react";
import { currentTheme, onThemeChange, saveThemePref, type Theme } from "@/lib/theme";

/**
 * One-click light/dark switch (a round sun/moon button) for the nav and the app top bar. It saves an explicit "light" or "dark"
 * preference (Auto stays available in Settings and the footer theme control) and follows changes made anywhere else.
 * The icon spins in when it swaps (kp-theme-icon, redesign.css) while the page crossfades (saveThemePref).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore<Theme | null>((cb) => onThemeChange(() => cb()), currentTheme, () => null);
  const dark = theme === "dark";
  return (
    <button
      type="button"
      className={className}
      data-glass-pill=""
      data-distort=""
      data-glass-chip=""
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      onClick={() => saveThemePref(dark ? "light" : "dark")}
      style={theme === null ? { visibility: "hidden" } : undefined}
    >
      {dark ? (
        <svg key="sun" className="kp-theme-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
        </svg>
      ) : (
        <svg key="moon" className="kp-theme-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        </svg>
      )}
    </button>
  );
}
