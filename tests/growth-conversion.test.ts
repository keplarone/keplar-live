import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { asPricingFrom, compareGroups, PLAN_ORDER, planFits, pricingContext, pricingFaq, FREE_DAILY_QUESTIONS } from "../src/lib/growth/pricing-page";
import { createLanding } from "../src/lib/growth/create-landing";
import { ctaUrl, lifecycleEmails, renderLifecycle, SIGN_OFF } from "../src/lib/growth/lifecycle-emails";
import { tiers } from "../src/lib/tiers";
import { PLAN_ALLOWANCES } from "../src/lib/orchestration/plans";
import { IMAGE_LIMITS } from "../src/lib/images/config";
import { ENTITLEMENTS } from "../src/lib/create/platform/plans";
import { DEFAULT_COST_CONFIG } from "../src/lib/cost/config";
import { sitemapPaths } from "../src/app/sitemap";
import { staticLastmod } from "../src/lib/content/lastmod";

const BANNED = /testimonial|trusted by|#1\b|best-in-class|guarantee|hurry|limited time|only \d+ left|act now|SOC ?2|ISO ?27001|HIPAA certified|\d+% (more )?accurate/i;
const row = (label: string) => compareGroups.flatMap((g) => g.rows).find((r) => r.label === label)!;

test("comparison table has a cell for every plan, in the pricing grid's order", () => {
  assert.deepEqual(PLAN_ORDER, tiers.map((t) => t.id));
  for (const g of compareGroups) for (const r of g.rows) assert.deepEqual(Object.keys(r.values), PLAN_ORDER, r.label);
});

test("comparison numbers come from the enforcing modules", () => {
  const prices = row("Price").values;
  assert.equal(prices.plus, "$45 / month");
  assert.equal(prices.pro, "$99 / month");
  assert.equal(prices.free, "$0");
  assert.equal(row("Usage included").values.plus, `${PLAN_ALLOWANCES.plus.monthlyUnits!.toLocaleString("en-US")} credits a month`);
  assert.equal(row("Usage included").values.free, `Up to ${FREE_DAILY_QUESTIONS} questions a day`);
  assert.equal(row("Image generation").values.free, null);
  assert.equal(row("Image generation").values.plus, `${IMAGE_LIMITS.plus!.perDay} a day`);
  assert.equal(row("Video generation (Beta)").values.plus, null);
  assert.equal(row("Video generation (Beta)").values.pro, `Clips up to ${ENTITLEMENTS.pro.maxVideoSeconds} s`);
  assert.equal(row("Deep Research").values.lite, null);
  assert.equal(row("Deep Research").values.plus, "Included");
});

test("features that are not live are labelled Coming soon, never as included", () => {
  assert.equal(DEFAULT_COST_CONFIG.flags.overage, false, "overage flag is off by default; if this changes, revisit the copy");
  for (const label of ["Pay-as-you-go above your plan", "Live web lookups"]) {
    const r = row(label);
    assert.equal(r.soon, true);
    for (const v of Object.values(r.values)) assert.ok(v === null || v === "Coming soon", `${label}: ${v}`);
  }
  const overage = pricingFaq().find((f) => /extra usage/.test(f.q))!;
  assert.match(overage.a, /^Coming soon\./);
  assert.match(overage.a, /never billed beyond your plan price/);
  assert.match(pricingFaq({ overageLive: true }).find((f) => /extra usage/.test(f.q))!.a, /off by default/);
});

test("no annual price is offered while every plan bills monthly", () => {
  const annual = pricingFaq().find((f) => /annual/i.test(f.q))!;
  assert.match(annual.a, /^Not yet/);
  const src = readFileSync("src/components/growth/pricing/PlanCompare.tsx", "utf8") + readFileSync("src/components/growth/pricing/PlanFit.tsx", "utf8");
  assert.ok(!/annual|yearly|\/yr/i.test(src));
});

test("pricing copy and landing copy make no fake-proof claims", () => {
  const blob = JSON.stringify({ compareGroups, planFits, faq: pricingFaq(), pricingContext, createLanding, lifecycleEmails });
  assert.ok(!BANNED.test(blob), blob.match(BANNED)?.[0] ?? "");
});

test("context notes only render for known keys", () => {
  assert.equal(asPricingFrom("daily-limit"), "daily-limit");
  assert.equal(asPricingFrom("constructor"), null);
  assert.equal(asPricingFrom("<script>"), null);
  assert.equal(asPricingFrom(null), null);
  const app = readFileSync("src/components/app-ui/KeplarTurn.tsx", "utf8");
  for (const m of app.matchAll(/\/pricing\?from=([\w-]+)/g)) assert.ok(asPricingFrom(m[1]), m[1]);
});

test("plan chooser links go to real checkout plans or the app", () => {
  for (const f of planFits) {
    if (f.plan === "plus" || f.plan === "pro") assert.equal(f.cta.href, `/checkout?plan=${f.plan}`);
  }
  assert.ok(!planFits.some((f) => /most popular|best value/i.test(f.who + f.outcome)));
});

test("/ai-app-builder is in the sitemap with a lastmod, and its plan numbers match Create entitlements", () => {
  assert.ok(sitemapPaths.includes("/ai-app-builder"));
  assert.ok(staticLastmod["/ai-app-builder"]);
  const blob = JSON.stringify(createLanding);
  assert.ok(blob.includes(`Free includes ${ENTITLEMENTS.free.projects} project`));
  assert.ok(createLanding.metaDescription.length <= 170);
});

test("lifecycle emails are drafts: nothing imports them to send", () => {
  const users = execSync("rg -l 'lifecycle-emails' src || true", { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  assert.deepEqual(users, []);
});

test("lifecycle emails: signed, explain why they were sent, campaign-tagged internal CTAs", () => {
  const ids = new Set<string>();
  for (const e of lifecycleEmails) {
    assert.ok(!ids.has(e.id)); ids.add(e.id);
    assert.ok(e.cta.path.startsWith("/") && !e.cta.path.startsWith("//"));
    const url = ctaUrl(e);
    assert.ok(url.startsWith("https://keplar.one/"));
    assert.match(url, /utm_source=lifecycle&utm_medium=email&utm_campaign=/);
    assert.equal(url.match(/\?/g)?.length, 1);
    const r = renderLifecycle(e, { firstName: "Sam", resetTime: "8:00 PM", renewDate: "Nov 1", accessUntil: "Nov 1", percentUsed: "80", unsubscribeUrl: "https://keplar.one/u/x" });
    assert.ok(r.text.includes(SIGN_OFF));
    assert.ok(r.text.includes("Why you got this:"));
    assert.ok(r.text.includes("Unsubscribe: https://keplar.one/u/x"));
    assert.ok(!/\{\{\w+\}\}/.test(r.text + r.subject), e.id);
  }
  assert.ok(renderLifecycle(lifecycleEmails[0]).text.includes("{{unsubscribeUrl}}"), "missing values stay visible for review");
});
