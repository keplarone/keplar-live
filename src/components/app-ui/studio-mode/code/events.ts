/**
 * The run's execution event log: an append-only, timestamped record of what really happened in a Studio or Blender run.
 *
 * Every kind maps to one moment in useStudioAgent.ts (the page's run loop). Nothing here is inferred or simulated: a kind is only
 * emitted where the hook actually does the thing (sends the request, receives the reply, asks for approval, calls the bridge,
 * reads a script). The model's turns arrive whole (POST /api/studio/agent returns complete tool calls, no token streaming), so
 * there is no "typing" event: code appears at `action.proposed`, the moment the page receives it.
 *
 * Pure and client-safe (no React, no DOM): the code documents model (documents.ts), the timeline and tests read it.
 */
import type { Risk } from "../useStudioAgent";

/** Real token usage of one model turn, as the server returned it (src/lib/studio/agent.ts StudioUsage). Absent on servers that do not send it. */
export type TurnUsage = { model: string; provider: string | null; promptTokens: number; cachedTokens: number; completionTokens: number; reasoningTokens: number; latencyMs: number };

/** Where an action came from: the model's tool call, or one the person started from the page (revert, retry). */
export type ActionOrigin = "model" | "revert" | "retry";

/** Why a script was read through the bridge. "model": the model's own script_read; the others are the page's own reads around an edit. */
export type ReadPurpose = "model" | "preview" | "before" | "after";

/** How a script_read result was turned into source text (see parseScriptRead in documents.ts). */
export type ReadFormat = "plain" | "numbered" | "json";

/** Outcome of an edit, from re-reading the script after it ran and comparing with the proposed content. */
export type EditOutcome = "applied" | "differs" | "unconfirmed";

type Base = {
  /** Monotonic within one log (1, 2, 3, ...). */
  id: number;
  /** Date.now() when it happened. */
  at: number;
  /** The model request this belongs to (1 for the first request of the session); 0 before any request. */
  turn: number;
};

export type StudioEventBody =
  /** POST to the agent route is about to go out. */
  | { kind: "request.sent"; surface: "studio" | "blender"; mode: string | null; messages: number }
  /** The route answered 200 with a complete turn. latencyMs is measured on the page; usage/units are the server's real numbers. */
  | { kind: "reply.received"; latencyMs: number; units: number; usage: TurnUsage | null; mode: string | null; actions: number; blocked: number; done: boolean; text: string }
  /** The route answered with an error (credits, rate limit, model failure). */
  | { kind: "reply.failed"; latencyMs: number; status: number; code: string | null; error: string }
  /** The reply contained a numbered plan (parsePlan). */
  | { kind: "plan.parsed"; steps: string[] }
  /** The reply said which plan step it is starting ("Step N:"). */
  | { kind: "plan.step"; step: number }
  /** An action arrived (whole) and was added to the feed. `action` is the feed item's key. */
  | { kind: "action.proposed"; action: string; callId: string | null; name: string; args: Record<string, unknown>; risk: Risk; title: string; origin: ActionOrigin; of: string | null }
  /** The model asked for a tool Keplar does not run. */
  | { kind: "action.blocked"; callId: string; name: string }
  | { kind: "approval.requested"; action: string }
  | { kind: "approval.granted"; action: string; by: "person" | "auto-approve" }
  | { kind: "approval.declined"; action: string; by: "person" | "stop" }
  /** The bridge call is about to start. Read-only actions go straight here (they never wait). */
  | { kind: "action.running"; action: string; name: string }
  | { kind: "action.done"; action: string; name: string; ms: number; result: string; image: boolean }
  | { kind: "action.failed"; action: string; name: string; ms: number; error: string }
  /** Keplar looked at the place: before a request ("look"/"scene"), a viewport refresh, or the model's screen_capture. */
  | { kind: "studio.looked"; via: "look" | "scene" | "refresh" | "screen_capture"; screenshot: boolean; items: number | null; action: string | null }
  /** A script's source as read through the bridge (full text, capped at MAX_SOURCE_CHARS). */
  | { kind: "script.read"; path: string; purpose: ReadPurpose; action: string | null; ok: true; source: string; complete: boolean; format: ReadFormat }
  | { kind: "script.read"; path: string; purpose: ReadPurpose; action: string | null; ok: false; error: string }
  /** After a script edit ran: the re-read compared with what was proposed. */
  | { kind: "edit.applied"; action: string; path: string; outcome: EditOutcome }
  | { kind: "run.paused"; reason: "person" | "step-cap" | "credits" | "error" }
  | { kind: "run.resumed" }
  | { kind: "run.stopped" }
  | { kind: "run.finished"; changed: boolean }
  | { kind: "error"; message: string };

export type StudioEvent = Base & StudioEventBody;
export type StudioEventKind = StudioEvent["kind"];

/** Text kept in events for display (results, errors, reply text). Script sources keep far more (MAX_SOURCE_CHARS). */
export const MAX_EVENT_TEXT = 2000;
/** A script source larger than this is cut and marked incomplete (never used for revert). */
export const MAX_SOURCE_CHARS = 400_000;
/** The log keeps at most this many events (oldest dropped); a long session stays bounded in memory. */
export const MAX_EVENTS = 2000;

export function clip(text: string, max = MAX_EVENT_TEXT): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Appends to a log (returns a new array), keeping it bounded. */
export function appendEvent(log: readonly StudioEvent[], e: StudioEvent): StudioEvent[] {
  const next = [...log, e];
  return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
}

