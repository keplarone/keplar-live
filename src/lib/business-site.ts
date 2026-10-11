/**
 * Keplar Business is its own app on business.keplar.one: storefront, account setup, sign-in and the workspace all live there,
 * and none of it is reachable from keplar.one (src/proxy.ts sends the old keplar.one URLs over). Same codebase, same deploy,
 * same Keplar account (sign-in hands the session over, src/lib/business/handoff.ts); separate plans and billing.
 *
 * Public paths on the Business host map onto internal routes under /biz (src/app/(business)/biz, src/app/(business-app)/biz):
 *   /         → /biz          storefront
 *   /account  → /biz/account   business account setup and plan checkout
 *   /work     → /biz/work      the workspace
 *   /signin   → /biz/signin    starts the sign-in handoff from keplar.one
 */
import { BUSINESS_HOST } from "@/lib/site";

export const BUSINESS_URL = (
  process.env.NEXT_PUBLIC_BUSINESS_URL ||
  (process.env.NODE_ENV === "production" ? `https://${BUSINESS_HOST}` : "http://business.localhost:3000")
).replace(/\/$/, "");

/** Old Keplar One app views that now belong to Business (sidebar links, /app/business, /app/agents, /app/approvals). */
export const BUSINESS_VIEWS = new Set(["business", "agents", "approvals"]);

/** Internal route prefix for Business pages (src/app/(business)/biz, src/app/(business-app)/biz); never served on keplar.one. */
export const BUSINESS_PREFIX = "/biz";

/** Hosts that serve the Business app: production, a configured override, and business.localhost for local dev. */
export function isBusinessHost(host: string): boolean {
  if (host === BUSINESS_HOST || host === "business.localhost") return true;
  try {
    return host === new URL(BUSINESS_URL).hostname;
  } catch {
    return false;
  }
}

/** The public Business URL for a path ("/work" → https://business.keplar.one/work). */
export const businessUrl = (path = "/") => `${BUSINESS_URL}${path.startsWith("/") ? path : `/${path}`}`;

/** A relative, same-app path safe to redirect to after sign-in ("/work?x=1"); anything else becomes "/work". */
export function safeBusinessNext(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\") || /[\u0000-\u001f]/.test(v) || v.length > 512) return "/work";
  if (v.startsWith(`${BUSINESS_PREFIX}/`) || v === BUSINESS_PREFIX || v.startsWith("/api/")) return "/work";
  return v;
}
