/**
 * AI execution flight recorder: one structured, text-free timeline per /api/keplar request (collection system_flight).
 *
 * Each request already runs inside a cost scope (request-cost.ts, AsyncLocalStorage). The recorder adds a bounded event list to
 * that scope: pipeline stages as the client saw them, every provider request when it leaves and when it comes back (model,
 * provider, slot, outcome, latency, billed USD), connected-app tool states, cancellation, and the final outcome with a failure
 * classification (provider / capacity / orchestration / client). One row is written when the request ends.
 *
 * Privacy by construction: events carry enums, model ids, numbers and short codes only. Every string passes `safe()` (64
 * characters, [A-Za-z0-9._:/@+-] only), so a prompt, an answer, an email or a token cannot be stored even by mistake. No
 * account id is stored: a request is found by the x-request-id the response already carries. Rows are pruned after 7 days
 * (KEPLAR_RETAIN_FLIGHT_DAYS). Reading is admin-only (/api/admin/flight, /admin/flight).
 */
import { collection } from "@/lib/create/platform/store";
import { id } from "@/lib/create/platform/ids";

export const FLIGHT_MAX_EVENTS = 240;

export type FlightEvent = {
  /** Milliseconds since the request started. */
  t: number;
  k: "stage" | "sent" | "call" | "tool" | "error" | "answer" | "limit" | "cancel" | "note";
  stage?: string;
  status?: string;
  slot?: string;
  model?: string;
  provider?: string;
  ok?: boolean;
  reason?: string;
  ms?: number;
  usd?: number;
  code?: string;
};

export type FlightLog = { start: number; events: FlightEvent[]; dropped: number };

export type FlightOutcome = "answered" | "no_answer" | "error" | "cancelled" | "limited";
/** Where a failed request went wrong, from the evidence in its own timeline (never guessed from text). */
export type FailureCause = "provider_timeout" | "provider_rate_limited" | "provider_error" | "quality_gate" | "capacity" | "orchestration" | "client" | null;

export type FlightRow = {
  id: string;
  workspaceId: "system";
  at: string;
  reqId: string;
  plan: string;
  /** The product feature (cost/features.ts id: ask, deep-research, ...), for per-feature reliability. */
  feature: string;
  kind: "answer" | "instant";
  outcome: FlightOutcome;
  cause: FailureCause;
  errorCode: string | null;
  durationMs: number;
  /** Time from the request start to the first streamed word or answer event the client received (null when none came). */
  firstOutputMs: number | null;
  calls: { sent: number; returned: number; failed: number; rateLimited: number; usd: number };
  models: string[];
  events: FlightEvent[];
  droppedEvents: number;
};

/** Short, character-limited strings only: no prompt, answer, email or token can survive this. */
export function safe(v: unknown, max = 64): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/[^A-Za-z0-9._:/@+-]/g, "").slice(0, max);
  return s || undefined;
}

export const startFlight = (start = Date.now()): FlightLog => ({ start, events: [], dropped: 0 });

/** Append one event (bounded). Unknown fields are dropped; strings are sanitized; numbers rounded. */
export function flightPush(log: FlightLog | undefined, e: Omit<FlightEvent, "t">, at = Date.now()): void {
  if (!log) return;
  if (log.events.length >= FLIGHT_MAX_EVENTS) { log.dropped++; return; }
  const ev: FlightEvent = { t: Math.max(0, at - log.start), k: e.k };
  for (const key of ["stage", "status", "slot", "model", "provider", "reason", "code"] as const) {
    const s = safe(e[key]);
    if (s) ev[key] = s;
  }
  if (typeof e.ok === "boolean") ev.ok = e.ok;
  if (typeof e.ms === "number" && Number.isFinite(e.ms)) ev.ms = Math.max(0, Math.round(e.ms));
  if (typeof e.usd === "number" && Number.isFinite(e.usd) && e.usd > 0) ev.usd = Math.round(e.usd * 1e6) / 1e6;
  log.events.push(ev);
}

/** The events the client stream carries that belong on the timeline (stage changes, tool states, the outcome). Text never. */
export function flightFromStreamEvent(log: FlightLog | undefined, e: { type: string } & Record<string, unknown>): void {
  if (!log) return;
  switch (e.type) {
    case "stage": flightPush(log, { k: "stage", stage: e.stage as string, status: e.status as string }); break;
    case "tool": { const u = e.use as { app?: string; tool?: string; status?: string } | undefined; flightPush(log, { k: "tool", stage: u?.app, model: u?.tool, status: u?.status }); break; }
    case "error": flightPush(log, { k: "error", code: e.code as string }); break;
    case "answer": flightPush(log, { k: "answer", ok: true }); break;
    case "limit": flightPush(log, { k: "limit", code: (e.code as string) ?? "limit" }); break;
    default: break;
  }
}

