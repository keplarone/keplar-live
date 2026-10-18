"use client";

import { useEffect, useRef, useState } from "react";
import { isPhone } from "@/lib/fx/lite";
import { spaceFx } from "@/lib/fx/space-fx";
import { DEFAULT_SKY, isSkyVariant, stillName, type SkyTheme, type SkyVariant } from "@/lib/sky/variants";

/**
 * The sky behind the marketing pages: the visitor's current local weather, as a realistic sky (docs/design/space-ui.md, "The
 * weather sky"). Light theme = the daytime version of the weather, Dark = a dimmed bluish almost-night version with small stars.
 *
 * - First paint: a pre-rendered still of the same renderer (public/sky, CSS background in space.css), so nothing waits on
 *   JavaScript. Until the weather is known it is the neutral partly-cloudy sky (or the one this tab already resolved, restored
 *   before paint from sessionStorage); then GET /api/sky (same origin, no cookies, no permission prompt: the server reads the
 *   approximate location of the connection) names the variant and the matching still cross-fades in.
 * - Desktop, after idle: the live volumetric renderer (src/lib/sky/renderer.ts, loaded on demand) cross-fades in over the
 *   still and drifts with the wind at up to 30 fps; it pauses while the tab is hidden or the sky is not on screen and stops
 *   for good on a software or slow GPU, Save-Data or a low battery (the still stays).
 * - Phones (640px and narrower) and prefers-reduced-motion: the still only. The renderer is never downloaded.
 * - Thunderstorms: a rare, soft lightning glow inside the clouds (at most two pulses, then 6+ seconds of calm: far below three
 *   flashes a second, WCAG 2.3.1), never under reduced motion.
 * Decorative: aria-hidden, no pointer events.
 */

const STORE = "keplar-sky";
const FPS = 30;

/** Runs before paint (inline, right after the sky): the variant this tab resolved in the last 15 minutes, so a reload doesn't swap. */
const RESTORE = `try{var s=JSON.parse(sessionStorage.getItem("${STORE}")||"null");var e=document.currentScript&&document.currentScript.previousElementSibling;if(s&&e&&Date.now()-s.t<9e5&&/^[a-z-]{3,20}$/.test(s.v)){e.setAttribute("data-sky",s.v);var i=e.querySelector(".sp-sky__still");i&&i.setAttribute("data-sky",s.v)}}catch(_){}`;

const themeNow = (): SkyTheme => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

type Idle = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };

export function WeatherSky({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [layers, setLayers] = useState<{ v: SkyVariant; fresh: boolean }[]>([{ v: DEFAULT_SKY, fresh: false }]);
  const [wind, setWind] = useState(1);
  const sky = layers[layers.length - 1]!.v;
  const live = useRef<{ setLook: (v: SkyVariant, w: number) => void } | null>(null);
  const current = useRef({ sky, wind });

  // Resolve the weather (once per page load; the browser caches the answer for 15 minutes).
  useEffect(() => {
    const el = ref.current;
    const restored = el?.getAttribute("data-sky");
    if (isSkyVariant(restored) && restored !== DEFAULT_SKY) setLayers([{ v: restored, fresh: false }]);
    const forced = new URLSearchParams(location.search).get("sky");
    const ctl = new AbortController();
    fetch(`/api/sky${isSkyVariant(forced) ? `?sky=${forced}` : ""}`, { credentials: "omit", signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { sky?: unknown; wind?: unknown } | null) => {
        if (!d || !isSkyVariant(d.sky)) return;
        const v = d.sky;
        if (typeof d.wind === "number" && Number.isFinite(d.wind)) setWind(d.wind);
        try {
          sessionStorage.setItem(STORE, JSON.stringify({ v, t: Date.now() }));
        } catch {}
        setLayers((ls) => (ls[ls.length - 1]!.v === v ? ls : [...ls.slice(-1), { v, fresh: true }]));
      })
      .catch(() => {});
    return () => ctl.abort();
  }, []);

  // A new still fades in once its image has arrived; the one under it is dropped afterwards.
  useEffect(() => {
    const top = layers[layers.length - 1]!;
    if (!top.fresh || layers.length < 2) return;
    const small = isPhone();
    const img = new Image();
    img.src = `/sky/${stillName(top.v, themeNow(), small)}.webp`;
    let gone = false;
    const show = () => {
      if (gone) return;
      ref.current?.querySelector(`.sp-sky__still[data-sky="${top.v}"]`)?.setAttribute("data-state", "in");
      window.setTimeout(() => !gone && setLayers((ls) => ls.slice(-1)), 1600);
    };
    img.decode().then(show, show);
    return () => {
      gone = true;
    };
  }, [layers]);

  useEffect(() => {
    current.current = { sky, wind };
    live.current?.setLook(sky, wind);
  }, [sky, wind]);

  // The live sky: desktop only, after idle, never under reduced motion.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (isPhone() || matchMedia("(prefers-reduced-motion: reduce)").matches) return; // phones and reduced motion: still only
    const nav = navigator as Navigator & { connection?: { saveData?: boolean }; getBattery?: () => Promise<{ charging: boolean; level: number; addEventListener: (t: string, cb: () => void) => void }> };
    if (nav.connection?.saveData) return;
    const w = window as Idle;
    let stopped = false;
    let cleanup = () => {};
    const start = async () => {
      if (stopped || isPhone()) return;
      const battery = await nav.getBattery?.().catch(() => null);
      const lowPower = () => Boolean(battery && !battery.charging && battery.level < 0.2);
      if (lowPower()) return;
      const { SkyRenderer } = await import("@/lib/sky/renderer");
      if (stopped) return;
      const canvas = document.createElement("canvas");
      canvas.className = "sp-sky__live";
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const r = SkyRenderer.create(canvas, { scale: 1 / (3 * dpr), steps: 40, history: 0.35, px: dpr }, { failIfMajorPerformanceCaveat: true });
      if (!r) return;
      const info = r.gl.getExtension("WEBGL_debug_renderer_info");
      const gpu = info ? String(r.gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
      if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpu)) return r.dispose();
      const nextFrame = () => new Promise<void>((res) => requestAnimationFrame(() => res()));
      try {
        await r.bake(nextFrame, 8);
      } catch {
        return r.dispose();
      }
      if (stopped) return r.dispose();
      root.appendChild(canvas);

      let variant: SkyVariant = current.current.sky;
      let gust = 1;
      let windNow = current.current.wind;
      const look = () => r.setLook(variant, themeNow(), windNow);
      live.current = {
        setLook: (v, wv) => {
          variant = v;
          windNow = wv;
          look();
        },
      };
      look();
      const size = () => r.resize(Math.round(innerWidth * dpr), Math.round(innerHeight * dpr));
      size();

      let simT = 0;
      let last = 0;
      let raf = 0;
      let running = false;
      let shown = false;
      let visible = true;
      const gaps: number[] = [];
      let flashAt = performance.now() + 6000 + Math.random() * 8000;
      let flashX = 0.3;
      let flashY = 0.75;
      let double = false;
      const flash = (now: number) => {
        if (variant !== "thunderstorm") return 0;
        const k = now - flashAt;
        if (k > 900) {
          flashAt = now + 6000 + Math.random() * 9000; // calm for 6-15 s between strikes
          flashX = 0.15 + Math.random() * 0.7;
          flashY = 0.55 + Math.random() * 0.4;
          double = Math.random() < 0.5;
          return 0;
        }
        if (k < 0) return 0;
        const pulse = (t: number) => (t < 0 ? 0 : t < 40 ? t / 40 : Math.exp(-(t - 40) / 110));
        return Math.min(1, pulse(k) + (double ? 0.7 * pulse(k - 420) : 0)); // at most two pulses per strike
      };

      const stop = () => {
        running = false;
        cancelAnimationFrame(raf);
      };
      const give = () => {
        // a slow GPU, or low battery: back to the still for good
        stopped = true;
        stop();
        canvas.removeAttribute("data-on");
        window.setTimeout(() => {
          canvas.remove();
          r.dispose();
        }, 1600);
      };
      const tick = (now: number) => {
        if (!running) return;
        raf = requestAnimationFrame(tick);
        const gap = now - last;
        if (gap < 1000 / FPS - 2) return;
        last = now;
        simT += Math.min(gap, 100) / 1000 * gust;
        r.frame({ time: simT, flash: flash(now), flashX, flashY });
        if (!shown) {
          shown = true;
          canvas.setAttribute("data-on", "");
        } else if (gaps.length < 90) {
          gaps.push(gap);
          if (gaps.length === 90) {
            const sorted = [...gaps].sort((a, b) => a - b);
            if (sorted[45]! > 60) give(); // under ~16 fps: this GPU can't keep it smooth
          }
        }
      };
      const run = () => {
        if (running || stopped || !visible || document.hidden) return;
        running = true;
        last = performance.now() - 1000;
        raf = requestAnimationFrame(tick);
      };
      // a few frames of history before it fades in over the still (same picture, so the fade is near invisible)
      for (let i = 0; i < 4; i++) r.clouds(0, 1 / (i + 1));
      run();

      const onVis = () => (document.hidden ? stop() : run());
      document.addEventListener("visibilitychange", onVis);
      const io = new IntersectionObserver(([e]) => {
        visible = Boolean(e?.isIntersecting);
        if (visible) run();
        else stop();
      });
      io.observe(root);
      const mo = new MutationObserver(look);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      let resizeT = 0;
      const onResize = () => {
        window.clearTimeout(resizeT);
        resizeT = window.setTimeout(size, 150);
      };
      addEventListener("resize", onResize);
      const onBattery = () => lowPower() && give();
      battery?.addEventListener("levelchange", onBattery);
      battery?.addEventListener("chargingchange", onBattery);
      // spaceFx.warp(): a gust, the drift speeds up and eases back
      let gustRaf = 0;
      const offWarp = spaceFx.onWarp(({ strength, seconds }) => {
        cancelAnimationFrame(gustRaf);
        const t0 = performance.now();
        const peak = 1 + strength * 14;
        const step = (now: number) => {
          const k = Math.min(1, (now - t0) / (seconds * 1000));
          gust = 1 + (peak - 1) * Math.sin(Math.PI * k);
          if (k < 1) gustRaf = requestAnimationFrame(step);
          else gust = 1;
        };
        gustRaf = requestAnimationFrame(step);
      });
      cleanup = () => {
        stop();
        cancelAnimationFrame(gustRaf);
        offWarp();
        io.disconnect();
        mo.disconnect();
        removeEventListener("resize", onResize);
        document.removeEventListener("visibilitychange", onVis);
        live.current = null;
        canvas.remove();
        r.dispose();
      };
    };
    const idle = w.requestIdleCallback ? w.requestIdleCallback(() => void start(), { timeout: 4000 }) : window.setTimeout(() => void start(), 2000);
    return () => {
      stopped = true;
      if (w.cancelIdleCallback) w.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      cleanup();
    };
  }, []);

  return (
    <>
      <div ref={ref} className={className ? `sp-sky ${className}` : "sp-sky"} data-sky={sky} aria-hidden="true" suppressHydrationWarning>
        {layers.map((l) => (
          <i key={l.v} className="sp-sky__still" data-sky={l.v} data-state={l.fresh ? "loading" : undefined} suppressHydrationWarning />
        ))}
      </div>
      <script dangerouslySetInnerHTML={{ __html: RESTORE }} />
    </>
  );
}
