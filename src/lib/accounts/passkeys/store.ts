/**
 * Passkey storage (WebAuthn credentials) and the short-lived challenges that go with them.
 *
 * Why not a Better Auth passkey plugin: like its two-factor plugin it needs Better Auth's own database adapter and
 * user/session tables, which this app does not use (see ../mfa/store.ts). The protocol work is done by
 * @simplewebauthn/server (./webauthn.ts); this file only stores what it needs. A passkey's public key is not a secret
 * (it cannot sign anyone in), so it is stored as is; the credential id is the primary key.
 */
import { randomBytes } from "node:crypto";
import { neonQuery } from "@/lib/create/platform/neon";

let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  ready ??= (async () => {
    await neonQuery(
      "CREATE TABLE IF NOT EXISTS keplar_passkeys (id text PRIMARY KEY, user_id text NOT NULL, public_key text NOT NULL, counter bigint NOT NULL DEFAULT 0, transports jsonb NOT NULL DEFAULT '[]'::jsonb, name text NOT NULL DEFAULT 'Passkey', device_type text NOT NULL DEFAULT 'singleDevice', backed_up boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), last_used_at timestamptz)",
    );
    await neonQuery("CREATE INDEX IF NOT EXISTS keplar_passkeys_user ON keplar_passkeys (user_id)");
    await neonQuery("CREATE TABLE IF NOT EXISTS keplar_webauthn_challenges (id text PRIMARY KEY, challenge text NOT NULL, user_id text, purpose text NOT NULL, expires_at timestamptz NOT NULL)");
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}
const q = async (sql: string, params: unknown[] = []) => {
  await ensure();
  return neonQuery(sql, params);
};

export const CHALLENGE_TTL_SECONDS = 300;
export const MAX_PASSKEYS = 10;

export type Purpose = "register" | "login";
export type PasskeyRow = { id: string; userId: string; publicKey: string; counter: number; transports: string[]; name: string; deviceType: string; backedUp: boolean; createdAt: string; lastUsedAt: string | null };
/** What the account page shows: never the public key. */
export type PasskeySummary = { id: string; name: string; createdAt: string; lastUsedAt: string | null; synced: boolean };

const list = (v: unknown): string[] => {
  try {
    const x = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(x) ? x.map(String) : [];
  } catch {
    return [];
  }
};
const row = (r: Record<string, unknown>): PasskeyRow => ({
  id: String(r.id),
  userId: String(r.user_id),
  publicKey: String(r.public_key),
  counter: Number(r.counter ?? 0),
  transports: list(r.transports),
  name: String(r.name ?? "Passkey"),
  deviceType: String(r.device_type ?? "singleDevice"),
  backedUp: r.backed_up === true,
  createdAt: new Date(String(r.created_at)).toISOString(),
  lastUsedAt: r.last_used_at ? new Date(String(r.last_used_at)).toISOString() : null,
});

/** A new single-use challenge. `userId` is set for registration (the signed-in user) and null for sign-in (the passkey says who). */
export async function saveChallenge(challenge: string, purpose: Purpose, userId: string | null, now = Date.now()): Promise<string> {
  const id = randomBytes(18).toString("base64url");
  await q("DELETE FROM keplar_webauthn_challenges WHERE expires_at < $1", [new Date(now).toISOString()]);
  await q("INSERT INTO keplar_webauthn_challenges (id, challenge, user_id, purpose, expires_at) VALUES ($1, $2, $3, $4, $5)", [id, challenge, userId, purpose, new Date(now + CHALLENGE_TTL_SECONDS * 1000).toISOString()]);
  return id;
}

/** Consume a challenge: it works once, only for the purpose (and user, when one is given) it was issued for, and only before it expires. */
export async function takeChallenge(id: string, purpose: Purpose, userId: string | null, now = Date.now()): Promise<string | null> {
  if (!id || id.length > 64) return null;
  const rows = await q("DELETE FROM keplar_webauthn_challenges WHERE id = $1 RETURNING challenge, user_id, purpose, expires_at", [id]);
  const r = rows[0];
  if (!r) return null;
  if (String(r.purpose) !== purpose) return null;
  if (new Date(String(r.expires_at)).getTime() < now) return null;
  if (userId !== null && String(r.user_id ?? "") !== userId) return null;
  return String(r.challenge);
}

export async function listPasskeys(userId: string): Promise<PasskeyRow[]> {
  return (await q("SELECT * FROM keplar_passkeys WHERE user_id = $1 ORDER BY created_at", [userId])).map(row);
}

export const summarize = (p: PasskeyRow): PasskeySummary => ({ id: p.id, name: p.name, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt, synced: p.backedUp });

export async function hasPasskey(userId: string): Promise<boolean> {
  try {
    return (await q("SELECT 1 FROM keplar_passkeys WHERE user_id = $1 LIMIT 1", [userId])).length > 0;
  } catch {
    return false;
  }
}

export async function findPasskey(id: string): Promise<PasskeyRow | null> {
  if (!id || id.length > 1400) return null;
  const r = (await q("SELECT * FROM keplar_passkeys WHERE id = $1", [id]))[0];
  return r ? row(r) : null;
}

export async function addPasskey(p: { id: string; userId: string; publicKey: string; counter: number; transports?: string[]; name: string; deviceType: string; backedUp: boolean }): Promise<void> {
  if ((await listPasskeys(p.userId)).length >= MAX_PASSKEYS) throw new Error("too_many_passkeys");
  await q("INSERT INTO keplar_passkeys (id, user_id, public_key, counter, transports, name, device_type, backed_up) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)", [
    p.id,
    p.userId,
    p.publicKey,
    p.counter,
    JSON.stringify(p.transports ?? []),
    p.name.slice(0, 60),
    p.deviceType,
    p.backedUp,
  ]);
}

export async function touchPasskey(id: string, counter: number, backedUp: boolean): Promise<void> {
  await q("UPDATE keplar_passkeys SET counter = $2, backed_up = $3, last_used_at = now() WHERE id = $1", [id, counter, backedUp]);
}

export async function renamePasskey(userId: string, id: string, name: string): Promise<boolean> {
  const rows = await q("UPDATE keplar_passkeys SET name = $3 WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId, name.trim().slice(0, 60) || "Passkey"]);
  return rows.length > 0;
}

export async function deletePasskey(userId: string, id: string): Promise<boolean> {
  const rows = await q("DELETE FROM keplar_passkeys WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId]);
  return rows.length > 0;
}

/** Account deletion: every passkey and any open challenge for the user. */
export async function deleteAllPasskeys(userId: string): Promise<void> {
  await q("DELETE FROM keplar_passkeys WHERE user_id = $1", [userId]);
  await q("DELETE FROM keplar_webauthn_challenges WHERE user_id = $1", [userId]);
}
