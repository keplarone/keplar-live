/**
 * Small shared counters the incident detector reads (incidents.ts). Each is one row per bucket in the shared store, incremented
 * fire-and-forget, so counting can never fail or slow the request it describes. Buckets carry their start time in `at` so the
 * retention job prunes them like any other telemetry.
 *
 *   system_error_minute   tracked errors per source ("server" | "render" | "client" | "job") per UTC minute
 *   system_webhook_hourly webhook deliveries per provider per UTC hour: ok, failed (handler error, 5xx so the sender retries),
 *                         rejected (bad signature / not configured)
 */
import { collection } from "@/lib/create/platform/store";

const SYSTEM = "system";
export const minuteOf = (t = Date.now()) => new Date(t).toISOString().slice(0, 16);
export const hourOf = (t = Date.now()) => new Date(t).toISOString().slice(0, 13);

type ErrorMinute = { id: string; workspaceId: string; at: string; source: string; n: number };
const errorMinutes = () => collection<ErrorMinute>("system_error_minute");

export function countError(source: string, at = Date.now()): Promise<void> {
  const m = minuteOf(at);
  const id = `${source}:${m}`;
  return errorMinutes()
    .increment(SYSTEM, id, { n: 1 }, { id, workspaceId: SYSTEM, at: `${m}:00.000Z`, source, n: 0 })
    .then(() => undefined)
    .catch(() => undefined);
}

/** Errors per source over the last `minutes` minutes. */
export async function errorsSince(minutes: number, at = Date.now()): Promise<Record<string, number>> {
  const rows = await errorMinutes().listSystemRange({ field: "at", gte: `${minuteOf(at - (minutes - 1) * 60_000)}:00.000Z` }, 2000);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.source] = (out[r.source] ?? 0) + (r.n || 0);
  return out;
}

export type WebhookProvider = "whop" | "apple" | "stripe-connect" | "higgsfield";
export type WebhookOutcome = "ok" | "failed" | "rejected";
type WebhookHour = { id: string; workspaceId: string; at: string; provider: string; ok: number; failed: number; rejected: number };
const webhookHours = () => collection<WebhookHour>("system_webhook_hourly");

export function countWebhook(provider: WebhookProvider, outcome: WebhookOutcome, at = Date.now()): void {
  const h = hourOf(at);
  const id = `${provider}:${h}`;
  void webhookHours()
    .increment(SYSTEM, id, { [outcome]: 1 }, { id, workspaceId: SYSTEM, at: `${h}:00:00.000Z`, provider, ok: 0, failed: 0, rejected: 0 })
    .catch(() => undefined);
}

export type WebhookTally = { provider: string; ok: number; failed: number; rejected: number };

/** Webhook outcomes per provider over the last `hours` hour buckets (including the current one). */
export async function webhooksSince(hours: number, at = Date.now()): Promise<WebhookTally[]> {
  const rows = await webhookHours().listSystemRange({ field: "at", gte: `${hourOf(at - (hours - 1) * 3_600_000)}:00:00.000Z` }, 2000);
  const by = new Map<string, WebhookTally>();
  for (const r of rows) {
    const t = by.get(r.provider) ?? { provider: r.provider, ok: 0, failed: 0, rejected: 0 };
    t.ok += r.ok || 0;
    t.failed += r.failed || 0;
    t.rejected += r.rejected || 0;
    by.set(r.provider, t);
  }
  return [...by.values()];
}
