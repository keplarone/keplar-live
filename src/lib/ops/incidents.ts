/**
 * Automated incident detection. One sweep reads signals the product already records, decides which incidents are happening
 * (pure `evaluate`, unit-tested), keeps one row per incident in `system_incidents`, and notifies the owner about new, escalated
 * and resolved incidents in a single digest (deduplicated and throttled).
 *
 * Signals (a 15-minute window unless noted; nothing is sampled synthetically or estimated):
 *   database      the store write/read/delete round trip (health.ts)
 *   auth secret   production running without BETTER_AUTH_SECRET
 *   answers       system_flight: answered vs failed answer requests (the person's own cancels and plan limits excluded),
 *                 with the request ids of failed ones as trace ids (x-request-id; /admin/flight opens them)
 *   providers     model_calls per provider: failure, timeout and rate-limit rates; p95 latency against the previous 24 hours
 *   errors        system_error_minute: tracked server and browser errors
 *   webhooks      system_webhook_hourly: failed and rejected deliveries over the last 2 hours
 *   spend         today's shared spend against the global daily cap; provider spend in the last hour
 *   auth          security_events: failed and throttled sign-ins
 *   crons         _cron_beats: failed or late scheduled jobs
 *
 * Severity: SEV-1 critical outage, SEV-2 major functionality degraded, SEV-3 limited functionality affected, SEV-4 minor.
 * Notifications carry services, timestamps, counts and request ids only: never a prompt, an email address or an account id.
 * The detector changes nothing in production; people act on it (runbooks in docs/runbooks, kill switches in /admin).
 */
import { collection } from "@/lib/create/platform/store";
import { neonConfigured } from "@/lib/create/platform/neon";
import { caps, spendToday } from "@/lib/create/platform/spend";
import { authSecretMissingInProduction } from "@/lib/accounts/secret";
import { alertOwner } from "@/lib/accounts/alerts";
import { cronStatus, probeStore, type CronState } from "./health";
import { errorsSince, webhooksSince, type WebhookTally } from "./counters";
import { percentile } from "./metrics";
import { writeAudit } from "./audit";
import type { ModelCallRow } from "./telemetry";
import type { FlightRow } from "./flight";

export type Sev = 1 | 2 | 3 | 4;
export const SEV_LABEL: Record<Sev, string> = { 1: "SEV-1", 2: "SEV-2", 3: "SEV-3", 4: "SEV-4" };
export const SEV_MEANING: Record<Sev, string> = {
  1: "Critical production outage",
  2: "Major functionality degraded",
  3: "Limited functionality affected",
  4: "Minor operational issue",
};

export type ProviderWindow = { provider: string; calls: number; failed: number; timeouts: number; rateLimited: number; p95Ms: number | null; baselineP95Ms: number | null; baselineCalls: number };

export type Signals = {
  at: number;
  windowMin: number;
  database: { checked: boolean; ok: boolean; ms: number | null };
  authSecretMissing: boolean;
  answers: { judged: number; failed: number; causes: Record<string, number>; traceIds: string[] };
  providers: ProviderWindow[];
  errors: Record<string, number>;
  webhooks: WebhookTally[];
  spend: { todayUsd: number | null; capUsd: number; lastHourUsd: number | null };
  auth: { failed: number; throttled: number };
  crons: { name: string; label: string; state: CronState }[];
  alertsRouted: boolean;
};

export type Detected = { key: string; sev: Sev; service: string; title: string; evidence: string[]; traceIds: string[] };

export type IncidentThresholds = typeof THRESHOLDS;
export const THRESHOLDS = {
  minAnswers: 10,
  answersSev1: 0.5,
  answersSev2: 0.25,
  answersSev3: 0.1,
  minProviderCalls: 10,
  providerSev2: 0.5,
  providerRateLimitedSev3: 0.3,
  latencyRatio: 2,
  latencyFloorMs: 20_000,
  serverErrorsSev2: 50,
  serverErrorsSev3: 10,
  clientErrorsSev3: 30,
  webhookFailuresSev2: 3,
  webhookRejectedSev3: 10,
  spendTodaySev2: 0.9,
  spendTodaySev3: 0.7,
  authFailedSev3: 100,
  authThrottledSev3: 20,
} as const;

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
const BILLING_WEBHOOKS = new Set(["whop", "apple"]);

