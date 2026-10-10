/**
 * Scale-aware view of KEPLAR_GLOBAL_DAILY_USD_CAP (src/lib/create/platform/spend.ts; live value $25 unless set). This file
 * NEVER changes the cap: the owner raises it in Vercel env. It
 *  - warns the owner once per UTC day when today's provider spend reaches `globalCap.alertPct`% (default 80%) of the cap,
 *    before Free pauses at 100% and the breaker (breaker.ts) degrades paid media from 85%;
 *  - recommends a cap of `globalCap.recommendFactor` (1.5) × the busiest of the last 7 days, and flags when the live cap is
 *    below it (as usage grows the cap must grow with it, or the breaker stops the business early in the day).
 */
import { collection } from "@/lib/create/platform/store";
import { caps, spendToday } from "@/lib/create/platform/spend";
import type { CostConfig } from "./config";

export type GlobalCapStatus = {
  capUsd: number;
  todayUsd: number;
  pct: number;
  level: "ok" | "warn" | "capped";
  busiestDayUsd: number;
  recommendedUsd: number;
  needsRaise: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Pure. */
export function globalCapStatusFrom(i: { capUsd: number; todayUsd: number; recentDaysUsd: number[]; cfg: Pick<CostConfig, "globalCap"> }): GlobalCapStatus {
  const cap = i.capUsd > 0 ? i.capUsd : 0;
  const pct = cap > 0 ? (i.todayUsd / cap) * 100 : 0;
  const level = cap > 0 && pct >= 100 ? "capped" : cap > 0 && pct >= i.cfg.globalCap.alertPct ? "warn" : "ok";
  const busiest = Math.max(0, i.todayUsd, ...i.recentDaysUsd);
  // Round the suggestion up to a tidy number ($5 steps under $100, $25 under $1k, $100 above); never below the current cap.
  const raw = busiest * Math.max(1, i.cfg.globalCap.recommendFactor);
  const step = raw < 100 ? 5 : raw < 1000 ? 25 : 100;
  const recommended = Math.max(cap, Math.ceil(raw / step) * step);
  return { capUsd: cap, todayUsd: r2(i.todayUsd), pct: r2(pct), level, busiestDayUsd: r2(busiest), recommendedUsd: recommended, needsRaise: cap > 0 && recommended > cap };
}

type DayRow = { id: string; workspaceId: string; totalUsd: number };

export async function globalCapStatus(cfg: Pick<CostConfig, "globalCap">, now = Date.now()): Promise<GlobalCapStatus> {
  const rows = collection<DayRow>("system_daily_spend");
  const days = Array.from({ length: 7 }, (_, i) => new Date(now - (i + 1) * 864e5).toISOString().slice(0, 10));
  const [today, ...recent] = await Promise.all([spendToday().catch(() => null), ...days.map((d) => rows.get("system", d).catch(() => null))]);
  return globalCapStatusFrom({ capUsd: caps().globalUsd, todayUsd: today?.totalUsd ?? 0, recentDaysUsd: recent.map((r) => r?.totalUsd ?? 0), cfg });
}
