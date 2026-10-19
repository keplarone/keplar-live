/**
 * Exactly-once claims for billing webhooks (Whop, Apple).
 *
 * A delivery is claimed by inserting its event row with result "processing" (insertIfAbsent is atomic), so two concurrent
 * copies of the same event can't both apply. A handler that fails releases the claim, so the provider's retry is processed.
 * A claim stuck "processing" for longer than STALE_MS (a crashed instance) can be taken over by exactly one retry: a taker that read
 * attempt k at time `at` inserts the marker row `<id>#<k+1>@<at>` (insertIfAbsent, so one winner per stale state, even after a
 * release and a new claim), and the winner then writes attempt k+1 and a
 * fresh `at` in one update. Any other reader sees either (k, stale), and loses the marker, or (k+1, fresh), and backs off.
 */
import type { Collection } from "@/lib/create/platform/store";

export type ClaimRow = { id: string; workspaceId: string; type: string; at: string; result: string; attempt?: number };

export const PROCESSING = "processing";
export const STALE_MS = 120_000;

export type Claim = { claimed: true } | { claimed: false; result: string };

export async function claimEvent<T extends ClaimRow>(events: Collection<T>, row: Omit<T, "result" | "at" | "attempt">, nowIso = new Date().toISOString()): Promise<Claim> {
  const fresh = { ...row, at: nowIso, result: PROCESSING, attempt: 0 } as unknown as T;
  const first = await events.insertIfAbsent(fresh);
  if (first.inserted) return { claimed: true };
  const seen = first.row;
  const stale = seen.result === PROCESSING && Date.parse(nowIso) - Date.parse(seen.at) > STALE_MS;
  if (!stale) return { claimed: false, result: seen.result };
  const next = (seen.attempt ?? 0) + 1;
  const marker = await events.insertIfAbsent({ ...fresh, id: `${row.id}#${next}@${seen.at}`, result: "takeover", attempt: next } as T);
  if (!marker.inserted) return { claimed: false, result: PROCESSING };
  await events.update(row.workspaceId, row.id, { at: nowIso, attempt: next } as Partial<T>);
  return { claimed: true };
}

/** Records how a claimed event ended. */
export async function finishEvent<T extends ClaimRow>(events: Collection<T>, workspaceId: string, id: string, result: string): Promise<void> {
  await events.update(workspaceId, id, { result, at: new Date().toISOString() } as Partial<T>);
}

/** Releases a claim after a failed handler, so the provider's retry is processed. */
export async function releaseEvent<T extends ClaimRow>(events: Collection<T>, workspaceId: string, id: string): Promise<void> {
  await events.remove(workspaceId, id).catch(() => undefined);
}