/** A small factory that stamps ids, times and the current turn. `now` is injectable for tests. */
export function eventStamper(now: () => number = Date.now) {
  let id = 0;
  return {
    stamp(body: StudioEventBody, turn: number): StudioEvent {
      return { ...body, id: ++id, at: now(), turn } as StudioEvent;
    },
    reset() { id = 0; },
  };
}

const ago = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`);
const n = (v: number) => v.toLocaleString("en-US");

/** A one-line, human label for a timeline row. Only facts carried by the event. */
export function describeEvent(e: StudioEvent): { label: string; detail: string; tone: "neutral" | "progress" | "success" | "error" | "attention" } {
  switch (e.kind) {
    case "request.sent": return { label: `Request ${e.turn} sent`, detail: [e.mode ? `mode ${e.mode}` : "", `${e.messages} messages`].filter(Boolean).join(" · "), tone: "progress" };
    case "reply.received": {
      const parts = [ago(e.latencyMs), `${n(e.units)} credits`];
      if (e.usage) parts.push(`${n(e.usage.promptTokens)} in${e.usage.cachedTokens ? ` (${n(e.usage.cachedTokens)} cached)` : ""}`, `${n(e.usage.completionTokens)} out`);
      parts.push(e.actions ? `${e.actions} action${e.actions === 1 ? "" : "s"}` : e.done ? "no actions (done)" : "no actions");
      return { label: "Reply received", detail: parts.join(" · "), tone: "neutral" };
    }
    case "reply.failed": return { label: `Request failed (${e.status})`, detail: e.error, tone: "error" };
    case "plan.parsed": return { label: `Plan: ${e.steps.length} steps`, detail: e.steps.slice(0, 3).join(" / "), tone: "neutral" };
    case "plan.step": return { label: `Step ${e.step}`, detail: "", tone: "neutral" };
    case "action.proposed": return { label: e.origin === "revert" ? "Revert proposed" : e.origin === "retry" ? "Retry proposed" : "Action proposed", detail: `${e.title} · ${e.risk}`, tone: e.risk === "destructive" ? "attention" : "neutral" };
    case "action.blocked": return { label: "Tool not available", detail: e.name, tone: "attention" };
    case "approval.requested": return { label: "Waiting for approval", detail: "", tone: "attention" };
    case "approval.granted": return { label: e.by === "person" ? "Approved" : "Auto-approved (safe change)", detail: "", tone: "neutral" };
    case "approval.declined": return { label: e.by === "stop" ? "Not run (stopped)" : "Declined", detail: "", tone: "neutral" };
    case "action.running": return { label: "Running", detail: e.name, tone: "progress" };
    case "action.done": return { label: "Done", detail: `${e.name} · ${ago(e.ms)}${e.result ? ` · ${firstLine(e.result)}` : ""}`, tone: "success" };
    case "action.failed": return { label: "Failed", detail: `${e.name} · ${firstLine(e.error)}`, tone: "error" };
    case "studio.looked": return { label: e.via === "scene" ? "Read the Blender scene" : e.screenshot ? "Looked at Studio (screenshot)" : "Looked at Studio", detail: e.items != null ? `${e.items} items` : "", tone: "neutral" };
    case "script.read": return e.ok
      ? { label: `Read ${e.path}`, detail: [readWhy(e.purpose), `${e.source.split("\n").length} lines`, e.complete ? "" : "partial"].filter(Boolean).join(" · "), tone: "neutral" }
      : { label: `Could not read ${e.path}`, detail: `${readWhy(e.purpose)} · ${firstLine(e.error)}`, tone: "attention" };
    case "edit.applied": return e.outcome === "applied"
      ? { label: "Edit confirmed", detail: `${e.path} matches the proposed content`, tone: "success" }
      : e.outcome === "differs"
        ? { label: "Edit applied, content differs", detail: `${e.path} does not match the proposed content`, tone: "attention" }
        : { label: "Edit not confirmed", detail: `${e.path} could not be re-read`, tone: "attention" };
    case "run.paused": return { label: "Paused", detail: { person: "by you", "step-cap": "step limit reached", credits: "credits", error: "after an error" }[e.reason], tone: "attention" };
    case "run.resumed": return { label: "Resumed", detail: "", tone: "progress" };
    case "run.stopped": return { label: "Stopped", detail: "", tone: "neutral" };
    case "run.finished": return { label: "Finished", detail: e.changed ? "changes made" : "no changes", tone: "success" };
    case "error": return { label: "Error", detail: e.message, tone: "error" };
  }
}

function readWhy(p: ReadPurpose): string {
  return p === "model" ? "by Keplar" : p === "preview" ? "for the preview" : p === "before" ? "before the edit" : "after the edit";
}

function firstLine(s: string): string {
  const l = s.split("\n").find((x) => x.trim()) ?? "";
  return l.length > 140 ? `${l.slice(0, 139)}…` : l;
}

/** Last status of an action from the log: what the feed would show, derived only from events. */
export type ActionPhase = "proposed" | "waiting" | "running" | "done" | "failed" | "declined";
export function actionPhases(events: readonly StudioEvent[]): Map<string, ActionPhase> {
  const m = new Map<string, ActionPhase>();
  for (const e of events) {
    if (e.kind === "action.proposed") m.set(e.action, "proposed");
    else if (e.kind === "approval.requested") m.set(e.action, "waiting");
    else if (e.kind === "approval.declined") m.set(e.action, "declined");
    else if (e.kind === "action.running") m.set(e.action, "running");
    else if (e.kind === "action.done") m.set(e.action, "done");
    else if (e.kind === "action.failed") m.set(e.action, "failed");
  }
  return m;
}