/** Pure: which incidents the signals show. Too little data means nothing is claimed. */
export function evaluate(s: Signals, t: IncidentThresholds = THRESHOLDS): Detected[] {
  const out: Detected[] = [];
  const win = `last ${s.windowMin} min`;

  if (s.database.checked && !s.database.ok) {
    out.push({ key: "database:unavailable", sev: 1, service: "database", title: "Database round trip failing", evidence: [`Store write/read/delete round trip failed (${s.database.ms ?? "?"} ms).`, "Sign-in, chats, billing and limits depend on it."], traceIds: [] });
  }
  if (s.authSecretMissing) {
    out.push({ key: "auth:secret-missing", sev: 1, service: "auth", title: "Production running without BETTER_AUTH_SECRET", evidence: ["Sessions and sign-in links break on every instance restart."], traceIds: [] });
  }

  const a = s.answers;
  if (a.judged >= t.minAnswers) {
    const rate = a.failed / a.judged;
    const sev: Sev | null = rate >= t.answersSev1 ? 1 : rate >= t.answersSev2 ? 2 : rate >= t.answersSev3 ? 3 : null;
    if (sev) {
      const causes = Object.entries(a.causes).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${n}`).join(", ") || "unclassified";
      out.push({ key: "answers:failing", sev, service: "answers", title: `${pct(rate)} of answer requests failing`, evidence: [`${a.failed} of ${a.judged} answer requests failed (${win}).`, `Causes: ${causes}.`], traceIds: a.traceIds.slice(0, 5) });
    }
  }

  const usable = s.providers.filter((p) => p.calls >= t.minProviderCalls);
  const allDown = usable.length > 0 && usable.every((p) => p.failed / p.calls >= 0.9);
  for (const p of usable) {
    const failRate = p.failed / p.calls;
    if (failRate >= t.providerSev2) {
      out.push({ key: `provider:${p.provider}:failing`, sev: allDown ? 1 : 2, service: `provider:${p.provider}`, title: `${p.provider}: ${pct(failRate)} of calls failing`, evidence: [`${p.failed} of ${p.calls} calls failed (${win}); ${p.timeouts} timed out, ${p.rateLimited} rate-limited.`, allDown ? "Every active provider is failing." : "Routing falls back to other providers where it can."], traceIds: [] });
      continue;
    }
    if (p.rateLimited / p.calls >= t.providerRateLimitedSev3) {
      out.push({ key: `provider:${p.provider}:rate-limited`, sev: 3, service: `provider:${p.provider}`, title: `${p.provider}: ${pct(p.rateLimited / p.calls)} of calls rate-limited`, evidence: [`${p.rateLimited} of ${p.calls} calls rate-limited (${win}).`], traceIds: [] });
    }
    if (p.p95Ms !== null && p.baselineP95Ms && p.baselineCalls >= t.minProviderCalls && p.p95Ms >= t.latencyFloorMs && p.p95Ms / p.baselineP95Ms >= t.latencyRatio) {
      out.push({ key: `provider:${p.provider}:slow`, sev: 3, service: `provider:${p.provider}`, title: `${p.provider}: responses ${(p.p95Ms / p.baselineP95Ms).toFixed(1)}x slower than usual`, evidence: [`p95 ${Math.round(p.p95Ms)} ms (${win}) vs ${Math.round(p.baselineP95Ms)} ms over the previous 24 h.`], traceIds: [] });
    }
  }

  const server = (s.errors.server ?? 0) + (s.errors.render ?? 0) + (s.errors.job ?? 0);
  if (server >= t.serverErrorsSev3) {
    out.push({ key: "errors:server", sev: server >= t.serverErrorsSev2 ? 2 : 3, service: "server", title: `${server} server errors in ${s.windowMin} min`, evidence: [`Tracked unhandled or 500 errors: server ${s.errors.server ?? 0}, render ${s.errors.render ?? 0}, job ${s.errors.job ?? 0} (${win}).`, "Grouped details: /admin/errors."], traceIds: [] });
  }
  if ((s.errors.client ?? 0) >= t.clientErrorsSev3) {
    out.push({ key: "errors:client", sev: 3, service: "frontend", title: `${s.errors.client} browser errors in ${s.windowMin} min`, evidence: [`Error boundaries and uncaught errors reported by browsers (${win}).`], traceIds: [] });
  }

  for (const w of s.webhooks) {
    if (w.failed >= t.webhookFailuresSev2) {
      const billing = BILLING_WEBHOOKS.has(w.provider);
      out.push({ key: `webhook:${w.provider}:failing`, sev: billing ? 2 : 3, service: `webhook:${w.provider}`, title: `${w.provider} webhooks failing`, evidence: [`${w.failed} deliveries failed and ${w.ok} succeeded in the last 2 hours; the sender retries failed ones.`, billing ? "Plan grants, renewals, cancellations or refunds may be delayed." : "Seller order updates may be delayed."], traceIds: [] });
    }
    if (w.rejected >= t.webhookRejectedSev3) {
      out.push({ key: `webhook:${w.provider}:rejected`, sev: 3, service: `webhook:${w.provider}`, title: `${w.provider} webhooks rejected`, evidence: [`${w.rejected} deliveries rejected (bad signature or webhook not configured) in the last 2 hours.`, "Either the signing secret does not match the provider's, or someone is sending forged events."], traceIds: [] });
    }
  }

  if (s.spend.todayUsd !== null && s.spend.capUsd > 0) {
    const share = s.spend.todayUsd / s.spend.capUsd;
    if (share >= t.spendTodaySev3) {
      out.push({ key: "spend:daily-cap", sev: share >= t.spendTodaySev2 ? 2 : 3, service: "inference-spend", title: `Inference spend at ${pct(share)} of the daily cap`, evidence: [`$${s.spend.todayUsd.toFixed(2)} of $${s.spend.capUsd.toFixed(2)} today (UTC).`, `Last hour: ${s.spend.lastHourUsd === null ? "unknown" : `$${s.spend.lastHourUsd.toFixed(2)}`}. Cheaper routing engages automatically near the cap.`], traceIds: [] });
    }
  }

  if (s.auth.throttled >= t.authThrottledSev3 || s.auth.failed >= t.authFailedSev3) {
    out.push({ key: "auth:failures", sev: 3, service: "auth", title: "Unusual sign-in failures", evidence: [`${s.auth.failed} failed and ${s.auth.throttled} throttled sign-in attempts (${win}).`, "Possible credential stuffing; per-account and per-IP limits are in force. Review /admin/security."], traceIds: [] });
  }

  for (const c of s.crons) {
    if (c.state === "failed") out.push({ key: `cron:${c.name}:failed`, sev: 3, service: `cron:${c.name}`, title: `Scheduled job failed: ${c.label}`, evidence: ["Its last run reported a failure."], traceIds: [] });
    else if (c.state === "late") out.push({ key: `cron:${c.name}:late`, sev: 4, service: `cron:${c.name}`, title: `Scheduled job late: ${c.label}`, evidence: ["No successful run within its expected interval."], traceIds: [] });
  }

  if (!s.alertsRouted) {
    out.push({ key: "alerts:unrouted", sev: 4, service: "alerting", title: "Alerts go to email only", evidence: ["KEPLAR_ALERT_WEBHOOK_URL is not set, so no chat or pager channel receives incidents."], traceIds: [] });
  }
  return out;
}

/* ───────────── signals ───────────── */

/** Pure: per-provider window figures from call rows (latency percentiles from successful calls only). */
export function providerWindows(current: Pick<ModelCallRow, "provider" | "ok" | "reason" | "latencyMs">[], baseline: Pick<ModelCallRow, "provider" | "ok" | "latencyMs">[]): ProviderWindow[] {
  const group = <R extends { provider: string }>(rows: R[]) => {
    const m = new Map<string, R[]>();
    for (const r of rows) (m.get(r.provider) ?? m.set(r.provider, []).get(r.provider)!).push(r);
    return m;
  };
  const p95 = (rows: { ok: boolean; latencyMs: number }[]) => percentile(rows.filter((r) => r.ok).map((r) => r.latencyMs).sort((x, y) => x - y), 95);
  const base = group(baseline);
  return [...group(current).entries()].map(([provider, rows]) => {
    const b = base.get(provider) ?? [];
    return {
      provider,
      calls: rows.length,
      failed: rows.filter((r) => !r.ok && !r.reason.startsWith("gate")).length,
      timeouts: rows.filter((r) => r.reason === "timeout").length,
      rateLimited: rows.filter((r) => r.reason === "rate_limited").length,
      p95Ms: p95(rows),
      baselineP95Ms: p95(b),
      baselineCalls: b.length,
    };
  });
}

/** Pure: answer outcomes in the window. Cancels and plan limits are the person's choice or plan, not failures. */
export function answerWindow(rows: Pick<FlightRow, "outcome" | "cause" | "reqId">[]): Signals["answers"] {
  const judged = rows.filter((r) => r.outcome !== "cancelled" && r.outcome !== "limited");
  const failed = judged.filter((r) => r.outcome !== "answered");
  const causes: Record<string, number> = {};
  for (const r of failed) causes[r.cause ?? "unknown"] = (causes[r.cause ?? "unknown"] ?? 0) + 1;
  return { judged: judged.length, failed: failed.length, causes, traceIds: failed.map((r) => r.reqId).filter((id) => id && id !== "unknown").slice(-10) };
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error("[incidents] signal failed:", e instanceof Error ? e.name : "error");
    return fallback;
  }
}

export async function collectSignals(at = Date.now(), windowMin = 15): Promise<Signals> {
  const from = new Date(at - windowMin * 60_000).toISOString();
  const baseFrom = new Date(at - 24 * 3_600_000).toISOString();
  const calls = collection<ModelCallRow>("model_calls");
  const [db, current, baseline, flights, errors, webhooks, today, lastHour, auth, crons] = await Promise.all([
    neonConfigured() ? safe(async () => { const p = await probeStore(); return { checked: true, ok: p.ok, ms: p.ms }; }, { checked: true, ok: false, ms: null }) : Promise.resolve({ checked: false, ok: true, ms: null }),
    safe(() => calls.listSystemRange({ field: "at", gte: from }, 20_000), [] as ModelCallRow[]),
    safe(() => calls.listSystemRange({ field: "at", gte: baseFrom, lt: from }, 20_000), [] as ModelCallRow[]),
    safe(() => collection<FlightRow>("system_flight").listSystemRange({ field: "at", gte: from }, 5000), [] as FlightRow[]),
    safe(() => errorsSince(windowMin, at), {} as Record<string, number>),
    safe(() => webhooksSince(2, at), [] as WebhookTally[]),
    safe(async () => (await spendToday()).totalUsd, null as number | null),
    safe(async () => {
      const rows = await collection<{ id: string; workspaceId: string; m: string; usd: number }>("system_spend_minute").listSystemRange({ field: "m", gte: new Date(at - 59 * 60_000).toISOString().slice(0, 16) }, 120);
      return rows.reduce((t, r) => t + (r.usd || 0), 0);
    }, null as number | null),
    safe(async () => {
      const rows = await collection<{ id: string; workspaceId: string; at: string; kind: string }>("security_events").listSystemRange({ field: "at", gte: from }, 5000);
      return { failed: rows.filter((r) => r.kind === "auth.failed" || r.kind === "auth.mfa_failed").length, throttled: rows.filter((r) => r.kind === "auth.throttled").length };
    }, { failed: 0, throttled: 0 }),
    safe(() => cronStatus(at), [] as Awaited<ReturnType<typeof cronStatus>>),
  ]);
  return {
    at,
    windowMin,
    database: db,
    authSecretMissing: authSecretMissingInProduction(),
    answers: answerWindow(flights),
    providers: providerWindows(current, baseline),
    errors,
    webhooks,
    spend: { todayUsd: today, capUsd: caps().globalUsd, lastHourUsd: lastHour },
    auth,
    crons: crons.filter((c) => c.state !== "never").map((c) => ({ name: c.name, label: c.label, state: c.state })),
    alertsRouted: Boolean(process.env.KEPLAR_ALERT_WEBHOOK_URL?.trim()),
  };
}

/* ───────────── incident records, dedupe and notification ───────────── */

export type IncidentRow = {
  id: string;
  workspaceId: "system";
  key: string;
  status: "open" | "resolved";
  sev: Sev;
  service: string;
  title: string;
  evidence: string[];
  traceIds: string[];
  firstAt: string;
  lastAt: string;
  resolvedAt: string | null;
  /** Sweeps in which it was seen. */
  seen: number;
  notifiedAt: string | null;
  notifiedSev: Sev | null;
};

const incidents = () => collection<IncidentRow>("system_incidents");
const locks = () => collection<{ id: string; workspaceId: "system"; at: string }>("system_incident_locks");

/** How long before an unchanged open incident is mentioned again. SEV-4 is shown in /admin only, never sent. */
export const RENOTIFY_MS: Record<Sev, number | null> = { 1: 30 * 60_000, 2: 2 * 3_600_000, 3: 12 * 3_600_000, 4: null };
/** At most this many incidents in one digest; the rest are summarised by count. */
export const DIGEST_MAX = 8;

export type Plan = { upsert: IncidentRow[]; notify: { row: IncidentRow; why: "new" | "escalated" | "reminder" | "resolved" }[] };

/** Pure: given what is open and what was detected, which rows change and what is worth telling someone. */
export function plan(open: IncidentRow[], detected: Detected[], at: number): Plan {
  const iso = new Date(at).toISOString();
  const byKey = new Map(open.map((r) => [r.key, r]));
  const upsert: IncidentRow[] = [];
  const notify: Plan["notify"] = [];
  for (const d of detected) {
    const cur = byKey.get(d.key);
    if (!cur) {
      const row: IncidentRow = { id: `inc_${d.key}_${at}`.replace(/[^A-Za-z0-9_:.-]/g, "-").slice(0, 120), workspaceId: "system", key: d.key, status: "open", sev: d.sev, service: d.service, title: d.title, evidence: d.evidence, traceIds: d.traceIds, firstAt: iso, lastAt: iso, resolvedAt: null, seen: 1, notifiedAt: null, notifiedSev: null };
      if (RENOTIFY_MS[d.sev] !== null) { row.notifiedAt = iso; row.notifiedSev = d.sev; notify.push({ row, why: "new" }); }
      upsert.push(row);
      continue;
    }
    byKey.delete(d.key);
    const row: IncidentRow = { ...cur, sev: d.sev, title: d.title, service: d.service, evidence: d.evidence, traceIds: d.traceIds.length ? d.traceIds : cur.traceIds, lastAt: iso, seen: cur.seen + 1 };
    const every = RENOTIFY_MS[d.sev];
    if (every !== null) {
      if (cur.notifiedSev === null || d.sev < cur.notifiedSev) { row.notifiedAt = iso; row.notifiedSev = d.sev; notify.push({ row, why: cur.notifiedSev === null ? "new" : "escalated" }); }
      else if (!cur.notifiedAt || at - Date.parse(cur.notifiedAt) >= every) { row.notifiedAt = iso; row.notifiedSev = d.sev; notify.push({ row, why: "reminder" }); }
    }
    upsert.push(row);
  }
  for (const cur of byKey.values()) {
    const row: IncidentRow = { ...cur, status: "resolved", resolvedAt: iso };
    upsert.push(row);
    if (cur.notifiedSev !== null && cur.notifiedSev <= 2) notify.push({ row, why: "resolved" });
  }
  return { upsert, notify };
}

/** Pure: one digest message for everything worth telling in this sweep. */
export function digest(items: Plan["notify"], at: number): { subject: string; text: string } | null {
  if (!items.length) return null;
  const order = { new: 0, escalated: 1, reminder: 2, resolved: 3 } as const;
  const sorted = [...items].sort((a, b) => (a.why === "resolved" ? 9 : a.row.sev) - (b.why === "resolved" ? 9 : b.row.sev) || order[a.why] - order[b.why]);
  const active = sorted.filter((i) => i.why !== "resolved");
  const worst = active.length ? Math.min(...active.map((i) => i.row.sev)) as Sev : null;
  const subject = worst ? `${SEV_LABEL[worst]} ${active[0].row.title}${active.length > 1 ? ` (+${active.length - 1} more)` : ""}` : `Resolved: ${sorted[0].row.title}${sorted.length > 1 ? ` (+${sorted.length - 1} more)` : ""}`;
  const lines = sorted.slice(0, DIGEST_MAX).map((i) => {
    const r = i.row;
    const head = i.why === "resolved" ? `RESOLVED ${SEV_LABEL[r.sev]} ${r.title}` : `${SEV_LABEL[r.sev]} (${i.why}) ${r.title}`;
    return [
      head,
      `  Service: ${r.service}. ${SEV_MEANING[r.sev]}.`,
      `  First seen ${r.firstAt}, last seen ${r.lastAt}${r.resolvedAt ? `, resolved ${r.resolvedAt}` : ""}.`,
      ...r.evidence.map((e) => `  - ${e}`),
      ...(r.traceIds.length ? [`  Request ids: ${r.traceIds.join(", ")}`] : []),
    ].join("\n");
  });
  const more = sorted.length > DIGEST_MAX ? [`…and ${sorted.length - DIGEST_MAX} more. See /admin/reliability.`] : [];
  return { subject, text: [`Incident sweep at ${new Date(at).toISOString()}.`, "", ...lines, ...more, "", "Dashboard: /admin/reliability. Runbooks: docs/runbooks."].join("\n") };
}

export type SweepResult = { skipped?: "locked"; detected: Detected[]; opened: number; resolved: number; notified: number };

/**
 * Cron entry. Overlapping sweeps (Vercel cron, Inngest, an external scheduler) are harmless: a 2-minute lock means only one of
 * them writes and notifies.
 */
export async function runIncidentSweep(at = Date.now(), notify: (subject: string, text: string) => Promise<void> = alertOwner, signals?: Signals): Promise<SweepResult> {
  const lock = await locks().insertIfAbsent({ id: `sweep:${Math.floor(at / 120_000)}`, workspaceId: "system", at: new Date(at).toISOString() });
  if (!lock.inserted) return { skipped: "locked", detected: [], opened: 0, resolved: 0, notified: 0 };
  const s = signals ?? (await collectSignals(at));
  const detected = evaluate(s);
  const open = await incidents().listSystem((r) => r.status === "open");
  const p = plan(open, detected, at);
  for (const row of p.upsert) {
    const exists = open.some((o) => o.id === row.id);
    if (exists) await incidents().update("system", row.id, row);
    else await incidents().insert(row);
  }
  const d = digest(p.notify, at);
  if (d) {
    await notify(d.subject, d.text).catch((e) => console.error("[incidents] notify failed:", e instanceof Error ? e.name : "error"));
    await writeAudit("system:incidents", "incident_alert", d.subject.slice(0, 200)).catch(() => undefined);
  }
  return { detected, opened: p.upsert.filter((r) => r.seen === 1 && r.status === "open").length, resolved: p.upsert.filter((r) => r.status === "resolved").length, notified: p.notify.length };
}

export async function listIncidents(days = 14): Promise<IncidentRow[]> {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const rows = await incidents().listSystemRange({ field: "lastAt", gte: since }, 500);
  return rows.sort((a, b) => (a.status === b.status ? a.sev - b.sev || b.lastAt.localeCompare(a.lastAt) : a.status === "open" ? -1 : 1));
}
