"use client";

import { THREE_D_ENABLED } from "@/lib/fx/three-d";
import { useEffect, useRef, useState } from "react";
import { KLoader } from "./KLoader";
import { workingPath } from "@/lib/working-hard";
import type { WorkingScene } from "./working-scene";
import s from "./WorkingHard.module.css";

/**
 * "Working hard": a swarm of light that tightens into a ring as REAL work completes, and flares on every real event.
 * Reusable anywhere (Create, agents, site builder). It never invents progress:
 *   progress   0..1 when the amount is really known, otherwise omit it (the ring just breathes)
 *   pulseKey   increment on every real progress event (stage finished, model answered, file written)
 *   stage      text for the live caption (screen readers too)
 *   done / failed   settle into the calm ring / dim
 * three.js is imported lazily and only when the device may animate; otherwise (no WebGL, reduced motion, data saver,
 * low memory, one core) the CSS KLoader shows the same state (progress arc, caption). The scene is disposed on unmount.
 */
export function WorkingHard({ progress, stage, pulseKey = 0, done, failed, height = 180, className }: {
  progress?: number;
  stage?: string;
  pulseKey?: number;
  done?: boolean;
  failed?: boolean;
  height?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<WorkingScene | null>(null);
  const [mode, setMode] = useState<"pending" | "three" | "css">("pending");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dead = false;
    let ro: ResizeObserver | null = null;
    let mo: MutationObserver | null = null;
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    let webgl = false;
    try { webgl = THREE_D_ENABLED && !!document.createElement("canvas").getContext("webgl"); } catch { webgl = false; }
    const path = workingPath({
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      saveData: !!nav.connection?.saveData,
      lowMemory: typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2,
      cores: nav.hardwareConcurrency || 4,
      webgl,
    });
    if (path === "css") { setMode("css"); return; }
    import("./working-scene").then(({ createWorkingScene }) => {
      if (dead) return;
      try {
        const sc = createWorkingScene(canvas, { onError: () => { sceneRef.current?.dispose(); sceneRef.current = null; setMode("css"); } });
        sceneRef.current = sc;
        const root = document.documentElement;
        const sync = () => sc.setDark(root.getAttribute("data-theme") !== "light");
        sync();
        mo = new MutationObserver(sync);
        mo.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
        ro = new ResizeObserver(() => sc.resize());
        ro.observe(canvas);
        setMode("three");
      } catch { setMode("css"); }
    }).catch(() => { if (!dead) setMode("css"); });
    return () => {
      dead = true;
      ro?.disconnect();
      mo?.disconnect();
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => { sceneRef.current?.set({ progress, done, failed }); }, [progress, done, failed, mode]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    sceneRef.current?.pulse();
  }, [pulseKey]);

  const pct = typeof progress === "number" && Number.isFinite(progress) ? Math.round(Math.max(0, Math.min(1, progress)) * 100) : null;
  return (
    <div className={[s.root, className ?? ""].filter(Boolean).join(" ")} style={{ height }} data-working={failed ? "failed" : done ? "done" : "busy"} data-mode={mode} data-pulse={pulseKey}>
      <canvas ref={canvasRef} className={s.canvas} aria-hidden="true" hidden={mode === "css"} />
      {mode === "css" ? <div className={s.fallback}><KLoader size={44} progress={progress} label={stage ?? "Working"} /></div> : null}
      <p className={s.caption} role="status" aria-live="polite">
        <span>{failed ? "Stopped" : done ? "Done" : stage ?? "Working"}</span>
        {pct !== null && !done && !failed ? <span className={s.pct}>{pct}%</span> : null}
      </p>
    </div>
  );
}
