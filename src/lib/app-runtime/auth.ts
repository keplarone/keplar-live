/**
 * End-user accounts for generated apps. Accounts belong to one app and one environment (a preview account means nothing on the
 * live app and nothing on any other app). Passwords: scrypt. Sessions: 256-bit random bearer tokens, only their SHA-256 is
 * stored, 30-day expiry, revocable (sign out, removal). Magic links: single-use, 20 minutes, sent with Resend when configured.
 * The app's admins are the emails in AppMeta.admins (the creator's email by default): they get role "admin" on sign-in.
 */
import { createHash, randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "@/lib/site-builder/features/members";
import { appSql, ensureAppSchema } from "./db";
import type { AppCtx } from "./context";

export const SESSION_DAYS = 30;
export const MIN_PASSWORD = 8;
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const newId = () => `u_${randomBytes(9).toString("base64url")}`;
const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z]{2,24}$/i;

export type AppUser = { id: string; email: string; name: string; role: string; profile: Record<string, unknown>; verified: boolean; createdAt: string };
export type PublicUser = { id: string; name: string; role: string; profile: Record<string, unknown>; createdAt: string };

export class AuthError extends Error {
  constructor(message: string, public status = 400, public code = "auth") {
    super(message);
  }
}

const parse = (v: string | null) => {
  try {
    return v ? (JSON.parse(v) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};
const toUser = (r: Record<string, string | null>): AppUser => ({ id: r.id!, email: r.email!, name: r.name ?? "", role: r.role ?? "member", profile: parse(r.profile), verified: r.verified === "true" || r.verified === "t", createdAt: r.created_at ?? "" });
export const publicUser = (u: AppUser): PublicUser => ({ id: u.id, name: u.name, role: u.role === "admin" ? "admin" : u.role, profile: u.profile, createdAt: u.createdAt });
export const selfUser = (u: AppUser) => ({ ...publicUser(u), email: u.email, verified: u.verified });

const isAdminEmail = (ctx: AppCtx, email: string) => ctx.meta.admins.some((a) => a.toLowerCase() === email.toLowerCase());

/** Profile fields are free-form but bounded: strings up to 2,000 chars, at most 12 keys, http(s)/relative URLs only for avatar. */
export function cleanProfile(v: unknown, allowed: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!v || typeof v !== "object") return out;
  const keys = new Set(["avatar", "bio", ...allowed]);
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!keys.has(k) || Object.keys(out).length >= 12) continue;
    if (typeof val === "string") {
      const t = val.slice(0, 2000);
      if (k === "avatar" && t && !/^(https:\/\/|\/)/.test(t)) continue;
      out[k] = t;
    } else if (typeof val === "number" || typeof val === "boolean") out[k] = val;
  }
  return out;
}

async function countUsers(ctx: AppCtx) {
  const r = await appSql("SELECT count(*)::int AS n FROM app_users WHERE app_id = $1 AND env = $2", [ctx.appId, ctx.env]);
  return Number(r[0]?.n ?? 0);
}

async function issue(ctx: AppCtx, userId: string): Promise<string> {
  const token = `kas_${randomBytes(32).toString("base64url")}`;
  await appSql("INSERT INTO app_sessions (token_hash, app_id, env, user_id, expires_at) VALUES ($1, $2, $3, $4, now() + ($5 || ' days')::interval)", [sha(token), ctx.appId, ctx.env, userId, String(SESSION_DAYS)]);
  return token;
}

export async function signUp(ctx: AppCtx, input: { email?: unknown; password?: unknown; name?: unknown; profile?: unknown }) {
  await ensureAppSchema();
  if (!ctx.meta.settings.signups) throw new AuthError("Sign-ups are closed for this app.", 403, "signups_closed");
  const email = String(input.email ?? "").trim().toLowerCase();
  const password = String(input.password ?? "");
  const name = String(input.name ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 60) || email.split("@")[0].slice(0, 40);
  if (!EMAIL.test(email)) throw new AuthError("Enter a valid email address.");
  if (password.length < MIN_PASSWORD || password.length > 200) throw new AuthError(`Use a password of at least ${MIN_PASSWORD} characters.`);
  if ((await countUsers(ctx)) >= ctx.limits.users) throw new AuthError("This app has reached its account limit.", 403, "limit");
  const id = newId();
  const role = isAdminEmail(ctx, email) ? "admin" : "member";
  const rows = await appSql(
    "INSERT INTO app_users (app_id, env, id, email, pass_hash, name, role, profile) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb) ON CONFLICT DO NOTHING RETURNING *",
    [ctx.appId, ctx.env, id, email, hashPassword(password), name, role, JSON.stringify(cleanProfile(input.profile, ctx.spec.auth.profileFields))],
  );
  if (!rows[0]) throw new AuthError("An account with this email already exists. Sign in instead.", 409, "exists");
  const user = toUser(rows[0]);
  return { user, token: await issue(ctx, user.id) };
}

