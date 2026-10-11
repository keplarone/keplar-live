import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { annualDiscountPct, BUSINESS_TIERS, businessTierForWhopPlanId, businessTierOf, businessWhopPlanId, listPriceFor, priceFor, tierEntitlements } from "@/lib/business/tiers";
import { ENTITLEMENTS } from "@/lib/create/platform/plans";
import { PLAN_ALLOWANCES } from "@/lib/orchestration/plans";
import { normaliseWebsite, parseBusinessAccount } from "@/lib/business/account";
import { businessCheckoutBody } from "@/lib/billing/whop";
import { extract } from "@/lib/billing/sync";
import { planForWhopPlanId } from "@/lib/billing/plans";

const ENV = {
  WHOP_PLAN_BIZ_STARTER_MONTHLY: "plan_StarterMonthly1",
  WHOP_PLAN_BIZ_STARTER_ANNUAL: "plan_StarterAnnual1",
  WHOP_PLAN_BIZ_GROWTH_MONTHLY: "plan_GrowthMonthly1",
  WHOP_PLAN_BIZ_SCALE_ANNUAL: "plan_ScaleAnnual1",
};

test("Business plans: names, prices and every tier pricier than Keplar One Pro ($99)", () => {
  assert.equal(BUSINESS_TIERS.starter.name, "Keplar Business Starter");
  assert.equal(BUSINESS_TIERS.growth.name, "Keplar Business Growth");
  assert.equal(BUSINESS_TIERS.scale.name, "Keplar Business Scale");
  assert.equal(BUSINESS_TIERS.enterprise.name, "Keplar Enterprise");
  assert.deepEqual([BUSINESS_TIERS.starter.monthly, BUSINESS_TIERS.growth.monthly, BUSINESS_TIERS.scale.monthly, BUSINESS_TIERS.enterprise.monthly], [199.99, 499.99, 2999.99, null]);
  for (const t of ["starter", "growth", "scale"] as const) assert.ok(BUSINESS_TIERS[t].monthly! > 99);
  assert.equal(priceFor("starter", "monthly", 17), 199.99);
  assert.equal(priceFor("starter", "annual", 17), Math.round(199.99 * 12 * 0.83 * 100) / 100);
  assert.equal(priceFor("scale", "annual", 0), Math.round(2999.99 * 12 * 100) / 100);
  // By default a year is exactly twelve months (no annual discount), list price included.
  assert.equal(annualDiscountPct(), 0);
  assert.equal(priceFor("growth", "annual"), 5999.88);
  assert.equal(listPriceFor("starter", "annual"), 2639.88);
});

test("Business plans: the swarm is Enterprise-only; no Study or Skills anywhere in a Business plan", () => {
  assert.deepEqual(Object.values(BUSINESS_TIERS).filter((t) => t.swarm).map((t) => t.id), ["enterprise"]);
  for (const t of Object.values(BUSINESS_TIERS)) assert.equal(t.includes.some((x) => /study|skill/i.test(x)), false, t.id);
});

test("Business plans: AI credits keep model spend at or under ~40% of the price (unit economics, with room after the price rise)", () => {
  const COST_PER_CREDIT = 0.002 / 1.1; // a credit is $0.002 of metered cost, which is provider cost x 1.1
  for (const t of ["starter", "growth", "scale"] as const) {
    const share = (BUSINESS_TIERS[t].credits! * COST_PER_CREDIT) / BUSINESS_TIERS[t].monthly!;
    assert.ok(share <= 0.3, `${t}: ${Math.round(share * 100)}%`);
  }
});

test("Business entitlements: never unlimited; the tier bought sets the allowance; unknown keys fall back to Starter", () => {
  assert.equal(PLAN_ALLOWANCES.business.monthlyUnits, 30_000, "the bare business plan is bounded (it used to be unlimited)");
  assert.equal(Number.isFinite(ENTITLEMENTS.business.monthlyUnits), true);
  assert.equal(businessTierOf("plan_GrowthMonthly1", ENV), "growth");
  assert.equal(businessTierOf("plan_unknown123", ENV), "starter");
  assert.equal(businessTierOf(null, ENV), "starter");
  assert.equal(businessTierOf("enterprise:acme-2026", ENV), "enterprise");
  const growth = tierEntitlements(ENTITLEMENTS.business, "growth");
  assert.equal(growth.monthlyUnits, 70_000);
  assert.equal(growth.agents, 25);
  assert.equal(growth.label, "Keplar Business Growth");
  assert.ok(Number.isFinite(tierEntitlements(ENTITLEMENTS.business, "enterprise").monthlyUnits));
});

