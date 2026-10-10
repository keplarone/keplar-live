import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { embedPlanId, PAID_PLANS, planForWhopPlanId, isPaidPlan, asPlanId } from "@/lib/billing/plans";
import { checkoutBody, checkoutAvailable, createCheckoutConfiguration, liteCheckoutBody } from "@/lib/billing/whop";
import { embedMetadata } from "@/lib/billing/embed";
import { handleWhopEvent } from "@/lib/billing/sync";
import { workspaceForEmail } from "@/lib/accounts/workspaces";
import { workspaceById } from "@/lib/create/platform/workspace";
import { ENTITLEMENTS } from "@/lib/create/platform/plans";
import { PLAN_ALLOWANCES, WINDOW_LIMITS, upgradesFrom } from "@/lib/orchestration/plans";
import { PLAN_LIMITS } from "@/lib/orchestration/limits";
import { USD_PER_UNIT } from "@/lib/orchestration/compute";
import { canUseSlides, slidesLimitsFor, studyLimitsFor } from "@/lib/tools/limits";
import { mcpLimitsFor } from "@/lib/mcp/limits";
import { imageLimitsFor } from "@/lib/images/config";
import { BUILDER_LIMITS } from "@/lib/site-builder/limits";
import { domainLimit } from "@/lib/domains/limits";
import { tiers } from "@/lib/tiers";
import { POST as checkoutPOST } from "@/app/api/billing/checkout/route";

const LITE_ID = "plan_qpgb6JV0jhQGj";
const withLite = async <T>(fn: () => Promise<T> | T): Promise<T> => {
  process.env.WHOP_PLAN_LITE = LITE_ID;
  try {
    return await fn();
  } finally {
    delete process.env.WHOP_PLAN_LITE;
  }
};
const ev = (type: string, data: Record<string, unknown>, id = `wh_${Math.random().toString(36).slice(2)}`) => handleWhopEvent({ type, data }, id);

test("lite: price, order and margin are consistent with the cost model", () => {
  assert.equal(PAID_PLANS.lite.usdMonthly, 20, "displayed price; the Whop plan itself is 19.99 and is not touched");
  assert.deepEqual(upgradesFrom("free").map((p) => p.id), ["lite", "plus", "pro", "business"]);
  const a = PLAN_ALLOWANCES.lite;
  assert.equal(a.monthlyUnits, 2_400);
  assert.equal(a.monthlyUnits! * USD_PER_UNIT, a.monthlyBudgetUsd, "credits match the provider-cost budget");
  assert.ok(a.monthlyBudgetUsd! / PAID_PLANS.lite.usdMonthly <= 0.25, "provider budget <= 25% of price (Plus 26.7%, Pro 27.3%)");
  assert.ok(a.monthlyUnits! < PLAN_ALLOWANCES.plus.monthlyUnits! && a.monthlyUnits! > 0);
  assert.equal(a.deepResearch, false);
  assert.equal(a.models, "all");
  // rolling windows keep the same shape as Plus/Pro (5-hour ~17% and weekly ~53% of the month)
  assert.deepEqual(WINDOW_LIMITS.lite, { fiveHour: 400, weekly: 1_280 });
  const l = PLAN_LIMITS.lite;
  assert.ok(l.dailyUsd! < PLAN_LIMITS.plus.dailyUsd! && l.dailyUsd! > 0);
  assert.ok(l.maxRequestUsd < PLAN_LIMITS.plus.maxRequestUsd && l.maxDeepResearchUsd === 0);
  assert.ok(l.dailyUsd! * 30 <= a.monthlyBudgetUsd! * 8, "a maxed-out day cannot blow the monthly budget by more than 8x of one month's pace");
});

