"use client";

import { useEffect, useRef } from "react";
import { frameGap, isPhone, liteFx } from "@/lib/fx/lite";
import s from "./Sky.module.css";

type Blob = { x: number; y: number; r: number; depth: number; phase: number; color: [number, number, number] };

const LIGHT: [number, number, number][] = [[140, 200, 240], [168, 208, 246], [159, 221, 236], [186, 220, 250], [150, 196, 244], [176, 214, 250]];
const DARK: [number, number, number][] = [[38, 92, 150], [44, 78, 160], [30, 104, 130], [52, 96, 170], [34, 84, 140], [56, 90, 176]];

/**
 * Liquid background (replaces the three.js scenes): six soft blobs that merge and split like liquid metaballs. The field is
 * computed per pixel on a small canvas (about 1/8 of the screen) and scaled up, so edges stay smooth and the cost stays tiny.
 * Scroll animation: each blob drifts at its own depth as the page scrolls (parallax), and scroll speed stretches the blobs
 * vertically and swells them a little, settling back when scrolling stops. Colours are all light blues (dark theme: deeper blues), so the blobs read as one connected aura when they merge. Paused while the tab is
 * hidden; prefers-reduced-motion draws one still frame and ignores scrolling. Phones and modest devices (liteFx) compute a
 * quarter as many pixels at about 30 fps. Phones (isPhone) skip it entirely: the canvas is hidden there (Sky.module.css).
 */
export function LiquidLayer() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (isPhone()) return;
    const ctx = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !ctx) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lite = liteFx();
    const W = lite ? 80 : 160;
    const H = lite ? 48 : 96;
    const gap = frameGap(lite);
    let last = 0;
    canvas.width = W;
    canvas.height = H;
    const img = ctx.createImageData(W, H);
    const blobs: Blob[] = [
      { x: 0.16, y: 0.24, r: 0.14, depth: 0.35, phase: 0.0, color: LIGHT[0] },
      { x: 0.82, y: 0.2, r: 0.12, depth: 0.6, phase: 1.3, color: LIGHT[1] },
      { x: 0.66, y: 0.64, r: 0.1, depth: 0.85, phase: 2.1, color: LIGHT[2] },
      { x: 0.88, y: 0.86, r: 0.11, depth: 0.45, phase: 3.4, color: LIGHT[3] },
      { x: 0.12, y: 0.8, r: 0.11, depth: 0.7, phase: 4.2, color: LIGHT[4] },
      { x: 0.3, y: 0.46, r: 0.08, depth: 1.0, phase: 5.0, color: LIGHT[5] },
    ];
    let dark = document.documentElement.getAttribute("data-theme") === "dark";
    let raf = 0;
    let lastY = window.scrollY;
    let vel = 0; // smoothed scroll speed, px per frame
    const t0 = performance.now();

    const draw = (now: number) => {
      const t = (now - t0) / 1000;
      const y = window.scrollY;
      const vh = window.innerHeight || 800;
      vel += ((y - lastY) - vel) * 0.12;
      lastY = y;
      const stretch = reduce ? 0 : Math.min(0.9, Math.abs(vel) / 40);
      const sy = 1 + stretch; // vertical stretch from scroll speed
      const palette = dark ? DARK : LIGHT;
      const aMax = dark ? 120 : 120;
      // blob centres for this frame, in canvas pixels
      const cs = blobs.map((b, i) => {
        const scrollShift = reduce ? 0 : ((y / vh) * b.depth * 0.35) % 1.6;
        let cy = b.y - scrollShift + (reduce ? 0 : Math.sin(t * 0.25 + b.phase) * 0.05);
        cy = ((cy % 1.4) + 1.4) % 1.4 - 0.2; // wrap so blobs keep cycling through as you scroll
        const cx = b.x + (reduce ? 0 : Math.cos(t * 0.2 + b.phase) * 0.06);
        const r = b.r * (1 + stretch * 0.25) * (1 + (reduce ? 0 : Math.sin(t * 0.5 + b.phase) * 0.06));
        return { x: cx * W, y: cy * H, r2: (r * W) * (r * W), c: palette[i] };
      });
      const d = img.data;
      let p = 0;
      for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
          let f = 0, rr = 0, gg = 0, bb = 0;
          for (let k = 0; k < cs.length; k++) {
            const b = cs[k];
            const dx = px - b.x;
            const dy = (py - b.y) / sy;
            const v = b.r2 / (dx * dx + dy * dy + 1);
            f += v;
            rr += b.c[0] * v; gg += b.c[1] * v; bb += b.c[2] * v;
          }
          // liquid surface: a soft threshold on the summed field
          const a = f < 0.8 ? 0 : f > 1.05 ? 1 : (f - 0.8) / 0.25;
          d[p] = rr / f; d[p + 1] = gg / f; d[p + 2] = bb / f; d[p + 3] = a * aMax;
          p += 4;
        }
      }
      ctx.putImageData(img, 0, 0);
    };

    const loop = (now: number) => {
      if (now - last >= gap) { last = now; draw(now); }
      raf = requestAnimationFrame(loop);
    };
    const start = () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(loop); };
    const mo = new MutationObserver(() => {
      dark = document.documentElement.getAttribute("data-theme") === "dark";
      if (reduce) draw(performance.now());
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    if (reduce) draw(performance.now());
    else start();
    const onVis = () => { if (!reduce) start(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} className={s.liquid} aria-hidden="true" />;
}
