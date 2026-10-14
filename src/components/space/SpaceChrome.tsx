"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

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

const WORDS = ["Powerful", "Mighty", "Capable", "Potent", "Formidable", "Robust"] as const;

/**
 * "Powerful" in the headline, cycling smoothly through synonyms: the outgoing word lifts and blurs away while the next rises
 * in, and the slot's width eases to the new word so the line never jumps. Screen readers get the first word only (the line is
 * labelled once); with reduced motion the word stays "Powerful".
 */
export function RotatingWord({ className, wordClassName }: { className?: string; wordClassName?: string }) {
  const [i, setI] = useState(0);
  const [width, setWidth] = useState<number | null>(null);
  const measure = useRef<HTMLSpanElement[]>([]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % WORDS.length), 2600);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    const el = measure.current[i];
    if (el) setWidth(el.getBoundingClientRect().width);
    const onResize = () => { const m = measure.current[i]; if (m) setWidth(m.getBoundingClientRect().width); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [i]);

  return (
    <span className={className} style={width ? { width } : undefined} aria-hidden="true">
      {WORDS.map((w, k) => (
        <span
          key={w}
          ref={(el) => { if (el) measure.current[k] = el; }}
          className={wordClassName}
          data-state={k === i ? "in" : k === (i + WORDS.length - 1) % WORDS.length ? "out" : "idle"}
        >
          {w}
        </span>
      ))}
    </span>
  );
}

const CHAPTERS = [
  { id: "top", label: "Leaving orbit" },
  { id: "models", label: "Through the star field" },
  { id: "plans", label: "Crossing the nebula" },
  { id: "today", label: "Along the Milky Way" },
  { id: "arrive", label: "Arrival" },
] as const;

/** A small fixed caption naming the stretch of the journey the page is on, with a progress line. Decorative only. */
export function JourneyCaption({ className, lineClassName, fillClassName }: { className?: string; lineClassName?: string; fillClassName?: string }) {
  const [label, setLabel] = useState<string>(CHAPTERS[0].label);
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setP(max > 0 ? Math.min(1, window.scrollY / max) : 0);
      let current: string = CHAPTERS[0].label;
      for (const c of CHAPTERS) {
        const el = document.getElementById(c.id);
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.55) current = c.label;
      }
      setLabel(current);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(raf); };
  }, []);
  return (
    <div className={className} aria-hidden="true">
      <span key={label}>{label}</span>
      <span className={lineClassName}><span className={fillClassName} style={{ transform: `scaleX(${p})` }} /></span>
    </div>
  );
}
