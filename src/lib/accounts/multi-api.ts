/**
 * The multi-account operations behind /api/account/accounts (list, switch, sign out, sign out of all, remove).
 * Each returns a status, a JSON body and the Set-Cookie header values to send; the route only wires them to HTTP.
 * Nothing here ever returns a token: the browser sees emails, names and slots.
 */
import { auth, getSession } from "./auth";
import { persistenceEnabled, revokeSession } from "./persist";
import { SESSION_COOKIE_MAX_AGE } from "./session-cookies";
import { forgetSession, guardSession } from "./session-guard";
import {
  activateHeaders, buildStash, clearActiveHeaders, clearCookieHeader, parkHeader, parseCookies, readParked, stashCookieName,
  type AuthCookieNames, type Parked, type Slot, type Stash, SLOTS,
} from "./multi";

export type AccountView = { slot: number; email: string; name: string | null; expired: boolean };
export type Result = { status: number; body: Record<string, unknown>; cookies: string[] };

const done = (body: Record<string, unknown> = {}, cookies: string[] = [], status = 200): Result => ({ status, body: { ok: status < 400, ...body }, cookies });

async function env(req: Request) {
  const ctx = await auth.$context;
  const c = ctx.authCookies;
  const names: AuthCookieNames = { sessionToken: c.sessionToken.name, sessionData: c.sessionData.name, dontRemember: c.dontRememberToken.name };
  const secure = names.sessionToken.startsWith("__Secure-");
  const cookie = req.headers.get("cookie");
  return { names, secure, cookie, parked: readParked(cookie, secure) };
}

/** Is this parked account's session still good (not expired, not revoked, not signed out everywhere)? */
export async function parkedAlive(s: Stash, headers: Headers): Promise<boolean> {
  if (s.x <= Date.now()) return false;
  const ok = await guardSession({ session: { id: s.sid, userId: s.u, createdAt: new Date(s.ca), expiresAt: new Date(s.x) }, user: { id: s.u, email: s.e, name: s.n } }, headers);
  return Boolean(ok);
}

async function revoke(sessionId: string) {
  forgetSession(sessionId);
  if (!persistenceEnabled()) return;
  try { await revokeSession(sessionId); } catch { console.error("[auth] could not revoke a session record"); }
}

export async function listAccounts(req: Request): Promise<Result> {
  const { parked } = await env(req);
  const active = await getSession(req.headers);
  const accounts: AccountView[] = [];
  for (const p of parked) accounts.push({ slot: p.slot, email: p.stash.e, name: p.stash.n, expired: !(await parkedAlive(p.stash, req.headers)) });
  accounts.sort((a, b) => a.slot - b.slot);
  return done({ active: active ? { email: active.user.email.toLowerCase(), name: active.user.name || null } : null, accounts });
}

/** The cookies that park the currently active account into `slot` (or just free the slot when there is nothing to park). */
async function parkActive(req: Request, slot: Slot, e: Awaited<ReturnType<typeof env>>): Promise<string[]> {
  const active = await getSession(req.headers);
  if (!active) return [clearCookieHeader(stashCookieName(e.secure, slot), e.secure)];
  const remember = !parseCookies(e.cookie).has(e.names.dontRemember);
  const stash = buildStash(e.cookie, e.names, { id: active.session.id, userId: active.user.id, email: active.user.email, name: active.user.name || null, createdAt: new Date(active.session.createdAt), expiresAt: new Date(active.session.expiresAt) }, remember);
  return [stash ? parkHeader(slot, stash, e.secure) : clearCookieHeader(stashCookieName(e.secure, slot), e.secure)];
}

export async function switchTo(req: Request, slot: unknown): Promise<Result> {
  const e = await env(req);
  const target = e.parked.find((p) => p.slot === slot);
  if (!target) return done({ error: "That account isn't saved on this device any more.", code: "not_found" }, [], 404);
  if (!(await parkedAlive(target.stash, req.headers))) {
    return done({ error: `${target.stash.e} was signed out. Sign in again to use it.`, code: "expired", email: target.stash.e, slot: target.slot }, [], 409);
  }
  const active = await getSession(req.headers);
  const same = active && active.user.email.toLowerCase() === target.stash.e;
  const cookies = same ? [clearCookieHeader(stashCookieName(e.secure, target.slot), e.secure)] : await parkActive(req, target.slot, e);
  cookies.push(...activateHeaders(target.stash, e.names, e.secure, SESSION_COOKIE_MAX_AGE));
  return done({ account: { email: target.stash.e, name: target.stash.n } }, cookies);
}

/** Sign out the active account only; the most recently used other account (if it is still valid) becomes active. */
export async function signOutCurrent(req: Request): Promise<Result> {
  const e = await env(req);
  const active = await getSession(req.headers);
  if (active) await revoke(active.session.id);
  const cookies = clearActiveHeaders(e.names, e.secure);
  const candidates: Parked[] = [...e.parked].sort((a, b) => b.stash.s - a.stash.s);
  for (const p of candidates) {
    if (!(await parkedAlive(p.stash, req.headers))) continue;
    cookies.push(...activateHeaders(p.stash, e.names, e.secure, SESSION_COOKIE_MAX_AGE), clearCookieHeader(stashCookieName(e.secure, p.slot), e.secure));
    return done({ promoted: { email: p.stash.e, name: p.stash.n } }, cookies);
  }
  return done({ promoted: null }, cookies);
}

export async function signOutAll(req: Request): Promise<Result> {
  const e = await env(req);
  const active = await getSession(req.headers);
  if (active) await revoke(active.session.id);
  for (const p of e.parked) await revoke(p.stash.sid);
  const cookies = [...clearActiveHeaders(e.names, e.secure), ...SLOTS.map((s) => clearCookieHeader(stashCookieName(e.secure, s), e.secure))];
  return done({}, cookies);
}

/** Forget one saved account on this device (ends its session too). */
export async function removeSaved(req: Request, slot: unknown): Promise<Result> {
  const e = await env(req);
  const target = e.parked.find((p) => p.slot === slot);
  if (!target) return done({}, SLOTS.map((s) => (s === slot ? clearCookieHeader(stashCookieName(e.secure, s), e.secure) : "")).filter(Boolean));
  await revoke(target.stash.sid);
  return done({}, [clearCookieHeader(stashCookieName(e.secure, target.slot), e.secure)]);
}

/** For server-rendered pages (sign-in): the other accounts still signed in on this device. Emails and names only. */
export async function savedAccounts(headers: Headers): Promise<{ slot: number; email: string; name: string | null }[]> {
  try {
    const ctx = await auth.$context;
    const secure = ctx.authCookies.sessionToken.name.startsWith("__Secure-");
    const out: { slot: number; email: string; name: string | null }[] = [];
    for (const p of readParked(headers.get("cookie"), secure)) if (await parkedAlive(p.stash, headers)) out.push({ slot: p.slot, email: p.stash.e, name: p.stash.n });
    return out;
  } catch {
    return [];
  }
}
