/**
 * CSRF / origin checks for state-changing requests.
 * A browser always sends `Origin` on cross-site POSTs; it must be ours.
 * Requests with no Origin and no Sec-Fetch-Site are not browser form posts
 * (curl, server-to-server) and are not CSRF-able, so they pass here and are
 * still subject to auth and rate limits.
 */
import { HttpError } from "@/lib/create/platform/http";
import { hostOf, isAppHost } from "@/lib/domains/routing";
import { siteUrl } from "@/lib/site";

export const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Origins allowed to call state-changing endpoints from a browser. */
export function allowedOrigins(requestUrl?: string): Set<string> {
  const set = new Set<string>([new URL(siteUrl).origin]);
  const auth = process.env.BETTER_AUTH_URL?.trim();
  if (auth) {
    try {
      set.add(new URL(auth).origin);
    } catch {
      /* ignore a malformed value */
    }
  }
  if (requestUrl && process.env.NODE_ENV !== "production") {
    try {
      set.add(new URL(requestUrl).origin);
    } catch {
      /* ignore */
    }
  }
  return set;
}

export function isSameOrigin(req: Request): boolean {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return true;
  const origin = req.headers.get("origin");
  const allowed = allowedOrigins(req.url);
  if (origin) {
    if (origin === "null") return false;
    if (allowed.has(origin)) return true;
    // Host only — never X-Forwarded-Host. Browsers forbid setting Host from script,
    // so a cross-site page cannot forge Origin+Host to match. X-Forwarded-Host is
    // not forbidden and is spoofable, which would turn this fallback into a CSRF hole.
    const host = req.headers.get("host");
    try {
      const o = new URL(origin);
      if (!host || o.host !== host) return false;
      if (o.protocol !== "https:" && process.env.NODE_ENV === "production") return false;
      // Preview deployments (*.vercel.app) and localhost: Origin may equal Host when
      // siteUrl is the production apex. Never accept a customer custom domain this way.
      return isAppHost(hostOf(req));
    } catch {
      return false;
    }
  }
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  return true;
}

export function assertSameOrigin(req: Request) {
  if (!isSameOrigin(req)) throw new HttpError(403, "Request blocked: cross-site request.", "bad_origin");
}

/** Paths under /api that legitimately receive cross-site or server-to-server POSTs. */
export const ORIGIN_EXEMPT_PREFIXES = [
  "/api/webhooks/", // signed by the sender (Whop)
  "/api/business/stripe/webhook", // signed by Stripe
  "/api/inngest", // signed by Inngest
  "/api/business/forms/", // public forms on published sites (other origin); honeypot + rate limited
  "/api/business/checkout", // "Buy" buttons on published sites (other origin); rate limited
  "/api/auth/", // Better Auth runs its own origin / CSRF checks
  "/api/v1/", // public API: bearer keys only (never cookies), so there is no ambient credential for a cross-site request to ride on
];

export const isOriginExempt = (pathname: string) => ORIGIN_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));
