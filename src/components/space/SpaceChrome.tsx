"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";

// three.js only runs in the browser: loaded after hydration, never on the server.
const Starfield = dynamic(() => import("./Starfield"), { ssr: false });

/** The star field (mounted once by the Space layout, so it survives navigation) and the scroll reveals. */
export function SpaceBackground() {
  return <Starfield />;
}

/**
 * Elements with data-reveal fade and rise into place the first time they scroll into view; children of a data-reveal-stagger
 * group follow one another. Without JavaScript, or with reduced motion, everything is simply visible (see space.module.css).
 */
export function SpaceReveal() {
  // Keep the site theme dark while on Space pages (the layout's inline script sets it before paint). Leaving restores the
  // person's own choice, read from data-theme-pref (what the site's theme script recorded), not from the forced value.
  useEffect(() => {
    const r = document.documentElement;
    r.setAttribute("data-theme", "dark");
    r.classList.remove("light");
    r.classList.add("dark");
    r.style.colorScheme = "dark";
    return () => {
      const pref = r.getAttribute("data-theme-pref");
      const dark = pref === "dark" || (pref !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      const t = dark ? "dark" : "light";
      r.setAttribute("data-theme", t);
      r.classList.remove(dark ? "light" : "dark");
      r.classList.add(t);
      r.style.colorScheme = t;
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    root.dataset.spaceReveal = "on";
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).dataset.shown = "true";
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    const scan = () => document.querySelectorAll<HTMLElement>("[data-reveal]:not([data-shown])").forEach((el) => io.observe(el));
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
      delete root.dataset.spaceReveal;
    };
  }, []);
  return null;
}
