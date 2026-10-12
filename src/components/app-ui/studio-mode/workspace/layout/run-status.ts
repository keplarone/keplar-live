/**
 * Pure status helpers for the Keplar Studio shell (Workspace, OverlayShell, ControlCenter): what the run is doing right now,
 * the connection label, plan progress, the run's elapsed time. Everything is derived from the real agent state
 * (useStudioAgent) and the real event log (code/events.ts); nothing here invents a value.
 */
import type { StudioEvent } from "../../code/events";
import type { Item, PlanStep } from "../../useStudioAgent";

export type Env = "roblox" | "blender";
export type Connection = { state: string; message?: string };
/** StatusDot statuses (ui/Badge.tsx). */
export type DotStatus = "idle" | "running" | "success" | "warning" | "error" | "offline";

export const ENV_LABEL: Record<Env, string> = { roblox: "Roblox Studio", blender: "Blender" };
/** Short app name, as the old overlay said it ("Connecting to Studio…"). */
export const APP_SHORT: Record<Env, string> = { roblox: "Studio", blender: "Blender" };

/** The bridge's connection states, in words (StudioView's LABEL, plus Blender's). */
export const CONNECTION_LABEL: Record<string, string> = {
  idle: "Not connected",
  connecting: "Connecting…",
  connected: "Connected",
  missing: "Studio not found",
  unsupported: "Not available here",
  error: "Could not connect",
};

export function connectionLabel(env: Env, c: Connection): string {
  if (env === "blender" && c.state === "missing") return "Blender not found";
  return CONNECTION_LABEL[c.state] ?? c.state;
}

export function connectionDot(c: Connection): DotStatus {
  switch (c.state) {
    case "connected": return "success";
    case "connecting": return "running";
    case "missing":
    case "error": return "error";
    case "unsupported": return "offline";
    default: return "idle";
  }
}

/** The fields of the agent the status line reads (a structural subset of StudioAgent, so tests can pass plain objects). */
export type RunView = {
  items: readonly Item[];
  running: boolean;
  paused: boolean;
  looking: boolean;
  finished: boolean;
  playing: boolean;
  current: number;
  plan: readonly PlanStep[];
  place: { name: string } | null;
};

/** What Keplar is doing now, in a few words (the old overlay's statusText, plus approvals and play tests). */
export function operationText(a: RunView, env: Env, c: Connection): string {
  const app = APP_SHORT[env];
  if (c.state !== "connected") return c.state === "connecting" ? `Connecting to ${app}…` : c.message ?? `Not connected to ${app}`;
  if (a.looking) return env === "blender" ? "Reading the scene…" : "Looking at your place…";
  const waiting = a.items.filter((x) => x.kind === "action" && x.status === "waiting").length;
  if (waiting) return waiting === 1 ? "Waiting for your approval" : `${waiting} changes waiting for your approval`;
  if (a.running) return a.current ? `Building · step ${a.current}${a.plan.length ? ` of ${a.plan.length}` : ""}` : "Planning…";
  if (a.paused) return "Paused";
  if (a.playing) return "Play-testing";
  if (a.finished) return "Finished";
  return a.place ? a.place.name : "Ready";
}

/** StatusDot for the run: running while working, warning while waiting on the person, error after a failure. */
export function runDot(a: RunView, c: Connection): DotStatus {
  if (c.state !== "connected") return connectionDot(c);
  if (a.items.some((x) => x.kind === "action" && x.status === "waiting")) return "warning";
  if (a.running || a.looking) return "running";
  if (lastWarning(a.items)) return "error";
  if (a.finished) return "success";
  return "idle";
}

export function planProgress(plan: readonly PlanStep[]): { done: number; total: number } {
  return { done: plan.filter((p) => p.state === "done").length, total: plan.length };
}

/** The person's latest request (the active task), or null before the first one. */
export function activeTask(items: readonly Item[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]!;
    if (it.kind === "user") return it.text.trim() || (it.images.length ? `${it.images.length} reference ${it.images.length === 1 ? "image" : "images"}` : null);
  }
  return null;
}

/** The latest warning since the person's latest request (step cap, server error, credits, failed play test), else null. */
export function lastWarning(items: readonly Item[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]!;
    if (it.kind === "user") return null;
    if (it.kind === "note" && it.tone === "warn") return it.text;
  }
  return null;
}

/** Failed actions in the conversation (the run's real errors). */
export function failedActions(items: readonly Item[]): number {
  return items.filter((x) => x.kind === "action" && x.status === "failed").length;
}

/** True when the last warning is the credit stop (the run loop's auto top-up note), so the shell can offer Auto top-up. */
export const isCreditStop = (text: string | null): boolean => Boolean(text && /auto top-up/i.test(text));

/**
 * The current run's span from the event log: from the first event after the last finished or stopped run (pauses and resumes
 * belong to the same run) to `now` while it runs, else to its last event. Null when the log has no run (a restored chat).
 */
export function runSpan(events: readonly StudioEvent[]): { start: number; end: number } | null {
  // Look again (a refresh outside a run) is not part of a run.
  const log = events.filter((e) => !(e.kind === "studio.looked" && e.via === "refresh"));
  const boundary = (e: StudioEvent) => e.kind === "run.finished" || e.kind === "run.stopped";
  let i = log.length - 1;
  if (i >= 0 && boundary(log[i]!)) i--; // the run that just ended is still the current one
  while (i >= 0 && !boundary(log[i]!)) i--;
  const run = log.slice(i + 1);
  if (!run.length) return null;
  return { start: run[0]!.at, end: run[run.length - 1]!.at };
}

export function elapsedMs(events: readonly StudioEvent[], running: boolean, now: number): number | null {
  const span = runSpan(events);
  if (!span) return null;
  return Math.max(0, (running ? Math.max(now, span.end) : span.end) - span.start);
}

/** 0:07, 4:12, 1:02:09. */
export function formatElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export const formatCredits = (n: number): string => n.toLocaleString("en-US");

/** "12 s ago", "3 min ago" (the old viewport meta). */
export function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  return s < 60 ? `${s} s ago` : `${Math.round(s / 60)} min ago`;
}
