"use client";

import { useEffect, useRef } from "react";
import { isPhone } from "@/lib/fx/lite";
import { spaceFx } from "@/lib/fx/space-fx";

/**
 * The Space UI sky behind the marketing pages (one sky system for the whole site; docs/design/space-ui.md, "Background").
 *
 * Light: a bright day sky (CSS gradient, deeper blue at the zenith, pale at the horizon, a warm sun glow) with three layers of
 * realistic cumulus drifting at different speeds (parallax: far = small, flat, hazy and slow; near = large, crisp and faster).
 * Dark: late dusk, a dimmed deep blue (never black) with small scattered stars and two faint cloud layers.
 *
 * The clouds are pre-rendered offline (scripts/sky/render-clouds.py: band-limited noise, billow height fields, 3D sun shading,
 * ray-marched self-shadowing, aerial perspective) into seamless WebP masks in public/sky (about 155 KB for the day sky on
 * desktop, 64 KB on phones). They are CSS masks, not background images, so a cloud is never the LCP element (space.css).
 * Nothing is fetched from another origin.
 *
 * Cost: the first frame is plain CSS (gradient + layers at rest), so nothing waits on JavaScript and there is no flash
 * (phones paint the gradient first and fade the still clouds in when the page is idle, [data-ready], to keep their bytes off
 * the LCP path). Drift is a CSS transform animation (compositor only: no layout or paint per frame), switched on when the page is idle (data-drift) and
 * paused while the tab is hidden (data-paused). Phones (640px and narrower) and prefers-reduced-motion keep the clouds still
 * (still visible) and never run it. spaceFx.warp() sends a short gust: the drift speeds up and eases back. Decorative:
 * aria-hidden, no pointer events.
 */
export function CloudSky({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const later = (cb: () => void, timeout: number) => (w.requestIdleCallback ? w.requestIdleCallback(cb, { timeout }) : window.setTimeout(cb, 900));
    const cancel = (id: number) => (w.cancelIdleCallback ? w.cancelIdleCallback(id) : window.clearTimeout(id));
    if (isPhone()) {
      // Phones: the cloud masks load once the page is idle (space.css), so they never compete with the first paint; then still.
      const id = later(() => el.setAttribute("data-ready", ""), 3000);
      return () => cancel(id);
    }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const idle = later(() => el.setAttribute("data-drift", ""), 1500);
    const onVis = () => (document.hidden ? el.setAttribute("data-paused", "") : el.removeAttribute("data-paused"));
    document.addEventListener("visibilitychange", onVis);
    onVis();

    // A gust on spaceFx.warp(): every drift animation speeds up, then eases back to its own pace.
    let raf = 0;
    const offWarp = spaceFx.onWarp(({ strength, seconds }) => {
      const anims = el.getAnimations({ subtree: true });
      if (!anims.length) return;
      cancelAnimationFrame(raf);
      const t0 = performance.now();
      const peak = 1 + strength * 14;
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / (seconds * 1000));
        const rate = 1 + (peak - 1) * Math.sin(Math.PI * k);
        for (const a of anims) a.updatePlaybackRate(rate);
        if (k < 1) raf = requestAnimationFrame(tick);
        else for (const a of anims) a.updatePlaybackRate(1);
      };
      raf = requestAnimationFrame(tick);
    });

    return () => {
      cancel(idle);
      cancelAnimationFrame(raf);
      offWarp();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div ref={ref} className={className ? `sp-cloudsky ${className}` : "sp-cloudsky"} aria-hidden="true">
      <i className="sp-cloudsky__stars" />
      <i className="sp-cloudsky__twinkle" />
      <i className="sp-cloudsky__layer" data-layer="far" />
      <i className="sp-cloudsky__layer" data-layer="mid" />
      <i className="sp-cloudsky__layer" data-layer="near" />
    </div>
  );
}

/** @deprecated The star field became the cloud sky; kept as an alias so older imports keep compiling. */
export const SpaceSky = CloudSky;
