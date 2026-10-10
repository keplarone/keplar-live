/** Pure constants shared by the server code and the client components (no imports of server-only modules). */
import type { PlanId } from "@/lib/create/platform/plans";

export const TEMPLATE_CATEGORIES = ["business", "portfolio", "landing", "restaurant", "store", "blog", "event", "other"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];
export const CATEGORY_LABEL: Record<TemplateCategory, string> = { business: "Local business", portfolio: "Portfolio", landing: "Product landing", restaurant: "Cafe or restaurant", store: "Shop", blog: "Blog", event: "Event", other: "Other" };

export const TEMPLATE_TEXT = { title: { min: 4, max: 60 }, description: { min: 20, max: 200 }, credit: { max: 40 } } as const;

/** Per-plan limits. `shared`: templates one account can list at once. `remixesPerDay`: remixes per account per rolling day (the site-count limit of the plan applies on top). */
export const TEMPLATE_LIMITS: Record<PlanId, { shared: number; remixesPerDay: number }> = {
  free: { shared: 1, remixesPerDay: 3 },
  lite: { shared: 2, remixesPerDay: 8 },
  plus: { shared: 5, remixesPerDay: 20 },
  pro: { shared: 10, remixesPerDay: 40 },
  business: { shared: 25, remixesPerDay: 100 },
};

