/**
 * Model quality and drift observatory + feature reliability scorecards. Every number comes from rows the product already writes:
 *   - model_calls (telemetry.ts): one row per provider call: model, provider, ok/reason, latency, billed USD;
 *   - system_flight (flight.ts): one text-free timeline per answer request: feature, outcome, cause, durations, cost.
 * Nothing is sampled synthetically, estimated or simulated. With too few calls a figure is null and no drift is claimed.
 *
 * Drift = the last 24 hours against the 7 days before them, per model: success rate down by >= 15 points, timeout rate up by
 * >= 10 points, or p95 latency at least 1.8x and over 5 s. Each finding is alerted to the owner once per model, kind and day.
 * The observatory never changes routing or a person's chosen model: it reports, people decide (admin controls exist for that).
 */
import { collection } from "@/lib/create/platform/store";
import { alertOwner } from "@/lib/accounts/alerts";
import { writeAudit } from "./audit";
import type { ModelCallRow } from "./telemetry";
import type { FlightRow } from "./flight";

export const DRIFT = { minCurrent: 20, minBaseline: 50, successDrop: 0.15, timeoutRise: 0.1, latencyRatio: 1.8, latencyFloorMs: 5000 } as const;

const pct = (sorted: number[], q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : null);

export type ModelStats = {
  model: string;
  calls: number;
  ok: number;
  successRate: number | null;
  timeoutRate: number | null;
  rateLimitedRate: number | null;
  gateRejects: number;
  p50Ms: number | null;
  p95Ms: number | null;
  usd: number;
  /** Billed USD per successful call (null without successes). */
  usdPerSuccess: number | null;
};

type CallLike = Pick<ModelCallRow, "model" | "ok" | "reason" | "latencyMs" | "usd">;

/** Pure: per-model figures from call rows. Latency percentiles use successful calls only (a timeout's latency is the timeout). */
export function modelStats(rows: CallLike[]): ModelStats[] {
  const by = new Map<string, CallLike[]>();
  for (const r of rows) (by.get(r.model) ?? by.set(r.model, []).get(r.model)!).push(r);
  return [...by.entries()].map(([model, list]) => {
    const ok = list.filter((r) => r.ok);
    const lat = ok.map((r) => r.latencyMs).sort((a, b) => a - b);
    const usd = list.reduce((t, r) => t + (Number.isFinite(r.usd) ? r.usd : 0), 0);
    const n = list.length;
    return {
      model,
      calls: n,
      ok: ok.length,
      successRate: n ? ok.length / n : null,
      timeoutRate: n ? list.filter((r) => r.reason === "timeout").length / n : null,
      rateLimitedRate: n ? list.filter((r) => r.reason === "rate_limited").length / n : null,
      gateRejects: list.filter((r) => r.reason.startsWith("gate")).length,
      p50Ms: pct(lat, 0.5),
      p95Ms: pct(lat, 0.95),
      usd: Math.round(usd * 1e6) / 1e6,
      usdPerSuccess: ok.length ? Math.round((usd / ok.length) * 1e6) / 1e6 : null,
    };
  }).sort((a, b) => b.calls - a.calls);
}

export type DriftFinding = { model: string; kind: "success" | "timeouts" | "latency"; current: number; baseline: number; detail: string };

/** Pure: which models measurably got worse. Needs enough calls on both sides; otherwise nothing is claimed. */
export function detectDrift(current: ModelStats[], baseline: ModelStats[], cfg = DRIFT): DriftFinding[] {
  const base = new Map(baseline.map((b) => [b.model, b]));
  const out: DriftFinding[] = [];
  for (const c of current) {
    const b = base.get(c.model);
    if (!b || c.calls < cfg.minCurrent || b.calls < cfg.minBaseline) continue;
    if (c.successRate !== null && b.successRate !== null && b.successRate - c.successRate >= cfg.successDrop) {
      out.push({ model: c.model, kind: "success", current: c.successRate, baseline: b.successRate, detail: `success ${(c.successRate * 100).toFixed(1)}% vs ${(b.successRate * 100).toFixed(1)}% (${c.calls} vs ${b.calls} calls)` });
    }
    if (c.timeoutRate !== null && b.timeoutRate !== null && c.timeoutRate - b.timeoutRate >= cfg.timeoutRise) {
      out.push({ model: c.model, kind: "timeouts", current: c.timeoutRate, baseline: b.timeoutRate, detail: `timeouts ${(c.timeoutRate * 100).toFixed(1)}% vs ${(b.timeoutRate * 100).toFixed(1)}%` });
    }
    if (c.p95Ms !== null && b.p95Ms !== null && b.p95Ms > 0 && c.p95Ms >= cfg.latencyFloorMs && c.p95Ms / b.p95Ms >= cfg.latencyRatio) {
      out.push({ model: c.model, kind: "latency", current: c.p95Ms, baseline: b.p95Ms, detail: `p95 ${Math.round(c.p95Ms)} ms vs ${Math.round(b.p95Ms)} ms` });
    }
  }
  return out;
}

export type FeatureCard = {
  feature: string;
  requests: number;
  answered: number;
  /** answered / (requests - the person's own cancels); null with no judged requests. */
  successRate: number | null;
  baselineSuccessRate: number | null;
  /** Success rate down by >= 10 points against the previous 7 days, with at least 20 requests on each side. */
  regression: boolean;
  p50Ms: number | null;
  p95Ms: number | null;
  firstOutputP50Ms: number | null;
  causes: Record<string, number>;
  usd: number;
};

