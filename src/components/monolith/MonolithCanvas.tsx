"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { probeCaps, softwareRenderer } from "@/field/caps";
import type { VariantId } from "@/field/monolith/math";
import type { MonolithFrame, MonolithScene } from "@/field/monolith/scene";
import { resolveTier } from "@/lib/spatial/policy";

export type MonolithHandle = { converge: () => Promise<void>; agitate: (a: number) => void };

export type MonolithCanvasProps = {
  variant: VariantId;
  className?: string;
  /** "scroll": the page's scroll position (0..1) drives the camera. A number pins it (0..1). */
  progress?: "scroll" | number;
  /** paint an opaque black stage instead of a transparent layer */
  opaque?: boolean;
  /** force a theme; default follows <html data-theme> */
  theme?: "dark" | "light";
  onFrame?: (f: MonolithFrame) => void;
  onReady?: () => void;
  /** called when the scene cannot run (no WebGL, CPU rendering, data saver): render your own fallback */
  onUnavailable?: () => void;
};

const htmlTheme = (): "dark" | "light" => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");

/**
 * Reusable Monolith canvas: lazy-loads three, picks a quality tier, follows the theme, pauses off-screen/hidden, honours reduced motion
 * (one still frame) and tells you when it cannot run. Used for the page backgrounds and available to any page (e.g. /simulation).
 */
export const MonolithCanvas = forwardRef<MonolithHandle, MonolithCanvasProps>(function MonolithCanvas(
  { variant, className, progress = "scroll", opaque = false, theme, onFrame, onReady, onUnavailable },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<MonolithScene | null>(null);
  const cb = useRef({ onFrame, onReady, onUnavailable });
  cb.current = { onFrame, onReady, onUnavailable };
  const [ready, setReady] = useState(false);
  const [nonce, setNonce] = useState(0);

  useImperativeHandle(ref, () => ({
    converge: () => sceneRef.current?.converge() ?? Promise.resolve(),
    agitate: (a) => sceneRef.current?.agitate(a),
  }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const caps = probeCaps();
    if (!caps.webgl || caps.saveData || softwareRenderer() || (caps.deviceMemoryGb !== undefined && caps.deviceMemoryGb <= 1)) { cb.current.onUnavailable?.(); return; }
    const fq = new URLSearchParams(window.location.search).get("fq");
    const tier = resolveTier("immersive", caps);
    const quality = fq === "low" || fq === "medium" || fq === "high" ? fq : caps.mobile ? "low" : tier.quality === "high" ? "medium" : tier.quality;
    let cancelled = false;
    let dispose = () => {};
    (async () => {
      let mod: typeof import("@/field/monolith/scene");
      try { mod = await import("@/field/monolith/scene"); } catch { if (!cancelled) cb.current.onUnavailable?.(); return; }
      if (cancelled) return;
      let sc: MonolithScene;
      try {
        sc = new mod.MonolithScene({
          canvas, variant, quality, mobile: caps.mobile, still: caps.reducedMotion, theme: theme ?? htmlTheme(), opaque,
          onFirstFrame: () => { setReady(true); cb.current.onReady?.(); },
          onLost: () => setNonce((n) => n + 1),
          onFrame: (f) => cb.current.onFrame?.(f),
        });
      } catch { if (!cancelled) cb.current.onUnavailable?.(); return; }
      sceneRef.current = sc;
      const update = () => {
        if (progress === "scroll") {
          const max = document.documentElement.scrollHeight - window.innerHeight;
          sc.setProgress(max > 0 ? window.scrollY / max : 0);
        } else sc.setProgress(progress);
      };
      update();
      const onScroll = () => update();
      if (progress === "scroll") window.addEventListener("scroll", onScroll, { passive: true });
      const ro = new ResizeObserver(() => { sc.resize(); update(); });
      ro.observe(canvas);
      const onMove = (e: PointerEvent) => sc.setPointer((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1), true);
      const onLeave = () => sc.setPointer(0, 0, false);
      const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
      if (fine && !caps.reducedMotion) { window.addEventListener("pointermove", onMove, { passive: true }); document.documentElement.addEventListener("pointerleave", onLeave); }
      const mo = theme ? null : new MutationObserver(() => sc.setTheme(htmlTheme()));
      mo?.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      sc.setVisible(true);
      sc.start();
      dispose = () => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("pointermove", onMove);
        document.documentElement.removeEventListener("pointerleave", onLeave);
        ro.disconnect(); mo?.disconnect();
        sc.dispose();
        sceneRef.current = null;
      };
    })();
    return () => { cancelled = true; dispose(); setReady(false); };
  }, [variant, progress, opaque, theme, nonce]);

  return <canvas key={`${variant}-${nonce}`} ref={canvasRef} className={className} data-ready={ready || undefined} aria-hidden="true" />;
});
