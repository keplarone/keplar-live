/**
 * Two-factor storage and checks (authenticator-app codes + one-time recovery codes).
 *
 * Why not Better Auth's two-factor plugin: it needs Better Auth's own database adapter and user/session tables, which this
 * app does not use (sessions are an encrypted cookie plus `keplar_sessions` rows; see password-auth.ts). So 2FA is built on the
 * same pieces: the TOTP secret is sealed with AES-256-GCM (src/lib/mcp/crypto.ts, bound to the user), recovery codes are
 * stored only as keyed hashes, and the sign-in gate is one column on the session row (`mfa_pending`).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { neonQuery } from "@/lib/create/platform/neon";
import { ensureSideSql } from "../sql-setup";
import { openSecret, sealSecret } from "@/lib/mcp/crypto";
import { authSecret } from "../secret";
import { generateRecoveryCodes, generateSecret, looksLikeRecovery, normalizeRecovery, otpauthUri, verifyTotp } from "./totp";

const SCOPE = "mfa";
let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  ready ??= ensureSideSql()
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}
const q = async (sql: string, params: unknown[] = []) => {
  await ensure();
  return neonQuery(sql, params);
};

const hashRecovery = (normalized: string) => createHmac("sha256", authSecret()).update(`mfa-recovery:${normalized}`).digest("hex");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const parseList = (v: unknown): string[] => {
  try {
    const x = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(x) ? x.map(String) : [];
  } catch {
    return [];
  }
};

export type MfaStatus = { enabled: boolean; recoveryLeft: number };

/** Is a second factor required for this account's sign-ins? An unreadable store counts as "no" (logged), matching the rest of auth's fail-open-on-outage rule. */
export async function mfaEnabled(userId: string): Promise<boolean> {
  try {
    const rows = await q("SELECT 1 FROM keplar_mfa WHERE user_id = $1 AND enabled_at IS NOT NULL", [userId]);
    return rows.length > 0;
  } catch {
    console.error("[auth] could not read the 2FA setting; continuing without the second factor");
    return false;
  }
}

export async function mfaStatus(userId: string): Promise<MfaStatus> {
  const rows = await q("SELECT enabled_at, recovery FROM keplar_mfa WHERE user_id = $1", [userId]);
  const r = rows[0];
  return { enabled: Boolean(r?.enabled_at), recoveryLeft: r?.enabled_at ? parseList(r.recovery).length : 0 };
}

/** Start (or restart) setup: a fresh secret, not active until a code from the app proves it works. */
export async function beginSetup(userId: string, email: string, issuer = "Keplar"): Promise<{ secret: string; uri: string }> {
  if ((await mfaStatus(userId)).enabled) throw new Error("already_enabled");
  const secret = generateSecret();
  await q(
    `INSERT INTO keplar_mfa (user_id, secret_enc, enabled_at, last_step, recovery) VALUES ($1, $2, NULL, 0, '[]'::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET secret_enc = EXCLUDED.secret_enc, enabled_at = NULL, last_step = 0, recovery = '[]'::jsonb`,
    [userId, sealSecret(secret, SCOPE, userId)],
  );
  return { secret, uri: otpauthUri(issuer, email, secret) };
}

async function secretOf(userId: string): Promise<{ secret: string; enabled: boolean; lastStep: number; recovery: string[] } | null> {
  const rows = await q("SELECT secret_enc, enabled_at, last_step, recovery FROM keplar_mfa WHERE user_id = $1", [userId]);
  const r = rows[0];
  if (!r) return null;
  const secret = openSecret(String(r.secret_enc), SCOPE, userId);
  if (!secret) return null;
  return { secret, enabled: Boolean(r.enabled_at), lastStep: Number(r.last_step ?? 0), recovery: parseList(r.recovery) };
}

/** Finish setup with a code from the authenticator app; returns the recovery codes, shown once. */
export async function confirmSetup(userId: string, code: string, now = Date.now()): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false }> {
  const row = await secretOf(userId);
  if (!row || row.enabled) return { ok: false };
  const step = verifyTotp(row.secret, code, now);
  if (step === null) return { ok: false };
  const codes = generateRecoveryCodes();
  await q("UPDATE keplar_mfa SET enabled_at = now(), last_step = $2, recovery = $3::jsonb WHERE user_id = $1", [userId, step, JSON.stringify(codes.map((c) => hashRecovery(normalizeRecovery(c))))]);
  return { ok: true, recoveryCodes: codes };
}

/** Check a sign-in code: an authenticator code (each 30 s step usable once) or a recovery code (usable once). */
export async function verifySecondFactor(userId: string, input: string, now = Date.now()): Promise<{ ok: true; via: "totp" | "recovery"; recoveryLeft: number } | { ok: false }> {
  const row = await secretOf(userId);
  if (!row || !row.enabled) return { ok: false };
  if (looksLikeRecovery(input) && !/^\d{6}$/.test(input.replace(/\s/g, ""))) {
    const h = hashRecovery(normalizeRecovery(input));
    const hit = row.recovery.find((x) => same(x, h));
    if (!hit) return { ok: false };
    // Remove it only if it is still there (two concurrent uses of one code: one wins).
    const left = row.recovery.filter((x) => x !== hit);
    const res = await q("UPDATE keplar_mfa SET recovery = $2::jsonb WHERE user_id = $1 AND recovery @> $3::jsonb RETURNING user_id", [userId, JSON.stringify(left), JSON.stringify([hit])]);
    return res.length ? { ok: true, via: "recovery", recoveryLeft: left.length } : { ok: false };
  }
  const step = verifyTotp(row.secret, input, now);
  if (step === null || step <= row.lastStep) return { ok: false };
  const res = await q("UPDATE keplar_mfa SET last_step = $2 WHERE user_id = $1 AND last_step < $2 RETURNING user_id", [userId, step]);
  return res.length ? { ok: true, via: "totp", recoveryLeft: row.recovery.length } : { ok: false };
}

export async function disableMfa(userId: string): Promise<void> {
  await q("DELETE FROM keplar_mfa WHERE user_id = $1", [userId]);
}

/** New set of recovery codes (the old ones stop working). Caller has already verified a code. */
export async function regenerateRecovery(userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await q("UPDATE keplar_mfa SET recovery = $2::jsonb WHERE user_id = $1 AND enabled_at IS NOT NULL", [userId, JSON.stringify(codes.map((c) => hashRecovery(normalizeRecovery(c))))]);
  return codes;
}
