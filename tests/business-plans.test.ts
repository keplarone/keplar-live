import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { BUSINESS_TIERS, businessTierForWhopPlanId, businessTierOf, businessWhopPlanId, listPriceFor, priceFor, tierEntitlements } from "@/lib/business/tiers";
import { ENTITLEMENTS } from "@/lib/create/platform/plans";
import { PLAN_ALLOWANCES } from "@/lib/orchestration/plans";
import { normaliseWebsite, parseBusinessAccount } from "@/lib/business/account";
import { businessCheckoutBody } from "@/lib/billing/whop";
import { extract } from "@/lib/billing/sync";
import { planForWhopPlanId } from "@/lib/billing/plans";

const ENV = {
  WHOP_PLAN_BIZ_STARTER_MONTHLY: "plan_StarterMonthly1",
  WHOP_PLAN_BIZ_GROWTH_MONTHLY: "plan_GrowthMonthly1",
};

test("Business plans: names, prices and every tier pricier than Keplar One Pro ($99)", () => {
  assert.equal(BUSINESS_TIERS.starter.name, "Keplar Business Starter");
  assert.equal(BUSINESS_TIERS.growth.name, "Keplar Business Growth");
  assert.equal(BUSINESS_TIERS.scale.name, "Keplar Business Scale");
  assert.equal(BUSINESS_TIERS.enterprise.name, "Keplar Enterprise");
  assert.deepEqual([BUSINESS_TIERS.starter.monthly, BUSINESS_TIERS.growth.monthly, BUSINESS_TIERS.scale.monthly, BUSINESS_TIERS.enterprise.monthly], [199.99, 499.99, 2499.99, null]);
  for (const t of ["starter", "growth", "scale"] as const) assert.ok(BUSINESS_TIERS[t].monthly! > 99);
  assert.equal(priceFor("starter"), 199.99);
  assert.equal(priceFor("scale"), 2499.99);
  assert.equal(listPriceFor("scale"), 2749.99);
  for (const t of ["starter", "growth", "scale"] as const) assert.ok(listPriceFor(t)! > priceFor(t), `${t}: list price sits above the price`);
});

test("Business plans: monthly only, no annual plans anywhere in checkout or the storefront", () => {
  assert.equal(businessWhopPlanId("starter", { WHOP_PLAN_BIZ_STARTER_ANNUAL: "plan_StarterAnnual1" }), null, "an annual plan id never sells a tier");
  assert.equal(businessTierForWhopPlanId("plan_StarterAnnual1", { WHOP_PLAN_BIZ_STARTER_ANNUAL: "plan_StarterAnnual1" }), null);
  for (const f of ["src/components/business-site/Storefront.tsx", "src/components/business-site/AccountSetup.tsx", "src/app/api/business/subscribe/route.ts", "src/lib/business/tiers.ts"]) {
    assert.doesNotMatch(readFileSync(f, "utf8").replace(/no annual plans/g, ""), /annual|per year|billed yearly/i, f);
  }
});

test("Business plans: no Study or Skills anywhere in a Business plan", () => {
  for (const t of Object.values(BUSINESS_TIERS)) assert.equal(t.includes.some((x) => /study|skill/i.test(x)), false, t.id);
});

test("Revenue Guard is not built (owner decision), so no plan, page or footer offers it", () => {
  for (const t of Object.values(BUSINESS_TIERS)) assert.equal(t.includes.some((x) => /revenue guard|testing swarm/i.test(x)), false, t.id);
  for (const f of ["src/components/business-site/Storefront.tsx", "src/components/business-site/BusinessFooter.tsx", "src/lib/business/tiers.ts", "src/lib/privacy/account-data.ts"]) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /revenue.?guard|testing swarm|guard_targets/i, f);
  }
  assert.equal(existsSync("src/lib/business/guard"), false, "the unwired Revenue Guard module is gone");
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
  assert.equal(businessWhopPlanId("starter", ENV), "plan_StarterMonthly1");
  assert.equal(businessWhopPlanId("scale", ENV), null, "unset: no checkout");
  assert.equal(businessWhopPlanId("growth", { WHOP_PLAN_BIZ_GROWTH_MONTHLY: "not-a-plan" }), null);
  assert.deepEqual(businessTierForWhopPlanId("PLAN_GROWTHMONTHLY1", ENV), { tier: "growth" });
  assert.equal(businessTierForWhopPlanId("plan_wd9Xs4iDlwvDi", ENV), null);
  const b = businessCheckoutBody({ planId: "plan_StarterMonthly1", tier: "starter", email: " Ops@Acme.com ", workspaceId: "ws_1" });
  assert.equal(b.metadata.cycle, "monthly");
  assert.equal(b.plan_id, "plan_StarterMonthly1");
  assert.equal(b.metadata.email, "ops@acme.com");
  assert.equal(b.redirect_url, "https://business.keplar.one/?purchased=1");
});

