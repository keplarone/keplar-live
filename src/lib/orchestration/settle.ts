/**
 * Metering for one /api/keplar run. Charges the Usage ledger once, at the
 * margin-included cost, for Plus/Pro/admin. Never charges Free, and never
 * charges a run where no model responded (all failed, timed out, were
 * rate-limited or returned nothing): those are reported as "not charged".
 */
import { chargeUnits } from "@/lib/create/platform/compute";
import type { Workspace } from "@/lib/create/platform/workspace";

export type RunState = { started: boolean; settled: boolean; plannedUnits: number; noResponse?: boolean; responded?: number; extraUnits?: number };

/** True when the run produced nothing a user could use, so it must not be billed. */
export const runWasEmpty = (run: Pick<RunState, "noResponse" | "responded">) => run.noResponse === true || run.responded === 0;

export function createSettler(ws: Workspace, run: RunState) {
  let billed = false;
  return async (units: number): Promise<boolean> => {
    if (billed || ws.plan === "free" || !(units > 0) || runWasEmpty(run)) return false;
    billed = true;
    // Stored cost carries the margin so the daily USD cap and the global spend counter see the same number as the credits.
    await chargeUnits(ws, "answer", units, units * 0.002, undefined);
    return true;
  };
}