export async function signIn(ctx: AppCtx, input: { email?: unknown; password?: unknown }) {
  await ensureAppSchema();
  const email = String(input.email ?? "").trim().toLowerCase();
  const password = String(input.password ?? "");
  const rows = await appSql("SELECT * FROM app_users WHERE app_id = $1 AND env = $2 AND lower(email) = $3", [ctx.appId, ctx.env, email]);
  const r = rows[0];
  // Same answer for an unknown email and a wrong password.
  if (!r || !r.pass_hash || !verifyPassword(password, r.pass_hash)) throw new AuthError("That email and password don't match.", 401, "invalid");
  let user = toUser(r);
  const want = isAdminEmail(ctx, email) ? "admin" : user.role === "admin" ? "member" : user.role;
  if (want !== user.role) {
    await appSql("UPDATE app_users SET role = $4 WHERE app_id = $1 AND env = $2 AND id = $3", [ctx.appId, ctx.env, user.id, want]);
    user = { ...user, role: want };
  }
  return { user, token: await issue(ctx, user.id) };
}

/** Creates a single-use sign-in link token (the caller emails it). Unknown emails get an account on first use if sign-ups are open. */
export async function magicToken(ctx: AppCtx, emailRaw: unknown): Promise<{ email: string; token: string }> {
  await ensureAppSchema();
  const email = String(emailRaw ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) throw new AuthError("Enter a valid email address.");
  const token = `kml_${randomBytes(24).toString("base64url")}`;
  await appSql("INSERT INTO app_magic (token_hash, app_id, env, email, expires_at) VALUES ($1, $2, $3, $4, now() + interval '20 minutes')", [sha(token), ctx.appId, ctx.env, email]);
  return { email, token };
}

export async function redeemMagic(ctx: AppCtx, tokenRaw: unknown) {
  await ensureAppSchema();
  const token = String(tokenRaw ?? "");
  if (!/^kml_[\w-]{20,60}$/.test(token)) throw new AuthError("This sign-in link is not valid.", 401, "invalid");
  const rows = await appSql("UPDATE app_magic SET used = true WHERE token_hash = $1 AND app_id = $2 AND env = $3 AND used = false AND expires_at > now() RETURNING email", [sha(token), ctx.appId, ctx.env]);
  const email = rows[0]?.email;
  if (!email) throw new AuthError("This sign-in link has expired or was already used.", 401, "expired");
  let r = (await appSql("SELECT * FROM app_users WHERE app_id = $1 AND env = $2 AND lower(email) = $3", [ctx.appId, ctx.env, email]))[0];
  if (!r) {
    if (!ctx.meta.settings.signups) throw new AuthError("Sign-ups are closed for this app.", 403, "signups_closed");
    if ((await countUsers(ctx)) >= ctx.limits.users) throw new AuthError("This app has reached its account limit.", 403, "limit");
    r = (await appSql("INSERT INTO app_users (app_id, env, id, email, name, role, verified) VALUES ($1, $2, $3, $4, $5, $6, true) ON CONFLICT DO NOTHING RETURNING *", [ctx.appId, ctx.env, newId(), email, email.split("@")[0].slice(0, 40), isAdminEmail(ctx, email) ? "admin" : "member"]))[0];
    if (!r) r = (await appSql("SELECT * FROM app_users WHERE app_id = $1 AND env = $2 AND lower(email) = $3", [ctx.appId, ctx.env, email]))[0];
  } else if (r.verified !== "true" && r.verified !== "t") {
    await appSql("UPDATE app_users SET verified = true WHERE app_id = $1 AND env = $2 AND id = $3", [ctx.appId, ctx.env, r.id]);
  }
  const user = toUser(r!);
  return { user, token: await issue(ctx, user.id) };
}

