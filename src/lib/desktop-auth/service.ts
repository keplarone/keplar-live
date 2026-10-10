/**
 * The desktop sign-in state machine (see ./core.ts for the protocol). Pure of HTTP: every function takes the store and a
 * clock, returns a plain result, and never throws for a bad request, so the same code is driven by unit tests with the
 * memory store and by the Better Auth endpoints with Postgres.
 *
 *   pending --approve--> approved --exchange--> used --finish--> finished        (finished: the session cookie was issued)
 *   pending|approved --cancel (app) / deny (browser)--> cancelled|denied
 */
import {
  CODE_TTL_SECONDS,
  FINISH_TTL_SECONDS,
  MAX_BAD_ATTEMPTS,
  REQUEST_TTL_SECONDS,
  cleanLabel,
  deepLinkFor,
  displayCode,
  hashSecret,
  isChallenge,
  isRequestId,
  isSecret,
  isVerifier,
  newRequestId,
  newSecret,
  secretMatches,
  verifierMatches,
  type Status,
} from "./core";
import type { DesktopAuthStore, Row, Who } from "./store";

export type Clock = () => number;
export type Deps = { store: DesktopAuthStore; key: string; now?: Clock };
const nowOf = (d: Deps) => (d.now ?? Date.now)();

export type StartResult = { ok: true; rid: string; code: string; expiresAt: number } | { ok: false; reason: "bad_challenge" };

export async function startRequest(d: Deps, input: { challenge: unknown; label?: unknown }): Promise<StartResult> {
  if (!isChallenge(input.challenge)) return { ok: false, reason: "bad_challenge" };
  const now = nowOf(d);
  const rid = newRequestId();
  const row: Row = {
    id: rid,
    challenge: input.challenge,
    label: cleanLabel(input.label),
    createdAt: now,
    expiresAt: now + REQUEST_TTL_SECONDS * 1000,
    status: "pending",
    userId: null,
    email: null,
    name: null,
    codeHash: null,
    codeExpiresAt: null,
    finishHash: null,
    finishExpiresAt: null,
    attempts: 0,
  };
  await d.store.create(row, now);
  return { ok: true, rid, code: displayCode(d.key, rid), expiresAt: row.expiresAt };
}

export type PageState =
  | { state: "unknown" }
  | { state: "ready"; code: string; label: string; expiresAt: number }
  | { state: "approved" | "finished" | "cancelled" | "denied" | "expired"; code: string; label: string };

/** What the browser page shows for a request id (no secrets). */
export async function describeRequest(d: Deps, rid: unknown): Promise<PageState> {
  if (!isRequestId(rid)) return { state: "unknown" };
  const row = await d.store.get(rid);
  if (!row) return { state: "unknown" };
  const code = displayCode(d.key, rid);
  const base = { code, label: row.label };
  if (row.status === "cancelled" || row.status === "denied") return { state: row.status, ...base };
  if (row.status === "finished" || row.status === "used") return { state: "finished", ...base };
  if (row.expiresAt <= nowOf(d)) return { state: "expired", ...base };
  if (row.status === "approved") return { state: "approved", ...base };
  return { state: "ready", ...base, expiresAt: row.expiresAt };
}

export type ApproveResult =
  | { ok: true; deepLink: string; code: string }
  | { ok: false; reason: "unknown" | "expired" | "closed" };

/** Called by the signed-in browser. Mints the one-time code and the keplar:// link that carries it. */
export async function approveRequest(d: Deps, rid: unknown, who: Who): Promise<ApproveResult> {
  if (!isRequestId(rid)) return { ok: false, reason: "unknown" };
  const row = await d.store.get(rid);
  if (!row) return { ok: false, reason: "unknown" };
  const now = nowOf(d);
  if (row.status === "cancelled" || row.status === "denied" || row.status === "used" || row.status === "finished") return { ok: false, reason: "closed" };
  if (row.expiresAt <= now) return { ok: false, reason: "expired" };
  const secret = newSecret();
  const ok = await d.store.approve(rid, who, hashSecret(secret), now + CODE_TTL_SECONDS * 1000, now);
  if (!ok) return { ok: false, reason: "closed" };
  return { ok: true, deepLink: deepLinkFor(secret, rid), code: secret };
}

export type PollResult =
  | { status: "pending" }
  | { status: "approved"; code: string }
  | { status: "cancelled" | "denied" | "expired" | "used" | "invalid" };

