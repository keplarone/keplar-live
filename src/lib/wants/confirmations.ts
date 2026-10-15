/**
 * A confirmation is the plan Keplar will run after the account's PIN checks out.
 * It belongs to one workspace and expires after 10 minutes. Kept in the app store
 * (Neon or the JSON file), not in process memory, so another instance can finish it.
 */
import { randomBytes } from "node:crypto";
import { collection } from "@/lib/create/platform/store";
import type { AgentHit } from "./types";

export const CONFIRM_TTL_MS = 10 * 60 * 1000;

export type PendingWant = {
  id: string;
  workspaceId: string;
  prompt: string;
  answers: Record<string, string>;
  provider: string;
  track: "A" | "B";
  agents: AgentHit[];
  createdAt: number;
};

const rows = () => collection<PendingWant>("wants_confirmations");
/** One row per confirmation that ran (id = confirmation id), inserted with insertIfAbsent: two confirms can't both run it. */
type Claim = { id: string; workspaceId: string; at: string };
const claims = () => collection<Claim>("wants_confirm_claims");

/**
 * Take this confirmation for running, atomically (the biz_approval_claims pattern): true for exactly one caller, however many
 * confirm the same plan at once. Call after the PIN checked out and before anything runs.
 */
export async function claimPending(workspaceId: string, id: string): Promise<boolean> {
  return (await claims().insertIfAbsent({ id, workspaceId, at: new Date().toISOString() })).inserted;
}

export async function savePending(row: Omit<PendingWant, "id" | "createdAt"> & { createdAt?: number }): Promise<PendingWant> {
  const saved: PendingWant = { ...row, id: randomBytes(9).toString("base64url"), createdAt: row.createdAt ?? Date.now() };
  await rows().insert(saved);
  return saved;
}

export async function readPending(workspaceId: string, id: string, at = Date.now()): Promise<PendingWant | "missing" | "expired"> {
  const row = await rows().get(workspaceId, id);
  if (!row) return "missing";
  if (at - row.createdAt > CONFIRM_TTL_MS) {
    await rows().remove(workspaceId, id);
    return "expired";
  }
  return row;
}

export async function dropPending(workspaceId: string, id: string): Promise<void> {
  await rows().remove(workspaceId, id);
}
