/**
 * Durable accounts + revocable sessions in Neon (plain SQL over the existing HTTP client).
 *
 * - keplar_users: one row per person, keyed by verified email (so magic link, Google and Microsoft
 *   are the same account), with the providers they have used, created_at and last_login.
 *   The row's id is what workspaces (plan, credits, chats, memory, study, slides) hang off; it is
 *   the HMAC-derived id for new users, and a stored id always wins afterwards.
 * - keplar_sessions: one row per signed-in browser. The cookie only proves "this session id was issued";
 *   the row decides whether it still counts (revoked? expired? signed out of all devices?). A session id with no row
 *   is refused (fail closed): rows are pruned, revoked, still waiting for their second factor, or deleted with the
 *   account, and an encrypted cookie outlives all of those. The one exception is the migration window: cookies issued
 *   before this table existed (LEGACY_SESSION_CUTOFF) are adopted on first sight until LEGACY_ADOPTION_UNTIL.
 * - keplar_deleted_logins: a keyed hash of each deleted account's email and when it was deleted (no address, no
 *   name), so an old cookie can never recreate a deleted account.
 * - No DATABASE_URL: everything here is a no-op and the stateless cookie keeps working as before.
 * Secrets and tokens never touch these tables: only the opaque session id, a user-agent string and an
 * HMAC of the IP (never the raw address).
 */
import { keepAlive } from "@/lib/create/platform/after";
import { createHmac } from "node:crypto";
import { neonConfigured, neonQuery } from "@/lib/create/platform/neon";
import { ensureSideSql } from "./sql-setup";
import { authSecret } from "./secret";
import { normalizeEmail, userIdForEmail } from "./magic-token";

/** Remembered sessions last this long and slide forward on activity. */
export const SESSION_TTL_SECONDS = 60 * 24 * 60 * 60;
/** "Remember me" off: a browser-session cookie, and the server record stops counting after a day. */
export const SHORT_SESSION_TTL_SECONDS = 24 * 60 * 60;
/** last_seen is written at most this often per session. */
export const TOUCH_EVERY_SECONDS = 5 * 60;
/** A remembered session unused for this long ends, even though the sliding window would have kept it (KEPLAR_SESSION_IDLE_DAYS, default 30). */
export const SESSION_IDLE_SECONDS = (Number(process.env.KEPLAR_SESSION_IDLE_DAYS) >= 1 ? Math.floor(Number(process.env.KEPLAR_SESSION_IDLE_DAYS)) : 30) * 86_400;
/** No session lives longer than this from sign-in, however active (KEPLAR_SESSION_MAX_DAYS, default 180): the person signs in again. */
export const SESSION_ABSOLUTE_SECONDS = (Number(process.env.KEPLAR_SESSION_MAX_DAYS) >= 1 ? Math.floor(Number(process.env.KEPLAR_SESSION_MAX_DAYS)) : 180) * 86_400;

export const persistenceEnabled = () => neonConfigured();

export type Validation = { ok: true; userId: string } | { ok: false; reason: "revoked" | "expired" | "idle" | "signed_out_everywhere" | "mfa_required" | "unknown" | "deleted" };

/**
 * keplar_sessions went live with the 2026-10-01 release ("sign-in lasts 60 days, see your devices"). Every session issued
 * since has a row from its first request. A cookie from before then (the old stateless sessions, whose encrypted payload
 * claims at most 30 days) may still turn up without one, so it is adopted, but only until those cookies have all expired.
 * After LEGACY_ADOPTION_UNTIL nothing is adopted, and any session id without a row is refused.
 */
export const LEGACY_SESSION_CUTOFF = Date.parse("2026-10-02T00:00:00Z");
export const LEGACY_ADOPTION_UNTIL = LEGACY_SESSION_CUTOFF + 31 * 86_400_000;
export const legacyAdoptable = (createdAt: Date, now = Date.now()) => {
  const t = createdAt.getTime();
  return Number.isFinite(t) && t < LEGACY_SESSION_CUTOFF && now < LEGACY_ADOPTION_UNTIL;
};

