/**
 * Custom domain allowance per plan. One number per plan, used by the API (hard limit), the UI ("1 of 3 used") and
 * the entitlements table. Free has none: the add form shows an upgrade message instead. Admin accounts are treated as Business.
 * Change them here only (and docs/custom-domains.md).
 */
export const DOMAIN_LIMITS = { free: 0, lite: 0, plus: 1, pro: 3, business: 10 } as const;

export type DomainPlan = keyof typeof DOMAIN_LIMITS;

export const domainLimit = (plan: string): number => (DOMAIN_LIMITS as Record<string, number>)[plan] ?? 0;

/** The plan to suggest when a plan has no room left. */
export const upgradeFor = (plan: string): "plus" | "pro" | "business" => (plan === "free" || plan === "lite" ? "plus" : plan === "plus" ? "pro" : "business");
