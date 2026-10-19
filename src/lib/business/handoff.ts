/**
 * Sign-in handoff from keplar.one to business.keplar.one: one Keplar account, a separate session cookie per app.
 * Keplar One's cookies stay host-only on keplar.one; Business gets its own on business.keplar.one.
 *
 *   1. business.keplar.one/signin   sets a random nonce in an HttpOnly cookie (Business host only) and sends the browser to
 *                                  keplar.one/api/business/handoff?n=<sha256(nonce)>&next=/work
 *   2. keplar.one (signed in; if not, through its normal /signin first) signs a ticket {user, email, name, n, exp 60 s,
 *                                  and when that Keplar session signed in, so the Business session inherits its sign-in time}
 *                                  and sends the browser to business.keplar.one/api/auth/business/finish?t=<ticket>&next=…
 *   3. business.keplar.one          checks the signature, the expiry and that sha256(its nonce cookie) is n, then issues the
 *                                  Business session cookie and clears the nonce.
 *
 * The nonce binds a ticket to the browser that started the sign-in: a ticket on its own (leaked, or sent to someone in a link)
 * signs nobody in, so it can't be used to log a victim into an attacker's account. Replaying it in the same browser within
 * the minute only signs that person in again. Pure: no I/O.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const HANDOFF_NONCE_COOKIE = "kb_handoff";
/** True when a sign-in will continue to the Business handoff, so the shared sign-in page can wear the Business look. */
export const isBusinessHandoff = (next: string): boolean => next.startsWith("/api/business/handoff");
export const NONCE_TTL_SECONDS = 10 * 60;
export const TICKET_TTL_SECONDS = 60;

export type HandoffUser = { userId: string; email: string; name: string | null; /** When the keplar.one session signed in (epoch ms). */ authAt?: number | null };

const B64URL = /^[A-Za-z0-9_-]+$/;
export const newNonce = (): string => randomBytes(32).toString("base64url");
export const nonceHash = (nonce: string): string => createHash("sha256").update(nonce).digest("base64url");
export const isNonceHash = (v: unknown): v is string => typeof v === "string" && v.length === 43 && B64URL.test(v);

const mac = (secret: string, payload: string) => createHmac("sha256", `business-handoff:${secret}`).update(payload).digest("base64url");

export function signTicket(secret: string, user: HandoffUser, n: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ u: user.userId, e: user.email, nm: user.name, n, x: Math.floor(now / 1000) + TICKET_TTL_SECONDS, ...(typeof user.authAt === "number" ? { a: user.authAt } : {}) })).toString("base64url");
  return `${payload}.${mac(secret, payload)}`;
}

export type TicketCheck = { ok: true; user: HandoffUser } | { ok: false; reason: "invalid" | "expired" | "wrong_browser" };

export function verifyTicket(secret: string, ticket: unknown, nonceCookie: string | null | undefined, now = Date.now()): TicketCheck {
  if (typeof ticket !== "string" || ticket.length > 2048) return { ok: false, reason: "invalid" };
  const [payload, sig, extra] = ticket.split(".");
  if (!payload || !sig || extra !== undefined || !B64URL.test(payload) || !B64URL.test(sig)) return { ok: false, reason: "invalid" };
  const want = Buffer.from(mac(secret, payload));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: "invalid" };
  let p: { u?: unknown; e?: unknown; nm?: unknown; n?: unknown; x?: unknown; a?: unknown };
  try {
    p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (typeof p.u !== "string" || typeof p.e !== "string" || !p.e.includes("@") || !isNonceHash(p.n) || typeof p.x !== "number") return { ok: false, reason: "invalid" };
  if (p.x * 1000 < now) return { ok: false, reason: "expired" };
  if (!nonceCookie || nonceHash(nonceCookie) !== p.n) return { ok: false, reason: "wrong_browser" };
  return { ok: true, user: { userId: p.u, email: p.e, name: typeof p.nm === "string" ? p.nm : null, authAt: typeof p.a === "number" && Number.isFinite(p.a) ? p.a : null } };
}

/** The value of one cookie on a request, or null. */
export function cookieValue(headers: Headers | null | undefined, name: string): string | null {
  for (const part of (headers?.get("cookie") ?? "").split(/;\s*/)) {
    if (part.startsWith(`${name}=`)) return decodeURIComponent(part.slice(name.length + 1)) || null;
  }
  return null;
}
