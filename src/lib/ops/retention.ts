/**
 * Data retention for high-volume operational telemetry. Without it model_calls (one row per provider call),
 * system_spend_minute and system_hourly_use grow forever in the shared table.
 *
 * Defaults (days, env override KEPLAR_RETAIN_<NAME>_DAYS, minimum 1):
 *   model_calls 14 (admin reads the last 24 h; the rest is only for incident review)
 *   system_spend_minute 3 (spike detector reads minutes)
 *   system_hourly_use 3 (limits read the current hour)
 * seo_events (first-party landing-page funnel events, src/lib/seo/events.ts) 180 (KEPLAR_RETAIN_SEO_EVENTS_DAYS), pruned in the same hourly trigger.
 * Business records, the credits ledger, billing events and the admin audit log are NEVER pruned here.
 * Runs: Inngest cron (hourly) when Inngest is on, and opportunistically at most once an hour per instance
 * after a model call. Each run deletes at most `batch` rows per collection, so it can never become a long query.
 */
import { collection } from "@/lib/create/platform/store";
import { pruneSeoEvents } from "@/lib/seo/events";
import { keepAlive } from "@/lib/create/platform/after";
import { maybePruneViews } from "@/lib/business/traffic";

export type RetentionResult = Record<string, number>;

export const retentionDays = (env: Record<string, string | undefined> = process.env) => {
  const n = (k: string, d: number) => (Number.isFinite(Number(env[k])) && Number(env[k]) >= 1 ? Math.floor(Number(env[k])) : d);
  return { modelCalls: n("KEPLAR_RETAIN_MODEL_CALLS_DAYS", 14), spendMinute: n("KEPLAR_RETAIN_SPEND_MINUTE_DAYS", 3), hourlyUse: n("KEPLAR_RETAIN_HOURLY_USE_DAYS", 3) };
};

/** Hour bucket ("2026-10-02T16") encoded in a system_hourly_use id such as "m:some/model:2026-10-02T16". */
export const hourOfId = (id: string): string | null => /:(\d{4}-\d{2}-\d{2}T\d{2})$/.exec(id)?.[1] ?? null;

export async function pruneTelemetry(at = Date.now(), batch = 5000): Promise<RetentionResult> {
  const d = retentionDays();
  const iso = (days: number) => new Date(at - days * 864e5).toISOString();
  const out: RetentionResult = { model_calls: 0, system_spend_minute: 0, system_hourly_use: 0 };
  const step = async (name: string, job: () => Promise<number>) => {
    try {
      out[name] = await job();
    } catch (e) {
      out[name] = -1; // one collection failing never blocks the others
      console.error("[ops] retention failed:", name, e instanceof Error ? e.name : "error");
    }
  };
  await step("model_calls", () => collection("model_calls").purgeSystemBefore("at", iso(d.modelCalls), batch));
  await step("system_spend_minute", () => collection("system_spend_minute").purgeSystemBefore("m", iso(d.spendMinute).slice(0, 16), batch));
  await step("system_hourly_use", async () => {
    const cutoff = iso(d.hourlyUse).slice(0, 13);
    const c = collection<{ id: string; workspaceId: string }>("system_hourly_use");
    const old = (await c.listSystem((r) => (hourOfId(r.id) ?? "9999") < cutoff)).slice(0, batch);
    let n = 0;
    for (const r of old) if (await c.remove(r.workspaceId, r.id)) n++;
    return n;
  });
  return out;
}

/**
 * Newer operational collections, pruned separately so the result shape above stays stable:
 * system_request_costs 30 days (KEPLAR_RETAIN_REQUEST_COSTS_DAYS), system_error_events 30 days (KEPLAR_RETAIN_ERRORS_DAYS),
 * system_fanout_day 3 days, system_safety_events 180 days (KEPLAR_RETAIN_SAFETY_DAYS), system_flight 7 days (KEPLAR_RETAIN_FLIGHT_DAYS),
 * dev_outbox 14 days, biz_connect_event_claims 30 days.
 */
export async function pruneOperational(at = Date.now(), batch = 5000): Promise<RetentionResult> {
  const n = (k: string, d: number) => (Number.isFinite(Number(process.env[k])) && Number(process.env[k]) >= 1 ? Math.floor(Number(process.env[k])) : d);
  const iso = (days: number) => new Date(at - days * 864e5).toISOString();
  const out: RetentionResult = {};
  const jobs: [string, string, number][] = [
    ["system_request_costs", "at", n("KEPLAR_RETAIN_REQUEST_COSTS_DAYS", 30)],
    ["system_error_events", "at", n("KEPLAR_RETAIN_ERRORS_DAYS", 30)],
    ["system_safety_events", "at", n("KEPLAR_RETAIN_SAFETY_DAYS", 180)],
    ["system_fanout_day", "day", 3],
    ["system_flight", "at", n("KEPLAR_RETAIN_FLIGHT_DAYS", 7)], // execution timelines (flight.ts): incident review only
    ["system_observatory_alerts", "at", 30], // one row per drift alert sent (dedupe per model, kind and day)
    ["dev_outbox", "at", 14], // undelivered / dev-mode mail records (outbox.ts): masked recipient in production, body withheld
    ["biz_connect_event_claims", "at", 30], // Stripe Connect webhook dedupe claims (connect-webhook.ts); Stripe stops retrying an event after 3 days
    ["answer_turns", "expiresAt", 1], // answer recovery checkpoints (turn-recovery.ts): unreadable after 30 min, deleted within a day
    ["queue_claims", "at", 30], // per-run claims of durable jobs (platform/queue.ts); a job lives minutes, at most a day
    ["queue_jobs", "updatedAt", 30], // jobs that were given up (finished jobs delete their own row)
  ];
  for (const [name, field, days] of jobs) {
    try {
      out[name] = await collection(name).purgeSystemBefore(field, iso(days), batch);
    } catch (e) {
      out[name] = -1;
      console.error("[ops] retention failed:", name, e instanceof Error ? e.name : "error");
    }
  }
  return out;
}

let lastRun = 0;
/**
 * Cheap trigger for the request path: runs at most once an hour per instance, never throws, never awaited. The work runs after the
 * response (Next `after`), so a frozen instance can't drop it half-way.
 */
export function maybePrune(at = Date.now()): void {
  if (at - lastRun < 3_600_000) return;
  lastRun = at;
  keepAlive(() => pruneTelemetry(at), "retention: telemetry");
  keepAlive(() => pruneOperational(at), "retention: operational");
  keepAlive(() => pruneSeoEvents(at), "retention: seo events"); // search-to-activation events: 180 days (KEPLAR_RETAIN_SEO_EVENTS_DAYS)
  keepAlive(() => maybePruneViews(at), "retention: page views"); // site page views (counters and legacy rows): 90 days, one bulk delete each
}
export const resetPruneClock = () => {
  lastRun = 0;
};
