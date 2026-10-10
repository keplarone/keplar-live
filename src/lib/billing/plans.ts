/** Keplar's paid plans, sold through Whop (see ./whop.ts). */
import type { PlanId } from "@/lib/create/platform/plans";

export type PaidPlan = "lite" | "plus" | "pro";

export const PAID_PLANS: Record<PaidPlan, { name: string; usdMonthly: number; productKey: string }> = {
  lite: { name: "Keplar Lite", usdMonthly: 20, productKey: "keplar-lite" },
  plus: { name: "Keplar Plus", usdMonthly: 45, productKey: "keplar-plus" },
  pro: { name: "Keplar Pro", usdMonthly: 99, productKey: "keplar-pro" },
};

/**
 * Whop plan IDs for the embedded checkout. Defaults are the live plans; set WHOP_PLAN_ID_PLUS / WHOP_PLAN_ID_PRO to override.
 * The price is defined on the Whop plan itself (the embed cannot assert an amount).
 */
/** Lite has no built-in default: it is sold only once WHOP_PLAN_LITE (or WHOP_PLAN_ID_LITE) is set, so its checkout stays hidden until then. */
export const DEFAULT_WHOP_PLAN_IDS: Record<Exclude<PaidPlan, "lite">, string> = { plus: "plan_wd9Xs4iDlwvDi", pro: "plan_M6ztgSJDucMJA" };
const PLAN_ID_RE = /^plan_[A-Za-z0-9]{6,40}$/;

/** The embedded-checkout plan id for a tier, or null when none is set (then the hosted checkout is used). */
export function embedPlanId(plan: PaidPlan): string | null {
  const e = process.env;
  const v = plan === "lite" ? e.WHOP_PLAN_LITE?.trim() || e.WHOP_PLAN_ID_LITE?.trim() || "" : e[plan === "plus" ? "WHOP_PLAN_ID_PLUS" : "WHOP_PLAN_ID_PRO"]?.trim() || DEFAULT_WHOP_PLAN_IDS[plan];
  return PLAN_ID_RE.test(v) ? v : null;
}

/** Which tier a Whop plan id sells. Authoritative for embedded payments (browser metadata is never trusted for the tier). */
export function planForWhopPlanId(id: unknown): PaidPlan | null {
  if (typeof id !== "string" || !id) return null;
  for (const p of ["lite", "plus", "pro"] as const) if (embedPlanId(p)?.toLowerCase() === id.toLowerCase()) return p; // Whop resolves ids case-insensitively; match the same way
  return null;
}

export const isPaidPlan = (p: unknown): p is PaidPlan => p === "lite" || p === "plus" || p === "pro";

export const asPlanId = (p: unknown): PlanId | null => (p === "free" || p === "lite" || p === "plus" || p === "pro" || p === "business" ? p : null);
