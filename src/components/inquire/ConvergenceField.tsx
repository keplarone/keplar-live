"use client";

/**
 * Inquire convergence visual (2D canvas, self-contained).
 *
 * Meaning, not decoration: every completed form field emits one stream of
 * particles from that field toward a single point. As more of the form is
 * complete, the streams tighten and the destination mark gains definition.
 * On submit, the particles resolve into the Keplar symbol.
 *
 * Budget: ~60 particles per stream on desktop, ~22 on mobile; the loop runs
 * only while something is moving and pauses in background tabs. Reduced
 * motion draws static frames on change instead of animating.
 */
import { useEffect, useRef } from "react";
import { color } from "@/lib/tokens";
import { sampleMark } from "@/gl/markSampler";
import type { InquiryField } from "@/lib/inquire/schema";
import s from "./Inquire.module.css";

type Props = {
  completed: InquiryField[];
  total: number;
  resolved: boolean;
};

type Particle = { t: number; speed: number; offset: number; size: number; target: number; delay: number };
type Stream = { field: InquiryField; hue: string; sign: number; alpha: number; dying: boolean; particles: Particle[]; ox?: number; oy?: number };

const TAU = Math.PI * 2;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function ConvergenceField({ completed, total, resolved }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ completed, total, resolved });
  const kickRef = useRef<() => void>(() => {});

  useEffect(() => {
    propsRef.current = { completed, total, resolved };
    kickRef.current();
  }, [completed, total, resolved]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobileQ = window.matchMedia("(max-width: 899px)");
    const rand = mulberry(7);
    let mobile = mobileQ.matches;
    let perStream = mobile ? 22 : 60;
    let markBudget = mobile ? 300 : 720;
    let marks = sampleMark(markBudget, mulberry(11));
    let w = 0, h = 0, dpr = 1;

    const streams: Stream[] = [];
    let resolveStart = -1;
    let raf = 0;
    let last = performance.now();
    let settledAt = -1;

    const resize = () => {
      mobile = mobileQ.matches;
      perStream = mobile ? 22 : 60;
      const nextBudget = mobile ? 300 : 720;
      if (nextBudget !== markBudget) {
        markBudget = nextBudget;
        marks = sampleMark(markBudget, mulberry(11));
      }
      dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };

    const makeParticle = (i: number, n: number, spread = true): Particle => ({
      t: spread ? (i / n + rand() * 0.02) % 1 : rand() * 0.05,
      speed: 0.07 + rand() * 0.06,
      offset: (rand() - 0.5) * 2,
      size: 0.7 + rand() * 1.1,
      target: Math.floor(rand() * markBudget),
      delay: rand() * 520,
    });

    const sync = () => {
      const { completed: done, resolved: isResolved } = propsRef.current;
      // Keep streams in form order; new ones fade in, removed ones fade out.
      for (const st of streams) st.dying = !done.includes(st.field);
      done.forEach((f, i) => {
        const existing = streams.find((x) => x.field === f);
        if (existing) { existing.dying = false; return; }
        const n = perStream;
        streams.push({
          field: f,
          hue: color.streams[i % color.streams.length],
          sign: i % 2 === 0 ? 1 : -1,
          alpha: reduce.matches ? 1 : 0,
          dying: false,
          particles: Array.from({ length: n }, (_, k) => makeParticle(k, n)),
        });
      });
      if (isResolved && resolveStart < 0) {
        resolveStart = performance.now();
        // Top up to the mark budget so the symbol has enough points to read.
        const live = streams.filter((x) => !x.dying);
        if (live.length) {
          let count = live.reduce((a, x) => a + x.particles.length, 0);
          let k = 0;
          while (count < markBudget) {
            live[k % live.length].particles.push(makeParticle(count, markBudget));
            count++;
            k++;
          }
          // Give every particle a distinct target so the mark fills evenly.
          let idx = 0;
          for (const st of live) for (const p of st.particles) p.target = idx++ % markBudget;
        }
      }
      if (!isResolved) resolveStart = -1;
    };

    const anchorRect = () => {
      const all = [...document.querySelectorAll<HTMLElement>("[data-converge-anchor]")];
      const visible = all.filter((el) => el.offsetParent !== null);
      const pick = visible.find((el) => el.dataset.convergeAnchor === "success") ?? visible[0];
      return pick?.getBoundingClientRect() ?? null;
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { completed: done, total: tot } = propsRef.current;
      const motion = !reduce.matches;
      const progress = tot ? done.length / tot : 0;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const a = anchorRect();
      if (!a) return;
      const ax = a.left + a.width / 2;
      const ay = a.top + a.height / 2;
      const size = Math.min(a.width, a.height);
      const resolving = resolveStart >= 0;
      const rt = resolving ? now - resolveStart : 0;

      // Destination: the mark's silhouette, faint until the form fills in.
      if (!resolving || rt < 1400) {
        const outline = (0.06 + 0.22 * progress) * (resolving ? 1 - smooth(600, 1400, rt) : 1);
        ctx.save();
        ctx.translate(ax - size / 2, ay - size / 2);
        ctx.scale(size / 398, size / 398);
        ctx.strokeStyle = `rgba(${document.documentElement.dataset.theme === "dark" ? "237, 237, 240" : "9, 9, 11"}, ${outline.toFixed(3)})`;
        ctx.lineWidth = 398 / size;
        ctx.beginPath();
        ctx.roundRect(0, 0, 229, 229, 70);
        ctx.stroke();
        ctx.stroke(new Path2D("M204.95 11.95A7 7 0 0 1 209.9 0L362 0A16 16 0 0 1 378 16L378 168.1A7 7 0 0 1 366.05 173.05Z"));
        ctx.beginPath();
        ctx.arc(281, 281, 117, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }

      const spread = (mobile ? 90 : 170) * (1 - 0.8 * progress);
      let moving = false;

      for (let si = streams.length - 1; si >= 0; si--) {
        const st = streams[si];
        const target = st.dying ? 0 : 1;
        st.alpha += (target - st.alpha) * (motion ? Math.min(1, dt * 3) : 1);
        if (st.dying && st.alpha < 0.02) { streams.splice(si, 1); continue; }
        if (Math.abs(target - st.alpha) > 0.01) moving = true;

        const el = document.querySelector<HTMLElement>(`[data-stream-field="${st.field}"]`);
        const r = el?.getBoundingClientRect();
        // Fields unmount on success; resolve from where the stream last started.
        if (r && r.width > 0) {
          st.ox = r.left + Math.min(28, r.width * 0.1);
          st.oy = r.top + r.height / 2;
        }
        if (st.ox === undefined || st.oy === undefined) continue;
        const ox = st.ox;
        const oy = st.oy;
        const dx = ox - ax;
        const bend = st.sign * spread * (0.6 + ((si * 37) % 10) / 20);
        const c1x = ox - dx * 0.42, c1y = oy + bend;
        const c2x = ax + dx * 0.3, c2y = ay - bend * 0.45;

        ctx.fillStyle = st.hue;
        for (const p of st.particles) {
          if (motion && !resolving) {
            p.t += p.speed * dt * (0.8 + progress * 0.7);
            if (p.t >= 1) p.t -= 1;
          }
          const t = p.t;
          const u = 1 - t;
          const bx = u * u * u * ox + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ax;
          const by = u * u * u * oy + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ay;
          const jitter = p.offset * (1 - t) * (6 + spread * 0.05);
          let x = bx + jitter * 0.6;
          let y = by + jitter;
          let alpha = smooth(0, 0.08, t) * (1 - smooth(0.86, 1, t)) * 0.8;

          if (resolving) {
            const m = p.target * 3;
            const mx = ax + marks[m] * size;
            const my = ay - marks[m + 1] * size;
            const k = motion ? easeOut((rt - p.delay) / 1100) : 1;
            x += (mx - x) * k;
            y += (my - y) * k;
            alpha = alpha + (0.92 - alpha) * k;
            if (k < 1) moving = true;
          }
          alpha *= st.alpha;
          if (alpha < 0.01) continue;
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.arc(x, y, p.size * (resolving ? 0.9 : 1), 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        if (!resolving) moving = true; // streams flow continuously
      }

      if (!motion) return;
      if (moving) {
        settledAt = -1;
        raf = requestAnimationFrame(frame);
      } else if (settledAt < 0) {
        settledAt = now;
        raf = requestAnimationFrame(frame);
      }
    };

    const kick = () => {
      sync();
      if (raf || document.hidden) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    kickRef.current = kick;

    const redraw = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onResize = () => { resize(); redraw(); };
    const onVisibility = () => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
      else kick();
    };

    resize();
    kick();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", redraw, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    reduce.addEventListener("change", kick);
    const ro = new ResizeObserver(redraw);
    ro.observe(document.body);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", redraw);
      document.removeEventListener("visibilitychange", onVisibility);
      reduce.removeEventListener("change", kick);
      ro.disconnect();
      kickRef.current = () => {};
    };
  }, []);

  return <canvas ref={canvasRef} className={s.canvas} data-resolved={resolved || undefined} aria-hidden="true" />;
}
