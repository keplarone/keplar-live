/** Cookies and request helpers for the referral routes. Kept out of the route files (Next route modules may only export handlers). */
import { randomBytes } from "node:crypto";
import { site } from "@/lib/site";
import { DEV_COOKIE, REF_COOKIE, REF_FLAG_COOKIE } from "./config";

export function cookieOf(req: Request, name: string): string | null {
  const m = (req.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(`${name}=`));
  if (!m) return null;
  try {
    return decodeURIComponent(m.slice(name.length + 1)) || null;
  } catch {
    return null;
  }
}

const secure = (req: Request) => new URL(req.url).protocol === "https:" || process.env.NODE_ENV === "production";
function set(req: Request, name: string, value: string, maxAge: number, httpOnly: boolean) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${httpOnly ? "; HttpOnly" : ""}${secure(req) ? "; Secure" : ""}`;
}

export const REF_DAYS = 30;
/** Cookies set when someone opens an invite link: the code (HttpOnly), a readable "claim once" flag without the code, and a random browser id if there is none yet. */
export function inviteCookies(req: Request, code: string): string[] {
  const out = [set(req, REF_COOKIE, code, REF_DAYS * 86400, true), set(req, REF_FLAG_COOKIE, "1", REF_DAYS * 86400, false)];
  if (!cookieOf(req, DEV_COOKIE)) out.push(set(req, DEV_COOKIE, randomBytes(16).toString("hex"), 365 * 86400, true));
  return out;
}
/** A signed-in person opening their own invite panel gets the browser id too, so a later claim from the same browser can be recognised. */
export const deviceCookie = (req: Request): string[] => (cookieOf(req, DEV_COOKIE) ? [] : [set(req, DEV_COOKIE, randomBytes(16).toString("hex"), 365 * 86400, true)]);
export const clearInviteCookies = (req: Request): string[] => [set(req, REF_COOKIE, "", 0, true), set(req, REF_FLAG_COOKIE, "", 0, false)];

export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
export const originFor = (req: Request) => (process.env.NODE_ENV === "production" ? site.url : new URL(req.url).origin);

export function withCookies(res: Response, cookies: string[]): Response {
  for (const c of cookies) res.headers.append("set-cookie", c);
  return res;
}
