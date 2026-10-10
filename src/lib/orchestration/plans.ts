/**
 * Keplar Usage plan allowances: the single source of truth for metering.
 *
 * TODO(founder approval): these figures are a PROPOSAL from the unit-economics
 * research (/workspace/research/unit-economics-2026-09-27.md §4) and are not
 * approved. Change them here only; the /app meter, limit state and Deep
 * Research estimate all read from this module.
 *
 * Rules that must hold whatever the numbers are:
 * - Meter by actual provider cost (usage.cost, catalog estimate when a
 *   provider reports none), converted with `toUnits` (1 unit = $0.002, see compute.ts).
 * - Users see units as a meter and a reset date. Never tokens or dollars.
 * - A limit stops the request before it starts. There is no silent
 *   fallback to cheaper models when an allowance runs out.
 */
import { brand } from "@/lib/site";
import { toUnits } from "./compute";

export type PlanId = "free" | "lite" | "plus" | "pro" | "business";

export type PlanAllowance = {
  id: PlanId;
  name: string;
  /** credits per billing month; null = no fixed allowance (Free runs on $0 open models; Business is a custom contract). */
  monthlyUnits: number | null;
  /** Provider-cost budget the units represent (internal only; never shown). */
  monthlyBudgetUsd: number | null;
  /** Which models the plan can route to. "free-only" = $0 OpenRouter `:free` models (free-guard.ts). */
  models: "free-only" | "all";
  deepResearch: boolean;
};

/** TODO(founder approval): proposed allowances, not final. */
export const PLAN_ALLOWANCES: Record<PlanId, PlanAllowance> = {
  free: { id: "free", name: brand.plans.free, monthlyUnits: null, monthlyBudgetUsd: 0, models: "free-only", deepResearch: false },
  // Lite ($20): 2,400 credits = $4.80 of provider cost (24% of price, below Plus 26.7% / Pro 27.3%), so fees + hosting + the 10% meter margin still leave >= 70% gross margin. No Deep Research (one typical run is half the month).
  lite: { id: "lite", name: brand.plans.lite, monthlyUnits: 2_400, monthlyBudgetUsd: 4.8, models: "all", deepResearch: false },
  plus: { id: "plus", name: brand.plans.plus, monthlyUnits: 6_000, monthlyBudgetUsd: 12, models: "all", deepResearch: true },
  pro: { id: "pro", name: brand.plans.pro, monthlyUnits: 13_500, monthlyBudgetUsd: 27, models: "all", deepResearch: true },
  business: { id: "business", name: brand.plans.business, monthlyUnits: null, monthlyBudgetUsd: null, models: "all", deepResearch: true },
};

/**
 * Rolling usage limits for subscribed plans, on top of the monthly credits. Metered in credits
 * (real provider cost x METER_MARGIN) by the same ledger charge, enforced server-side from the
 * Neon-backed store (platform/windows.ts), so they hold across serverless instances.
 *
 * A window opens with the first charge after the previous one ended and closes after `ms`
 * (5 hours / 7 days). Credits used inside it count against its limit; when it closes the
 * counter starts again. The admin account (team@keplar.one) is exempt and keeps its daily USD
 * cap. Failed / no-response runs are never charged, so they never count.
 * TODO(founder approval): proposed numbers, not final. Change them here only.
 */
export type WindowId = "fiveHour" | "weekly";
export const USAGE_WINDOWS: Record<WindowId, { id: WindowId; label: string; ms: number }> = {
  fiveHour: { id: "fiveHour", label: "5-hour", ms: 5 * 60 * 60 * 1000 },
  weekly: { id: "weekly", label: "Weekly", ms: 7 * 24 * 60 * 60 * 1000 },
};
/** Credits per window. Plans not listed (Free, Business, admin) have no rolling limits. */
export const WINDOW_LIMITS: Partial<Record<PlanId, Record<WindowId, number>>> = {
  lite: { fiveHour: 400, weekly: 1_280 },
  plus: { fiveHour: 1_000, weekly: 3_200 },
  pro: { fiveHour: 2_250, weekly: 7_200 },
};
/** Show the "nearly at your limit" warning from this share used. */
export const WINDOW_WARN_AT = 0.8;

export const windowLimitsFor = (plan: PlanId): Record<WindowId, number> | null => WINDOW_LIMITS[plan] ?? null;

/** "3h 20m", "45m", "2d 4h" until `iso`; "under a minute" when it is about to reset. */
export function formatResetIn(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - now;
  if (!(ms > 60_000)) return "under a minute";
  const mins = Math.ceil(ms / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

/** "Mon" (the weekday the window resets), in the viewer's time zone. */
export function formatResetDay(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short" });
}

/** "resets in 3h 20m" for the 5-hour window, "resets Mon" for the weekly one. */
export function windowResetText(id: WindowId, iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "starts when you next ask";
  return id === "weekly" ? `resets ${formatResetDay(iso)}` : `resets in ${formatResetIn(iso, now)}`;
}

/**
 * Typical Deep Research run (research §2d: ~$2.38 typical, $0.80–$6.84 range).
 * Used for the "about N runs left" hint and the pre-send check. A real run is
 * still metered at its actual cost.
 * TODO(founder approval): estimate, not a price.
 */
export const DEEP_RESEARCH_ESTIMATE_USD = 2.4;
export const DEEP_RESEARCH_UNITS = toUnits(DEEP_RESEARCH_ESTIMATE_USD);

export function allowanceFor(plan: PlanId): number {
  return PLAN_ALLOWANCES[plan].monthlyUnits ?? Infinity;
}

/**
 * Billing period key (calendar months; the server meter uses the subscription period).
 */
export function periodKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** When the current period's allowance resets (start of next calendar month, local time). */
export function nextReset(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export function formatReset(d = new Date()): string {
  return nextReset(d).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

/** Reset date from the server meter (billing-period end); falls back to the calendar month. */
export function formatResetAt(iso?: string | null): string {
  if (!iso) return formatReset();
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

/** Whole Deep Research runs the remaining units cover (typical-cost estimate). */
export function deepResearchRunsLeft(remainingUnits: number): number {
  if (!Number.isFinite(remainingUnits)) return Infinity;
  return Math.max(0, Math.floor(remainingUnits / DEEP_RESEARCH_UNITS));
}

/** Plans with more compute than `plan`, for the upgrade option. */
export function upgradesFrom(plan: PlanId): PlanAllowance[] {
  const order: PlanId[] = ["free", "lite", "plus", "pro", "business"];
  return order.slice(order.indexOf(plan) + 1).map((id) => PLAN_ALLOWANCES[id]);
}
