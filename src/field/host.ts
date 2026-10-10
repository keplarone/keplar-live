import type { SceneOptions } from "./scene-engine";
import type { SceneId, SceneParams } from "./scenes";

/**
 * Main-thread side of the particle layer. No three.js here (the engine is loaded lazily, or lives in a worker).
 * Preferred: transfer the canvas to a worker (OffscreenCanvas), so rendering never touches the main thread and
 * typing latency is unaffected. Fallback (no OffscreenCanvas / worker failed): the same engine on the main thread,
 * with a smaller particle budget. Every call is a tiny message or a uniform write.
 */
export type SceneHandle = {
  mode: "worker" | "main";
  setScene(id: SceneId, params?: SceneParams): void;
  boom(x: number, y: number, strength?: number): void;
  setPersonalize(on: boolean): void;
  setPointer(x: number, y: number, on: boolean): void;
  setEnergy(e: number): void;
  /** Page scroll progress 0..1: the scene's camera travels with it. */
  setScroll(p: number): void;
  setAsk(p: number | null): void;
  setDark(dark: boolean): void;
  setConfig(c: { fpsCap?: number; density?: number; speed?: number; calm?: boolean }): void;
  setVisible(v: boolean): void;
  resize(): void;
  dispose(): void;
};

export type HostOptions = Omit<SceneOptions, "width" | "height" | "dpr"> & { forceMain?: boolean };
export type HostHooks = { onFirstFrame?: () => void; onError?: () => void; onStats?: (s: { fps: number; dpr: number; density: number; count: number }) => void };

const size = (canvas: HTMLCanvasElement) => ({ w: Math.max(1, canvas.clientWidth), h: Math.max(1, canvas.clientHeight), dpr: window.devicePixelRatio || 1 });

export function workerSupported(canvas: HTMLCanvasElement): boolean {
  return typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && "transferControlToOffscreen" in canvas;
}

export async function createSceneHandle(canvas: HTMLCanvasElement, o: HostOptions, hooks: HostHooks = {}): Promise<SceneHandle> {
  const { forceMain, ...opts } = o;
  if (!forceMain && workerSupported(canvas)) {
    const s = size(canvas);
    const worker = new Worker(new URL("./field.worker.ts", import.meta.url), { type: "module" });
    let dead = false;
    const fail = () => { if (!dead) { dead = true; hooks.onError?.(); } };
    worker.onerror = fail;
    worker.onmessageerror = fail;
    worker.onmessage = (e: MessageEvent<{ t: string } & Record<string, number>>) => {
      if (e.data.t === "first") hooks.onFirstFrame?.();
      else if (e.data.t === "error" || e.data.t === "lost") fail();
      else if (e.data.t === "stats") hooks.onStats?.({ fps: e.data.fps, dpr: e.data.dpr, density: e.data.density, count: e.data.count });
    };
    const off = canvas.transferControlToOffscreen();
    worker.postMessage({ t: "init", canvas: off, opts: { ...opts, width: s.w, height: s.h, dpr: s.dpr } }, [off]);
    const post = (m: Record<string, unknown>) => { if (!dead) worker.postMessage(m); };
    return {
      mode: "worker",
      setScene: (id, params) => post({ t: "scene", id, params }),
      boom: (x, y, strength) => post({ t: "boom", x, y, strength }),
      setPersonalize: (on) => post({ t: "pers", on }),
      setPointer: (x, y, on) => post({ t: "pointer", x, y, on }),
      setEnergy: (e) => post({ t: "energy", e }),
      setScroll: (p) => post({ t: "scroll", p }),
      setAsk: (p) => post({ t: "ask", p }),
      setDark: (dark) => post({ t: "dark", dark }),
      setConfig: (c) => post({ t: "config", ...c }),
      setVisible: (v) => post({ t: "visible", v }),
      resize: () => { const z = size(canvas); post({ t: "size", ...z }); },
      dispose: () => { dead = true; try { worker.postMessage({ t: "dispose" }); } catch { /* gone */ } window.setTimeout(() => worker.terminate(), 200); },
    };
  }
  const { SceneEngine } = await import("./scene-engine");
  const s = size(canvas);
  const eng = new SceneEngine(canvas, { ...opts, width: s.w, height: s.h, dpr: s.dpr, budgetScale: 0.5 });
  eng.onFirstFrame = hooks.onFirstFrame;
  eng.onStats = hooks.onStats;
  eng.onLost = hooks.onError;
  eng.start();
  // QA only: ?fxdebug=1 on the main-thread renderer exposes read-only counters (time, buffer rebuilds, boom slots, camera)
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("fxdebug") === "1") (window as unknown as { __keplarField?: unknown }).__keplarField = { diag: () => eng.diag() };
  return {
    mode: "main",
    setScene: (id, params) => eng.setScene(id, params),
    boom: (x, y, strength) => eng.boom(x, y, strength),
    setPersonalize: (on) => eng.setPersonalize(on),
    setPointer: (x, y, on) => eng.setPointer(x, y, on),
    setEnergy: (e) => eng.setEnergy(e),
    setScroll: (p) => eng.setScroll(p),
    setAsk: (p) => eng.setAsk(p),
    setDark: (d) => eng.setDark(d),
    setConfig: (c) => eng.setConfig(c),
    setVisible: (v) => eng.setVisible(v),
    resize: () => { const z = size(canvas); eng.setSize(z.w, z.h, z.dpr); },
    dispose: () => eng.dispose(),
  };
}
