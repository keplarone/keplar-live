/**
 * Keplar Business plans (sold on business.keplar.one, used in the Keplar desktop app).
 *
 * Every Business tier grants the account the "business" plan. WHICH tier was bought comes from the Whop plan id that was
 * paid for (stored on the workspace as billing.lookupKey), never from the browser; the tier then sets the allowances
 * (tierEntitlements, applied in src/lib/create/platform/workspace.ts). Enterprise is sold by contract through an inquiry.
 *
 * Unit economics (credits are metered at real provider cost x METER_MARGIN 1.1; 1 credit = $0.002 of metered cost):
 *   Prices were raised (Oct 2026) with the same perks, for margin: a customer who spends every credit costs ~25% of the price in
 *   model spend (it was ~37%),
 *   leaving room for Whop fees (~3-5%), hosting, storage, video/image providers' own metering and support:
 *     Starter $199.99 -> 30,000 credits  = $60 metered ($54.5 provider cost)   = 27% of price
 *     Growth  $499.99 -> 70,000 credits  = $140 metered ($127 provider cost)   = 25% of price
 *     Scale   $2,999.99 -> 400,000 credits = $800 metered ($727 provider cost) = 24% of price
 *   Automation actions are a separate meter: one action is one step an agent takes (a tool call, a message sent, a record
 *   written). They cost almost nothing to run; the model calls behind them draw credits, so an action is never "free AI".
 *   The suggested 3,000 / 15,000 / 75,000 actions are therefore kept as proposed.
 *   Images, video, deep research and deployments keep their own per-use pricing in credits (src/lib/orchestration).
 */
import { DOMAIN_LIMITS } from "@/lib/domains/limits";
import type { Entitlements } from "@/lib/create/platform/plans";

export type BusinessTier = "starter" | "growth" | "scale" | "enterprise";
export type BillingCycle = "monthly" | "annual";

export type BusinessTierSpec = {
  id: BusinessTier;
  name: string;
  /** USD per month (to the cent); null = custom contract. */
  monthly: number | null;
  /** The crossed-out list price shown above `monthly`; null when there is none. */
  listMonthly: number | null;
  audience: string;
  seats: number | null;
  activeAgents: number | null;
  actionsPerMonth: number | null;
  /** Monthly AI credits (see the unit economics above); null = negotiated. */
  credits: number | null;
  projects: number | null;
  customDomains: number;
  rpm: number;
  /** The autonomous testing swarm (Revenue Guard). Enterprise only. */
  swarm: boolean;
  includes: string[];
};

const CORE = ["Business dashboard", "Projects", "Images", "Deep Research", "Reason", "Videos", "Website and app creation", "Make an Agent", "AI Design Canvas", "Business analytics", "Knowledge and integrations"];

export const BUSINESS_TIERS: Record<BusinessTier, BusinessTierSpec> = {
  starter: {
    id: "starter", name: "Keplar Business Starter", monthly: 199.99, listMonthly: 219.99, audience: "Small businesses and startups",
    seats: 1, activeAgents: 5, actionsPerMonth: 3_000, credits: 30_000, projects: 10, customDomains: 3, rpm: 120, swarm: false,
    includes: [...CORE, "1 seat", "5 active agents", "3,000 automation actions a month", "10 projects", "High-priority AI requests", "Standard support"],
  },
  growth: {
    id: "growth", name: "Keplar Business Growth", monthly: 499.99, listMonthly: 549.99, audience: "Growing teams and agencies",
    seats: 5, activeAgents: 25, actionsPerMonth: 15_000, credits: 70_000, projects: null, customDomains: 10, rpm: 240, swarm: false,
    includes: ["Everything in Starter", "5 seats", "25 active agents", "15,000 automation actions a month", "Unlimited projects (fair use)", "Shared team workspaces", "Multi-agent workflows", "Team permissions", "Priority support"],
  },
  scale: {
    id: "scale", name: "Keplar Business Scale", monthly: 2_999.99, listMonthly: 3_349.99, audience: "Automation-intensive organizations",
    seats: 15, activeAgents: 100, actionsPerMonth: 75_000, credits: 400_000, projects: null, customDomains: 50, rpm: 600, swarm: false,
    includes: ["Everything in Growth", "15 seats", "100 active agents", "75,000 automation actions a month", "Department workspaces", "Advanced model routing", "Audit logs", "API access", "Advanced approval workflows", "Priority technical support"],
  },
  enterprise: {
    id: "enterprise", name: "Keplar Enterprise", monthly: null, listMonthly: null, audience: "Large organizations",
    seats: null, activeAgents: null, actionsPerMonth: null, credits: null, projects: null, customDomains: 200, rpm: 1_200, swarm: true,
    includes: ["Everything in Scale", "Revenue Guard: autonomous testing swarm", "Negotiated seats, usage and concurrency", "SSO / SAML and SCIM", "Custom retention and security policies", "Dedicated onboarding", "Contractual service commitments"],
  },
};

