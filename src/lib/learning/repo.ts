/**
 * Storage for the learning loop. Operational records live under the "system" tenant (collections named system_learn_*, which the
 * account-deletion code keeps because they hold no content and no account id). The two per-person collections (learn_settings,
 * learn_cases) belong to the person: they show up in their data export and are deleted with their account.
 */
import { createHmac } from "node:crypto";
import { collection } from "@/lib/create/platform/store";
import { now } from "@/lib/create/platform/ids";
import type { ArmRow, Boosts, CaseRow, LearnSettings, OutcomeRow, PolicyRow, StateRow } from "./types";

export const SYSTEM = "system" as const;
export const outcomes = () => collection<OutcomeRow>("system_learn_outcomes");
export const armRows = () => collection<ArmRow>("system_learn_arms");
export const policyRows = () => collection<PolicyRow>("system_learn_policies");
export const stateRows = () => collection<StateRow>("system_learn_state");
/** One row per (turn, vote/signal) so a repeated click is counted once. */
export const signalRows = () => collection<{ id: string; workspaceId: "system"; at: string; value: string }>("system_learn_signals");
export const caseRows = () => collection<CaseRow>("learn_cases");
export const settingsRows = () => collection<LearnSettings>("learn_settings");

/** Salted one-way key for a turn. Only the account that owns the turn (and the server) can recompute it. */
export function turnKey(workspaceId: string, answerId: string): string {
  const salt = process.env.BETTER_AUTH_SECRET || "keplar-learning-dev-salt";
  return createHmac("sha256", salt).update(`learn:${workspaceId}:${answerId}`).digest("hex").slice(0, 32);
}

export async function getState(): Promise<StateRow> {
  return (await stateRows().get(SYSTEM, "state")) ?? { id: "state", workspaceId: SYSTEM, activeVersion: 0, frozen: false, updatedAt: now() };
}

export async function saveState(patch: Partial<Omit<StateRow, "id" | "workspaceId">>): Promise<StateRow> {
  const cur = await getState();
  const next: StateRow = { ...cur, ...patch, updatedAt: now() };
  if (await stateRows().get(SYSTEM, "state")) await stateRows().update(SYSTEM, "state", next);
  else await stateRows().insert(next);
  return next;
}

export async function listPolicies(): Promise<PolicyRow[]> {
  return (await policyRows().list(SYSTEM)).sort((a, b) => b.version - a.version);
}

export async function getPolicy(version: number): Promise<PolicyRow | null> {
  if (version <= 0) return null;
  return (await listPolicies()).find((p) => p.version === version) ?? null;
}

export async function nextVersion(): Promise<number> {
  return ((await listPolicies())[0]?.version ?? 0) + 1;
}

export async function savePolicy(row: PolicyRow): Promise<PolicyRow> {
  return policyRows().insert(row);
}

export async function patchPolicy(id: string, patch: Partial<PolicyRow>): Promise<void> {
  await policyRows().update(SYSTEM, id, patch);
}

/** The promoted policy plus the running tallies: everything the router needs, in two reads. */
export async function loadActive(): Promise<{ version: number; frozen: boolean; boosts: Boosts; arms: ArmRow[] }> {
  const state = await getState();
  const [policy, arms] = await Promise.all([state.activeVersion ? getPolicy(state.activeVersion) : Promise.resolve(null), armRows().listSystem()]);
  return { version: state.activeVersion, frozen: state.frozen, boosts: policy?.status === "active" ? policy.boosts : {}, arms };
}

/* ───────────────────────── per-person consent ───────────────────────── */

/** Off until the person turns it on. Controls only whether a redacted copy of a failed question may be kept to test future changes. */
export async function shareFailures(workspaceId: string): Promise<boolean> {
  return Boolean((await settingsRows().get(workspaceId, "settings"))?.shareFailures);
}

export async function setShareFailures(workspaceId: string, on: boolean): Promise<boolean> {
  const row: LearnSettings = { id: "settings", workspaceId, shareFailures: on, updatedAt: now() };
  if (await settingsRows().get(workspaceId, "settings")) await settingsRows().update(workspaceId, "settings", row);
  else await settingsRows().insert(row);
  if (!on) await eraseCases(workspaceId);
  return on;
}

export async function listCases(workspaceId: string): Promise<CaseRow[]> {
  return (await caseRows().list(workspaceId)).sort((a, b) => b.at.localeCompare(a.at));
}

export async function eraseCases(workspaceId: string): Promise<number> {
  const all = await caseRows().list(workspaceId);
  for (const c of all) await caseRows().remove(workspaceId, c.id);
  return all.length;
}