/** Pure: the outcome and its most likely cause, from the timeline alone. */
export function classify(events: FlightEvent[], o: { answered: boolean; aborted: boolean; errorCode: string | null; limited: boolean }): { outcome: FlightOutcome; cause: FailureCause } {
  if (o.answered) return { outcome: "answered", cause: null };
  if (o.aborted) return { outcome: "cancelled", cause: "client" };
  if (o.limited) return { outcome: "limited", cause: "capacity" };
  const calls = events.filter((e) => e.k === "call");
  const failed = calls.filter((e) => e.ok === false);
  const outcome: FlightOutcome = o.errorCode === "no_response" ? "no_answer" : "error";
  if (!calls.length) return { outcome, cause: o.errorCode && /rate|busy|limit|budget|pool|paused|stop/.test(o.errorCode) ? "capacity" : "orchestration" };
  if (failed.length === calls.length) {
    const reasons = new Set(failed.map((e) => e.reason ?? "error"));
    if ([...reasons].every((r) => r === "timeout")) return { outcome, cause: "provider_timeout" };
    if ([...reasons].every((r) => r === "rate_limited")) return { outcome, cause: "provider_rate_limited" };
    if ([...reasons].some((r) => r.startsWith("gate"))) return { outcome, cause: "quality_gate" };
    return { outcome, cause: "provider_error" };
  }
  // Some calls worked but no answer came out: the failure is in Keplar's own pipeline after the providers.
  return { outcome, cause: "orchestration" };
}

const rows = () => collection<FlightRow>("system_flight");

function withoutEvents(r: FlightRow): Omit<FlightRow, "events"> {
  const { events, ...rest } = r;
  void events;
  return rest;
}

export function flightRow(log: FlightLog, f: { reqId: string; plan: string; feature?: string; kind: "answer" | "instant"; answered: boolean; aborted: boolean; errorCode: string | null; limited: boolean; usd: number; end?: number }): FlightRow {
  const end = f.end ?? Date.now();
  const { outcome, cause } = classify(log.events, f);
  const calls = log.events.filter((e) => e.k === "call");
  const first = log.events.find((e) => e.k === "note" && e.code === "first_output");
  return {
    id: id("fl"),
    workspaceId: "system",
    at: new Date(log.start).toISOString(),
    reqId: safe(f.reqId, 80) ?? "unknown",
    plan: safe(f.plan, 24) ?? "unknown",
    feature: safe(f.feature, 32) ?? "ask",
    kind: f.kind,
    outcome,
    cause,
    errorCode: safe(f.errorCode ?? undefined, 40) ?? null,
    durationMs: Math.max(0, end - log.start),
    firstOutputMs: first ? first.t : null,
    calls: {
      sent: log.events.filter((e) => e.k === "sent").length,
      returned: calls.length,
      failed: calls.filter((e) => e.ok === false).length,
      rateLimited: calls.filter((e) => e.reason === "rate_limited").length,
      usd: Math.round(f.usd * 1e6) / 1e6,
    },
    models: [...new Set(calls.map((e) => e.model).filter((m): m is string => Boolean(m)))].slice(0, 12),
    events: log.events,
    droppedEvents: log.dropped,
  };
}

/** Fire and forget: a recorder failure never touches the answer. */
export function recordFlight(row: FlightRow): void {
  rows().insert(row).catch((e) => console.error("[ops] flight not recorded:", e instanceof Error ? e.name : "error"));
}

export async function flightByRequest(reqId: string): Promise<FlightRow | null> {
  const key = safe(reqId, 80);
  if (!key) return null;
  const hits = await rows().listSystem((r) => r.reqId === key);
  return hits.sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
}

export async function recentFlights(o: { outcome?: FlightOutcome | "failed"; limit?: number } = {}): Promise<Omit<FlightRow, "events">[]> {
  const limit = Math.min(200, Math.max(1, o.limit ?? 50));
  const list = await rows().listSystem((r) => !o.outcome || (o.outcome === "failed" ? r.outcome !== "answered" && r.outcome !== "cancelled" : r.outcome === o.outcome));
  return list.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit).map(withoutEvents);
}

/* ── summaries for /admin/flight and the feature scorecards (pure) ───────────── */

const pct = (sorted: number[], q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : null);

export type FlightSummary = {
  requests: number;
  outcomes: Record<FlightOutcome, number>;
  causes: Record<string, number>;
  /** Share of requests (excluding the person's own cancels) that ended with an answer. Null with no data. */
  successRate: number | null;
  durationMs: { p50: number | null; p95: number | null };
  firstOutputMs: { p50: number | null; p95: number | null };
  usd: number;
};

export function summarizeFlights(list: Pick<FlightRow, "outcome" | "cause" | "durationMs" | "firstOutputMs" | "calls">[]): FlightSummary {
  const outcomes: Record<FlightOutcome, number> = { answered: 0, no_answer: 0, error: 0, cancelled: 0, limited: 0 };
  const causes: Record<string, number> = {};
  for (const r of list) {
    outcomes[r.outcome]++;
    if (r.cause && r.cause !== "client") causes[r.cause] = (causes[r.cause] ?? 0) + 1;
  }
  const judged = list.length - outcomes.cancelled;
  const dur = list.map((r) => r.durationMs).sort((a, b) => a - b);
  const first = list.map((r) => r.firstOutputMs).filter((n): n is number => n !== null).sort((a, b) => a - b);
  return {
    requests: list.length,
    outcomes,
    causes,
    successRate: judged > 0 ? outcomes.answered / judged : null,
    durationMs: { p50: pct(dur, 0.5), p95: pct(dur, 0.95) },
    firstOutputMs: { p50: pct(first, 0.5), p95: pct(first, 0.95) },
    usd: Math.round(list.reduce((t, r) => t + (r.calls?.usd ?? 0), 0) * 1e6) / 1e6,
  };
}

export async function flightsSince(sinceIso: string): Promise<Omit<FlightRow, "events">[]> {
  const list = await rows().listSystem((r) => r.at >= sinceIso);
  return list.map(withoutEvents);
}

/** The last 24 hours (the admin page's window; the clock is read here, not during render). */
export const flightsLastDay = (at = Date.now()) => flightsSince(new Date(at - 864e5).toISOString());
