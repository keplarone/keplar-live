/**
 * Signed plan cookie: how a paid plan survives without a database.
 *
 * After a verified Whop purchase the server (never the browser) sets
 * `keplar_plan`: {email, plan, period} signed with HMAC-SHA256 under a key
 * derived from BETTER_AUTH_SECRET. It is HttpOnly, Secure (on https) and
 * SameSite=Lax, bound to the signed-in email, and expires with the billing
 * period (plus a short grace). With DATABASE_URL set, the stored workspace row
 * is the source of truth and this cookie is only a fallback.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { authSecret } from "@/lib/accounts/secret";
import type { PaidPlan } from "./plans";
import { isPaidPlan } from "./plans";

export const PLAN_COOKIE = "keplar_plan";
const GRACE_MS = 3 * 864e5;
const MAX_MS = 40 * 864e5;

export type PlanClaim = { plan: PaidPlan; periodStart: string; periodEnd: string; manageUrl: string | null };
type Payload = { v: 1; e: string; p: PaidPlan; ps: string; pe: string; m: string | null; exp: number };

const key = (secret: string) => createHmac("sha256", secret).update("keplar:plan-cookie:v1").digest();
const mac = (secret: string, data: string) => createHmac("sha256", key(secret)).update(data).digest("base64url");
const safeManage = (u: unknown) => (typeof u === "string" && /^https:\/\/(whop\.com|[a-z0-9-]+\.whop\.com)\//.test(u) && u.length < 300 ? u : null);

export function signPlanCookie(email: string, claim: PlanClaim, secret = authSecret(), now = Date.now()): { value: string; maxAgeSec: number } {
  const end = Date.parse(claim.periodEnd);
  const exp = Math.min(now + MAX_MS, (Number.isFinite(end) ? end : now + 30 * 864e5) + GRACE_MS);
  const payload: Payload = { v: 1, e: email.trim().toLowerCase(), p: claim.plan, ps: claim.periodStart, pe: claim.periodEnd, m: safeManage(claim.manageUrl), exp };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { value: `${body}.${mac(secret, body)}`, maxAgeSec: Math.max(60, Math.floor((exp - now) / 1000)) };
}

export function verifyPlanCookie(value: string | null | undefined, email: string, secret = authSecret(), now = Date.now()): PlanClaim | null {
  if (!value || value.length > 1200) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(mac(secret, body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  let p: Payload;
  try {
    p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload;
  } catch {
    return null;
  }
  if (p.v !== 1 || !isPaidPlan(p.p) || typeof p.exp !== "number" || p.exp < now) return null;
  if (p.e !== email.trim().toLowerCase()) return null;
  return { plan: p.p, periodStart: p.ps, periodEnd: p.pe, manageUrl: safeManage(p.m) };
}

export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export const planFromCookie = (cookieHeader: string | null | undefined, email: string | null | undefined): PlanClaim | null =>
  email ? verifyPlanCookie(readCookie(cookieHeader, PLAN_COOKIE), email) : null;

/** Set-Cookie header value. */
export function planCookieHeader(value: string, maxAgeSec: number, secure: boolean): string {
  return `${PLAN_COOKIE}=${value}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}
export const clearPlanCookieHeader = (secure: boolean) => `${PLAN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
