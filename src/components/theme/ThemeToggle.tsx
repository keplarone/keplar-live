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
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      onClick={() => saveThemePref(dark ? "light" : "dark")}
      style={theme === null ? { visibility: "hidden" } : undefined}
    >
      {dark ? (
        <svg key="sun" className="kp-theme-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
          {/* Keplar Icons v2: a ring and eight orbit dots instead of the stock rays. */}
          <circle cx="8" cy="8" r="3" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <circle key={a} cx={8 + 5.6 * Math.cos((a * Math.PI) / 180)} cy={8 + 5.6 * Math.sin((a * Math.PI) / 180)} r={a % 90 ? 0.75 : 0.95} fill="currentColor" stroke="none" />
          ))}
        </svg>
      ) : (
        <svg key="moon" className="kp-theme-icon" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {/* Keplar Icons v2: a crescent with the orbit dot as a star. */}
          <path d="M12.9 9.7A5.4 5.4 0 0 1 6.3 3.1a5.4 5.4 0 1 0 6.6 6.6Z" />
          <circle cx="12.3" cy="3.6" r="1" fill="currentColor" stroke="none" />
        </svg>
      )}
    </button>
  );
}
