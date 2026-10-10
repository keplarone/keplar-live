/**
 * Admin actions on learned policies. Each one is logged in the admin audit log by the route that calls it.
 * Approve re-validates the policy and re-runs the guard checks first: an approval can never skip them.
 */
import { now } from "@/lib/create/platform/ids";
import { boostOf, validateBoosts } from "./policy";
import { getPolicy, getState, listPolicies, patchPolicy, saveState } from "./repo";
import { promote, rollbackTo, type EvalCase } from "./pipeline";
import { itemsFrom, runSuite, type Rosters } from "./suite";

export class LearningAdminError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** One-click rollback: the active policy is marked rolled back and the version it replaced (or the plain baseline) takes over. */
export async function rollbackActive(who: string, reason: string): Promise<{ activeVersion: number }> {
  const st = await getState();
  const cur = st.activeVersion ? await getPolicy(st.activeVersion) : null;
  if (!cur || cur.status !== "active") throw new LearningAdminError("There is no learned policy to roll back: Keplar is already on the baseline.", 409);
  await rollbackTo(cur.replaces, cur, "admin", who, reason || "Rolled back by an admin.");
  return { activeVersion: (await getState()).activeVersion };
}

/** Re-activate a policy that was rolled back or superseded (also reversible with another rollback). */
export async function restoreVersion(version: number, who: string, rosters: Rosters, evalSet: readonly EvalCase[]): Promise<void> {
  const p = await getPolicy(version);
  if (!p) throw new LearningAdminError("No such version.", 404);
  if (p.status === "active") throw new LearningAdminError("That version is already active.", 409);
  await assertSafe(p.boosts, rosters, evalSet);
  const cur = await getState();
  await promote({ ...p, replaces: cur.activeVersion }, who, "admin", `Restored by an admin (was ${p.status}).`);
  await patchPolicy(p.id, { replaces: cur.activeVersion });
}

export async function approve(version: number, who: string, rosters: Rosters, evalSet: readonly EvalCase[]): Promise<void> {
  const p = await getPolicy(version);
  if (!p) throw new LearningAdminError("No such version.", 404);
  if (p.status !== "pending_approval") throw new LearningAdminError("Only a proposal waiting for approval can be approved.", 409);
  await assertSafe(p.boosts, rosters, evalSet);
  const cur = await getState();
  await patchPolicy(p.id, { replaces: cur.activeVersion });
  await promote({ ...p, replaces: cur.activeVersion }, who, "admin", "Approved by an admin.");
}

export async function reject(version: number, who: string): Promise<void> {
  const p = await getPolicy(version);
  if (!p) throw new LearningAdminError("No such version.", 404);
  if (p.status !== "pending_approval") throw new LearningAdminError("Only a proposal waiting for approval can be rejected.", 409);
  await patchPolicy(p.id, { status: "rejected", decidedAt: now(), decidedBy: who, note: "Rejected by an admin." });
}

export async function setFrozen(frozen: boolean) {
  return saveState({ frozen });
}

async function assertSafe(boosts: Record<string, Record<string, number>>, rosters: Rosters, evalSet: readonly EvalCase[]) {
  const v = validateBoosts(boosts);
  if (!v.ok) throw new LearningAdminError(`This policy fails validation: ${v.error}`);
  const base = (await getState()).activeVersion ? (await getPolicy((await getState()).activeVersion))?.boosts ?? {} : {};
  const r = runSuite(rosters, itemsFrom(evalSet, []), (t, c, m) => boostOf(base, t, c, m), (t, c, m) => boostOf(v.boosts, t, c, m));
  if (r.failures.length) throw new LearningAdminError(`Safety checks failed: ${r.failures.slice(0, 3).join("; ")}`, 422);
}

export { listPolicies };