test("lite: entitlements - premium chat and Study yes; images, Slides, MCP, agents, domains, commerce no", () => {
  const e = ENTITLEMENTS.lite;
  assert.equal(e.monthlyUnits, 2_400);
  assert.equal(e.label, "Keplar Lite");
  assert.equal(e.projects, 2);
  assert.equal(e.images, false);
  assert.equal(e.video, false);
  assert.equal(e.commerce, false);
  assert.equal(e.agents, 0);
  assert.equal(e.autoSendAllowed, false);
  assert.equal(e.customDomains, 0);
  assert.equal(domainLimit("lite"), 0);
  assert.equal(imageLimitsFor("lite"), null);
  assert.equal(canUseSlides("lite"), false);
  assert.equal(slidesLimitsFor("lite"), null);
  assert.equal(mcpLimitsFor("lite").servers, 0);
  assert.ok(studyLimitsFor("lite").maxSets > studyLimitsFor("free").maxSets && studyLimitsFor("lite").maxSets < studyLimitsFor("plus").maxSets);
  assert.ok(BUILDER_LIMITS.lite.pages > BUILDER_LIMITS.free.pages && BUILDER_LIMITS.lite.pages < BUILDER_LIMITS.plus.pages);
  assert.ok(BUILDER_LIMITS.lite.maxJobUsd > 0 && BUILDER_LIMITS.lite.maxJobUsd < BUILDER_LIMITS.plus.maxJobUsd);
});

test("lite: pricing data has a Lite card between Free and Plus", () => {
  const ids = tiers.map((t) => t.id);
  assert.deepEqual(ids, ["free", "lite", "plus", "pro"]); // Business is sold at business.keplar.one
  const t = tiers.find((x) => x.id === "lite")!;
  assert.equal(t.price, 20);
  assert.equal(t.cta.href, "/checkout?plan=lite");
  assert.ok(t.features.some((f) => /2,400 credits/.test(f)));
  assert.ok(isPaidPlan("lite") && asPlanId("lite") === "lite");
});

test("lite: checkout stays hidden until the Whop plan id is configured", async () => {
  delete process.env.WHOP_PLAN_LITE;
  delete process.env.WHOP_PLAN_ID_LITE;
  assert.equal(embedPlanId("lite"), null);
  assert.equal(planForWhopPlanId(LITE_ID), null);
  process.env.WHOP_API_KEY = "whop_test";
  process.env.WHOP_COMPANY_ID = "biz_test";
  try {
    // API route: the plan is refused, not created
    const req = new Request("https://keplar.one/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json", origin: "https://keplar.one" }, body: JSON.stringify({ plan: "lite" }) });
    const res = await checkoutPOST(req);
    assert.ok([401, 403, 404].includes(res.status), `status ${res.status}`);
    await assert.rejects(createCheckoutConfiguration({ plan: "lite", email: "a@example.com", workspaceId: "w" }), (e: unknown) => (e as { status?: number }).status === 404);
  } finally {
    delete process.env.WHOP_API_KEY;
    delete process.env.WHOP_COMPANY_ID;
  }
});

test("lite: with the plan id set, the id maps to the lite tier, alongside plus and pro; the hosted body uses the plan id only", async () => {
  await withLite(async () => {
    assert.equal(embedPlanId("lite"), LITE_ID);
    assert.equal(planForWhopPlanId(LITE_ID), "lite");
    assert.equal(planForWhopPlanId("plan_wd9xs4iDlwvDi"), "plus", "Whop resolves ids case-insensitively");
    assert.equal(planForWhopPlanId("plan_wd9Xs4iDlwvDi"), "plus", "the id as Whop prints it");
    assert.equal(planForWhopPlanId(LITE_ID.toUpperCase()), "lite");
    assert.equal(planForWhopPlanId("plan_M6ztgSJDucMJA"), "pro");
    assert.equal(planForWhopPlanId("plan_unknown12345"), null);
    assert.equal(checkoutAvailable(), true);
    const b = liteCheckoutBody({ plan: "lite", email: " Buyer@Example.com ", workspaceId: "ws1", origin: "https://keplar.one" });
    assert.equal(b.plan_id, LITE_ID);
    assert.equal(b.metadata.plan, "lite");
    assert.equal(b.metadata.email, "buyer@example.com");
    assert.ok(!("plan" in b), "no inline plan / price: the Whop plan decides what is sold");
    assert.equal(checkoutBody({ plan: "plus", email: "a@example.com", workspaceId: "w" }).plan.renewal_price, 45);
  });
  process.env.WHOP_PLAN_ID_LITE = LITE_ID; // alternative name also works
  try {
    assert.equal(embedPlanId("lite"), LITE_ID);
  } finally {
    delete process.env.WHOP_PLAN_ID_LITE;
  }
  process.env.WHOP_PLAN_LITE = "not a plan id";
  try {
    assert.equal(embedPlanId("lite"), null, "a malformed id never enables checkout");
  } finally {
    delete process.env.WHOP_PLAN_LITE;
  }
});

