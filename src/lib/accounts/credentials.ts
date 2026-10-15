/**
 * Email + password credentials, in Neon (needs DATABASE_URL; without it passwords are simply unavailable).
 *
 * One row per email: a scrypt hash (Better Auth's `hashPassword`), when the address was verified, and when the
 * Terms were accepted. A row with `verified_at` null is a pending sign-up: it cannot log in, a newer sign-up for
 * the same address replaces it (so nobody can squat on someone else's address), and it is deleted the moment the
 * address is proven another way (magic link, Google, Microsoft). The hash never leaves this module's callers.
 */
import { neonQuery } from "@/lib/create/platform/neon";
import { normalizeEmail } from "./magic-token";
import { ensureAuthSchema } from "./persist";

export type Credential = { email: string; hash: string; name: string; verifiedAt: string | null; termsAcceptedAt: string | null };

let ready: Promise<void> | null = null;
export function ensureCredentialSchema(): Promise<void> {
  ready ??= (async () => {
    const run = () => neonQuery("CREATE TABLE IF NOT EXISTS keplar_credentials (email text PRIMARY KEY, password_hash text NOT NULL, name text NOT NULL DEFAULT '', verified_at timestamptz, terms_accepted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())");
    await run().catch(async () => {
      await new Promise((r) => setTimeout(r, 300));
      await run();
    });
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

const q = async (sql: string, params: unknown[] = []) => {
  await ensureCredentialSchema();
  return neonQuery(sql, params);
};

const toCred = (r: Record<string, unknown>): Credential => ({
  email: String(r.email),
  hash: String(r.password_hash),
  name: String(r.name ?? ""),
  verifiedAt: r.verified_at ? new Date(String(r.verified_at)).toISOString() : null,
  termsAcceptedAt: r.terms_accepted_at ? new Date(String(r.terms_accepted_at)).toISOString() : null,
});

const COLS = "email, password_hash, name, verified_at, terms_accepted_at";

export async function getCredential(email: string): Promise<Credential | null> {
  const rows = await q(`SELECT ${COLS} FROM keplar_credentials WHERE email = $1`, [normalizeEmail(email)]);
  return rows[0] ? toCred(rows[0]) : null;
}

/** Is there a Keplar account (password, link, Google or Microsoft) for this address? Only decides whether a reset email is sent; never shown. */
export async function accountExists(email: string): Promise<boolean> {
  await ensureAuthSchema(); // keplar_users
  const rows = await q("SELECT 1 AS x FROM keplar_credentials WHERE email = $1 UNION ALL SELECT 1 FROM keplar_users WHERE email = $1 LIMIT 1", [normalizeEmail(email)]);
  return rows.length > 0;
}

/**
 * Does this address already have a Keplar account (signed in before by email link, Google, Microsoft, passkey or a verified
 * password)? A password sign-up for such an address must not create a pending credential: its verification link would go
 * to the owner, who would attach a stranger's password to their own account by clicking it.
 */
export async function userAccountExists(email: string): Promise<boolean> {
  await ensureAuthSchema(); // keplar_users
  const rows = await neonQuery("SELECT 1 AS x FROM keplar_users WHERE email = $1 LIMIT 1", [normalizeEmail(email)]);
  return rows.length > 0;
}

/**
 * Start (or restart) a pending sign-up. Returns "exists" without touching anything when the address already has a
 * verified password account. Callers check userAccountExists first (an account without a password is "exists" too).
 */
export async function savePendingCredential(input: { email: string; hash: string; name?: string }): Promise<"created" | "exists"> {
  const rows = await q(
    `INSERT INTO keplar_credentials AS c (email, password_hash, name, terms_accepted_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name, terms_accepted_at = now(), updated_at = now()
       WHERE c.verified_at IS NULL
     RETURNING email`,
    [normalizeEmail(input.email), input.hash, (input.name ?? "").trim().slice(0, 80)],
  );
  return rows.length ? "created" : "exists";
}

/** Verify the address of a pending credential, but only if its hash is still the one the link was issued for. */
export async function markVerified(email: string, expectedHash: string): Promise<boolean> {
  const rows = await q("UPDATE keplar_credentials SET verified_at = now(), updated_at = now() WHERE email = $1 AND verified_at IS NULL AND password_hash = $2 RETURNING email", [normalizeEmail(email), expectedHash]);
  return rows.length > 0;
}

/**
 * Set a new password after a reset link (the link proved the address, so the credential is verified).
 * `previousHash` is the hash the link was issued for (null = there was no credential): compare-and-set, so a
 * link works exactly once even if two requests race.
 */
export async function replacePassword(email: string, hash: string, previousHash: string | null): Promise<boolean> {
  const e = normalizeEmail(email);
  if (previousHash === null) {
    const rows = await q("INSERT INTO keplar_credentials (email, password_hash, verified_at) VALUES ($1, $2, now()) ON CONFLICT (email) DO NOTHING RETURNING email", [e, hash]);
    return rows.length > 0;
  }
  const rows = await q("UPDATE keplar_credentials SET password_hash = $2, verified_at = COALESCE(verified_at, now()), updated_at = now() WHERE email = $1 AND password_hash = $3 RETURNING email", [e, hash, previousHash]);
  return rows.length > 0;
}

/** The address was proven another way: a pending (unverified) password sign-up for it must not survive. */
export async function dropUnverifiedCredential(email: string): Promise<void> {
  await q("DELETE FROM keplar_credentials WHERE email = $1 AND verified_at IS NULL", [normalizeEmail(email)]);
}