type FlightLike = Pick<FlightRow, "feature" | "outcome" | "cause" | "durationMs" | "firstOutputMs" | "calls">;

/** Pure: one scorecard per feature, from flight rows (current window) and the baseline window. */
export function featureCards(current: FlightLike[], baseline: FlightLike[]): FeatureCard[] {
  const group = (list: FlightLike[]) => {
    const m = new Map<string, FlightLike[]>();
    for (const r of list) (m.get(r.feature ?? "ask") ?? m.set(r.feature ?? "ask", []).get(r.feature ?? "ask")!).push(r);
    return m;
  };
  const rate = (list: FlightLike[]) => {
    const judged = list.filter((r) => r.outcome !== "cancelled");
    return judged.length ? judged.filter((r) => r.outcome === "answered").length / judged.length : null;
  };
  const cur = group(current);
  const base = group(baseline);
  return [...cur.entries()].map(([feature, list]) => {
    const b = base.get(feature) ?? [];
    const sr = rate(list);
    const br = rate(b);
    const dur = list.map((r) => r.durationMs).sort((x, y) => x - y);
    const first = list.map((r) => r.firstOutputMs).filter((n): n is number => n !== null).sort((x, y) => x - y);
    const causes: Record<string, number> = {};
    for (const r of list) if (r.cause && r.cause !== "client") causes[r.cause] = (causes[r.cause] ?? 0) + 1;
    return {
      feature,
      requests: list.length,
      answered: list.filter((r) => r.outcome === "answered").length,
      successRate: sr,
      baselineSuccessRate: br,
      regression: sr !== null && br !== null && list.length >= 20 && b.length >= 20 && br - sr >= 0.1,
      p50Ms: pct(dur, 0.5),
      p95Ms: pct(dur, 0.95),
      firstOutputP50Ms: pct(first, 0.5),
      causes,
      usd: Math.round(list.reduce((t, r) => t + (r.calls?.usd ?? 0), 0) * 1e6) / 1e6,
    };
  }).sort((a, b) => b.requests - a.requests);
}

/** The deployment these numbers belong to (Vercel's git metadata when present). */
export const deploymentVersion = (env: Record<string, string | undefined> = process.env) => ({
  commit: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  ref: env.VERCEL_GIT_COMMIT_REF ?? null,
  deployment: env.VERCEL_DEPLOYMENT_ID ?? null,
  env: env.VERCEL_ENV ?? env.NODE_ENV ?? null,
});

export type ObservatorySnapshot = {
  generatedAt: string;
  window: { current: string; baselineFrom: string };
  models: { current: ModelStats[]; baseline: ModelStats[] };
  drift: DriftFinding[];
  features: FeatureCard[];
  /** True when a window hit the scan cap (the figures are from the newest rows only). */
  capped: boolean;
  version: ReturnType<typeof deploymentVersion>;
};

const SCAN_CAP = 20_000;

export async function observatorySnapshot(at = Date.now()): Promise<ObservatorySnapshot> {
  const curFrom = new Date(at - 864e5).toISOString();
  const baseFrom = new Date(at - 8 * 864e5).toISOString();
  const until = new Date(at).toISOString();
  const calls = collection<ModelCallRow>("model_calls");
  const flights = collection<FlightRow>("system_flight");
  const [cCalls, bCalls, cFlights, bFlights] = await Promise.all([
    calls.listSystemRange({ field: "at", gte: curFrom, lt: until }, SCAN_CAP),
    calls.listSystemRange({ field: "at", gte: baseFrom, lt: curFrom }, SCAN_CAP),
    flights.listSystemRange({ field: "at", gte: curFrom, lt: until }, SCAN_CAP),
    flights.listSystemRange({ field: "at", gte: baseFrom, lt: curFrom }, SCAN_CAP),
  ]);
  const current = modelStats(cCalls);
  const baseline = modelStats(bCalls);
  return {
    generatedAt: until,
    window: { current: curFrom, baselineFrom: baseFrom },
    models: { current, baseline },
    drift: detectDrift(current, baseline),
    features: featureCards(cFlights, bFlights),
    capped: [cCalls, bCalls, cFlights, bFlights].some((l) => l.length >= SCAN_CAP),
    version: deploymentVersion(),
  };
}

type AlertRow = { id: string; workspaceId: "system"; at: string };

/** Cron entry: compute, alert each new finding once per model, kind and UTC day, audit it. Returns what it found. */
export async function runObservatory(at = Date.now(), notify: (subject: string, text: string) => Promise<void> = alertOwner): Promise<{ drift: DriftFinding[]; alerted: number; regressions: string[] }> {
  const snap = await observatorySnapshot(at);
  const day = new Date(at).toISOString().slice(0, 10);
  const sent = collection<AlertRow>("system_observatory_alerts");
  let alerted = 0;
  for (const d of snap.drift) {
    const r = await sent.insertIfAbsent({ id: `${day}:${d.kind}:${d.model}`.slice(0, 200), workspaceId: "system", at: new Date(at).toISOString() });
    if (!r.inserted) continue;
    alerted++;
    await notify(`Model drift: ${d.model} (${d.kind})`, `Measured over the last 24 hours against the 7 days before:\n${d.detail}\n\nNothing was changed automatically. Review /admin/reliability; use /admin controls to disable a provider or model if needed.`).catch(() => undefined);
    await writeAudit("system:observatory", "model_drift", `${d.model} ${d.kind}: ${d.detail}`).catch(() => undefined);
  }
  return { drift: snap.drift, alerted, regressions: snap.features.filter((f) => f.regression).map((f) => f.feature) };
}