test("lite: webhook lifecycle - the Whop plan id (not browser metadata) grants lite; upgrade, lapse and cancel behave", async () => {
  await withLite(async () => {
    const email = `lite-${Date.now()}@example.com`;
    const md = embedMetadata({ email, plan: "lite", workspaceId: "ws_l" });
    // buyer edits browser metadata to say "pro": still lite, because the Whop plan sells lite
    const r1 = await ev("payment.succeeded", { id: "pay_l1", plan_id: LITE_ID, membership_id: "mem_lite1", paid_at: new Date().toISOString(), metadata: { ...md, plan: "pro" } });
    assert.equal(r1.result, "plan=lite");
    const row = (await workspaceForEmail(email))!;
    assert.equal(row.plan, "lite");
    const ws = (await workspaceById(row.id))!;
    assert.equal(ws.plan, "lite");
    assert.equal(ws.entitlements.monthlyUnits, 2_400);
    assert.equal(ws.entitlements.images, false);
    // failed payment keeps lite until the period ends, cancel flag does not remove it
    assert.equal((await ev("payment.failed", { id: "pay_l2", membership_id: "mem_lite1" })).result, "past_due");
    assert.equal((await workspaceForEmail(email))!.plan, "lite");
    assert.equal((await ev("membership.cancel_at_period_end_changed", { id: "mem_lite1", cancel_at_period_end: true })).result, "cancel_at_period_end");
    // upgrade through the plus plan id, then deactivate
    assert.equal((await ev("membership.activated", { id: "mem_lite2", plan_id: "plan_wd9xs4iDlwvDi", metadata: md })).result, "plan=plus");
    assert.equal((await workspaceForEmail(email))!.plan, "plus");
    await ev("membership.deactivated", { id: "mem_lite2" });
    assert.equal((await workspaceForEmail(email))!.plan, "free");
    // forged email on a lite purchase never upgrades anyone
    const victim = `victim-lite-${Date.now()}@example.com`;
    assert.equal((await ev("payment.succeeded", { id: "pay_l9", plan_id: LITE_ID, metadata: { email: victim, plan: "lite", source: "keplar-embed", keplar_ref: "bogus.bogus" } })).result, "no_workspace");
    assert.equal(await workspaceForEmail(victim), null);
  });
  // without the env, a lite plan id grants nothing
  const email2 = `nolite-${Date.now()}@example.com`;
  const r = await ev("payment.succeeded", { id: "pay_l10", plan_id: LITE_ID, metadata: embedMetadata({ email: email2, plan: "lite", workspaceId: "w" }) });
  assert.equal(r.result, "no_workspace");
});

test("lite: shown as $20 everywhere, with the billing disclosure; nothing says 19.99", async () => {
  const { readFileSync } = await import("node:fs");
  const { faq } = await import("@/lib/faq");
  const { softwareApp } = await import("@/lib/structuredData");
  assert.ok(faq.some((f) => /Keplar Lite is \$20 a month/.test(f.a)));
  const files = ["src/lib/tiers.ts", "src/components/account/AccountActions.tsx", "src/lib/faq.ts", "src/lib/content/landing.ts", "src/lib/billing/plans.ts"];
  for (const f of files) assert.doesNotMatch(readFileSync(f, "utf8"), /19\.99/, f);
  assert.match(readFileSync("src/components/billing/CheckoutStart.tsx", "utf8"), /Billed monthly through Whop; the exact amount is shown at checkout/);
  assert.match(readFileSync("src/app/(marketing)/account/page.tsx", "utf8"), /billed through Whop/);
  const offers = (softwareApp() as unknown as { offers: { name: string; price: string }[] }).offers;
  assert.equal(offers.find((o) => /Lite/.test(o.name))?.price, "20");
});
