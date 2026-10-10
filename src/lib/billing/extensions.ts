/**
 * Limit extensions: one-time credit packs for paid plans, sold through Whop.
 *
 * Nothing here edits an existing Whop plan. The founder creates one separate ONE-TIME Whop product/plan per pack and puts its
 * plan id in the environment (WHOP_EXTENSION_PLAN_SMALL / WHOP_EXTENSION_PLAN_MEDIUM). A pack with no plan id is "unavailable":
 * users never see a Buy button for it. The price lives on the Whop plan; the credits a pack grants live here (env-configurable),
 * so the plan id (never browser input) decides what a verified payment is worth.
 *
 * Money model: 1 credit = $0.002 of provider cost (+10% metering margin), same as the monthly allowance. Extension credits are
 * spent only after the plan's own allowance or rolling window is used up, and every per-request and per-day cost cap, the usage
 * cooldown and the global breakers still apply on top (see src/lib/create/platform/extensions.ts and compute.ts).
 */
import type { PaidPlan } from "./plans";

export type PackId = "small" | "medium";
export const PACK_IDS: PackId[] = ["small", "medium"];

const PLAN_ID_RE = /^plan_[A-Za-z0-9]{6,40}$/;

type PackDef = { label: string; defaultCredits: number; planEnv: string; creditsEnv: string; priceEnv: string };
const DEFS: Record<PackId, PackDef> = {
  small: { label: "Small", defaultCredits: 1_500, planEnv: "WHOP_EXTENSION_PLAN_SMALL", creditsEnv: "KEPLAR_EXTENSION_CREDITS_SMALL", priceEnv: "KEPLAR_EXTENSION_PRICE_USD_SMALL" },
  medium: { label: "Medium", defaultCredits: 4_000, planEnv: "WHOP_EXTENSION_PLAN_MEDIUM", creditsEnv: "KEPLAR_EXTENSION_CREDITS_MEDIUM", priceEnv: "KEPLAR_EXTENSION_PRICE_USD_MEDIUM" },
};

/** Plans that can buy and spend extensions (Free uses free models only, so it has no credits to extend; Business is a custom contract). */
export const EXTENSION_PLANS: readonly PaidPlan[] = ["lite", "plus", "pro"];
export const canBuyExtension = (plan: string): boolean => (EXTENSION_PLANS as readonly string[]).includes(plan);

const envOf = (name: string) => process.env[name]?.trim() || "";
const intEnv = (name: string, fallback: number, min: number, max: number) => {
  const n = Math.floor(Number(envOf(name)));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

/** How long purchased credits last. Long enough that a user is not rushed, short enough that unspent credits do not pile up forever. */
export const extensionValidDays = () => intEnv("KEPLAR_EXTENSION_VALID_DAYS", 90, 7, 365);

export type Pack = { id: PackId; label: string; credits: number; priceUsd: number | null; planId: string | null; available: boolean };

export function packPlanId(id: PackId): string | null {
  const v = envOf(DEFS[id].planEnv);
  return PLAN_ID_RE.test(v) ? v : null;
}

export function extensionPack(id: PackId): Pack {
  const d = DEFS[id];
  const price = Number(envOf(d.priceEnv));
  const planId = packPlanId(id);
  return {
    id,
    label: d.label,
    credits: intEnv(d.creditsEnv, d.defaultCredits, 100, 200_000),
    priceUsd: Number.isFinite(price) && price > 0 && price < 10_000 ? price : null,
    planId,
    available: Boolean(planId),
  };
}

export const extensionPacks = (): Pack[] => PACK_IDS.map(extensionPack);

/** The pack a Whop plan id sells, or null. Whop resolves ids case-insensitively; so do we. */
export function packForWhopPlanId(planId: unknown): Pack | null {
  if (typeof planId !== "string" || !planId) return null;
  const hit = PACK_IDS.find((id) => packPlanId(id)?.toLowerCase() === planId.toLowerCase());
  return hit ? extensionPack(hit) : null;
}

/** True when Whop checkout can sell at least one pack (API key + company id + a pack plan id). */
export const extensionsAvailable = (checkoutConfigured: boolean): boolean => checkoutConfigured && extensionPacks().some((p) => p.available);

/** What the founder must create in Whop (shown in docs and in the admin hint). */
export const FOUNDER_PRODUCTS = PACK_IDS.map((id) => ({ env: DEFS[id].planEnv, pack: id, credits: extensionPack(id).credits }));
