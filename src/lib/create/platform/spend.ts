/**
 * Global daily spend guard. Every metered charge adds its provider USD to a
 * per-day system counter. When the day's total crosses
 * KEPLAR_GLOBAL_DAILY_USD_CAP (default $25), or Free-plan spend crosses
 * KEPLAR_FREE_DAILY_USD_CAP (default $5), Free usage pauses until UTC
 * midnight and the owner is alerted once per day. Paid plans keep working.
 */
import { collection } from "./store";
import { now } from "./ids";
import { alertOwner } from "@/lib/accounts/alerts";
import { adminDailyCapUsd } from "@/lib/billing/admin";
import { autoPaused, opsControls } from "@/lib/ops/controls";
import { background, recordMinuteSpend } from "@/lib/ops/telemetry";

type DayRow = { id: string; workspaceId: string; totalUsd: number; freeUsd: number; alerted: boolean; updatedAt: string };
type AdminRow = { id: string; workspaceId: string; usd: number; updatedAt: string };
const adminDays = () => collection<AdminRow>("admin_daily_spend");
const days = () => collection<DayRow>("system_daily_spend");
const SYSTEM = "system";
const today = () => new Date().toISOString().slice(0, 10);

export const caps = () => ({
  globalUsd: Number(process.env.KEPLAR_GLOBAL_DAILY_USD_CAP ?? 25),
  freeUsd: Number(process.env.KEPLAR_FREE_DAILY_USD_CAP ?? 5),
});

/** When today's shared usage budget lifts. */
export function nextUtcMidnight(now = Date.now()): string {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

/** Shown when Free is paused by the shared daily budget. The person's own questions were not used. */
export const FREE_DAY_BUDGET_MESSAGE =
  "Keplar has reached today's usage budget. Free is paused until 00:00 UTC. This question was not counted against your Free questions.";

export async function spendToday() {
  return (await days().get(SYSTEM, today())) ?? { id: today(), workspaceId: SYSTEM, totalUsd: 0, freeUsd: 0, alerted: false, updatedAt: now() };
}

export async function freePaused(): Promise<boolean> {
  if (process.env.KEPLAR_FREE_PAUSED === "1") return true;
  if (autoPaused(await opsControls())) return true; // spend-spike auto-pause (ops/telemetry.ts)
  const d = await spendToday();
  const c = caps();
  return d.totalUsd >= c.globalUsd || d.freeUsd >= c.freeUsd;
}

export async function recordSpend(usd: number, plan: string) {
  if (!(usd > 0)) return;
  background(() => recordMinuteSpend(usd)); // spike detector (never throws, runs after the response)
  const key = today();
  // Atomic add (Postgres: one upsert), so concurrent instances never lose spend.
  const next = await days().increment(SYSTEM, key, { totalUsd: usd, freeUsd: plan === "free" ? usd : 0 }, { id: key, workspaceId: SYSTEM, totalUsd: 0, freeUsd: 0, alerted: false, updatedAt: now() });
  const c = caps();
  if (!next.alerted && (next.totalUsd >= c.globalUsd || next.freeUsd >= c.freeUsd)) {
    await days().update(SYSTEM, key, { alerted: true, updatedAt: now() });
    await alertOwner(
      "Daily spend cap reached — Free usage paused",
      `Provider spend today (UTC ${key}): $${next.totalUsd.toFixed(2)} total (cap $${c.globalUsd}), $${next.freeUsd.toFixed(2)} on Free (cap $${c.freeUsd}).\nFree requests are paused until 00:00 UTC. Paid plans are unaffected.\nRaise KEPLAR_GLOBAL_DAILY_USD_CAP / KEPLAR_FREE_DAILY_USD_CAP to resume sooner.`,
    );
  }
}

/** Admin safety cap: the admin's own provider spend today (UTC), across Keplar, Create and agents. */
export async function adminSpendToday(): Promise<number> {
  return (await adminDays().get(SYSTEM, today()))?.usd ?? 0;
}
export async function adminCapped(): Promise<boolean> {
  return (await adminSpendToday()) >= adminDailyCapUsd();
}
export async function recordAdminSpend(usd: number) {
  if (!(usd > 0)) return;
  const key = today();
  await adminDays().increment(SYSTEM, key, { usd }, { id: key, workspaceId: SYSTEM, usd: 0, updatedAt: now() });
}
