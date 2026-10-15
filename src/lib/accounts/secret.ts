/**
 * The one server secret (BETTER_AUTH_SECRET): keys sessions, magic links and
 * the signed plan cookie. Never imported by client code.
 * Production without it: a random per-process secret is used (so nothing is
 * forgeable; sessions and links just don't survive a restart or reach another instance),
 * an error is logged on every instance, and GET /api/health reports failure (503)
 * so monitoring catches it. It deliberately does not throw at import time: that would
 * also break `next build` and every page that never touches a session.
 */
import { randomBytes } from "node:crypto";

const DEV_SECRET = "keplar-dev-only-secret-change-me-0123456789abcdef";
let cached: string | null = null;

type Env = Record<string, string | undefined>;

/** BETTER_AUTH_SECRET is set and long enough to key sessions across restarts. Never returns the secret. */
export const authSecretConfigured = (env: Env = process.env): boolean => (env.BETTER_AUTH_SECRET?.trim() ?? "").length >= 16;

/** A deployment that serves real users (Vercel production, or a production server), as opposed to a build, a test or a dev server. */
export function isProductionRuntime(env: Env = process.env): boolean {
  if (env.NEXT_PHASE === "phase-production-build" || env.NODE_ENV === "test") return false;
  return env.VERCEL_ENV === "production" || env.NODE_ENV === "production";
}

/** True when this deployment is running on a temporary random secret: production with no usable BETTER_AUTH_SECRET. */
export const authSecretMissingInProduction = (env: Env = process.env): boolean => isProductionRuntime(env) && !authSecretConfigured(env);

export function authSecret(): string {
  if (cached) return cached;
  const env = process.env.BETTER_AUTH_SECRET?.trim();
  if (env && env.length >= 16) return (cached = env);
  if (process.env.NODE_ENV === "production") {
    if (process.env.NEXT_PHASE !== "phase-production-build") console.error("[auth] CRITICAL: BETTER_AUTH_SECRET is missing or too short. Using a temporary per-instance secret: sign-ins and links break on every restart and across instances. /api/health reports 503 until it is set.");
    return (cached = randomBytes(32).toString("hex"));
  }
  return (cached = DEV_SECRET);
}