export type UserRow = { id: string; email: string; name: string; createdAt: string; lastLogin: string | null; providers: string[] };
export type SessionRow = { id: string; userId: string; createdAt: string; lastSeen: string; expiresAt: string; userAgent: string; provider: string; remember: boolean };

/** Postgres booleans arrive as "t"/"f" over Neon's raw text output ("true"/"false" elsewhere). */
const bool = (v: unknown) => v === true || v === "t" || v === "true";
const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);
const secs = (n: number) => String(n);

let ready: Promise<void> | null = null;
export function ensureAuthSchema(): Promise<void> {
  ready ??= (async () => {
    const run = async () => {
      // Tables and indexes live in sql-setup.ts (versioned, create-if-not-exists only). The column adds below already
      // shipped; they stay here so this setup does not take on a new change to an existing table.
      await ensureSideSql();
      // First-run onboarding (src/lib/onboarding). Idempotent. Existing rows get onboarding_required = false, so only accounts
      // created from now on (the INSERT in upsertUser sets true) are sent through it.
      await neonQuery("ALTER TABLE keplar_users ADD COLUMN IF NOT EXISTS onboarding_required boolean NOT NULL DEFAULT false");
      await neonQuery("ALTER TABLE keplar_users ADD COLUMN IF NOT EXISTS onboarding_step integer NOT NULL DEFAULT 0");
      await neonQuery("ALTER TABLE keplar_users ADD COLUMN IF NOT EXISTS onboarding_started_at timestamptz");
      await neonQuery("ALTER TABLE keplar_users ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz");
      await neonQuery("ALTER TABLE keplar_users ADD COLUMN IF NOT EXISTS onboarding_skipped_at timestamptz");
      await neonQuery("ALTER TABLE keplar_users ADD COLUMN IF NOT EXISTS onboarding_answers jsonb NOT NULL DEFAULT '{}'::jsonb");
      await neonQuery("ALTER TABLE keplar_users ADD COLUMN IF NOT EXISTS onboarding_progress jsonb NOT NULL DEFAULT '{}'::jsonb");
      // Account deletion grace period (src/lib/privacy/deletion.ts): null = not scheduled.
      await neonQuery("ALTER TABLE keplar_users ADD COLUMN IF NOT EXISTS deletion_scheduled_at timestamptz");
      // Second factor: a session created for an account with 2FA on stays unusable until the code is checked (src/lib/accounts/mfa).
      await neonQuery("ALTER TABLE keplar_sessions ADD COLUMN IF NOT EXISTS mfa_pending boolean NOT NULL DEFAULT false");
      // New-device notice (./new-device.ts): a keyed hash of the coarse network (IPv4 /16, IPv6 /32), never the address.
      await neonQuery("ALTER TABLE keplar_sessions ADD COLUMN IF NOT EXISTS net_hash text NOT NULL DEFAULT ''");
    };
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
  await ensureAuthSchema();
  return neonQuery(sql, params);
};

const toUser = (r: Record<string, unknown>): UserRow => {
  let providers: string[] = [];
  try {
    const p = typeof r.providers === "string" ? JSON.parse(r.providers) : r.providers;
    if (Array.isArray(p)) providers = p.map(String);
  } catch {
    /* keep [] */
  }
  return { id: String(r.id), email: String(r.email), name: String(r.name ?? ""), createdAt: iso(r.created_at) as string, lastLogin: iso(r.last_login), providers };
};

/** Privacy: only a keyed hash of the IP is kept (enough to tell devices apart, useless as an address). */
export const hashIp = (ip: string | null | undefined) => (ip && ip !== "local" ? createHmac("sha256", authSecret()).update(`ip:${ip}`).digest("hex").slice(0, 24) : "");
/**
 * The coarse network an address belongs to: IPv4 /16 ("203.0"), IPv6 /32 ("2001:db8"). Roughly "which provider and region",
 * so a phone moving between cells or a home router's new address stays the same network. Null for local or unparseable input.
 */
export function networkPrefix(ip: string | null | undefined): string | null {
  const v = (ip ?? "").trim().toLowerCase();
  if (!v || v === "local" || v === "unknown") return null;
  const v4 = v.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (v4) return Number(v4[1]) <= 255 && Number(v4[2]) <= 255 ? `${Number(v4[1])}.${Number(v4[2])}` : null;
  if (!v.includes(":") || v.startsWith("::")) return null;
  const groups = v.split("%")[0].split(":");
  if (groups.length < 3 || !groups.slice(0, 2).every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return `${parseInt(groups[0], 16).toString(16)}:${parseInt(groups[1], 16).toString(16)}`;
}
/** Keyed hash of networkPrefix: lets sign-ins be compared by network without keeping the network, let alone the address. */
export const hashNetwork = (ip: string | null | undefined) => {
  const net = networkPrefix(ip);
  return net ? createHmac("sha256", authSecret()).update(`net:${net}`).digest("hex").slice(0, 24) : "";
};
export const ipFromHeaders = (h: Headers | null | undefined) => h?.get("x-forwarded-for")?.split(",")[0]?.trim() || h?.get("x-real-ip") || "";

/**
 * Create the user for this verified email or update it (last_login, providers, name if still empty).
 * `id` is only used for a brand-new row. Returns the stored row, whose id is canonical.
 */
export async function upsertUser(input: { email: string; name?: string | null; provider?: string; id?: string; /** false for accounts that already existed (an old stateless session adopted on first sight): they are not sent through onboarding. */ firstRun?: boolean }): Promise<UserRow> {
  const email = normalizeEmail(input.email);
  const id = input.id || userIdForEmail(authSecret(), email);
  const providers = JSON.stringify(input.provider ? [input.provider] : []);
  const rows = await q(
    `INSERT INTO keplar_users AS u (id, email, name, last_login, providers, onboarding_required) VALUES ($1, $2, $3, now(), $4::jsonb, $5::boolean)
     ON CONFLICT (email) DO UPDATE SET
       last_login = now(),
       name = CASE WHEN u.name = '' THEN EXCLUDED.name ELSE u.name END,
       providers = (SELECT COALESCE(jsonb_agg(DISTINCT x), '[]'::jsonb) FROM jsonb_array_elements_text(u.providers || EXCLUDED.providers) AS x)
     RETURNING id, email, name, created_at, last_login, providers`,
    [id, email, (input.name ?? "").slice(0, 100), providers, String(input.firstRun !== false)],
  );
  return toUser(rows[0]);
}

export async function userById(id: string): Promise<UserRow | null> {
  const rows = await q("SELECT id, email, name, created_at, last_login, providers FROM keplar_users WHERE id = $1", [id]);
  return rows[0] ? toUser(rows[0]) : null;
}

/** The id already stored for this email (so a person keeps one id and one workspace whichever way they sign in), or null. */
export async function storedUserId(email: string): Promise<string | null> {
  if (!persistenceEnabled()) return null;
  try {
    const rows = await q("SELECT id FROM keplar_users WHERE email = $1", [normalizeEmail(email)]);
    return rows[0] ? String(rows[0].id) : null;
  } catch {
    return null;
  }
}

export async function createSessionRecord(s: { id: string; userId: string; userAgent?: string | null; ip?: string | null; provider?: string; remember?: boolean; createdAt?: Date; mfaPending?: boolean }) {
  const remember = s.remember !== false;
  const ttl = remember ? SESSION_TTL_SECONDS : SHORT_SESSION_TTL_SECONDS;
  await q(
    `INSERT INTO keplar_sessions (id, user_id, created_at, last_seen, expires_at, user_agent, ip_hash, provider, remember, mfa_pending, net_hash)
     VALUES ($1, $2, $3::timestamptz, now(), now() + make_interval(secs => $4::double precision), $5, $6, $7, $8::boolean, $9::boolean, $10)
     ON CONFLICT (id) DO NOTHING`,
    [s.id, s.userId, (s.createdAt ?? new Date()).toISOString(), secs(ttl), (s.userAgent ?? "").slice(0, 300), hashIp(s.ip), s.provider ?? "", String(remember), String(s.mfaPending === true), hashNetwork(s.ip)],
  );
  // Pruning is safe because a session id without a row is refused (validateSession): a pruned revoked, expired or
  // still-pending session stays dead. Only migration-window cookies are adopted, and those rows outlive the window.
  if (Math.random() < 0.01) keepAlive(() => neonQuery("DELETE FROM keplar_sessions WHERE expires_at < now() - interval '30 days'"), "session prune");
}

/** Keyed hash of an email for the deleted-accounts list: says nothing about the address without the server secret. */
export const deletedLoginKey = (email: string) => createHmac("sha256", authSecret()).update(`deleted-login:${normalizeEmail(email)}`).digest("hex");

/** Remember that the account for this email was deleted (called before its rows are removed). */
export async function tombstoneLogin(email: string): Promise<void> {
  await q("INSERT INTO keplar_deleted_logins (email_key, deleted_at) VALUES ($1, now()) ON CONFLICT (email_key) DO UPDATE SET deleted_at = now()", [deletedLoginKey(email)]);
}

/**
 * Does this cookie session still count? Slides expiry forward on activity (at most every 5 minutes).
 * A session id with no row is refused, except a cookie from before the sessions table during the migration window
 * (see LEGACY_SESSION_CUTOFF), which is adopted unless its account signed out everywhere or was deleted since.
 */
export async function validateSession(cookie: { id: string; userId: string; email: string; name?: string | null; createdAt: Date; expiresAt: Date; userAgent?: string | null; ip?: string | null }): Promise<Validation> {
  const rows = await q(
    `SELECT s.user_id, s.revoked_at, s.remember, s.mfa_pending, (s.expires_at <= now()) AS expired, (s.last_seen < now() - make_interval(secs => $2::double precision)) AS stale,
            (s.last_seen < now() - make_interval(secs => $3::double precision)) AS idle, (s.created_at < now() - make_interval(secs => $4::double precision)) AS too_old
       FROM keplar_sessions s WHERE s.id = $1`,
    [cookie.id, secs(TOUCH_EVERY_SECONDS), secs(SESSION_IDLE_SECONDS), secs(SESSION_ABSOLUTE_SECONDS)],
  );
  const r = rows[0];
  if (r) {
    if (r.revoked_at) return { ok: false, reason: "revoked" };
    if (bool(r.expired) || bool(r.too_old)) return { ok: false, reason: "expired" };
    if (bool(r.idle)) return { ok: false, reason: "idle" };
    if (bool(r.mfa_pending)) return { ok: false, reason: "mfa_required" };
    if (bool(r.stale)) {
      const remember = bool(r.remember);
      await q(
        `UPDATE keplar_sessions SET last_seen = now()${remember ? ", expires_at = now() + make_interval(secs => $2::double precision)" : ""} WHERE id = $1 AND revoked_at IS NULL`,
        remember ? [cookie.id, secs(SESSION_TTL_SECONDS)] : [cookie.id],
      );
    }
    return { ok: true, userId: String(r.user_id) };
  }
  // No row: pruned, deleted with the account, or never written. Fail closed, except for a pre-table cookie in the window.
  if (!legacyAdoptable(cookie.createdAt)) return { ok: false, reason: "unknown" };
  const email = normalizeEmail(cookie.email);
  const gone = await q("SELECT deleted_at FROM keplar_deleted_logins WHERE email_key = $1", [deletedLoginKey(email)]);
  if (gone[0]) return { ok: false, reason: "deleted" };
  const known = await q("SELECT id, sessions_valid_after FROM keplar_users WHERE email = $1", [email]);
  const after = known[0]?.sessions_valid_after ? new Date(String(known[0].sessions_valid_after)).getTime() : 0;
  if (after && cookie.createdAt.getTime() <= after) return { ok: false, reason: "signed_out_everywhere" };
  const user = known[0] ? { id: String(known[0].id) } : await upsertUser({ email, name: cookie.name, id: cookie.userId, firstRun: false });
  await createSessionRecord({ id: cookie.id, userId: user.id, userAgent: cookie.userAgent, ip: cookie.ip, provider: "legacy", createdAt: cookie.createdAt });
  return { ok: true, userId: user.id };
}

export async function listSessions(userId: string): Promise<SessionRow[]> {
  const rows = await q(
    `SELECT id, user_id, created_at, last_seen, expires_at, user_agent, provider, remember FROM keplar_sessions
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY last_seen DESC LIMIT 50`,
    [userId],
  );
  return rows.map((r) => ({ id: String(r.id), userId: String(r.user_id), createdAt: iso(r.created_at) as string, lastSeen: iso(r.last_seen) as string, expiresAt: iso(r.expires_at) as string, userAgent: String(r.user_agent ?? ""), provider: String(r.provider ?? ""), remember: bool(r.remember) }));
}

/** Browsers/devices this account has signed in from before (live or ended; rows are pruned 30 days after expiry). */
export async function priorDevices(userId: string): Promise<{ userAgent: string; ipHash: string; netHash: string }[]> {
  const rows = await q("SELECT user_agent, ip_hash, net_hash FROM keplar_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100", [userId]);
  return rows.map((r) => ({ userAgent: String(r.user_agent ?? ""), ipHash: String(r.ip_hash ?? ""), netHash: String(r.net_hash ?? "") }));
}

/** Revoke one session. With `userId`, only if it belongs to that user. Returns whether a live session was revoked. */
export async function revokeSession(id: string, userId?: string): Promise<boolean> {
  const rows = userId
    ? await q("UPDATE keplar_sessions SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id", [id, userId])
    : await q("UPDATE keplar_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING id", [id]);
  return rows.length > 0;
}

/** Sign out of every device: revoke all rows and make older, never-recorded cookies invalid too. */
export async function revokeAllSessions(userId: string): Promise<number> {
  await q("UPDATE keplar_users SET sessions_valid_after = now() WHERE id = $1", [userId]);
  const rows = await q("UPDATE keplar_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL RETURNING id", [userId]);
  return rows.length;
}

/** "Chrome on macOS" from a user-agent string (best effort, display only). */
export function deviceLabel(ua: string): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\/|CriOS\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

/* ── Account deletion grace period ───────────────────────────────────────── */

/** Schedule (or reschedule) the permanent deletion of an account. */
export async function setDeletionSchedule(userId: string, at: Date | null): Promise<void> {
  await q("UPDATE keplar_users SET deletion_scheduled_at = $2::timestamptz WHERE id = $1", [userId, at ? at.toISOString() : null]);
}

export async function deletionScheduledFor(userId: string): Promise<string | null> {
  const rows = await q("SELECT deletion_scheduled_at FROM keplar_users WHERE id = $1", [userId]);
  return rows[0] ? iso(rows[0].deletion_scheduled_at) : null;
}

/** Accounts whose grace period has ended. */
export async function dueDeletions(now = new Date()): Promise<{ id: string; email: string }[]> {
  const rows = await q("SELECT id, email FROM keplar_users WHERE deletion_scheduled_at IS NOT NULL AND deletion_scheduled_at <= $1::timestamptz LIMIT 25", [now.toISOString()]);
  return rows.map((r) => ({ id: String(r.id), email: String(r.email) }));
}

/* ── Second factor: pending sessions ─────────────────────────────────────── */

/** The session row behind this id when it is live and still waiting for the second factor. */
export async function pendingMfaRow(sessionId: string): Promise<{ userId: string } | null> {
  const rows = await q("SELECT user_id FROM keplar_sessions WHERE id = $1 AND mfa_pending = true AND revoked_at IS NULL AND expires_at > now()", [sessionId]);
  return rows[0] ? { userId: String(rows[0].user_id) } : null;
}

export async function completeMfa(sessionId: string): Promise<void> {
  await q("UPDATE keplar_sessions SET mfa_pending = false WHERE id = $1 AND revoked_at IS NULL", [sessionId]);
}

/**
 * Record a magic-link id as used. Returns false when that id was already stored.
 * Shared across instances so a link cannot be redeemed twice before it expires.
 */
export async function claimMagicJti(jti: string, expUnix: number): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(jti)) return false;
  await q("DELETE FROM keplar_magic_used WHERE expires_at < now()");
  const rows = await q("INSERT INTO keplar_magic_used (jti, expires_at) VALUES ($1, to_timestamp($2)) ON CONFLICT (jti) DO NOTHING RETURNING jti", [jti, expUnix]);
  return rows.length > 0;
}
