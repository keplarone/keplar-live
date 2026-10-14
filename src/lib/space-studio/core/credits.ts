// Synced from keplarone/space-studio src/core — edit there, then copy.
/**
 * Space Studio credits: what each plan includes, what things cost, and the fair-use rules. Shared by the app (display) and
 * keplar.one (enforcement). Every balance is computed on the server from its own usage records; nothing a client sends is an input.
 *
 * One credit is one US cent of model cost for the work actually done, so a credit means the same thing on every model.
 * Plan prices sit above the credits they include to cover cloud compute, storage, payment fees and support.
 */
import type { ModelId, PlanId } from "./models";

export const USD_PER_CREDIT = 0.01;

/** Credits for a finished request: what it actually cost, rounded up to a whole credit (minimum 1 when anything ran). */
export function creditsFor(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.max(1, Math.ceil(usd / USD_PER_CREDIT - 1e-9));
}

export const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Free: a 5-hour limit and a weekly limit. Paid: a monthly allowance with one month of rollover. */
export type CreditAllowance =
  | { kind: "windows"; perFiveHours: number; perWeek: number }
  | { kind: "monthly"; perMonth: number; rollover: boolean }
  | { kind: "custom" };

export type PlanPrice = { monthlyUsd: number | null; yearlyUsd: number | null; perSeat: boolean };

export const ALLOWANCES: Record<PlanId, CreditAllowance> = {
  free: { kind: "windows", perFiveHours: 30, perWeek: 120 },
  plus: { kind: "monthly", perMonth: 500, rollover: true },
  pro: { kind: "monthly", perMonth: 1_500, rollover: true },
  team: { kind: "monthly", perMonth: 3_000, rollover: true },
  enterprise: { kind: "custom" },
};

/**
 * Prices, set from the credits each plan includes at full use: Plus and Pro keep at least about 40% after model cost, cloud
 * compute and payment fees even if every credit is spent; most subscribers use well under their allowance. Yearly is ten months.
 */
export const PRICES: Record<PlanId, PlanPrice> = {
  free: { monthlyUsd: 0, yearlyUsd: 0, perSeat: false },
  plus: { monthlyUsd: 12, yearlyUsd: 120, perSeat: false },
  pro: { monthlyUsd: 32, yearlyUsd: 320, perSeat: false },
  team: { monthlyUsd: 60, yearlyUsd: 600, perSeat: true },
  enterprise: { monthlyUsd: null, yearlyUsd: null, perSeat: true },
};

/** Extra credits for paid plans, used only after the plan's own credits. Valid for 12 months. */
export const CREDIT_PACKS = [
  { id: "pack_500", credits: 500, usd: 8 },
  { id: "pack_1500", credits: 1_500, usd: 22 },
  { id: "pack_5000", credits: 5_000, usd: 70 },
] as const;

/** A typical medium-effort task, for planning only. Real tasks are charged for what they actually use. */
export const TYPICAL_CREDITS: Record<ModelId, number> = { orbit: 3, nebula: 12, solar: 40, nova: 90 };

export const FAIR_RULES = [
  "You pay for what a task actually used, rounded up to a whole credit. Nothing is charged for a failed or discarded answer.",
  "A task never costs more than you have left: its length is capped to your remaining credits before it starts.",
  "Unused monthly credits carry over to the next month, up to one month's allowance.",
  "Free includes a 5-hour limit and a weekly limit, so everyone gets a fair share. Both reset on their own.",
  "Credit packs are used only after your plan's credits, and last 12 months.",
] as const;

/** Window ids. Fixed UTC-aligned windows, so a reset time can always be shown. */
export const fiveHourWindow = (now: number) => Math.floor(now / FIVE_HOURS_MS);
export const weekWindow = (now: number) => Math.floor((now - 4 * 24 * 60 * 60 * 1000) / WEEK_MS); // weeks start Monday 00:00 UTC
export const monthWindow = (now: number) => new Date(now).toISOString().slice(0, 7);
export function previousMonth(now: number): string {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
}

/** Used credits per window, as the server's records read them. */
export type CreditUsage = { fiveHour: number; week: number; month: number; previousMonth: number };

export type CreditBalance = {
  plan: PlanId;
  remaining: number;
  /** The limit that binds right now. */
  limitedBy: "five_hours" | "week" | "month" | "custom";
  resetsAt: string | null;
  windows: { label: string; used: number; limit: number; resetsAt: string }[];
};

const nonNeg = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** What a workspace has left. Pure: the server passes its own usage records and the effective plan. */
export function creditBalance(plan: PlanId, used: CreditUsage, now: number): CreditBalance {
  const a = ALLOWANCES[plan];
  if (a.kind === "custom") return { plan, remaining: Number.MAX_SAFE_INTEGER, limitedBy: "custom", resetsAt: null, windows: [] };
  if (a.kind === "windows") {
    const fiveReset = new Date((fiveHourWindow(now) + 1) * FIVE_HOURS_MS).toISOString();
    const weekReset = new Date((weekWindow(now) + 1) * WEEK_MS + 4 * 24 * 60 * 60 * 1000).toISOString();
    const five = Math.max(0, a.perFiveHours - nonNeg(used.fiveHour));
    const week = Math.max(0, a.perWeek - nonNeg(used.week));
    const byWeek = week < five;
    return {
      plan, remaining: Math.min(five, week), limitedBy: byWeek ? "week" : "five_hours", resetsAt: byWeek ? weekReset : fiveReset,
      windows: [
        { label: "5-hour limit", used: Math.min(a.perFiveHours, nonNeg(used.fiveHour)), limit: a.perFiveHours, resetsAt: fiveReset },
        { label: "Weekly limit", used: Math.min(a.perWeek, nonNeg(used.week)), limit: a.perWeek, resetsAt: weekReset },
      ],
    };
  }
  const d = new Date(now);
  const monthReset = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
  // Rollover: what last month's own allowance left unused, at most one allowance. It never compounds beyond that.
  const carry = a.rollover ? Math.max(0, Math.min(a.perMonth, a.perMonth - nonNeg(used.previousMonth))) : 0;
  const limit = a.perMonth + carry;
  return {
    plan, remaining: Math.max(0, limit - nonNeg(used.month)), limitedBy: "month", resetsAt: monthReset,
    windows: [{ label: carry ? `This month (incl. ${carry.toLocaleString("en-US")} carried over)` : "This month", used: Math.min(limit, nonNeg(used.month)), limit, resetsAt: monthReset }],
  };
}

/** Plain-language reason a request can't start, or null. */
export function outOfCreditsReason(b: CreditBalance, now: number): string | null {
  if (b.remaining > 0) return null;
  const when = b.resetsAt ? relative(Date.parse(b.resetsAt) - now) : "soon";
  if (b.limitedBy === "five_hours") return `You've reached the Free 5-hour limit. It resets ${when}.`;
  if (b.limitedBy === "week") return `You've reached the Free weekly limit. It resets ${when}.`;
  return `This month's credits are used up. They renew ${when}.`;
}

function relative(ms: number): string {
  if (!(ms > 0)) return "now";
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `in ${hours} h`;
  return `in ${Math.round(hours / 24)} days`;
}
