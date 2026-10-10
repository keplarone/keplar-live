"use client";

import { useEffect, useRef } from "react";
import s from "./Sky.module.css";

/**
 * The light backdrop from the canvas designs: soft colour auras (CSS) and two drifting ribbons of fine dots (a 2D canvas).
 * The dots follow slow sine waves, blue low on the left and coral high on the right, like the reference. Pauses when the tab is
 * hidden; prefers-reduced-motion draws one still frame. Dark theme hides the whole layer (Sky.module.css).
 */
export function SkyBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0, raf = 0, t = 0;

    type P = { u: number; off: number; speed: number; size: number };
    const ribbons = [
      { color: "91 116 201", y: 0.78, amp: 0.1, tilt: -0.22, span: [0, 0.62] as const, alpha: 0.5 },
      { color: "224 122 90", y: 0.3, amp: 0.08, tilt: -0.12, span: [0.45, 1.05] as const, alpha: 0.42 },
    ].map((r) => ({
      ...r,
      pts: Array.from({ length: 1700 }, (): P => ({ u: Math.random(), off: (Math.random() + Math.random() + Math.random() - 1.5) * 0.11, speed: 0.00004 + Math.random() * 0.00006, size: Math.random() < 0.85 ? 0.7 : 1.15 })),
    }));

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const r of ribbons) {
        const [a, b] = r.span;
        for (const p of r.pts) {
          const u = (p.u + t * p.speed) % 1;
          const x = (a + (b - a) * u) * w;
          const wave = Math.sin(u * Math.PI * 2 + t * 0.00025) * r.amp + Math.sin(u * 9 + t * 0.0004) * 0.012;
          const y = (r.y + r.tilt * (u - 0.5) + wave + p.off) * h;
          const fade = Math.sin(u * Math.PI) * (1 - Math.min(1, Math.abs(p.off) / 0.2));
          if (fade <= 0.02) continue;
          ctx.fillStyle = `rgb(${r.color} / ${(r.alpha * fade).toFixed(3)})`;
          ctx.fillRect(x, y, p.size, p.size);
        }
      }
    };

    const loop = (now: number) => {
      t = now;
      draw();
      raf = requestAnimationFrame(loop);
    };

    resize();
    window.addEventListener("resize", resize);
    if (reduce) draw();
    else raf = requestAnimationFrame(loop);
    const onVis = () => {
      if (reduce) return;
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(loop);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div className={s.backdrop} aria-hidden="true">
      <i className={s.auraSky} />
      <i className={s.auraLilac} />
      <i className={s.auraIce} />
      <i className={s.auraPeach} />
      <i className={s.auraMint} />
      <canvas ref={ref} className={s.dust} />
    </div>
  );
}
