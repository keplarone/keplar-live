"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode, type RefObject } from "react";
import LiquidGlass from "liquid-glass-react";
import g from "./glass.module.css";

/** One overshoot, then settle (a CSS linear() spring for the Web Animations API). */
export const SPRING = "linear(0, 0.06 2%, 0.23 5%, 0.5 9.5%, 0.86 16%, 1.04 22%, 1.1 27%, 1.09 32%, 1.03 40%, 0.99 50%, 0.995 62%, 1)";

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const noop = () => () => {};
/** liquid-glass-react reads `navigator` while rendering, so it is drawn only in the browser, after hydration. */
const useClient = () => useSyncExternalStore(noop, () => true, () => false);
/**
 * liquid-glass-react measures itself on mount and on window resize only. When a surface has settled at a new size, one
 * resize event (shared by every surface that changed) lets each glass re-measure in place, without being re-created.
 */
let remeasureTimer = 0;
const remeasure = () => {
  window.clearTimeout(remeasureTimer);
  remeasureTimer = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 120);
};

export type GlassLook = {
  /** Displacement at the rim (liquid-glass-react's displacementScale). */
  displacement?: number;
  /** Frost (its blurAmount). */
  blur?: number;
  saturation?: number;
  /** Chromatic aberration at the edge. */
  aberration?: number;
  /** How far the glass leans toward the pointer. */
  elasticity?: number;
  /** A bright scene behind: the glass darkens itself and refracts less, so text on it stays readable. */
  overLight?: boolean;
  mode?: "standard" | "polar" | "prominent" | "shader";
};

/**
 * The liquid glass behind a surface, drawn by liquid-glass-react (https://github.com/rdev/liquid-glass-react, MIT,
 * (c) 2025 Max Rovensky). The library centres its glass on a point; here it fills `host` instead: an empty block of the
 * host's size is its content, the host's own content sits above it, and the pointer is tracked over the whole host.
 * Put it first inside a surface (`g.surface`).
 */
export function GlassLayer({ host, radius, look = {} }: { host: RefObject<HTMLElement | null>; radius: number; look?: GlassLook }) {
  const client = useClient();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { setSize({ w: el.offsetWidth, h: el.offsetHeight }); remeasure(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [host]);
  if (!client || !size || size.w < 2 || size.h < 2) return null;
  return (
    <span className={g.layer} aria-hidden="true" data-glass="liquid">
      <LiquidGlass
        mouseContainer={host}
        cornerRadius={Math.min(radius, size.h / 2)}
        padding="0"
        displacementScale={look.displacement ?? 48}
        blurAmount={look.blur ?? 0.08}
        saturation={look.saturation ?? 150}
        aberrationIntensity={look.aberration ?? 2}
        elasticity={reduced() ? 0 : (look.elasticity ?? 0.12)}
        overLight={look.overLight ?? false}
        mode={look.mode ?? "standard"}
        // Sized explicitly: placed at left 50%, the wrapper would otherwise only have half the host's width to fit into.
        style={{ position: "absolute", top: "50%", left: "50%", width: size.w, height: size.h }}
      >
        <span style={{ display: "block", width: size.w, height: size.h }} />
      </LiquidGlass>
    </span>
  );
}

/** A round glass control. */
export function GlassIconButton({ children, className, overLight, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; overLight?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button ref={ref} type="button" {...rest} className={`${g.surface} ${g.icon} ${className ?? ""}`}>
      <GlassLayer host={ref} radius={999} look={{ displacement: 40, aberration: 1.5, elasticity: 0.3, overLight }} />
      {children}
    </button>
  );
}

/**
 * Studio / Blender: a single glass indicator that slides to the chosen side. On the way it stretches (wider and flatter,
 * like a drop being pulled) and settles.
 */
export function GlassSwitch<T extends string>({ value, options, onChange, disabled, label, disabledTitle, overLight }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean; label: string; disabledTitle?: string; overLight?: boolean }) {
  const pill = useRef<HTMLSpanElement>(null);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const last = useRef(index);
  useLayoutEffect(() => {
    const el = pill.current;
    if (!el) return;
    el.style.width = `calc((100% - 6px) / ${options.length})`;
    const to = `translateX(${index * 100}%)`;
    if (last.current !== index && !reduced()) {
      const from = `translateX(${last.current * 100}%)`;
      const mid = `translateX(${((last.current + index) / 2) * 100}%) scaleX(1.32) scaleY(0.84)`;
      el.animate([{ transform: from }, { transform: mid, offset: 0.45 }, { transform: to }], { duration: 620, easing: SPRING });
    }
    el.style.transform = to;
    last.current = index;
  }, [index, options.length]);
  return (
    <span className={g.switch} role="group" aria-label={label}>
      <span ref={pill} className={`${g.surface} ${g.switchPill}`} aria-hidden="true">
        <GlassLayer host={pill} radius={999} look={{ displacement: 36, aberration: 1.5, overLight }} />
      </span>
      {options.map((o) => (
        <button key={o.value} type="button" className={g.switchBtn} aria-pressed={o.value === value} onClick={() => onChange(o.value)} disabled={disabled} title={disabled ? disabledTitle : undefined}>
          {o.label}
        </button>
      ))}
    </span>
  );
}

/**
 * Carries one piece of glass from `from` to `to` inside `container`: it contracts, its edge deforms, it stretches out and
 * settles into the target's shape. Resolves when it has landed (then the target takes over). Interrupting is safe: a new
 * morph cancels the old one.
 */
