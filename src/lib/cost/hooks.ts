/**
 * The few calls the credit code (src/lib/create/platform/compute.ts, usage.ts) makes into the cost guard, kept here so those
 * shared files only gain one-line hooks. Every hook is a no-op (no I/O) when its flag is off.
 */
import type { Workspace } from "@/lib/create/platform/workspace";
import { costConfig, costConfigSync, featureMultiplier, type CostConfig } from "./config";
import { featureForLedgerAction, type FeatureId } from "./features";
import { assertCostGuard } from "./guard";
import { currentCostFeature } from "./meter";
import { overageCovers, recordOverage } from "./overage";

/** Feature recorded on a credit-ledger row: the request's feature, else derived from the action name. */
export const ledgerFeature = (action: string): FeatureId => currentCostFeature() ?? featureForLedgerAction(action);

/** Kill switch / throttle / quota / Free daily limit for the current request's feature, before any work starts. */
export async function costGuardForSpend(ws: Workspace): Promise<void> {
  await assertCostGuard(ws);
}

/** Credits after the configured margin multiplier (pricing.marginMultiplier × featureMultiplier; 1 = unchanged). */
export function applyChargeMultiplier(units: number, action: string): number {
  if (!(units > 0)) return units;
  const m = featureMultiplier(costConfigSync(), ledgerFeature(action));
  return m === 1 ? units : Math.ceil(units * m);
}

/** Paid plans with overage on: may this estimate continue past the plan's limits as pay-as-you-go? */
export async function overageInstead(ws: Workspace, units: number, wouldBlock: () => Promise<boolean> = async () => true): Promise<boolean> {
  if (!costConfigSync().flags.overage) return false; // flag off: no I/O at all
  if (!(await wouldBlock())) return false;
  return overageCovers(ws, units, currentCostFeature());
}

/** After a charge: record the part above the plan allowance as overage (flag on, opted in). */
export async function afterChargeOverage(ws: Workspace, units: number, usd: number, usedNow: () => Promise<number>): Promise<void> {
  if (!costConfigSync().flags.overage || !(units > 0) || ws.admin) return;
  try {
    const used = await usedNow();
    const over = Math.min(units, Math.max(0, used - ws.entitlements.monthlyUnits));
    if (over > 0) await recordOverage(ws, { overUnits: over, units, costUsd: usd, feature: currentCostFeature() });
  } catch (e) {
    console.error("[cost] overage not recorded:", e instanceof Error ? e.name : "error");
  }
}

/** Pure: the Free daily question limit. Flag off → `live` (today's coded limit) unchanged; on → the configured signed-in / anonymous cap. */
export function freeQuestionLimitFrom(cfg: CostConfig, anonymous: boolean, live: number): number {
  if (!cfg.flags.freeDailyLimits) return live;
  return Math.max(0, Math.floor(anonymous ? cfg.freeDaily.anonQuestions : cfg.freeDaily.questions));
}

/** The Free daily question limit for this visitor (config read failure → the live limit). */
export async function freeQuestionLimit(anonymous: boolean, live: number): Promise<number> {
  const cfg = await costConfig().catch(() => null);
  return cfg ? freeQuestionLimitFrom(cfg, anonymous, live) : live;
}
