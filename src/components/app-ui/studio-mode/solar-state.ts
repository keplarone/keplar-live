import type { SolarState } from "./SolarCore";
import type { StudioAgent } from "./useStudioAgent";

/** The core's state, from what the build is really doing (never a timer). */
export function solarState(a: StudioAgent, draftLength: number): SolarState {
  const last = a.items[a.items.length - 1];
  if (a.looking) return "looking";
  if (a.playing) return "testing";
  if (a.running) {
    if (a.items.some((x) => x.kind === "action" && x.status === "running")) return "building";
    return a.plan.length ? "thinking" : "planning";
  }
  if (last?.kind === "note" && last.tone === "warn") return "error";
  if (last?.kind === "action" && last.status === "failed") return "error";
  if (draftLength) return "typing";
  if (a.finished) return "done";
  return "idle";
}

/** Studio steps that have finished: each one sends a pulse through the core. */
export function solarPulse(a: StudioAgent): number {
  return a.items.filter((x) => x.kind === "action" && x.status === "done").length;
}