/** The signed-in end user for a bearer token, or null. Re-reads the user every time (removal signs out at once). */
export async function userFor(ctx: AppCtx, authHeader: string | null): Promise<AppUser | null> {
  const m = /^Bearer\s+(kas_[\w-]{30,60})$/.exec(authHeader ?? "");
  if (!m) return null;
  await ensureAppSchema();
  const rows = await appSql(
    "SELECT u.* FROM app_sessions s JOIN app_users u ON u.app_id = s.app_id AND u.env = s.env AND u.id = s.user_id WHERE s.token_hash = $1 AND s.app_id = $2 AND s.env = $3 AND s.expires_at > now()",
    [sha(m[1]), ctx.appId, ctx.env],
  );
  return rows[0] ? toUser(rows[0]) : null;
}

export async function signOut(ctx: AppCtx, authHeader: string | null) {
  const m = /^Bearer\s+(kas_[\w-]{30,60})$/.exec(authHeader ?? "");
  if (!m) return;
  await appSql("DELETE FROM app_sessions WHERE token_hash = $1 AND app_id = $2 AND env = $3", [sha(m[1]), ctx.appId, ctx.env]);
}

export async function updateProfile(ctx: AppCtx, user: AppUser, input: { name?: unknown; profile?: unknown }) {
  const name = input.name === undefined ? user.name : String(input.name).replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 60) || user.name;
  const profile = { ...user.profile, ...cleanProfile(input.profile, ctx.spec.auth.profileFields) };
  const r = await appSql("UPDATE app_users SET name = $4, profile = $5::jsonb WHERE app_id = $1 AND env = $2 AND id = $3 RETURNING *", [ctx.appId, ctx.env, user.id, name, JSON.stringify(profile)]);
  return toUser(r[0]!);
}

/** Example authors of seeded content: a read-only public profile built from their records. */
async function seedUsers(ctx: AppCtx, ids: string[]): Promise<PublicUser[]> {
  const want = ids.filter((i) => /^seed(_[a-z0-9-]{1,40})?$/.test(i)).slice(0, 100);
  if (!want.length) return [];
  const r = await appSql("SELECT DISTINCT ON (owner_id) owner_id, data, created_at FROM app_records WHERE app_id = $1 AND env = $2 AND owner_id = ANY($3::text[]) ORDER BY owner_id, created_at", [ctx.appId, ctx.env, want]);
  return r.map((x) => {
    const d = JSON.parse(String(x.data ?? "{}")) as Record<string, unknown>;
    const name = typeof d._ownerName === "string" && d._ownerName ? d._ownerName : "Example member";
    return { id: String(x.owner_id), name, role: "member", profile: { ...(typeof d._ownerAvatar === "string" ? { avatar: d._ownerAvatar } : {}), example: true }, createdAt: new Date(String(x.created_at)).toISOString() };
  });
}

export async function getPublicUser(ctx: AppCtx, id: string): Promise<PublicUser | null> {
  if (id.startsWith("seed")) {
    await ensureAppSchema();
    return (await seedUsers(ctx, [id]))[0] ?? null;
  }
  if (!/^u_[\w-]{6,20}$/.test(id)) return null;
  await ensureAppSchema();
  const r = await appSql("SELECT * FROM app_users WHERE app_id = $1 AND env = $2 AND id = $3", [ctx.appId, ctx.env, id]);
  return r[0] ? publicUser(toUser(r[0])) : null;
}

export async function listPublicUsers(ctx: AppCtx, q: string, limit: number, ids?: string[]): Promise<PublicUser[]> {
  await ensureAppSchema();
  if (ids?.length) {
    const r = await appSql("SELECT * FROM app_users WHERE app_id = $1 AND env = $2 AND id = ANY($3::text[]) LIMIT 100", [ctx.appId, ctx.env, ids.filter((i) => /^u_[\w-]{6,20}$/.test(i)).slice(0, 100)]);
    return [...r.map((x) => publicUser(toUser(x))), ...(await seedUsers(ctx, ids))];
  }
  const term = q.replace(/[%_\\]/g, "").slice(0, 60);
  const r = await appSql(
    `SELECT * FROM app_users WHERE app_id = $1 AND env = $2 ${term ? "AND name ILIKE $4" : ""} ORDER BY created_at DESC LIMIT $3`,
    term ? [ctx.appId, ctx.env, Math.min(100, Math.max(1, limit)), `%${term}%`] : [ctx.appId, ctx.env, Math.min(100, Math.max(1, limit))],
  );
  return r.map((x) => publicUser(toUser(x)));
}
