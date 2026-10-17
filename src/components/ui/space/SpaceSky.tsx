"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { frameGap, isPhone, liteFx } from "@/lib/fx/lite";
import { spaceFx } from "@/lib/fx/space-fx";
import { runWhileTheme } from "@/lib/fx/theme-gate";

/**
 * The Space UI star field: the Space Studio sky as a light 2D canvas (no three.js, so it costs no download on the marketing
 * pages). The camera drifts forward through a field of stars colored by stellar class (power-law brightness, a slow twinkle,
 * a glow and diffraction spikes on the brightest), past a faint violet nebula, with the odd shooting star. It leans toward the
 * pointer and jumps to warp on spaceFx.warp() (src/lib/fx/space-fx.ts) and on every route change.
 *
 * Motion blur is real accumulation, as in Space Studio: each frame fades the previous one instead of clearing it, so anything
 * moving leaves a trail that grows with speed (long streaks at warp). Alphas are scaled by the fade so a still sky looks the
 * same as a cleared one.
 *
 * Budget: never on the LCP path (it starts when the page is idle), DPR capped at 1.5, about 50 fps (30 on modest devices),
 * paused while the tab is hidden, and only in the dark theme (runWhileTheme). Phones (isPhone, 640px and narrower) and
 * prefers-reduced-motion draw one still frame: no drift, twinkle, warp or parallax. Decorative: aria-hidden, no pointer events.
 */

const CLASSES: { c: [number, number, number]; share: number; lum: number }[] = [
  { c: [155, 176, 255], share: 0.03, lum: 2.2 },
  { c: [170, 191, 255], share: 0.07, lum: 1.7 },
  { c: [202, 215, 255], share: 0.12, lum: 1.35 },
  { c: [248, 247, 255], share: 0.2, lum: 1.15 },
  { c: [255, 244, 234], share: 0.18, lum: 1.0 },
  { c: [255, 226, 184], share: 0.16, lum: 0.9 },
  { c: [255, 197, 138], share: 0.14, lum: 0.8 },
  { c: [255, 159, 122], share: 0.1, lum: 0.75 },
];
function stellar() {
  let r = Math.random();
  for (const k of CLASSES) if ((r -= k.share) <= 0) return k;
  return CLASSES[3]!;
}

type Star = { x: number; y: number; z: number; lum: number; c: string; phase: number; tw: number; big: number };
const NEAR = 0.04;
const FAR = 1;
const AURAS = ["176 104 255", "150 140 255", "196 96 236", "214 110 220", "170 118 250"];

/** Mounts the field when the page is idle (never during the first paint), then keeps it across client navigations. */
export function SpaceSky({ aura = true, warpOnRoute = true, className }: { aura?: boolean; warpOnRoute?: boolean; className?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setOn(true), { timeout: isPhone() ? 3000 : 1500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(() => setOn(true), 900);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className={className ? `sp-sky ${className}` : "sp-sky"} aria-hidden="true">
      {on ? <SkyCanvas /> : null}
      {aura ? <Aura /> : null}
      {warpOnRoute ? <WarpOnRoute /> : null}
    </div>
  );
}

function WarpOnRoute() {
  const path = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    spaceFx.warp(0.4, 1);
  }, [path]);
  return null;
}

function Aura() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    return spaceFx.onAura(() => setI((n) => (n + 1) % AURAS.length));
  }, []);
  return <div className="sp-sky__aura" style={{ backgroundColor: `rgb(${AURAS[i]})` }} />;
}

function SkyCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    return runWhileTheme("dark", () => start(canvas));
  }, []);
  return <canvas ref={ref} />;
}

