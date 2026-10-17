"use client";

import { useEffect } from "react";
import { applyTheme, readThemePref } from "@/lib/theme";

/**
 * Docs chrome (src/styles/docs-theme.css, scoped to <html data-docs="1">).
 * A full page load of /docs or docs.keplar.one gets data-docs from the head script before paint and keeps the site theme
 * (dark unless the visitor chose otherwise). This covers client-side navigation into the docs, and on the way out leaves the preference untouched.
 */
export function DocsSkin() {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-docs", "1");
    applyTheme(readThemePref());
    return () => {
      root.removeAttribute("data-docs");
      applyTheme(readThemePref());
    };
  }, []);
  return null;
}
