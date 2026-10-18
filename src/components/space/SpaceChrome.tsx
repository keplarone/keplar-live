"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isPhone } from "@/lib/fx/lite";
import { PAUSE_KEY, isMotionPaused, setMotionPaused, subscribePause } from "./motion-pause";

/** True while the visitor has paused the site's motion (MotionToggle). */
export function useMotionPaused() {
  return useSyncExternalStore(subscribePause, isMotionPaused, () => false);
}

/**
 * The pause / play control for the hero's moving parts. A real button whose label says what it will do; restores a saved
 * pause on load. Phones and reduced motion keep everything still already, so it is not rendered there.
 */
export function MotionToggle({ className }: { className?: string }) {
  const isPaused = useMotionPaused();
  const [show, setShow] = useState(false);
  useEffect(() => {
    // Phones keep everything still already (no cycling, a still star field); reduced motion too. Nothing to pause there.
    if (isPhone() || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let saved = false;
    try { saved = localStorage.getItem(PAUSE_KEY) === "1"; } catch { /* ignore */ }
    if (saved && !isMotionPaused()) setMotionPaused(true);
    const raf = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  if (!show) return null;
  return (
    <button
      type="button"
      className={className ? `sp-btn ${className}` : "sp-btn"}
      data-sp-btn=""
      data-variant="ghost"
      data-size="sm"
      onClick={() => setMotionPaused(!isPaused)}
    >
      <span className="sp-btn__label" aria-hidden="true">
        {isPaused ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M3 1.8v8.4c0 .5.5.8.9.5l6.6-4.2a.6.6 0 0 0 0-1L3.9 1.3c-.4-.3-.9 0-.9.5z" /></svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2.2" y="1.5" width="2.6" height="9" rx="1" /><rect x="7.2" y="1.5" width="2.6" height="9" rx="1" /></svg>
        )}
      </span>
      <span className="sp-btn__label">{isPaused ? "Play animation" : "Pause animation"}</span>
    </button>
  );
}

// three.js only runs in the browser: loaded after hydration, never on the server.
const Starfield = dynamic(() => import("./Starfield"), { ssr: false });

/**
 * The star field (mounted once by the Space layout, so it survives navigation) and the scroll reveals. Phones start it once the
 * page is idle (at most 2.5s after load), so three.js never competes with the hero's first paint and first tap there; wider
 * screens start it on the first frame after hydration, as before.
 */
export function SpaceBackground() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!isPhone()) {
      const raf = requestAnimationFrame(() => setOn(true));
      return () => cancelAnimationFrame(raf);
    }
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setOn(true), { timeout: 2500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(() => setOn(true), 1200);
    return () => window.clearTimeout(t);
  }, []);
  return on ? <Starfield /> : null;
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
    // Phones: no reveal, text is simply there (a fade on every block left it half-transparent while scrolling a small screen).
    if (isPhone() || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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
 * "Powerful" in the headline, cycling smoothly through synonyms: the outgoing word lifts away through a vertical motion blur
 * while the next rises in (Space Studio's headline), and the slot's width eases to the new word so the line never jumps. Screen
 * readers get the first word only (the line is labelled once); with reduced motion the word stays "Powerful"; <MotionToggle>
 * pauses it.
 */
export function RotatingWord({ className, wordClassName }: { className?: string; wordClassName?: string }) {
  const [i, setI] = useState(0);
  const [width, setWidth] = useState<number | null>(null);
  const measure = useRef<HTMLSpanElement[]>([]);
  const isPaused = useMotionPaused();

  useEffect(() => {
    if (isPaused || isPhone() || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setI((n) => (n + 1) % WORDS.length);
      window.dispatchEvent(new CustomEvent("space:aura")); // the aura shifts with each new word
    }, 2600);
    return () => window.clearInterval(id);
  }, [isPaused]);
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

/**
 * A layer behind the star field. It used to cycle violet glows; it now stays clear so the sky is the only colour back there.
 * Decorative, behind content, ignores the pointer.
 */
export function SpaceAura({ className }: { className?: string }) {
  return <div className={className} aria-hidden="true" />;
}
