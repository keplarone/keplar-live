/**
 * The one server secret (BETTER_AUTH_SECRET): keys sessions, magic links and
 * the signed plan cookie. Never imported by client code.
 * Production without it: a random per-process secret is used (so nothing is
 * forgeable; sessions and links just don't survive a restart) and an error is logged.
 */
import { randomBytes } from "node:crypto";

const DEV_SECRET = "keplar-dev-only-secret-change-me-0123456789abcdef";
let cached: string | null = null;

export function authSecret(): string {
  if (cached) return cached;
  const env = process.env.BETTER_AUTH_SECRET?.trim();
  if (env && env.length >= 16) return (cached = env);
  if (process.env.NODE_ENV === "production") {
    if (process.env.NEXT_PHASE !== "phase-production-build") console.error("[auth] BETTER_AUTH_SECRET is missing or too short. Using a temporary secret; set it in the environment.");
    return (cached = randomBytes(32).toString("hex"));
  }
  return (cached = DEV_SECRET);
}