test("Business checkout is embedded like Keplar One: signed email, the tier's own plan id, hosted checkout only as fallback", () => {
  const route = readFileSync("src/app/api/business/subscribe/route.ts", "utf8");
  assert.match(route, /embedMetadata\(\{ email: ws\.email, plan: "business", workspaceId: ws\.id \}\)/, "the email is signed on the server (keplar_ref)");
  assert.match(route, /embed: \{ planId, metadata, returnUrl: businessUrl\("\/\?purchased=1"\) \}/);
  assert.match(route, /if \(mode !== "hosted"\)/, "embed is the default");
  const setup = readFileSync("src/components/business-site/AccountSetup.tsx", "utf8");
  // Space UI: the storefront follows the site theme, so the embed does too (WhopEmbed's default).
  assert.doesNotMatch(setup, /<WhopEmbed[^>]*theme=/, "the embed follows the site theme like the Business storefront");
  assert.match(setup, /onFallback=\{embed\.hosted \? \(\) => void checkout\("hosted"\) : undefined\}/);
  const prev = process.env.WHOP_PLAN_BIZ_GROWTH_MONTHLY;
  process.env.WHOP_PLAN_BIZ_GROWTH_MONTHLY = "plan_GrowthMonthly1";
  try {
    // What the embed attaches is set in the browser: a forged email or plan in metadata never grants anything by itself.
    const forged = extract({ id: "pay_2", plan_id: "plan_unknown123", metadata: { source: "keplar-embed", email: "victim@b.co", plan: "business", keplar_ref: "bad.sig" } });
    assert.equal(forged.plan, null);
    assert.notEqual(forged.email, "victim@b.co");
    assert.equal(extract({ id: "pay_3", plan_id: "plan_GrowthMonthly1", metadata: { source: "keplar-embed" } }).plan, "business");
  } finally {
    if (prev === undefined) delete process.env.WHOP_PLAN_BIZ_GROWTH_MONTHLY;
    else process.env.WHOP_PLAN_BIZ_GROWTH_MONTHLY = prev;
  }
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

test("Business site: storefront on business.keplar.one, download only for active plans, dark Space chrome in Montserrat", () => {
  const route = readFileSync("src/app/api/business/account/route.ts", "utf8");
  assert.match(route, /if \(active\) \{\s*(?:\/\/[^\n]*\n\s*)?const r = await getDesktopRelease\(fetch, "business"\)/, "download links (the Business app's own) are computed only for an active Business plan");
  assert.doesNotMatch(route, /access-control-allow-origin/, "same origin now: business.keplar.one serves its own account API");
  const layout = readFileSync("src/app/(business)/layout.tsx", "utf8");
  // Space UI: Business reads the family's Montserrat (the root layout's --font-sans) instead of loading Geist of its own.
  assert.ok(!existsSync("src/components/business-site/fonts.ts"), "no separate Business font files");
  assert.doesNotMatch(layout, /geist/i);
  assert.match(readFileSync("src/components/business-site/tokens.css", "utf8"), /--kb-sans: var\(--font-sans\), "Montserrat"/);
  const store = readFileSync("src/components/business-site/Storefront.tsx", "utf8");
  assert.doesNotMatch(store, /study|skills/i);
  assert.match(readFileSync("src/proxy.ts", "utf8"), /url\.pathname = pathname === "\/" \? BUSINESS_PREFIX/);
});
