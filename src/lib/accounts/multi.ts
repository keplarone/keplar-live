/**
 * Several signed-in accounts on one device.
 *
 * The ACTIVE account is exactly what it always was: Better Auth's `session_token` + `session_data` cookies.
 * Every other signed-in account on this device is kept in its own HttpOnly, Secure, SameSite=Lax cookie
 * (`keplar_acct_1..4`) that holds that account's session cookie values, wrapped in an HMAC so it cannot be
 * edited. These values are bearer credentials of the same kind as the active cookies, they never reach
 * JavaScript, and the server still checks every session against its Neon record (revoked, expired or
 * signed-out-everywhere sessions stop working, per account).
 *
 *  - Add account: signing in again (password, magic link, Google, Microsoft) moves the previous active
 *    account into a free slot instead of dropping it (`stashPreviousAccount`, called by every sign-in path).
 *  - Switch: the chosen slot's cookies become the active ones, and the account that was active takes its slot.
 *  - Sign out: ends only the active account and promotes the most recently used other one.
 *  - Sign out of all: ends every account on this device.
 *
 * Pure helpers (cookie parsing, signing, slot choice) live here so they are unit-testable without Better Auth.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { authSecret } from "./secret";

export const MAX_OTHER_ACCOUNTS = 4;
export const STASH_MAX_AGE_SECONDS = 60 * 24 * 60 * 60;
/** Larger than this and a browser would drop the cookie: such an account is simply not kept. */
const MAX_COOKIE_VALUE = 3600;

export type Stash = {
  v: 1;
  /** user id, email (lower case), display name */
  u: string;
  e: string;
  n: string | null;
  /** session id, the signed session token cookie value, the encrypted session_data cookie value, the signed dont_remember value (or null) */
  sid: string;
  t: string;
  d: string;
  dr: string | null;
  /** remembered (persistent) sign-in */
  r: boolean;
  /** session createdAt / expiresAt (ms) and when it was parked (ms) */
  ca: number;
  x: number;
  s: number;
};

export type Slot = 1 | 2 | 3 | 4;
export const SLOTS: readonly Slot[] = [1, 2, 3, 4];

export const stashCookieName = (secure: boolean, slot: number) => `${secure ? "__Secure-" : ""}keplar_acct_${slot}`;

const key = () => createHmac("sha256", authSecret()).update("keplar:multi-account:v1").digest();
const mac = (data: string) => createHmac("sha256", key()).update(data).digest("base64url");

export function encodeStash(s: Stash): string {
  const body = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function decodeStash(raw: string | undefined | null): Stash | null {
  if (!raw) return null;
  const i = raw.lastIndexOf(".");
  if (i < 1) return null;
  const body = raw.slice(0, i);
  const want = Buffer.from(mac(body));
  const got = Buffer.from(raw.slice(i + 1));
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<Stash>;
    if (s.v !== 1 || typeof s.u !== "string" || typeof s.e !== "string" || typeof s.sid !== "string" || typeof s.t !== "string" || typeof s.d !== "string") return null;
    if (typeof s.x !== "number" || typeof s.ca !== "number" || typeof s.s !== "number") return null;
    return { v: 1, u: s.u, e: s.e, n: typeof s.n === "string" ? s.n : null, sid: s.sid, t: s.t, d: s.d, dr: typeof s.dr === "string" ? s.dr : null, r: s.r !== false, ca: s.ca, x: s.x, s: s.s };
  } catch {
    return null;
  }
}

/** Cookie header -> decoded values (the last one wins for a repeated name). */
export function parseCookies(header: string | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of (header ?? "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const name = part.slice(0, i).trim();
    let value = part.slice(i + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length > 1) value = value.slice(1, -1);
    try { value = decodeURIComponent(value); } catch { /* keep the raw value */ }
    out.set(name, value);
  }
  return out;
}

export type Parked = { slot: Slot; stash: Stash };

