/**
 * Pure logic behind the Keplar Studio conversation (Conversation.tsx) and composer (Composer.tsx): labels, approval stages,
 * when the thinking indicator shows, reference limits, the composer's keyboard rule and run controls. No React, no CSS, so it
 * is unit tested (tests/studio-conversation.test.ts). Everything here is derived from the run's real state (useStudioAgent).
 */
import type { StudioEvent } from "../code/events";
import type { CodeModel } from "../code/documents";
import type { ActionStatus, Item, PlanStep, Risk } from "../useStudioAgent";

export type Env = "roblox" | "blender";
export type ActionItem = Extract<Item, { kind: "action" }>;

/** Up to 8 reference images per request; a video becomes 6 frames (references.ts). */
export const MAX_REFS = 8;
export const REFS_LIMIT_ERROR = `Up to ${MAX_REFS} reference images per request (a video counts as 6 frames).`;

/** Short risk badges on action rows. */
export const RISK_LABEL: Record<Risk, string> = { read: "Read", change: "Change", destructive: "Destructive" };

/** Starting points for the empty state. They only fill the composer; nothing is sent until the person chooses Build. */
export const IDEAS: Record<Env, readonly string[]> = {
  roblox: ["A lava obby with checkpoints", "A shop UI with coins", "A day and night cycle", "Better lighting for this place"],
  blender: ["A low-poly tree set", "Studio lighting for this model", "Worn metal materials", "A stylised rock pile"],
};

export const appName = (env: Env) => (env === "blender" ? "Blender" : "Roblox Studio");

/**
 * Where an action stands in the approval flow, in words. Distinguishes read-only steps, proposals waiting for the person
 * (pending authorization), approved steps in flight, applied changes, declined ones and failures. Destructive steps say so.
 */
export type ApprovalStage = "pending" | "pending-destructive" | "approved" | "running" | "applied" | "done" | "declined" | "failed";

export function approvalStage(it: Pick<ActionItem, "risk" | "status">): ApprovalStage {
  const read = it.risk === "read";
  switch (it.status) {
    case "waiting": return it.risk === "destructive" ? "pending-destructive" : "pending";
    case "running": return read ? "running" : "approved";
    case "done": return read ? "done" : "applied";
    case "skipped": return "declined";
    case "failed": return "failed";
  }
}

export const STAGE_LABEL: Record<ApprovalStage, string> = {
  pending: "Waiting for you",
  "pending-destructive": "Needs your approval",
  approved: "Applying",
  running: "Running",
  applied: "Applied",
  done: "Done",
  declined: "Skipped",
  failed: "Failed",
};

/** StatusDot status for each action status (shape + colour + text, never colour alone). */
export function actionDot(status: ActionStatus): "idle" | "running" | "success" | "warning" | "error" | "offline" {
  switch (status) {
    case "waiting": return "warning";
    case "running": return "running";
    case "done": return "success";
    case "failed": return "error";
    case "skipped": return "offline";
  }
}

/** Who approved each change that ran: the person, or auto-approve for safe changes (from the real event log). */
export function approvals(events: readonly StudioEvent[]): Map<string, "person" | "auto-approve"> {
  const out = new Map<string, "person" | "auto-approve">();
  for (const e of events) if (e.kind === "approval.granted") out.set(e.action, e.by);
  return out;
}

/** Action keys that have a code document (a script read or edit, a command): the rows that can offer "View code". */
export function codeActionKeys(code: CodeModel): Set<string> {
  const keys = new Set<string>();
  for (const d of code.documents) {
    if (d.action) keys.add(d.action);
    for (const v of d.versions) if (v.action) keys.add(v.action);
    for (const c of d.changes) keys.add(c.action);
  }
  return keys;
}

/** The inline script of a command action (Studio execute_luau, Blender python), for the preview when no code panel exists. */
export function inlineCode(it: Pick<ActionItem, "name" | "args">): string | null {
  if ((it.name === "execute_luau" || it.name === "python") && typeof it.args.code === "string") return it.args.code;
  return null;
}

/** The image URLs an upload_image step would publish (shown while it waits, so the person can check them). */
export function uploadUrls(it: Pick<ActionItem, "name" | "args">): string[] {
  return it.name === "upload_image" && Array.isArray(it.args.imagePaths) ? it.args.imagePaths.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Waiting actions that "Approve all safe" may approve: non-destructive changes the model proposed. Destructive steps never,
 * and reverts never (they always wait for their own approval, even with auto-approve on).
 */
export function safeWaiting(items: readonly Item[]): ActionItem[] {
  return items.filter((x): x is ActionItem => x.kind === "action" && x.status === "waiting" && x.risk !== "destructive" && x.origin !== "revert");
}

/**
 * The thinking indicator shows only while the model is really working: a run is in flight and no Studio step is running or
 * waiting for the person. While looking (before the request), it says so.
 */
export function thinking(a: { running: boolean; looking: boolean; items: readonly Item[] }): null | "looking" | "thinking" {
  if (!a.running) return null;
  if (a.items.some((x) => x.kind === "action" && (x.status === "running" || x.status === "waiting"))) return null;
  return a.looking ? "looking" : "thinking";
}

export function thinkingLabel(state: "looking" | "thinking", env: Env): string {
  if (state === "thinking") return "Keplar is thinking";
  return env === "blender" ? "Keplar is reading the scene" : "Keplar is looking at your place";
}

/**
 * A Keplar message split into prose and its numbered plan (the "1. …" block the run loop parses), so the plan renders as a
 * checklist with live step states. The plan is the same lines the server asked the model for; nothing is invented.
 */
export type MessagePart = { type: "text"; text: string } | { type: "plan"; steps: string[] };

const PLAN_LINE = /^\s*(\d{1,2})[.)]\s+(.+?)\s*$/;

