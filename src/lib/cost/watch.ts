/**
 * Periodic profitability watch. Runs from the daily Vercel cron (/api/cron/cost-guard) and, opportunistically, from live
 * traffic (the meter's flush, at most every 10 minutes per instance; a store lease keeps it to one run per window across
 * instances):
 *
 *  - OpenRouter balance check (alert at the configured threshold; $0 → paid calls fall back to :free models) every 10 min;
 *  - negative-margin check per feature over `margin.windowDays`, hourly: alerts the owner and, with `flags.autoThrottle`,
 *    throttles the feature for `margin.throttleHours` (paid calls go to :free models or are refused, per `throttleAction`);
 *  - KEPLAR_GLOBAL_DAILY_USD_CAP: alert at `globalCap.alertPct`% (80%) of the cap with a suggested new cap (./global-cap.ts);
 *  - cost anomaly alerts (feature spike vs trailing average, one account's spend today, Free plan paid cost), one email per
 *    anomaly per UTC day.
 */
import { collection } from "@/lib/create/platform/store";
import { alertOwner } from "@/lib/accounts/alerts";
import { writeAudit } from "@/lib/ops/audit";
import { checkOpenRouterBalance, openRouterKey } from "@/lib/ops/openrouter-balance";
import { costConfig, type CostConfig } from "./config";
import { activeThrottles, setThrottle } from "./guard";
import { COST_EVENTS, flushCostEvents } from "./meter";
import { summarizeProfitability, recentCostEvents, type Anomaly, type LedgerRow } from "./report";
import { loadRevenue } from "./revenue";
import { globalCapStatus } from "./global-cap";
import type { FeatureId } from "./features";

type LeaseRow = { id: string; workspaceId: string; at: string };
const leases = () => collection<LeaseRow>("cost_state");
const SYSTEM = "system";

async function lease(id: string): Promise<boolean> {
  try {
    return (await leases().insertIfAbsent({ id, workspaceId: SYSTEM, at: new Date().toISOString() })).inserted;
  } catch {
    return false;
  }
}

export type WatchResult = { balance: string; globalCap?: string; margin: string; throttled: FeatureId[]; alerts: number; anomalies: Anomaly[] };

/** Pure: which negative-margin features to throttle now (not already throttled, paid cost over the minimum). */
export function featuresToThrottle(anomalies: Anomaly[], active: Partial<Record<FeatureId, unknown>>, cfg: CostConfig): FeatureId[] {
  if (!cfg.flags.autoThrottle) return [];
  const never = new Set<FeatureId>(["system", "untagged", "support"]);
  return [...new Set(anomalies.filter((a) => a.kind === "negative_margin_feature" && a.feature && !active[a.feature] && !never.has(a.feature)).map((a) => a.feature as FeatureId))];
}