/**
 * The app polls with its verifier when the protocol handler is not registered. Only the holder of the verifier is told the
 * code, so the browser (or anyone with the request id) never is. A polled code is minted here, fresh, rather than read back.
 */
export async function pollRequest(d: Deps, rid: unknown, verifier: unknown): Promise<PollResult> {
  const row = await verified(d, rid, verifier);
  if (!row) return { status: "invalid" };
  const now = nowOf(d);
  if (row.status === "cancelled" || row.status === "denied") return { status: row.status };
  if (row.status === "used" || row.status === "finished") return { status: "used" };
  if (row.expiresAt <= now) return { status: "expired" };
  if (row.status === "pending") return { status: "pending" };
  // approved: hand the verifier holder a fresh code (the earlier one went to the keplar:// link and may or may not be used).
  if (!row.userId || !row.email) return { status: "invalid" };
  const secret = newSecret();
  const ok = await d.store.approve(rid as string, { userId: row.userId, email: row.email, name: row.name }, hashSecret(secret), now + CODE_TTL_SECONDS * 1000, now);
  return ok ? { status: "approved", code: secret } : { status: "used" };
}

export type ExchangeResult = { ok: true; ticket: string } | { ok: false; reason: "invalid" | "expired" | "used" | "cancelled" | "not_approved" };

/** PKCE redemption: needs the request id, the one-time code AND the verifier. Single use, atomic. */
export async function exchangeCode(d: Deps, input: { rid: unknown; code: unknown; verifier: unknown }): Promise<ExchangeResult> {
  const row = await verified(d, input.rid, input.verifier);
  if (!row) return { ok: false, reason: "invalid" };
  const now = nowOf(d);
  if (row.status === "cancelled" || row.status === "denied") return { ok: false, reason: "cancelled" };
  if (row.status === "used" || row.status === "finished") return { ok: false, reason: "used" };
  if (row.expiresAt <= now) return { ok: false, reason: "expired" };
  if (row.status === "pending") return { ok: false, reason: "not_approved" };
  if (!isSecret(input.code) || !row.codeHash || !secretMatches(row.codeHash, input.code)) {
    await wrongGuess(d, row);
    return { ok: false, reason: "invalid" };
  }
  if ((row.codeExpiresAt ?? 0) <= now) return { ok: false, reason: "expired" };
  const ticket = newSecret();
  const won = await d.store.exchange(row.id, hashSecret(input.code), row.challenge, hashSecret(ticket), now + FINISH_TTL_SECONDS * 1000, now);
  return won ? { ok: true, ticket } : { ok: false, reason: "used" };
}

/** The window loads /desktop/finish?ticket=...; this redeems it once and says whose session to start. */
export async function redeemTicket(d: Deps, ticket: unknown): Promise<Who | null> {
  if (!isSecret(ticket)) return null;
  return d.store.finish(hashSecret(ticket), nowOf(d));
}

/** The app's Cancel button (needs the verifier: nobody else can cancel your request from the outside). */
export async function cancelRequest(d: Deps, rid: unknown, verifier: unknown): Promise<{ ok: boolean }> {
  const row = await verified(d, rid, verifier);
  if (!row) return { ok: false };
  await d.store.transition(row.id, ["pending", "approved"], "cancelled");
  return { ok: true };
}

/** The browser page's "This wasn't me" button. */
export async function denyRequest(d: Deps, rid: unknown): Promise<{ ok: boolean }> {
  if (!isRequestId(rid)) return { ok: false };
  return { ok: await d.store.transition(rid, ["pending", "approved"], "denied") };
}

/** Row for a request id when the verifier is the one that started it; counts (and eventually burns) wrong guesses. */
async function verified(d: Deps, rid: unknown, verifier: unknown): Promise<Row | null> {
  if (!isRequestId(rid) || !isVerifier(verifier)) return null;
  const row = await d.store.get(rid);
  if (!row) return null;
  if (!verifierMatches(row.challenge, verifier)) {
    await wrongGuess(d, row);
    return null;
  }
  return row;
}

async function wrongGuess(d: Deps, row: Row): Promise<void> {
  const n = await d.store.bump(row.id);
  if (n >= MAX_BAD_ATTEMPTS) await d.store.transition(row.id, ["pending", "approved"], "cancelled");
}

export type { Status };