export const SELF_SERVE_TIERS = ["starter", "growth", "scale"] as const;
export type SelfServeTier = (typeof SELF_SERVE_TIERS)[number];
export const isSelfServeTier = (t: unknown): t is SelfServeTier => t === "starter" || t === "growth" || t === "scale";
export const isBillingCycle = (c: unknown): c is BillingCycle => c === "monthly" || c === "annual";

/** Annual discount in percent (BUSINESS_ANNUAL_DISCOUNT_PCT, 0-50). Default 0: a year costs exactly 12 months. */
export function annualDiscountPct(): number {
  const n = Number(process.env.BUSINESS_ANNUAL_DISCOUNT_PCT ?? "0");
  return Number.isFinite(n) && n >= 0 && n <= 50 ? Math.round(n) : 0;
}

const cents = (usd: number) => Math.round(usd * 100) / 100;

/** USD for one billing period, to the cent: the monthly price, or twelve months at the annual discount. */
export function priceFor(tier: SelfServeTier, cycle: BillingCycle, discountPct = annualDiscountPct()): number {
  const m = BUSINESS_TIERS[tier].monthly!;
  return cycle === "monthly" ? m : cents(m * 12 * (1 - discountPct / 100));
}

/** The crossed-out list price for the same period (the annual one gets the same annual discount, so the % off matches). */
export function listPriceFor(tier: SelfServeTier, cycle: BillingCycle, discountPct = annualDiscountPct()): number | null {
  const l = BUSINESS_TIERS[tier].listMonthly;
  if (l === null) return null;
  return cycle === "monthly" ? l : cents(l * 12 * (1 - discountPct / 100));
}

/** US dollars with cents, e.g. $2,999.99. */
export const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PLAN_ID_RE = /^plan_[A-Za-z0-9]{6,40}$/;
const envKey = (tier: SelfServeTier, cycle: BillingCycle) => `WHOP_PLAN_BIZ_${tier.toUpperCase()}_${cycle.toUpperCase()}`;

/** The Whop plan id that sells a tier and cycle (WHOP_PLAN_BIZ_STARTER_MONTHLY ...), or null while it is not set up. */
export function businessWhopPlanId(tier: SelfServeTier, cycle: BillingCycle, env: Record<string, string | undefined> = process.env): string | null {
  const v = env[envKey(tier, cycle)]?.trim() ?? "";
  return PLAN_ID_RE.test(v) ? v : null;
}

/** Which Business tier a Whop plan id sells (case-insensitive, as Whop resolves ids), or null. */
export function businessTierForWhopPlanId(id: unknown, env: Record<string, string | undefined> = process.env): { tier: SelfServeTier; cycle: BillingCycle } | null {
  if (typeof id !== "string" || !id) return null;
  for (const tier of SELF_SERVE_TIERS) {
    for (const cycle of ["monthly", "annual"] as const) {
      if (businessWhopPlanId(tier, cycle, env)?.toLowerCase() === id.toLowerCase()) return { tier, cycle };
    }
  }
  return null;
}

/**
 * The tier a Business workspace is on, from its billing lookup key: a self-serve Whop plan id, or "enterprise:<contract>"
 * set by an admin for a signed contract. Unknown keys fall back to Starter (the safest allowance), never to unlimited.
 */
export function businessTierOf(lookupKey: string | null | undefined, env: Record<string, string | undefined> = process.env): BusinessTier {
  if (typeof lookupKey === "string" && lookupKey.startsWith("enterprise:")) return "enterprise";
  return businessTierForWhopPlanId(lookupKey, env)?.tier ?? "starter";
}

/** Entitlements for a Business tier, on top of the business plan's base. */
export function tierEntitlements(base: Entitlements, tier: BusinessTier): Entitlements {
  const t = BUSINESS_TIERS[tier];
  return {
    ...base,
    label: t.name,
    monthlyUnits: t.credits ?? Math.max(base.monthlyUnits, BUSINESS_TIERS.scale.credits!),
    projects: t.projects ?? 1_000,
    customDomains: Math.max(t.customDomains, DOMAIN_LIMITS.business ?? 0),
    agents: t.activeAgents ?? 1_000,
    rpm: t.rpm,
  };
}

/** Whether the account has an active Business plan right now (used to show the desktop download). */
export function hasBusinessAccess(plan: string, admin = false): boolean {
  return admin || plan === "business";
}
