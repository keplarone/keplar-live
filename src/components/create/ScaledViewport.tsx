"use client";
/**
 * A real desktop viewport for previews: the content (an iframe) is laid out at its true size (1920x1080 by default) and scaled
 * down with a CSS transform to fit, so a generated app looks exactly as it does on a 1080p monitor instead of reflowing to
 * whatever width the pane happens to have. Never upscaled; re-measured whenever the container resizes. The website builder's
 * stage does the same (src/components/create/workspace/StagePanel.tsx).
 *
 *   fit="contain"  fill the parent's width and height (the studio's preview pane)
 *   fit="width"    fill the parent's width; the height follows the viewport's aspect ratio (an inline card)
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export const DESKTOP_VIEWPORT = { w: 1920, h: 1080 } as const;

/** Scale factor for a w x h viewport in a box (pure; 1 means natural size, never more). */
export function viewportScale(box: { w: number; h: number | null }, vp: { w: number; h: number } = DESKTOP_VIEWPORT): number {
  if (!(box.w > 0)) return 1;
  const kw = box.w / vp.w;
  const kh = box.h && box.h > 0 ? box.h / vp.h : Infinity;
  return Math.max(0.02, Math.min(1, kw, kh));
}

export function ScaledViewport({ fit = "contain", w = DESKTOP_VIEWPORT.w, h = DESKTOP_VIEWPORT.h, children }: { fit?: "contain" | "width"; w?: number; h?: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number | null } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const next = { w: el.clientWidth, h: fit === "contain" ? el.clientHeight : null };
      setBox((b) => (b && Math.abs(b.w - next.w) < 0.25 && (b.h ?? 0) === (next.h ?? 0) ? b : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);
  const k = box ? viewportScale(box, { w, h }) : 0;
  return (
    <div
      ref={ref}
      data-viewport={`${w}x${h}`}
      data-scale={k.toFixed(4)}
      style={{ width: "100%", height: fit === "contain" ? "100%" : `${Math.round(h * k)}px`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", visibility: box ? "visible" : "hidden" }}
    >
      <div style={{ width: `${w * k}px`, height: `${h * k}px`, flex: "none", overflow: "hidden" }}>
        <div style={{ width: `${w}px`, height: `${h}px`, transform: `scale(${k})`, transformOrigin: "0 0", display: "flex" }}>{children}</div>
      </div>
    </div>
  );
}
