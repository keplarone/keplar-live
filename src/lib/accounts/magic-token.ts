/**
 * Stateless magic-link tokens.
 *
 * Vercel runs each route in its own short-lived serverless instances, so a
 * token kept in process memory (Better Auth's memory adapter) is invisible to
 * the instance that serves the click. These tokens carry everything needed to
 * verify them — email, redirect path, expiry, a random id — and are signed with
 * HMAC-SHA256 under a key derived from BETTER_AUTH_SECRET, so any instance can
 * verify them without a database lookup.
 *
 * Format: `v1.<base64url(JSON payload)>.<base64url(HMAC)>`.
 *
 * Single use: the landing page never consumes a token (so email-client link
 * prefetching is harmless); only the explicit "Sign in" POST does. Consumed
 * ids are stored in Postgres when it is configured, and remembered in this
 * process as well. If that store cannot be reached, the link is refused.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { safeCallbackPath } from "./redirect";

export const MAGIC_LINK_TTL_SECONDS = 15 * 60;
const VERSION = "v1";

export type MagicPayload = {
  v: 1;
  /** Normalized (trimmed, lower-case) email address. */
  e: string;
  /** Optional display name for first sign-in. */
  n?: string;
  /** Same-origin path to go to after sign-in. */
  cb: string;
  /** 0 = "remember me" was switched off (session-only cookie). Absent = remembered (the default). */
  r?: 0;
  /** Issued at / expires at, unix seconds. */
  iat: number;
  exp: number;
  /** Random token id (single-use bookkeeping). */
  jti: string;
};

export type VerifyResult = { ok: true; payload: MagicPayload } | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "used" };

const b64url = (buf: Buffer) => buf.toString("base64url");

function key(secret: string, purpose: string) {
  if (!secret) throw new Error("magic-link secret missing");
  return createHmac("sha256", secret).update(`keplar:${purpose}:v1`).digest();
}

function mac(secret: string, data: string) {
  return createHmac("sha256", key(secret, "magic-link")).update(data).digest();
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

// safeCallbackPath lives in ./redirect (pure, no node APIs) so the sign-in forms can use it in the browser too.
export { safeCallbackPath };

export function createMagicToken(
  secret: string,
  input: { email: string; name?: string; callbackURL?: string; remember?: boolean },
  opts: { now?: number; ttlSeconds?: number } = {},
): { token: string; payload: MagicPayload } {
  const iat = Math.floor((opts.now ?? Date.now()) / 1000);
  const payload: MagicPayload = {
    v: 1,
    e: normalizeEmail(input.email),
    ...(input.name ? { n: input.name.slice(0, 100) } : {}),
    cb: safeCallbackPath(input.callbackURL),
    ...(input.remember === false ? { r: 0 as const } : {}),
    iat,
    exp: iat + (opts.ttlSeconds ?? MAGIC_LINK_TTL_SECONDS),
    jti: b64url(randomBytes(16)),
  };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(mac(secret, `${VERSION}.${body}`));
  return { token: `${VERSION}.${body}.${sig}`, payload };
}

/** Checks signature and expiry. Does not consume the token. */
export function verifyMagicToken(secret: string, token: string | null | undefined, opts: { now?: number } = {}): VerifyResult {
  if (typeof token !== "string" || token.length > 2048) return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION || !parts[1] || !parts[2]) return { ok: false, reason: "malformed" };
  const expected = mac(secret, `${parts[0]}.${parts[1]}`);
  const given = Buffer.from(parts[2], "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "bad_signature" };
  let payload: MagicPayload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as MagicPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (payload?.v !== 1 || typeof payload.e !== "string" || !payload.e.includes("@") || typeof payload.exp !== "number" || typeof payload.jti !== "string") {
    return { ok: false, reason: "malformed" };
  }
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (payload.exp <= now) return { ok: false, reason: "expired" };
  return { ok: true, payload: { ...payload, cb: safeCallbackPath(payload.cb) } };
}

const g = globalThis as unknown as { __keplarUsedMagic?: Map<string, number> };
const used = () => (g.__keplarUsedMagic ??= new Map());

/** Verify and mark the token id as used (per instance; see file header). */
export function consumeMagicToken(secret: string, token: string | null | undefined, opts: { now?: number } = {}): VerifyResult {
  const res = verifyMagicToken(secret, token, opts);
  if (!res.ok) return res;
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  const map = used();
  for (const [jti, exp] of map) if (exp <= now) map.delete(jti);
  if (map.has(res.payload.jti)) return { ok: false, reason: "used" };
  map.set(res.payload.jti, res.payload.exp);
  return res;
}

/** Stable user id derived from the email, identical on every instance. */
export function userIdForEmail(secret: string, email: string) {
  return `usr_${b64url(createHmac("sha256", key(secret, "user-id")).update(normalizeEmail(email)).digest()).slice(0, 24)}`;
}

export const randomToken = (bytes = 24) => b64url(randomBytes(bytes));
