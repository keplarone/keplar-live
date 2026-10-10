/// <reference lib="webworker" />
import { SceneEngine, type SceneOptions } from "./scene-engine";
import type { SceneId, SceneParams } from "./scenes";

/**
 * The page-wide particle layer, rendered off the main thread: the canvas is transferred to this worker, so drawing,
 * the frame governor and scene building never compete with typing or scrolling. The page only posts tiny messages.
 */
type Msg =
  | { t: "init"; canvas: OffscreenCanvas; opts: SceneOptions }
  | { t: "scene"; id: SceneId; params?: SceneParams }
  | { t: "boom"; x: number; y: number; strength?: number }
  | { t: "pers"; on: boolean }
  | { t: "size"; w: number; h: number; dpr: number }
  | { t: "pointer"; x: number; y: number; on: boolean }
  | { t: "energy"; e: number }
  | { t: "scroll"; p: number }
  | { t: "ask"; p: number | null }
  | { t: "dark"; dark: boolean }
  | { t: "config"; fpsCap?: number; density?: number; speed?: number; calm?: boolean }
  | { t: "visible"; v: boolean }
  | { t: "dispose" };

let eng: SceneEngine | null = null;
const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  try {
    switch (m.t) {
      case "init":
        eng = new SceneEngine(m.canvas, m.opts);
        eng.onFirstFrame = () => ctx.postMessage({ t: "first" });
        eng.onStats = (s) => ctx.postMessage({ t: "stats", ...s });
        eng.onLost = () => ctx.postMessage({ t: "lost" });
        eng.start();
        break;
      case "scene": eng?.setScene(m.id, m.params); break;
      case "boom": eng?.boom(m.x, m.y, m.strength); break;
      case "pers": eng?.setPersonalize(m.on); break;
      case "size": eng?.setSize(m.w, m.h, m.dpr); break;
      case "pointer": eng?.setPointer(m.x, m.y, m.on); break;
      case "energy": eng?.setEnergy(m.e); break;
      case "scroll": eng?.setScroll(m.p); break;
      case "ask": eng?.setAsk(m.p); break;
      case "dark": eng?.setDark(m.dark); break;
      case "config": eng?.setConfig(m); break;
      case "visible": eng?.setVisible(m.v); break;
      case "dispose": eng?.dispose(); eng = null; ctx.close(); break;
    }
  } catch (err) {
    ctx.postMessage({ t: "error", message: String((err as Error)?.message ?? err) });
  }
};
