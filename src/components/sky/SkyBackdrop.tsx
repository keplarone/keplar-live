"use client";

import { useEffect, useRef } from "react";
import { LiquidLayer } from "./LiquidLayer";
import { frameGap, isPhone, liteFx } from "@/lib/fx/lite";
import { runWhileTheme } from "@/lib/fx/theme-gate";
import { SpaceSky } from "@/components/ui/space/SpaceSky";
import s from "./Sky.module.css";

/**
 * The light backdrop from the canvas designs: connected light-blue auras (CSS, chained down the whole page), the scroll-driven liquid layer (LiquidLayer) and two drifting
 * ribbons of fine dots (a 2D canvas).
 * The dots follow slow sine waves, deep blue low on the left and sky blue high on the right, like the reference. Pauses when the tab is
 * hidden or scrolled out of view; prefers-reduced-motion draws one still frame. Phones and modest devices (liteFx) draw a
 * third of the dots at 1x pixel density and about 30 fps. Dark theme dims the auras and uses deeper liquid colours (Sky.module.css).
 * Phones (isPhone, 640px and narrower) draw nothing: the canvases are hidden and the auras become one still CSS glow behind the
 * hero (Sky.module.css), so no frame loop competes with the page on a phone's main thread.
 *
 * Space UI: all of the above is the LIGHT theme's backdrop. In the dark (Space) theme the page sits in Space Studio's star field
 * instead (SpaceSky: a 2D canvas started when the page is idle); the blue auras, liquid layer and dots are hidden and their loops
 * do not run (runWhileTheme), so only the visible backdrop costs frames.
 */
export function SkyBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || isPhone()) return;
    return runWhileTheme("light", () => dots(canvas));
  }, []);

  return (
    <div className={s.backdrop} aria-hidden="true">
      <i className={s.auraSky} />
      <i className={s.auraLilac} />
      <i className={s.auraIce} />
      <i className={s.auraPeach} />
      <i className={s.auraMint} />
      <LiquidLayer />
      <canvas ref={ref} className={s.dust} />
      <SpaceSky />
    </div>
  );
}

function dots(canvas: HTMLCanvasElement): (() => void) | undefined {
  {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lite = liteFx();
    const dpr = lite ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    const gap = frameGap(lite);
    let last = 0;
    let onScreen = true;
    let w = 0, h = 0, raf = 0, t = 0;

    type P = { u: number; off: number; speed: number; size: number };
    const ribbons = [
      { color: "58 112 214", y: 0.78, amp: 0.1, tilt: -0.22, span: [0, 0.62] as const, alpha: 0.5 },
      { color: "92 168 232", y: 0.3, amp: 0.08, tilt: -0.12, span: [0.45, 1.05] as const, alpha: 0.42 },
    ].map((r) => ({
      ...r,
      pts: Array.from({ length: lite ? 560 : 1700 }, (): P => ({ u: Math.random(), off: (Math.random() + Math.random() + Math.random() - 1.5) * 0.11, speed: 0.00004 + Math.random() * 0.00006, size: Math.random() < 0.85 ? 0.7 : 1.15 })),
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
      if (now - last >= gap) { last = now; t = now; draw(); }
      raf = requestAnimationFrame(loop);
    };
    // Stop drawing once the dots are scrolled out of view (the canvas covers the first screen only).
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      if (reduce) return;
      cancelAnimationFrame(raf);
      if (onScreen && !document.hidden) raf = requestAnimationFrame(loop);
    });
    io.observe(canvas);

    resize();
    window.addEventListener("resize", resize);
    if (reduce) draw();
    else raf = requestAnimationFrame(loop);
    const onVis = () => {
      if (reduce) return;
      cancelAnimationFrame(raf);
      if (!document.hidden && onScreen) raf = requestAnimationFrame(loop);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }
}
