"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { attachGlass } from "./engine";
import { SPRING, useGlass } from "./useGlass";
import g from "./glass.module.css";

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Tracks the pointer over a glass surface for its rim light (--mx/--my, at most once a frame). */
export function usePointerLight(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0, x = 0, y = 0;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      x = ((e.clientX - r.left) / r.width) * 100; y = ((e.clientY - r.top) / r.height) * 100;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; el.style.setProperty("--mx", `${x.toFixed(1)}%`); el.style.setProperty("--my", `${y.toFixed(1)}%`); });
    };
    el.addEventListener("pointermove", move, { passive: true });
    return () => { cancelAnimationFrame(raf); el.removeEventListener("pointermove", move); };
  }, [ref]);
}

/** A round glass control with the pen's lens: the lens swells on hover (scale 1 → 1.4, as in the pen) and kicks on press. */
export function GlassIconButton({ children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null);
  const glass = useGlass(ref, { shape: "circle", strength: 1 });
  return (
    <button
      ref={ref}
      type="button"
      {...rest}
      className={`${g.surface} ${g.icon} ${className ?? ""}`}
      onPointerEnter={(e) => { glass.current?.setStrength(1.4); rest.onPointerEnter?.(e); }}
      onPointerLeave={(e) => { glass.current?.setStrength(1); rest.onPointerLeave?.(e); }}
      onPointerDown={(e) => { glass.current?.surge(0.6); rest.onPointerDown?.(e); }}
    >
      {children}
    </button>
  );
}

/**
 * Studio / Blender: a single glass indicator that slides to the chosen side. On the way it stretches (wider and flatter,
 * like a drop being pulled), and its refraction swells and settles.
 */
export function GlassSwitch<T extends string>({ value, options, onChange, disabled, label, disabledTitle }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean; label: string; disabledTitle?: string }) {
  const pill = useRef<HTMLSpanElement>(null);
  const glass = useGlass(pill, { shape: "rounded", strength: 10, band: 0.5 });
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
      glass.current?.surge(1);
    }
    el.style.transform = to;
    last.current = index;
  }, [index, options.length, glass]);
  return (
    <span className={g.switch} role="group" aria-label={label}>
      <span ref={pill} className={`${g.surface} ${g.switchPill}`} aria-hidden="true" />
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
let current: { anim: Animation; el: HTMLElement; dispose: () => void } | null = null;
export type Box = { left: number; top: number; width: number; height: number };
export function morphGlass(from: Box, to: HTMLElement | { left: number; top: number; width: number; height: number }, container: HTMLElement, opts: { toHeight?: number; radiusTo?: number; duration?: number } = {}): Promise<void> {
  if (reduced()) return Promise.resolve();
  if (current) { current.anim.cancel(); current.el.remove(); current.dispose(); current = null; }
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
  const glass = attachGlass(el, { shape: "rounded", strength: 14, band: 0.45 });
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
  glass.surge(0.8);
  const kick = window.setTimeout(() => glass.surge(1.2), (opts.duration ?? 820) * 0.42);
  current = { anim, el, dispose: () => { window.clearTimeout(kick); glass.dispose(); } };
  return anim.finished.then(
    () => {
      const fade = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease-out", fill: "forwards" });
      return fade.finished.then(() => { el.remove(); window.clearTimeout(kick); glass.dispose(); if (current?.el === el) current = null; });
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
