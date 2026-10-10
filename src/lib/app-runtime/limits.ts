/**
 * Runtime limits for generated apps, by the CREATOR's plan (read at request time, so an upgrade or downgrade applies at once).
 * Free apps are front-end only (no data, accounts, files or AI): the builder plans them that way and the API refuses.
 * Draft (preview) data is capped lower than live data.
 */
import type { PlanId } from "@/lib/create/platform/plans";

export type RuntimeLimits = {
  backend: boolean;
  ai: boolean;
  /** Records per app per environment. */
  records: number;
  /** End-user accounts per app per environment. */
  users: number;
  /** Uploaded bytes per app per environment, and per file. */
  fileBytes: number;
  maxFile: number;
  /** API requests per minute per visitor IP, and writes per minute per signed-in user. */
  reqPerMin: number;
  writesPerMin: number;
  /** AI calls per app per day, and per end user per day. */
  aiPerDay: number;
  aiPerUserDay: number;
  /** Characters of AI input per call. */
  aiInputChars: number;
  /** Max size of one record's JSON. */
  recordBytes: number;
};

export const RUNTIME_LIMITS: Record<PlanId, RuntimeLimits> = {
  free: { backend: false, ai: false, records: 0, users: 0, fileBytes: 0, maxFile: 0, reqPerMin: 60, writesPerMin: 0, aiPerDay: 0, aiPerUserDay: 0, aiInputChars: 0, recordBytes: 0 },
  lite: { backend: true, ai: false, records: 5_000, users: 300, fileBytes: 50_000_000, maxFile: 3_000_000, reqPerMin: 180, writesPerMin: 30, aiPerDay: 0, aiPerUserDay: 0, aiInputChars: 0, recordBytes: 16_000 },
  plus: { backend: true, ai: true, records: 50_000, users: 5_000, fileBytes: 200_000_000, maxFile: 4_000_000, reqPerMin: 300, writesPerMin: 60, aiPerDay: 600, aiPerUserDay: 40, aiInputChars: 12_000, recordBytes: 32_000 },
  pro: { backend: true, ai: true, records: 250_000, users: 50_000, fileBytes: 1_000_000_000, maxFile: 4_000_000, reqPerMin: 600, writesPerMin: 120, aiPerDay: 3_000, aiPerUserDay: 120, aiInputChars: 24_000, recordBytes: 64_000 },
  business: { backend: true, ai: true, records: 1_000_000, users: 250_000, fileBytes: 3_000_000_000, maxFile: 4_000_000, reqPerMin: 900, writesPerMin: 200, aiPerDay: 10_000, aiPerUserDay: 300, aiInputChars: 32_000, recordBytes: 64_000 },
};

/** Draft data is for trying the app out: smaller caps. */
export function limitsFor(plan: PlanId, env: "draft" | "live" | "qa"): RuntimeLimits {
  const l = RUNTIME_LIMITS[plan];
  if (env === "live") return l;
  return { ...l, records: Math.min(l.records, 2_000), users: Math.min(l.users, 50), fileBytes: Math.min(l.fileBytes, 30_000_000), aiPerDay: Math.min(l.aiPerDay, 150) };
}