test("Business checkout: only a configured Whop plan id sells a tier; ids match case-insensitively", () => {
  assert.equal(businessWhopPlanId("starter", "monthly", ENV), "plan_StarterMonthly1");
  assert.equal(businessWhopPlanId("growth", "annual", ENV), null, "unset: no checkout");
  assert.equal(businessWhopPlanId("growth", "monthly", { WHOP_PLAN_BIZ_GROWTH_MONTHLY: "not-a-plan" }), null);
  assert.deepEqual(businessTierForWhopPlanId("PLAN_SCALEANNUAL1", ENV), { tier: "scale", cycle: "annual" });
  assert.equal(businessTierForWhopPlanId("plan_wd9Xs4iDlwvDi", ENV), null);
  const b = businessCheckoutBody({ planId: "plan_StarterMonthly1", tier: "starter", cycle: "monthly", email: " Ops@Acme.com ", workspaceId: "ws_1" });
  assert.equal(b.plan_id, "plan_StarterMonthly1");
  assert.equal(b.metadata.email, "ops@acme.com");
  assert.equal(b.redirect_url, "https://business.keplar.one/?purchased=1");
});

test("Business grant: the webhook grants business only from a Business Whop plan id, never from metadata alone", () => {
  const prev = process.env.WHOP_PLAN_BIZ_GROWTH_MONTHLY;
  process.env.WHOP_PLAN_BIZ_GROWTH_MONTHLY = "plan_GrowthMonthly1";
  try {
    assert.equal(planForWhopPlanId("plan_GrowthMonthly1"), "business");
    assert.equal(extract({ id: "pay_1", plan_id: "plan_GrowthMonthly1", metadata: { email: "a@b.co", plan: "business" } }).plan, "business");
    assert.equal(extract({ id: "pay_2", plan_id: "plan_somethingElse1", metadata: { email: "a@b.co", plan: "business" } }).plan, null, "metadata cannot grant business");
  } finally {
    if (prev === undefined) delete process.env.WHOP_PLAN_BIZ_GROWTH_MONTHLY;
    else process.env.WHOP_PLAN_BIZ_GROWTH_MONTHLY = prev;
  }
});

test("Business account: company profile is validated and the website normalised", () => {
  assert.equal(normaliseWebsite("Acme.com"), "https://acme.com");
  assert.equal(normaliseWebsite(""), "");
  assert.equal(normaliseWebsite("javascript:alert(1)"), null);
  assert.equal(normaliseWebsite("https://user:pw@acme.com"), null);
  const ok = parseBusinessAccount({ company: "  Acme  Inc ", website: "acme.com/shop", size: "11-50", industry: "Finance", role: "COO" });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.deepEqual(ok.data, { company: "Acme Inc", website: "https://acme.com/shop", size: "11-50", industry: "Finance", role: "COO" });
  const bad = parseBusinessAccount({ company: "A", website: "nope", size: "huge", industry: "?", role: "" });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ["company", "industry", "role", "size", "website"]);
});

test("Business site: storefront on business.keplar.one, download only for active plans, dark Geist chrome", () => {
  const route = readFileSync("src/app/api/business/account/route.ts", "utf8");
  assert.match(route, /if \(active\) \{\s*(?:\/\/[^\n]*\n\s*)?const r = await getDesktopRelease\(fetch, "business"\)/, "download links (the Business app's own) are computed only for an active Business plan");
  assert.doesNotMatch(route, /access-control-allow-origin/, "same origin now: business.keplar.one serves its own account API");
  const layout = readFileSync("src/app/(business)/layout.tsx", "utf8");
  assert.match(readFileSync("src/components/business-site/fonts.ts", "utf8"), /Geist\(/);
  assert.match(layout, /geist\.variable/);
  const store = readFileSync("src/components/business-site/Storefront.tsx", "utf8");
  assert.doesNotMatch(store, /study|skills/i);
  assert.match(readFileSync("src/proxy.ts", "utf8"), /url\.pathname = pathname === "\/" \? BUSINESS_PREFIX/);
});
