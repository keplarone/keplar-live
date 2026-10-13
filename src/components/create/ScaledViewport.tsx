"use client";
/**
 * A real desktop viewport for previews: the content (an iframe) is laid out at its true size (1920x1080 by default) and scaled
 * down with a CSS transform to fit, so a generated app looks exactly as it does on a 1080p monitor instead of reflowing to
 * whatever width the pane happens to have. Never upscaled; re-measured whenever the container resizes. The website builder's
 * stage does the same (src/components/create/workspace/StagePanel.tsx).
 *
 *   fit="contain"  fill the parent's width and height, letterboxed to the viewport's aspect ratio
 *   fit="width"    fill the parent's width; the height follows the viewport's aspect ratio (an inline card)
 *   fit="fill"     fill the parent edge to edge: a desktop-width viewport (1280-1920px, matching the pane when it can) whose
 *                  height is whatever fills the pane, so there are no empty bands and text stays readable (the studio's pane)
 *
 * Every wrapper clips with overflow: clip, never hidden: a hidden box can still be scrolled by the browser when something inside
 * the iframe takes focus, which slid the whole workspace sideways in the desktop app.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export const DESKTOP_VIEWPORT = { w: 1920, h: 1080 } as const;

/** The narrowest and widest desktop layouts "fill" uses. */
export const FILL_MIN_W = 1280;

/** fit="fill": the viewport (and scale) that covers a box exactly at a desktop width between 1280 and 1920px (pure). */
export function fillViewport(box: { w: number; h: number }, max: number = DESKTOP_VIEWPORT.w): { w: number; h: number; k: number } {
  if (!(box.w > 0) || !(box.h > 0)) return { w: max, h: DESKTOP_VIEWPORT.h, k: 1 };
  const w = Math.round(Math.min(max, Math.max(FILL_MIN_W, box.w)));
  const k = Math.min(1, box.w / w);
  return { w, h: Math.round(box.h / k), k };
}

/** Scale factor for a w x h viewport in a box (pure; 1 means natural size, never more). */
export function viewportScale(box: { w: number; h: number | null }, vp: { w: number; h: number } = DESKTOP_VIEWPORT): number {
  if (!(box.w > 0)) return 1;
  const kw = box.w / vp.w;
  const kh = box.h && box.h > 0 ? box.h / vp.h : Infinity;
  return Math.max(0.02, Math.min(1, kw, kh));
}

export function ScaledViewport({ fit = "contain", w = DESKTOP_VIEWPORT.w, h = DESKTOP_VIEWPORT.h, children }: { fit?: "contain" | "width" | "fill"; w?: number; h?: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number | null } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const next = { w: el.clientWidth, h: fit === "width" ? null : el.clientHeight };
      setBox((b) => (b && Math.abs(b.w - next.w) < 0.25 && (b.h ?? 0) === (next.h ?? 0) ? b : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);
  const filled = fit === "fill" && box && box.h ? fillViewport({ w: box.w, h: box.h }, w) : null;
  const vw = filled ? filled.w : w;
  const vh = filled ? filled.h : h;
  const k = filled ? filled.k : box ? viewportScale(box, { w, h }) : 0;
  return (
    <div
      ref={ref}
      data-viewport={`${vw}x${vh}`}
      data-scale={k.toFixed(4)}
      style={{ width: "100%", height: fit === "width" ? `${Math.round(h * k)}px` : "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "clip", visibility: box ? "visible" : "hidden" }}
    >
      <div style={{ width: `${vw * k}px`, height: `${vh * k}px`, flex: "none", overflow: "clip" }}>
        <div style={{ width: `${vw}px`, height: `${vh}px`, transform: `scale(${k})`, transformOrigin: "0 0", display: "flex" }}>{children}</div>
      </div>
    </div>
  );
}