export function splitPlan(text: string): MessagePart[] {
  const lines = text.split("\n");
  const parts: MessagePart[] = [];
  let buf: string[] = [];
  let steps: string[] = [];
  const flushText = () => { const t = buf.join("\n").trim(); if (t) parts.push({ type: "text", text: t }); buf = []; };
  const flushPlan = () => {
    if (steps.length >= 3) { flushText(); parts.push({ type: "plan", steps }); }
    else if (steps.length) buf.push(...steps.map((s, i) => `${i + 1}. ${s}`));
    steps = [];
  };
  for (const line of lines) {
    const m = PLAN_LINE.exec(line);
    if (m) { steps.push(m[2]!.replace(/\*\*/g, "")); continue; }
    if (steps.length && !line.trim()) continue; // blank lines inside a plan
    flushPlan();
    buf.push(line);
  }
  flushPlan();
  flushText();
  return parts;
}

/** The live state of each step of a plan shown in a message: only when it is the run's current plan, else null. */
export function planStates(steps: readonly string[], plan: readonly PlanStep[]): PlanStep["state"][] | null {
  const live = plan.slice(0, 12);
  if (live.length !== Math.min(steps.length, 12) || live.some((p, i) => p.text !== steps[i])) return null;
  return live.map((p) => p.state);
}

/** Adds newly read references under the limit; says when some did not fit. */
export function mergeRefs(current: readonly string[], next: readonly string[], max = MAX_REFS): { refs: string[]; error: string } {
  const refs = [...current, ...next].slice(0, max);
  return { refs, error: current.length + next.length > max ? REFS_LIMIT_ERROR : "" };
}

/** Enter sends; Shift+Enter is a newline; never while a run is in flight or an IME composition is open. */
export function submitsOnKey(e: { key: string; shiftKey: boolean; isComposing?: boolean }, running: boolean): boolean {
  return e.key === "Enter" && !e.shiftKey && !e.isComposing && !running;
}

export function canBuild(text: string, refs: number, a: { running: boolean; playing: boolean }): boolean {
  return !a.running && !a.playing && (text.trim().length > 0 || refs > 0);
}

export function placeholder(a: { running: boolean; playing: boolean; items: readonly unknown[] }, env: Env): string {
  if (a.running) return "Keplar is working. You can pause or stop.";
  if (a.playing) return "Play-testing. Note what to change, then stop the test and build.";
  if (a.items.length) return "Change something or add to it…";
  return env === "blender" ? "Describe what to model or change…" : "Describe what to build or change…";
}

/** The run in a few words (composer status). */
export function runState(a: { looking: boolean; running: boolean; paused: boolean; finished: boolean; current: number; plan: readonly unknown[]; pending?: number }, env: Env): string {
  // A run held on the person's approval is not "Planning": say what it is actually waiting for (matches the control strip).
  if (a.running && a.pending) return "Waiting for approval";
  if (a.looking && a.running) return env === "blender" ? "Reading the scene" : "Looking at your place";
  if (a.running && a.paused) return "Pausing after this step";
  if (a.running) return a.current ? `Step ${a.current}${a.plan.length ? ` of ${a.plan.length}` : ""}` : "Planning";
  if (a.paused) return "Paused";
  if (a.finished) return "Finished";
  return "Ready";
}

/** The composer's MorphIcon states, each from real state. */
export function sendIcon(a: { running: boolean; finished: boolean; paused: boolean }): "send" | "working" | "complete" {
  return a.running ? "working" : a.finished && !a.paused ? "complete" : "send";
}

/**
 * The two run-control slots. `play` holds Play test / Pause / Continue (play↔pause icon); `build` holds Build / Stop /
 * End run (build↔stop icon). Same elements throughout, so their icons morph instead of swapping.
 */
export type Controls = {
  play: null | { action: "playtest" | "pause" | "resume"; label: string; icon: "play" | "pause"; pressed?: boolean; disabled?: boolean; primary?: boolean };
  build: { action: "build" | "stop"; label: string; icon: "build" | "stop"; primary: boolean; disabled: boolean; title?: string };
};

export function controls(a: { running: boolean; paused: boolean; playing: boolean; items: readonly unknown[] }, canPlayTest: boolean, hasInput: boolean): Controls {
  if (a.running) {
    return {
      play: a.paused ? { action: "pause", label: "Pausing", icon: "play", disabled: true } : { action: "pause", label: "Pause", icon: "pause" },
      build: { action: "stop", label: "Stop", icon: "stop", primary: true, disabled: false },
    };
  }
  if (a.paused) {
    return {
      play: { action: "resume", label: "Continue", icon: "play", primary: true },
      build: { action: "stop", label: "End run", icon: "stop", primary: false, disabled: false },
    };
  }
  return {
    play: canPlayTest && a.items.length ? { action: "playtest", label: a.playing ? "Stop test" : "Play test", icon: a.playing ? "pause" : "play", pressed: a.playing } : null,
    build: { action: "build", label: "Build", icon: "build", primary: true, disabled: a.playing || !hasInput, ...(a.playing ? { title: "Stop the play test, then build" } : {}) },
  };
}
