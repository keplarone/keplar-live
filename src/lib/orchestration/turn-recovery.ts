/**
 * Answer recovery: a dropped connection is not a lost answer, and a retry is not a second run.
 *
 * Each chat send carries a random turn key (16-64 [A-Za-z0-9_-] chars, made in the browser; a retry after a network failure
 * reuses it, a Regenerate makes a new one). The route claims the key before any work starts:
 *   - first time (or the earlier run failed, was cancelled, went stale or expired): this request runs, as before;
 *   - the earlier run finished: its saved answer is replayed: no second run, no second charge, no daily question taken;
 *   - the earlier run is still going (a reconnect raced it): 409, and the browser polls GET /api/keplar/turn until it is done.
 * While a turn runs and the browser disconnects, the run is not aborted: it finishes in the background and saves its answer,
 * unless the person pressed Stop (the browser posts a cancel first; the run checks for it and stops within ~1.5 s).
 *
 * Isolation: a turn belongs to its owner, the workspace AND the person for signed-in users (team workspaces are shared), the
 * signed device cookie for signed-out visitors (who all share the "anonymous" workspace). No device cookie, no recovery. The row
 * id is a hash of owner + key and the owner hash is checked again on every read, so one person's key never opens another's turn.
 *
 * Data: the final answer (what the person would have seen) is kept for 30 minutes, then the row is unreadable and pruned.
 * Private chats are never checkpointed. No prompt text is stored.
 */
import { createHash } from "node:crypto";
import { collection } from "@/lib/create/platform/store";

export const TURN_KEY_RE = /^[A-Za-z0-9_-]{16,64}$/;
export const TURN_TTL_MS = 30 * 60_000;
/** Longer than the chat route's maxDuration (300 s): a "running" row older than this belongs to a run that died. */
export const TURN_STALE_MS = 6 * 60_000;
/** Answers bigger than this are not kept (the recovery says so instead of failing the request). */
export const TURN_MAX_BYTES = 600_000;

export type TurnStatus = "running" | "done" | "failed" | "cancelled";

export type TurnRow = {
  id: string;
  workspaceId: "system";
  /** sha256 of the owner string; compared on every read. */
  owner: string;
  status: TurnStatus;
  startedAt: string;
  updatedAt: string;
  expiresAt: string;
  /** The final `answer` event's payload, as sent (done only). */
  answer?: unknown;
  error?: { code: string; message: string };
  cancelRequested?: boolean;
  /** Set when the run finished after the browser had gone (recovered in the background). */
  headless?: boolean;
};

const rows = () => collection<TurnRow>("answer_turns");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Who a turn belongs to, or null when recovery can't be scoped safely (signed out without a device cookie). */
export function turnOwner(ws: { id: string; anonymous: boolean; userId?: string | null }, deviceId: string | null): string | null {
  if (ws.anonymous) return deviceId ? `dev:${deviceId}` : null;
  return `ws:${ws.id}:u:${ws.userId ?? "owner"}`;
}

export const validTurnKey = (k: unknown): k is string => typeof k === "string" && TURN_KEY_RE.test(k);
const rowId = (owner: string, key: string) => `tk_${sha(`${owner}\u0000${key}`).slice(0, 40)}`;

export type TurnClaim = { kind: "fresh" } | { kind: "replay"; row: TurnRow } | { kind: "running"; row: TurnRow };

/** Claim a key before any work starts. Atomic for the first claim (insertIfAbsent); see the header for the rules. */
export async function claimTurn(owner: string, key: string, at = Date.now()): Promise<TurnClaim> {
  const now = new Date(at).toISOString();
  const row: TurnRow = { id: rowId(owner, key), workspaceId: "system", owner: sha(owner), status: "running", startedAt: now, updatedAt: now, expiresAt: new Date(at + TURN_TTL_MS).toISOString() };
  const r = await rows().insertIfAbsent(row);
  if (r.inserted) return { kind: "fresh" };
  const cur = r.row;
  if (cur.owner !== row.owner) return { kind: "fresh" }; // a hash collision across owners: never read another owner's row
  const expired = Date.parse(cur.expiresAt) <= at;
  if (!expired && cur.status === "done" && cur.answer) return { kind: "replay", row: cur };
  if (!expired && cur.status === "running" && at - Date.parse(cur.updatedAt) < TURN_STALE_MS) return { kind: "running", row: cur };
  // Failed, cancelled, stale or expired: this request runs again under the same key.
  await rows().update("system", row.id, { status: "running", startedAt: now, updatedAt: now, expiresAt: row.expiresAt, answer: undefined, error: undefined, cancelRequested: false, headless: false });
  return { kind: "fresh" };
}

export async function readTurn(owner: string, key: string, at = Date.now()): Promise<TurnRow | null> {
  const cur = await rows().get("system", rowId(owner, key));
  if (!cur || cur.owner !== sha(owner) || Date.parse(cur.expiresAt) <= at) return null;
  return cur;
}

/** The run ended: keep the answer (bounded) or the failure. Never throws into the answer path. */
export async function finishTurn(owner: string, key: string, f: { status: Exclude<TurnStatus, "running">; answer?: unknown; error?: { code: string; message: string }; headless?: boolean }, at = Date.now()): Promise<void> {
  let answer = f.status === "done" ? f.answer : undefined;
  let status = f.status;
  let error = f.error;
  if (answer !== undefined && JSON.stringify(answer).length > TURN_MAX_BYTES) {
    answer = undefined;
    status = "failed";
    error = { code: "too_large", message: "The answer finished but was too large to keep for recovery. Ask again to see it." };
  }
  await rows()
    .update("system", rowId(owner, key), { status, answer, error, headless: Boolean(f.headless), updatedAt: new Date(at).toISOString() })
    .catch((e) => console.error("[turns] not saved:", e instanceof Error ? e.name : "error"));
}

/** The person pressed Stop: the run (possibly on another instance, possibly headless) stops at its next check. */
export async function requestCancel(owner: string, key: string): Promise<boolean> {
  const cur = await readTurn(owner, key);
  if (!cur || cur.status !== "running") return false;
  await rows().update("system", cur.id, { cancelRequested: true, updatedAt: new Date().toISOString() });
  return true;
}

export async function cancelRequested(owner: string, key: string): Promise<boolean> {
  return Boolean((await readTurn(owner, key))?.cancelRequested);
}

/** What the browser may see about its own turn. */
export function publicTurn(row: TurnRow | null): { status: TurnStatus | "missing"; answer?: unknown; error?: { code: string; message: string }; headless?: boolean } {
  if (!row) return { status: "missing" };
  return { status: row.status, ...(row.status === "done" && row.answer ? { answer: row.answer } : {}), ...(row.error ? { error: row.error } : {}), ...(row.headless ? { headless: true } : {}) };
}
