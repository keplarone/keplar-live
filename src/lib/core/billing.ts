/**
 * Background work is billed like the rest of Ask: paid plans pay for the model spend of each slice (at the usual meter margin),
 * and a slice only starts while the plan has room. Free plans use :free models only and are never charged.
 */
import { assertCanSpend, chargeUnits } from "@/lib/create/platform/compute";
import { workspaceById, type Workspace } from "@/lib/create/platform/workspace";
import { toUnits } from "@/lib/orchestration/compute";
import { METER_MARGIN } from "@/lib/orchestration/limits";

/** Whether a background slice may start for this workspace: the same check as any Ask turn, for the slice's most expensive case. */
export async function mayContinue(ws: Workspace, sliceUsd: number): Promise<{ ok: true } | { ok: false; why: string }> {
  if (ws.plan === "free") return { ok: true };
  try {
    await assertCanSpend(ws, Math.max(1, toUnits(sliceUsd * METER_MARGIN)));
    return { ok: true };
  } catch (e) {
    return { ok: false, why: e instanceof Error ? e.message.slice(0, 200) : "Not enough compute left." };
  }
}

export async function chargeSlice(wsOrId: Workspace | string, usd: number, ref: string): Promise<number> {
  if (!(usd > 0)) return 0;
  const ws = typeof wsOrId === "string" ? await workspaceById(wsOrId) : wsOrId;
  if (!ws || ws.plan === "free") return 0;
  return chargeUnits(ws, "core-background", toUnits(usd * METER_MARGIN), usd, ref);
}
