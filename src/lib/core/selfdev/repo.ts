/**
 * Storage for Core's learning loop, in the existing store (Postgres when DATABASE_URL is set). System records hold no
 * prompt text and no account id; the two per-person collections (core_prefs, core_jobs) belong to the person, show up in
 * their data export and are deleted with the account.
 */
import { collection } from "@/lib/create/platform/store";
import { id as newId, now } from "@/lib/create/platform/ids";
import type { ChangeRow, CorePrefs, CoreState, EvalRun, GapCluster, ProposalRow, TurnRow, VariantRow } from "./types";

export const SYSTEM = "system" as const;
export const stateRows = () => collection<CoreState>("system_core_state");
export const variantRows = () => collection<VariantRow>("system_core_variants");
export const turnRows = () => collection<TurnRow>("system_core_turns");
export const evalRows = () => collection<EvalRun>("system_core_evals");
export const changeRows = () => collection<ChangeRow>("system_core_changes");
export const proposalRows = () => collection<ProposalRow>("system_core_proposals");
export const gapRows = () => collection<{ id: string; workspaceId: "system"; at: string; clusters: GapCluster[] }>("system_core_gaps");
export const prefRows = () => collection<CorePrefs>("core_prefs");

export async function getCoreState(): Promise<CoreState> {
  return (await stateRows().get(SYSTEM, "state")) ?? { id: "state", workspaceId: SYSTEM, killed: false, frozen: false, canaryPct: 10, updatedAt: now() };
}

export async function saveCoreState(patch: Partial<Omit<CoreState, "id" | "workspaceId">>): Promise<CoreState> {
  const cur = await getCoreState();
  const next: CoreState = { ...cur, ...patch, updatedAt: now() };
  if (await stateRows().get(SYSTEM, "state")) await stateRows().update(SYSTEM, "state", next);
  else await stateRows().insert(next);
  return next;
}

export async function logChange(c: Omit<ChangeRow, "id" | "workspaceId" | "at">): Promise<void> {
  await changeRows().insert({ ...c, id: newId("chg"), workspaceId: SYSTEM, at: now() });
}

export async function listVariants(): Promise<VariantRow[]> {
  return (await variantRows().list(SYSTEM)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getPrefs(workspaceId: string): Promise<CorePrefs> {
  return (await prefRows().get(workspaceId, "prefs")) ?? { id: "prefs", workspaceId, optOut: false, brevity: 0, updatedAt: now() };
}

export async function savePrefs(workspaceId: string, patch: Partial<Pick<CorePrefs, "optOut" | "brevity">>): Promise<CorePrefs> {
  const cur = await getPrefs(workspaceId);
  const next: CorePrefs = { ...cur, ...patch, brevity: Math.max(-1, Math.min(1, patch.brevity ?? cur.brevity)), updatedAt: now() };
  if (await prefRows().get(workspaceId, "prefs")) await prefRows().update(workspaceId, "prefs", next);
  else await prefRows().insert(next);
  return next;
}