/** Every well-formed, correctly signed parked account on this request, one per slot. */
export function readParked(header: string | null | undefined, secure: boolean): Parked[] {
  const jar = parseCookies(header);
  const out: Parked[] = [];
  const seen = new Set<string>();
  for (const slot of SLOTS) {
    const stash = decodeStash(jar.get(stashCookieName(secure, slot)));
    if (!stash || seen.has(stash.e)) continue;
    seen.add(stash.e);
    out.push({ slot, stash });
  }
  return out;
}

export type AuthCookieNames = { sessionToken: string; sessionData: string; dontRemember: string };

/** The active account's raw cookie values from the request, or null when they are not all there (or too large to park). */
export function activeMaterial(header: string | null | undefined, names: AuthCookieNames): { t: string; d: string; dr: string | null } | null {
  const jar = parseCookies(header);
  const t = jar.get(names.sessionToken);
  const d = jar.get(names.sessionData);
  if (!t || !d) return null; // a chunked or missing session_data cookie cannot be parked
  if (t.length + d.length > MAX_COOKIE_VALUE - 400) return null;
  return { t, d, dr: jar.get(names.dontRemember) ?? null };
}

/** Which slot a parked account goes to: its own, else a free one, else the least recently parked. */
export function chooseSlot(parked: Parked[], email: string): Slot {
  const own = parked.find((p) => p.stash.e === email);
  if (own) return own.slot;
  const used = new Set(parked.map((p) => p.slot));
  const free = SLOTS.find((s) => !used.has(s));
  if (free) return free;
  return [...parked].sort((a, b) => a.stash.s - b.stash.s)[0].slot;
}

export type CookieAttrs = { secure: boolean; maxAge?: number };

/** A Set-Cookie header value (HttpOnly, SameSite=Lax, Path=/; Secure on https; a session cookie when maxAge is undefined). */
export function setCookieHeader(name: string, value: string, a: CookieAttrs): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax${a.secure ? "; Secure" : ""}${a.maxAge !== undefined ? `; Max-Age=${Math.floor(a.maxAge)}` : ""}`;
}
export const clearCookieHeader = (name: string, secure: boolean) => `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;

/** Header values that make `s` the active account. */
export function activateHeaders(s: Stash, names: AuthCookieNames, secure: boolean, sessionMaxAge: number): string[] {
  const maxAge = s.r ? sessionMaxAge : undefined;
  const out = [setCookieHeader(names.sessionToken, s.t, { secure, maxAge }), setCookieHeader(names.sessionData, s.d, { secure, maxAge })];
  out.push(s.dr ? setCookieHeader(names.dontRemember, s.dr, { secure, maxAge: undefined }) : clearCookieHeader(names.dontRemember, secure));
  return out;
}

export const clearActiveHeaders = (names: AuthCookieNames, secure: boolean): string[] => [
  clearCookieHeader(names.sessionToken, secure),
  clearCookieHeader(names.sessionData, secure),
  clearCookieHeader(names.dontRemember, secure),
];

export function parkHeader(slot: Slot, s: Stash, secure: boolean): string {
  return setCookieHeader(stashCookieName(secure, slot), encodeStash(s), { secure, maxAge: STASH_MAX_AGE_SECONDS });
}

export type SessionLike = { id: string; userId: string; email: string; name: string | null; createdAt: Date; expiresAt: Date };

/** Build the record that parks the active account. Null when it has no complete cookie material. */
export function buildStash(header: string | null | undefined, names: AuthCookieNames, sess: SessionLike, remember: boolean, now = Date.now()): Stash | null {
  const m = activeMaterial(header, names);
  if (!m) return null;
  return { v: 1, u: sess.userId, e: sess.email.trim().toLowerCase(), n: sess.name, sid: sess.id, t: m.t, d: m.d, dr: m.dr, r: remember && !m.dr, ca: sess.createdAt.getTime() || now, x: sess.expiresAt.getTime() || now + STASH_MAX_AGE_SECONDS * 1000, s: now };
}
