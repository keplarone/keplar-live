/**
 * Signed, expiring, stateless tokens for emailed account actions (verify email, reset password).
 * Same idea as the magic-link token (HMAC-SHA256 under a key derived from BETTER_AUTH_SECRET, verifiable on any
 * serverless instance), with the purpose in the key so a reset token can never be used as a verification token.
 *
 * Single use without shared storage: the payload carries `f`, a keyed fingerprint of the password hash that was
 * current when the token was issued. Using the token changes the hash, so the same token fails afterwards.
 * Landing pages only check a token; the explicit button POST consumes it (link scanners can't burn it).
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { safeCallbackPath } from "./magic-token";

export type ActionPurpose = "verify" | "reset" | "secure";
export const ACTION_TTL_SECONDS: Record<ActionPurpose, number> = { verify: 24 * 3600, reset: 30 * 60, secure: 7 * 24 * 3600 };

export type ActionPayload = { v: 1; p: ActionPurpose; e: string; f: string; cb: string; r?: 0; iat: number; exp: number; jti: string };
export type ActionCheck = { ok: true; payload: ActionPayload } | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

const key = (secret: string, purpose: string) => {
  if (!secret) throw new Error("secret missing");
  return createHmac("sha256", secret).update(`keplar:action:${purpose}:v1`).digest();
};
const mac = (secret: string, purpose: ActionPurpose, data: string) => createHmac("sha256", key(secret, purpose)).update(data).digest();

/** Keyed fingerprint of a password hash (or "-" when there is none). Safe to put in an email link. */
export const fingerprint = (secret: string, hash: string | null | undefined) => (hash ? createHmac("sha256", key(secret, "fingerprint")).update(hash).digest("base64url").slice(0, 16) : "-");

export function createActionToken(secret: string, purpose: ActionPurpose, input: { email: string; fp: string; callbackURL?: string; remember?: boolean }, opts: { now?: number } = {}): string {
  const iat = Math.floor((opts.now ?? Date.now()) / 1000);
  const payload: ActionPayload = {
    v: 1,
    p: purpose,
    e: input.email.trim().toLowerCase(),
    f: input.fp,
    cb: safeCallbackPath(input.callbackURL),
    ...(input.remember === false ? { r: 0 as const } : {}),
    iat,
    exp: iat + ACTION_TTL_SECONDS[purpose],
    jti: randomBytes(12).toString("base64url"),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `a1.${body}.${mac(secret, purpose, `a1.${body}`).toString("base64url")}`;
}

export function verifyActionToken(secret: string, purpose: ActionPurpose, token: unknown, opts: { now?: number } = {}): ActionCheck {
  if (typeof token !== "string" || token.length > 2048) return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "a1" || !parts[1] || !parts[2]) return { ok: false, reason: "malformed" };
  const expected = mac(secret, purpose, `a1.${parts[1]}`);
  const given = Buffer.from(parts[2], "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "bad_signature" };
  let payload: ActionPayload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as ActionPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (payload?.v !== 1 || payload.p !== purpose || typeof payload.e !== "string" || !payload.e.includes("@") || typeof payload.f !== "string" || typeof payload.exp !== "number") return { ok: false, reason: "malformed" };
  if (payload.exp <= Math.floor((opts.now ?? Date.now()) / 1000)) return { ok: false, reason: "expired" };
  return { ok: true, payload: { ...payload, cb: safeCallbackPath(payload.cb) } };
}