function start(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return () => undefined;
  const still = isPhone() || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lite = liteFx();
  const dpr = Math.min(window.devicePixelRatio || 1, lite ? 1 : 1.5);
  const gap = lite ? frameGap(true) : 1000 / 50 - 2;
  const count = still ? (lite ? 320 : 600) : lite ? 420 : 1000;

  // Stars live inside the view frustum: x, y are spread in proportion to their depth, so they cover the screen at every depth
  // and stream outward as the camera moves forward.
  const fov = () => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const ff = Math.max(vw, vh * 1.4) * 0.62;
    return { ax: (vw / 2 / ff) * 1.2, ay: (vh / 2 / ff) * 1.2 };
  };
  let view = fov();
  const place = (st: { x: number; y: number }, z: number) => {
    st.x = (Math.random() * 2 - 1) * z * view.ax;
    st.y = (Math.random() * 2 - 1) * z * view.ay;
  };
  const stars: Star[] = Array.from({ length: count }, () => {
    const k = stellar();
    const lum = k.lum * Math.pow(Math.random(), 2.4); // power law: many faint, a few bright
    const z = NEAR + Math.random() * (FAR - NEAR);
    const st: Star = { x: 0, y: 0, z, lum, c: k.c.join(" "), phase: Math.random() * Math.PI * 2, tw: 0.6 + Math.random() * 1.6, big: 0 };
    place(st, z);
    return st;
  });
  // The brightest ~2% get a glow; the brightest ~0.5% diffraction spikes.
  const order = [...stars].sort((a, b) => b.lum - a.lum);
  order.slice(0, Math.ceil(count * 0.03)).forEach((s) => (s.big = 1));
  order.slice(0, Math.ceil(count * 0.005)).forEach((s) => (s.big = 2));

  // Glow sprite and nebula layer, drawn once.
  const glow = document.createElement("canvas");
  glow.width = glow.height = 64;
  const g = glow.getContext("2d")!;
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, "rgba(255,255,255,0.9)");
  rg.addColorStop(0.18, "rgba(220,215,255,0.35)");
  rg.addColorStop(1, "rgba(160,140,255,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 64, 64);
  const neb = document.createElement("canvas");

  let w = 0, h = 0, f = 1;
  const resize = () => {
    w = canvas.clientWidth || window.innerWidth;
    h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    f = Math.max(w, h * 1.4) * 0.62;
    // nebula: soft violet / orchid / periwinkle clouds, low-res and scaled up (smooth, cheap)
    neb.width = Math.max(64, Math.round(w / 6));
    neb.height = Math.max(64, Math.round(h / 6));
    const n = neb.getContext("2d")!;
    n.clearRect(0, 0, neb.width, neb.height);
    const cloud = (x: number, y: number, r: number, c: string, a: number) => {
      const gr = n.createRadialGradient(x * neb.width, y * neb.height, 0, x * neb.width, y * neb.height, r * neb.width);
      gr.addColorStop(0, `rgba(${c},${a})`);
      gr.addColorStop(1, `rgba(${c},0)`);
      n.fillStyle = gr;
      n.fillRect(0, 0, neb.width, neb.height);
    };
    cloud(0.12, 0.92, 0.55, "150,70,230", 0.16);
    cloud(0.3, 1.02, 0.35, "214,110,220", 0.08);
    cloud(0.9, 0.06, 0.42, "150,140,255", 0.1);
    cloud(0.62, 0.42, 0.3, "120,70,190", 0.05);
  };
  resize();

  // pointer lean (fine pointers only)
  let px = 0, py = 0, tx = 0, ty = 0;
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    tx = (e.clientX / w) * 2 - 1;
    ty = (e.clientY / h) * 2 - 1;
  };

  // warp envelope: quick attack, long decay
  let warp = { age: -1, len: 1, strength: 0 };
  const envelope = (t: number, len: number) => {
    const p = Math.min(1, t / len);
    return p < 0.22 ? Math.sin((p / 0.22) * Math.PI * 0.5) : Math.pow(1 - (p - 0.22) / 0.78, 2);
  };
  const offWarp = still ? () => undefined : spaceFx.onWarp((d) => (warp = { age: 0, len: d.seconds, strength: d.strength }));

  // shooting stars
  type Shot = { x: number; y: number; vx: number; vy: number; age: number; len: number };
  let shot: Shot | null = null;
  let nextShot = 4 + Math.random() * 8;

  let raf = 0;
  let last = 0;
  let prevT = 0;
  let time = 0;

  const draw = (dt: number, fade: number) => {
    // accumulation: fade the last frame instead of clearing it
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(0,0,0,${fade})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = fade;
    ctx.drawImage(neb, 0, 0, w, h);

    const e = warp.age >= 0 ? envelope(warp.age, warp.len) * warp.strength : 0;
    const speed = still ? 0 : 0.012 + e * 0.9; // depth units per second
    px += (tx - px) * Math.min(1, dt * 2.2);
    py += (ty - py) * Math.min(1, dt * 2.2);
    const cx = w / 2 - px * 26;
    const cy = h / 2 - py * 18;
    ctx.globalCompositeOperation = "lighter";
    for (const s of stars) {
      const z0 = s.z;
      s.z -= speed * dt;
      if (s.z < NEAR) {
        s.z += FAR - NEAR;
        place(s, s.z);
        continue;
      }
      const sx = cx + (s.x / s.z) * f;
      const sy = cy + (s.y / s.z) * f;
      if (sx < -40 || sx > w + 40 || sy < -40 || sy > h + 40) continue;
      const depthFade = Math.min(1, (FAR - s.z) / 0.25) * Math.min(1, (s.z - NEAR) / 0.03 + 0.2);
      const tw = still ? 1 : 0.82 + 0.18 * Math.sin(time * s.tw + s.phase);
      const a = Math.min(1, (0.5 + s.lum * 0.6) * depthFade * tw);
      const size = Math.max(0.7, Math.min(3.2, (0.7 + s.lum * 1.3) * (0.42 / (s.z + 0.18))));
      ctx.globalAlpha = Math.min(1, a * fade * (e > 0.05 ? 1.6 : 1));
      if (e > 0.05) {
        // streak from where the star was a moment ago
        const zb = Math.min(FAR, z0 + speed * 0.06);
        const bx = cx + (s.x / zb) * f;
        const by = cy + (s.y / zb) * f;
        ctx.strokeStyle = `rgb(${s.c})`;
        ctx.lineWidth = size;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      } else {
        ctx.fillStyle = `rgb(${s.c})`;
        ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
      }
      if (s.big) {
        const gs = size * (s.big === 2 ? 9 : 6);
        ctx.globalAlpha = Math.min(1, a * fade * 0.55);
        ctx.drawImage(glow, sx - gs / 2, sy - gs / 2, gs, gs);
        if (s.big === 2) {
          ctx.globalAlpha = Math.min(1, a * fade * 0.4);
          ctx.fillStyle = `rgb(${s.c})`;
          const L = gs * 1.1;
          ctx.fillRect(sx - L, sy - 0.4, L * 2, 0.8);
          ctx.fillRect(sx - 0.4, sy - L, 0.8, L * 2);
        }
      }
    }
    // a shooting star now and then
    if (!still) {
      nextShot -= dt;
      if (!shot && nextShot <= 0) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        shot = { x: Math.random() * w, y: Math.random() * h * 0.5, vx: dir * (500 + Math.random() * 400), vy: 160 + Math.random() * 160, age: 0, len: 0.7 + Math.random() * 0.5 };
        nextShot = 7 + Math.random() * 10;
      }
      if (shot) {
        shot.age += dt;
        const p = shot.age / shot.len;
        const hx = shot.x + shot.vx * shot.age;
        const hy = shot.y + shot.vy * shot.age;
        const tail = 0.12;
        const gr = ctx.createLinearGradient(hx - shot.vx * tail, hy - shot.vy * tail, hx, hy);
        gr.addColorStop(0, "rgba(255,255,255,0)");
        gr.addColorStop(1, "rgba(255,255,255,0.9)");
        ctx.globalAlpha = Math.max(0, Math.sin(Math.min(1, p) * Math.PI)) * fade;
        ctx.strokeStyle = gr;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(hx - shot.vx * tail, hy - shot.vy * tail);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        if (p >= 1) shot = null;
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (now - last < gap) return;
    last = now;
    const dt = prevT ? Math.min(0.05, (now - prevT) / 1000) : 1 / 50;
    prevT = now;
    time += dt;
    if (warp.age >= 0) {
      warp.age += dt;
      if (warp.age > warp.len) warp.age = -1;
    }
    const e = warp.age >= 0 ? envelope(warp.age, warp.len) * warp.strength : 0;
    draw(dt, 0.42 - Math.min(0.32, e * 0.3));
  };

  const once = () => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    draw(0, 1);
  };

  const onResize = () => {
    resize();
    view = fov();
    if (still) once();
  };
  const onVis = () => {
    cancelAnimationFrame(raf);
    if (!document.hidden && !still) {
      prevT = 0;
      raf = requestAnimationFrame(loop);
    }
  };
  window.addEventListener("resize", onResize);
  if (still) once();
  else {
    once();
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    raf = requestAnimationFrame(loop);
  }
  return () => {
    cancelAnimationFrame(raf);
    offWarp();
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pointermove", onMove);
    document.removeEventListener("visibilitychange", onVis);
  };
}
