/**
 * Create + Business OS entitlements per plan.
 *
 * Monthly Usage allowances are read from src/lib/orchestration/plans.ts
 * (the metering source of truth; values pending founder approval).
 */
import { brand } from "@/lib/site";
import { DOMAIN_LIMITS } from "@/lib/domains/limits";
import { PLAN_ALLOWANCES } from "@/lib/orchestration/plans";

const units = (p: PlanId) => PLAN_ALLOWANCES[p].monthlyUnits ?? Infinity;

export type PlanId = "free" | "lite" | "plus" | "pro" | "business";

export type Entitlements = {
  plan: PlanId;
  label: string;
  monthlyUnits: number; // Infinity = custom contract
  projects: number;
  /** Free *.keplar.site subdomain (verified accounts only). */
  freeSubdomain: boolean;
  customDomains: number;
  images: boolean;
  /** Premium image models (higher quality tiers). */
  premiumImages: boolean;
  video: boolean;
  maxVideoSeconds: number;
  commerce: boolean;
  agents: number;
  /** Per-agent auto-send opt-in allowed (still off by default). */
  autoSendAllowed: boolean;
  /** Requests per minute across Create + agent APIs. */
  rpm: number;
};

export const ENTITLEMENTS: Record<PlanId, Entitlements> = {
  free: { plan: "free", label: brand.plans.free, monthlyUnits: units("free"), projects: 1, freeSubdomain: true, customDomains: DOMAIN_LIMITS.free, images: true, premiumImages: false, video: false, maxVideoSeconds: 0, commerce: false, agents: 0, autoSendAllowed: false, rpm: 10 },
  // Lite: the everyday paid step. Premium chat models, Study, a small site; no images, Slides, Deep Research, video, commerce, agents, connected apps or custom domains (those start at Plus).
  lite: { plan: "lite", label: brand.plans.lite, monthlyUnits: units("lite"), projects: 2, freeSubdomain: true, customDomains: DOMAIN_LIMITS.lite, images: false, premiumImages: false, video: false, maxVideoSeconds: 0, commerce: false, agents: 0, autoSendAllowed: false, rpm: 20 },
  plus: { plan: "plus", label: brand.plans.plus, monthlyUnits: units("plus"), projects: 5, freeSubdomain: true, customDomains: DOMAIN_LIMITS.plus, images: true, premiumImages: true, video: false, maxVideoSeconds: 0, commerce: true, agents: 3, autoSendAllowed: true, rpm: 30 },
  pro: { plan: "pro", label: brand.plans.pro, monthlyUnits: units("pro"), projects: 20, freeSubdomain: true, customDomains: DOMAIN_LIMITS.pro, images: true, premiumImages: true, video: true, maxVideoSeconds: 8, commerce: true, agents: 10, autoSendAllowed: true, rpm: 60 },
  business: { plan: "business", label: brand.plans.business, monthlyUnits: units("business"), projects: 100, freeSubdomain: true, customDomains: DOMAIN_LIMITS.business, images: true, premiumImages: true, video: true, maxVideoSeconds: 10, commerce: true, agents: 50, autoSendAllowed: true, rpm: 120 },
};

export class EntitlementError extends Error {
  status = 402;
  constructor(message: string, public upgradeTo?: PlanId) {
    super(message);
  }
}