export async function runCostWatch(opts: { trigger: "cron" | "traffic" | "admin"; now?: number } = { trigger: "traffic" }): Promise<WatchResult | null> {
  const now = opts.now ?? Date.now();
  const force = opts.trigger !== "traffic";
  const tenMin = Math.floor(now / 600_000);
  const hour = Math.floor(now / 3600_000);
  const res: WatchResult = { balance: "skipped", margin: "skipped", throttled: [], alerts: 0, anomalies: [] };
  await flushCostEvents().catch(() => undefined);

  if (openRouterKey() && (force || (await lease(`watch:balance:${tenMin}`)))) {
    const b = await checkOpenRouterBalance().catch(() => null);
    res.balance = !b ? "error" : b.ok ? `ok ${b.remaining.toFixed(2)} (${b.percent.toFixed(2)}%)${b.low ? " LOW" : ""}` : b.code;
  }

  // KEPLAR_GLOBAL_DAILY_USD_CAP early warning (80% by default), once per UTC day; never changes the cap.
  if (force || (await lease(`watch:globalcap:${tenMin}`))) {
    const c = await costConfig().catch(() => null);
    const g = c ? await globalCapStatus(c, now).catch(() => null) : null;
    if (g) res.globalCap = `${g.level} $${g.todayUsd.toFixed(2)} of $${g.capUsd} (${g.pct.toFixed(0)}%)${g.needsRaise ? `, recommend $${g.recommendedUsd}` : ""}`;
    if (g && g.level !== "ok" && (await lease(`alert:${new Date(now).toISOString().slice(0, 10)}:global_cap:${g.level}`))) {
      await alertOwner(
        g.level === "capped" ? "Global daily spend cap reached" : `Provider spend at ${g.pct.toFixed(0)}% of the daily cap`,
        [
          `Provider spend today (UTC): $${g.todayUsd.toFixed(2)} of KEPLAR_GLOBAL_DAILY_USD_CAP $${g.capUsd}.`,
          "From 70% new Create jobs use cheaper models, from 85% paid images/video pause, and at 100% Free pauses until 00:00 UTC.",
          `Busiest day in the last week: $${g.busiestDayUsd.toFixed(2)}. Suggested cap: $${g.recommendedUsd} (${c?.globalCap.recommendFactor ?? 1.5}× that).`,
          "Raise the cap in Vercel env as usage grows (owner decision; nothing was changed automatically).",
          "",
          "https://keplar.one/admin/profitability",
        ].join("\n"),
      ).catch(() => undefined);
      res.alerts++;
    }
  }

  if (!force && !(await lease(`watch:margin:${hour}`))) return res;
  const cfg = await costConfig();
  const day = new Date(now).toISOString().slice(0, 10);
  const windowDays = Math.max(1, Math.min(90, cfg.margin.windowDays));
  const [events, ledger, rev, active] = await Promise.all([
    recentCostEvents(Math.max(windowDays, 8)).catch(() => []),
    collection<LedgerRow>("compute_ledger").listSystemRange({ field: "at", gte: new Date(now - windowDays * 864e5).toISOString() }, 100_000).catch(() => [] as LedgerRow[]),
    loadRevenue(cfg),
    activeThrottles(now).catch(() => ({})),
  ]);
  const s = summarizeProfitability({ events, ledger, revenue: rev.users, cfg, now, windowDays });
  res.anomalies = s.anomalies;
  res.margin = `ok: cost $${s.totals.usd.toFixed(2)}, revenue $${s.totals.revenue.toFixed(2)} over ${windowDays}d`;

  for (const f of featuresToThrottle(s.anomalies, active, cfg)) {
    const line = s.byFeature.find((l) => l.feature === f);
    const until = new Date(now + cfg.margin.throttleHours * 3600_000).toISOString();
    const reason = `Negative margin: cost $${((line?.usd ?? 0) + (line?.overheadUsd ?? 0)).toFixed(2)} vs allocated revenue $${(line?.revenue ?? 0).toFixed(2)} over ${windowDays}d`;
    await setThrottle(f, { action: cfg.margin.throttleAction, until, reason, at: new Date(now).toISOString(), by: "system:cost-watch" });
    await writeAudit("system:cost-watch", "feature_throttle", `${f}: ${reason}. Action ${cfg.margin.throttleAction} until ${until}.`).catch(() => undefined);
    res.throttled.push(f);
  }

  // One email per anomaly per day (insert-if-absent claim), batched.
  const fresh: Anomaly[] = [];
  for (const a of s.anomalies) {
    if (a.kind === "estimated" || a.kind === "untagged") continue;
    if (await lease(`alert:${day}:${a.kind}:${a.feature ?? a.userId ?? "all"}`)) fresh.push(a);
  }
  if (fresh.length || res.throttled.length) {
    const lines = fresh.map((a) => `- [${a.level}] ${a.message}`);
    if (res.throttled.length) lines.push("", `Auto-throttled (${cfg.margin.throttleAction}, ${cfg.margin.throttleHours} h): ${res.throttled.join(", ")}. Lift on /admin/profitability.`);
    await alertOwner(res.throttled.length ? `Negative margin: ${res.throttled.join(", ")} throttled` : `Cost anomalies (${fresh.length})`, `${lines.join("\n")}\n\nDetails: https://keplar.one/admin/profitability`).catch(() => undefined);
    res.alerts += fresh.length;
  }

  if (opts.trigger === "cron") {
    // Retention: cost events 90 days, rollups 120 days.
    const cut = new Date(now - 90 * 864e5).toISOString();
    await collection(COST_EVENTS).purgeSystemBefore("at", cut, 20_000).catch(() => 0);
  }
  return res;
}
