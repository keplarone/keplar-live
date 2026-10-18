"use client";

import { useEffect } from "react";
import { applyTheme, readThemePref } from "@/lib/theme";

/**
 * Docs-only white-and-blue skin (src/styles/docs-theme.css, scoped to <html data-docs="1">).
 * A full page load of /docs or docs.keplar.one gets data-docs and the light theme from the head script before paint (THEME_SCRIPT);
 * PageMonolith draws no field while data-docs is set. This covers client-side navigation into the docs, and on the way out restores the visitor's own theme preference (never saved over).
 */
export function DocsSkin() {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-docs", "1");
    applyTheme(readThemePref()); // resolves to light while data-docs is set; also sets meta theme-color to white
    return () => {
      root.removeAttribute("data-docs");
      applyTheme(readThemePref());
    };
  }, []);
  return null;
}