let current: { anim: Animation; el: HTMLElement } | null = null;
export type Box = { left: number; top: number; width: number; height: number };
export function morphGlass(from: Box, to: HTMLElement | { left: number; top: number; width: number; height: number }, container: HTMLElement, opts: { toHeight?: number; radiusTo?: number; duration?: number } = {}): Promise<void> {
  if (reduced()) return Promise.resolve();
  if (current) { current.anim.cancel(); current.el.remove(); current = null; }
  const c = container.getBoundingClientRect();
  // `from` is measured when the press happens: the pressed button may already be gone (Build becomes Stop).
  const a = from;
  const b = to instanceof HTMLElement ? to.getBoundingClientRect() : to;
  const rect = (r: { left: number; top: number; width: number; height: number }) => ({ left: `${r.left - c.left}px`, top: `${r.top - c.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  const start = rect(a);
  const end = rect({ left: b.left, top: b.top, width: b.width, height: opts.toHeight ?? b.height });
  // Squeezed (the press), then pulled long toward the target, then landed.
  const squeeze = rect({ left: a.left + a.width * 0.06, top: a.top + a.height * 0.08, width: a.width * 0.88, height: a.height * 0.84 });
  const pull = rect({ left: (a.left + b.left) / 2 - 10, top: (a.top + b.top) / 2, width: Math.max(a.width, b.width) * 0.72, height: Math.max(a.height, (opts.toHeight ?? b.height) * 0.62) });
  const el = document.createElement("div");
  el.className = `${g.surface} ${g.morph}`;
  Object.assign(el.style, start);
  container.appendChild(el);
  const radiusTo = `${opts.radiusTo ?? 16}px`;
  const anim = el.animate(
    [
      { ...start, borderRadius: "999px" },
      { ...squeeze, borderRadius: "999px", offset: 0.14 },
      { ...pull, borderRadius: "40px", offset: 0.5 },
      { ...end, borderRadius: radiusTo },
    ],
    { duration: opts.duration ?? 820, easing: "cubic-bezier(.2, .9, .1, 1)", fill: "forwards" },
  );
  current = { anim, el };
  return anim.finished.then(
    () => {
      const fade = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease-out", fill: "forwards" });
      return fade.finished.then(() => { el.remove(); if (current?.el === el) current = null; });
    },
    () => undefined,
  );
}

/**
 * Opens a panel out of its anchor: the panel starts clipped to the anchor's shape and grows into its own, springing. Closing
 * runs the same motion backwards, and a toggle mid-way reverses from where it is.
 */
export function useAnchoredMorph(open: boolean, panel: React.RefObject<HTMLElement | null>, anchor: React.RefObject<HTMLElement | null>) {
  const [shown, setShown] = useState(open);
  const anim = useRef<Animation | null>(null);
  if (open && !shown) setShown(true);
  useLayoutEffect(() => {
    const el = panel.current, an = anchor.current;
    if (!el || !an || !shown) return;
    const p = el.getBoundingClientRect(), r = an.getBoundingClientRect();
    const inset = `inset(${Math.max(0, r.top - p.top)}px ${Math.max(0, p.right - r.right)}px ${Math.max(0, p.bottom - r.bottom)}px ${Math.max(0, r.left - p.left)}px round 999px)`;
    const frames = [{ clipPath: inset, opacity: 0.6 }, { clipPath: "inset(0 0 0 0 round 18px)", opacity: 1 }];
    if (reduced()) return;
    if (anim.current && anim.current.playState === "running") {
      anim.current.reverse();
    } else {
      anim.current = el.animate(open ? frames : [...frames].reverse(), { duration: open ? 560 : 380, easing: open ? SPRING : "cubic-bezier(.4, 0, .2, 1)", fill: "both" });
    }
    const a = anim.current;
    if (!open) void a.finished.then(() => { if (anim.current === a) setShown(false); }, () => undefined);
  }, [open, shown, panel, anchor]);
  // With reduced motion there is no closing animation to wait for.
  return reduced() ? open : shown;
}

/**
 * How bright the scene behind the overlay is, from Keplar's own latest screenshot of it (never a guess): "bright", "mixed"
 * or "dark". The glass thickens its tint over bright scenes so text stays readable.
 */
export function useSceneTone(image: string | null | undefined): "bright" | "mixed" | "dark" {
  const [tone, setTone] = useState<"bright" | "mixed" | "dark">("mixed");
  useEffect(() => {
    if (!image) return;
    let live = true;
    const img = new Image();
    img.onload = () => {
      if (!live) return;
      const c = document.createElement("canvas");
      c.width = 48; c.height = 32;
      const x = c.getContext("2d", { willReadFrequently: true });
      if (!x) return;
      x.drawImage(img, 0, 0, 48, 32);
      const d = x.getImageData(0, 0, 48, 32).data;
      let sum = 0;
      for (let k = 0; k < d.length; k += 4) sum += (0.2126 * d[k]! + 0.7152 * d[k + 1]! + 0.0722 * d[k + 2]!) / 255;
      const lum = sum / (d.length / 4);
      setTone(lum > 0.6 ? "bright" : lum < 0.32 ? "dark" : "mixed");
    };
    img.src = image;
    return () => { live = false; };
  }, [image]);
  return tone;
}
