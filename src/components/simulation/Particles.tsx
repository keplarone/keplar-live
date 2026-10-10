"use client";
import { useEffect, useRef, type MutableRefObject } from "react";

/**
 * Full-bleed particle scene behind the walkthrough. A slab of points in perspective turns slowly with the scroll position and
 * pulls together toward the end of the story; thin beams carry a pulse from the question out to the models and back in to one answer.
 * Original and deliberately small (about 160 points, one canvas, no libraries): it runs at the display rate, stops when off screen or in a
 * hidden tab, caps the pixel ratio, and shows a still frame when the visitor prefers reduced motion. Ink follows the theme.
 */
type P = { x: number; y: number; z: number; r: number; a: number };

export function Particles({ fRef, points = true }: { fRef: MutableRefObject<number>; points?: boolean }) {
  const pointsRef = useRef(points);
  useEffect(() => { pointsRef.current = points; }, [points]);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = window.matchMedia("(max-width: 760px), (pointer: coarse)").matches || (navigator.hardwareConcurrency ?? 8) <= 4;
    const count = small ? 90 : 170;
    const pts: P[] = Array.from({ length: count }, (_, i) => {
      // deterministic scatter so the first frame is the same everywhere
      const u = Math.sin(i * 12.9898) * 43758.5453;
      const v = Math.sin(i * 78.233) * 12543.1234;
      const w = Math.sin(i * 37.719) * 9631.171;
      const f = (x: number) => x - Math.floor(x);
      return { x: f(u) * 2 - 1, y: f(v) * 2 - 1, z: f(w) * 2 - 1, r: 0.6 + f(u * 3.1) * 1.6, a: 0.25 + f(v * 2.3) * 0.6 };
    });
    let w = 1;
    let h = 1;
    let dpr = 1;
    const fit = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      dpr = Math.min(window.devicePixelRatio || 1, small ? 1 : 1.5);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    let ink = "255 255 255";
    const readInk = () => { ink = getComputedStyle(document.documentElement).getPropertyValue("--rgb-ink").trim() || "255 255 255"; };
    readInk();
    const mo = new MutationObserver(readInk);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    let on = true;
    const io = new IntersectionObserver(([e]) => { on = e.isIntersecting; });
    io.observe(canvas);
    let raf = 0;
    let t = 0;
    let last = 0;
    let lastF = -1;
    const ss = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!on || document.hidden) { last = 0; return; }
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      const f = fRef.current;
      if (still) { if (Math.abs(f - lastF) < 0.004) return; } else t += dt;
      lastF = f;
      ctx.clearRect(0, 0, w, h);
      const pull = ss((f - 4.2) / 1.8) * (1 - ss((f - 7) / 0.8)); // pulls together from "disagree" to "answer", relaxes for the sub-demos
      const R = 1.15 - 0.62 * pull;
      const yaw = f * 0.42 + t * 0.04;
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const tilt = 0.28 + Math.sin(t * 0.05) * 0.04;
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const scale = Math.min(w, h) * 0.62;
      const cx = w / 2, cyy = h * 0.52;
      for (const p of pointsRef.current ? pts : []) {
        const x0 = p.x * R * 1.5, y0 = p.y * R * 0.9, z0 = p.z * R;
        const x1 = x0 * cy + z0 * sy, z1 = -x0 * sy + z0 * cy;
        const y2 = y0 * ct - z1 * st, z2 = y0 * st + z1 * ct;
        const k = 1 / (2.7 + z2);
        const px = cx + x1 * scale * k * 1.9, py = cyy + y2 * scale * k * 1.9;
        const near = Math.min(1, Math.max(0.15, (z2 + 1.4) / 2.4));
        ctx.fillStyle = `rgb(${ink} / ${(p.a * near * (0.55 + 0.45 * pull)).toFixed(3)})`;
        const r = p.r * (0.6 + near) * (0.8 + k);
        ctx.beginPath();
        ctx.arc(px, py, r, 0, 6.2832);
        ctx.fill();
      }
      // beams: question -> models (route, answers), models -> one answer (disagree, verify, answer)
      const out = ss(f - 2) * (1 - ss(f - 6.9));
      if (out > 0.01) {
        const conv = ss(f - 4.2);
        const qx = w * 0.5, qy = h * 0.3, ay = h * (0.5 + 0.06 * conv);
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          const lx = w * (0.2 + i * 0.2);
          const ly = h * 0.68;
          const sx = qx + (lx - qx) * (1 - conv * 0.0);
          const ex = qx + (lx - qx) * (1 - conv);
          const ey = ly + (ay - ly) * conv;
          const mx = (qx + sx) / 2 + (lx - qx) * 0.1, my = (qy + ey) / 2;
          ctx.strokeStyle = `rgb(${ink} / ${(0.16 * out).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(qx, qy);
          ctx.quadraticCurveTo(mx, my, ex, ey);
          ctx.stroke();
          // a pulse travels along the beam
          const u = ((t * 0.35 + i * 0.23) % 1);
          const bx = (1 - u) * (1 - u) * qx + 2 * (1 - u) * u * mx + u * u * ex;
          const by = (1 - u) * (1 - u) * qy + 2 * (1 - u) * u * my + u * u * ey;
          const g = ctx.createRadialGradient(bx, by, 0, bx, by, 10);
          g.addColorStop(0, `rgb(${ink} / ${(0.8 * out).toFixed(3)})`);
          g.addColorStop(1, `rgb(${ink} / 0)`);
          ctx.fillStyle = g;
          ctx.fillRect(bx - 10, by - 10, 20, 20);
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); mo.disconnect(); };
  }, [fRef]);
  return <canvas ref={ref} className="sim-canvas" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", pointerEvents: "none" }} />;
}
