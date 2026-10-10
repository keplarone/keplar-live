"use client";

import { useEffect, useRef } from "react";
import { color } from "@/lib/tokens";
import { onThemeChange } from "@/lib/theme";
import { mulberry32, sampleMark } from "@/gl/markSampler";

/**
 * Closing convergence (Canvas 2D, no WebGL): six streams arrive from the edges and
 * resolve into the mark once, then the loop stops. Reduced motion draws the final frame.
 */
export function ConvergeCanvas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.matchMedia("(max-width: 899px)").matches;
    const N = mobile ? 520 : 1100;
    const rand = mulberry32(7);
    const mark = sampleMark(N, rand);
    const parts = Array.from({ length: N }, (_, i) => ({
      s: i % 6,
      seed: rand(),
      lane: rand() - 0.5,
      delay: rand() * 0.35,
      tx: mark[i * 3],
      ty: mark[i * 3 + 1],
    }));

    let w = 0, h = 0, dpr = 1, size = 0;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      size = Math.min(h * 0.62, w * 0.42, 240);
    };

    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    let ink: string = color.ink;
    const readInk = () => { ink = getComputedStyle(document.documentElement).getPropertyValue("--c-ink").trim() || color.ink; };
    readInk();
    const draw = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      for (const p of parts) {
        const k = ease(Math.min(1, Math.max(0, (t - p.delay) / 0.65)));
        // stream origin: six trajectories entering from both sides
        const side = p.s % 2 === 0 ? -1 : 1;
        const u = 1 - k;
        const sx = cx + side * (w * 0.55) * u + side * p.seed * 40 * u;
        const sy = cy + Math.sin(p.seed * 6.283 + p.s) * h * 0.35 * u + p.lane * 30 * u + (p.s - 2.5) * 18 * u;
        const x = sx + (cx + p.tx * size - sx) * k;
        const y = sy + (cy - p.ty * size - sy) * k;
        ctx.globalAlpha = 0.35 + 0.5 * k;
        ctx.fillStyle = k > 0.92 ? ink : color.streams[p.s];
        const r = 1.1 + (1 - k) * 0.5;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    };

    resize();
    if (reduce) {
      draw(1.2);
      return onThemeChange(() => { readInk(); draw(1.2); });
    }
    draw(0);

    let raf = 0, start = 0, done = false;
    const loop = (now: number) => {
      if (!start) start = now;
      const t = (now - start) / 2600;
      draw(t);
      if (t < 1.1) raf = requestAnimationFrame(loop);
      else done = true;
    };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !raf && !done) raf = requestAnimationFrame(loop);
    }, { threshold: 0.35 });
    io.observe(canvas);
    const onResize = () => { resize(); draw(done ? 1.2 : 0); };
    window.addEventListener("resize", onResize);
    const stopTheme = onThemeChange(() => { readInk(); if (done) draw(1.2); });
    return () => { io.disconnect(); cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); stopTheme(); };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
