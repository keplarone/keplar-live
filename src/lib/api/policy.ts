/**
 * Public API (BETA): scopes, per-plan key policy and the stated limits. Pure and client-safe.
 *
 * Free is available with strict limits and OpenRouter `:free` models only (the publisher's Free workspace already
 * enforces that). Paid plans use the same credits, rolling windows and spend caps as the app, plus the per-key
 * limits below, which only ever make things stricter.
 * TODO(founder approval): the per-key numbers are proposals, like the plan allowances in src/lib/orchestration/plans.ts.
 */
import type { PlanId } from "@/lib/create/platform/plans";

export const API_SCOPES = ["ask", "usage"] as const;
export type ApiScope = (typeof API_SCOPES)[number];
export const SCOPE_BLURB: Record<ApiScope, string> = {
  ask: "Ask questions: POST /api/v1/ask (including streaming). Spends your plan's credits.",
  usage: "Read usage: GET /api/v1/usage (plan, credits left, this key's counters). Spends nothing.",
};
export const isScope = (v: unknown): v is ApiScope => typeof v === "string" && (API_SCOPES as readonly string[]).includes(v);

export type ApiPlanPolicy = {
  available: boolean;
  /** Active (not revoked) keys at once. */
  maxKeys: number;
  /** Requests per minute, per key. */
  keyPerMinute: number;
  /** Requests per rolling day, per key. */
  keyPerDay: number;
};

export const API_POLICY: Record<PlanId, ApiPlanPolicy> = {
  free: { available: true, maxKeys: 1, keyPerMinute: 2, keyPerDay: 30 },
  lite: { available: true, maxKeys: 2, keyPerMinute: 6, keyPerDay: 100 },
  plus: { available: true, maxKeys: 5, keyPerMinute: 15, keyPerDay: 400 },
  pro: { available: true, maxKeys: 10, keyPerMinute: 30, keyPerDay: 1500 },
  business: { available: true, maxKeys: 25, keyPerMinute: 60, keyPerDay: 5000 },
};
export const apiAvailable = (plan: PlanId) => API_POLICY[plan].available;

export const KEY_PREFIX = "kpl_";
export const KEY_NAME_MAX = 40;
export const API_ASK_LIMITS = { questionChars: 8_000, historyTurns: 10, historyTurnChars: 4_000 } as const;
export const KEY_EXPIRY_CHOICES = [30, 90, 365] as const;

export const API_STATEMENT =
  "The API is in beta. Free keys are limited and use OpenRouter :free models only. Paid plans (Lite and above) use your plan's models and credits. An API answer is metered exactly like an app answer and counts against the same credits, rolling limits and spend caps. Per key, on top of that: requests per minute and per day, and a limit on active keys.";
