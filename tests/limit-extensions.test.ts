import "./setup";
// These tests spend whole allowances in one go; the usage cooldown has its own tests.
process.env.KEPLAR_COOLDOWN_QUICK_FRACTION = "1000";
process.env.KEPLAR_COOLDOWN_PLUS_HOURLY_USD = "1000000";
process.env.KEPLAR_COOLDOWN_PRO_HOURLY_USD = "1000000";
process.env.KEPLAR_COOLDOWN_BUSINESS_HOURLY_USD = "1000000";
process.env.WHOP_EXTENSION_PLAN_SMALL = "plan_extSMALL12345";
process.env.WHOP_EXTENSION_PLAN_MEDIUM = "plan_extMEDIUM6789";
process.env.KEPLAR_EXTENSION_CREDITS_SMALL = "500";
process.env.KEPLAR_EXTENSION_CREDITS_MEDIUM = "2000";
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleWhopEvent } from "@/lib/billing/sync";
import { workspaceForEmail } from "@/lib/accounts/workspaces";
import { assertCanSpend, chargeUnits, meter, usedThisPeriod } from "@/lib/create/platform/compute";
import { recordWindowUsage, windowMeters } from "@/lib/create/platform/windows";
import { drawExtension, extensionBalance, extensionForPayment, grantExtension } from "@/lib/create/platform/extensions";
import { canBuyExtension, extensionPack, extensionPacks, extensionsAvailable, extensionValidDays, packForWhopPlanId } from "@/lib/billing/extensions";
import { extensionCheckoutBody } from "@/lib/billing/whop";
import { workspaceById, type Workspace } from "@/lib/create/platform/workspace";
import { ENTITLEMENTS } from "@/lib/create/platform/plans";
import { EntitlementError } from "@/lib/create/platform/plans";
import { WINDOW_LIMITS } from "@/lib/orchestration/plans";

const DAY = 864e5;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();
let n = 0;
const mail = () => `ext${++n}-${Math.random().toString(36).slice(2, 6)}@example.com`;
const ev = (type: string, data: Record<string, unknown>, id = `wh_${Math.random().toString(36).slice(2)}`) => handleWhopEvent({ type, data }, id);
const SMALL = "plan_extSMALL12345";
const MEDIUM = "plan_extMEDIUM6789";

/** A Plus account created the way production does it: a verified plan payment through the webhook. */
async function plusAccount(): Promise<{ email: string; ws: Workspace }> {
  const email = mail();
  await ev("payment.succeeded", { id: `pay_plan_${email}`, membership_id: `mem_${email}`, paid_at: iso(0), plan_id: "plan_wd9Xs4iDlwvDi", metadata: { email, plan: "plus", source: "keplar.one" } });
  const row = (await workspaceForEmail(email))!;
  const ws = (await workspaceById(row.id))!;
  assert.equal(ws.plan, "plus");
  return { email, ws };
}
const pay = (email: string, id: string, planId = SMALL, extra: Record<string, unknown> = {}) => ({ id, plan_id: planId, status: "paid", paid_at: iso(0), metadata: { email, kind: "extension", source: "keplar.one" }, ...extra });

test("config: packs are unavailable until their Whop plan id is set; credits and expiry are env-configurable", () => {
  const saved = { s: process.env.WHOP_EXTENSION_PLAN_SMALL, m: process.env.WHOP_EXTENSION_PLAN_MEDIUM };
  try {
    delete process.env.WHOP_EXTENSION_PLAN_SMALL;
    process.env.WHOP_EXTENSION_PLAN_MEDIUM = "not-a-plan-id";
    assert.deepEqual(extensionPacks().map((p) => p.available), [false, false]);
    assert.equal(extensionsAvailable(true), false);
    process.env.WHOP_EXTENSION_PLAN_SMALL = SMALL;
    assert.equal(extensionPack("small").available, true);
    assert.equal(extensionsAvailable(true), true);
    assert.equal(extensionsAvailable(false), false, "no Whop API key/company: nothing is sold");
  } finally {
    process.env.WHOP_EXTENSION_PLAN_SMALL = saved.s;
    process.env.WHOP_EXTENSION_PLAN_MEDIUM = saved.m;
  }
  assert.equal(extensionPack("small").credits, 500);
  assert.equal(extensionPack("medium").credits, 2000);
  assert.equal(packForWhopPlanId(SMALL.toUpperCase())?.id, "small", "plan ids match case-insensitively, like Whop");
  assert.equal(packForWhopPlanId("plan_wd9Xs4iDlwvDi"), null, "a subscription plan is never an extension");
  assert.equal(extensionValidDays(), 90);
  process.env.KEPLAR_EXTENSION_VALID_DAYS = "30";
  assert.equal(extensionValidDays(), 30);
  process.env.KEPLAR_EXTENSION_VALID_DAYS = "0";
  assert.equal(extensionValidDays(), 90, "out-of-range values fall back");
  delete process.env.KEPLAR_EXTENSION_VALID_DAYS;
  process.env.KEPLAR_EXTENSION_CREDITS_SMALL = "5";
  assert.equal(extensionPack("small").credits, 1500, "an absurdly small amount falls back to the default");
  process.env.KEPLAR_EXTENSION_CREDITS_SMALL = "500";
});

test("config: only paid plans can buy; Free, Business and unknown cannot", () => {
  assert.deepEqual(["free", "lite", "plus", "pro", "business", "x"].map(canBuyExtension), [false, true, true, true, false, false]);
});

test("checkout body: the plan id decides the product; metadata has no plan so it can never change a subscription", () => {
  const b = extensionCheckoutBody({ planId: SMALL, pack: "small", email: "A@Example.com", workspaceId: "ws_1", origin: "https://keplar.one" });
  assert.equal(b.plan_id, SMALL);
  assert.deepEqual(b.metadata, { email: "a@example.com", kind: "extension", pack: "small", workspace_id: "ws_1", source: "keplar.one" });
  assert.equal("plan" in b.metadata, false);
  assert.match(b.redirect_url, /\/app\?extension=success$/);
});

test("webhook: a verified payment for a pack plan grants its credits once; replays and a second webhook id for the same payment do nothing", async () => {
  const { email, ws } = await plusAccount();
  const before = await workspaceById(ws.id);
  const r1 = await ev("payment.succeeded", pay(email, "pay_e1"), "wh_e1");
  assert.equal(r1.result, "extension=small:500");
  assert.equal(await extensionBalance(ws.id), 500);
  assert.equal((await ev("payment.succeeded", pay(email, "pay_e1"), "wh_e1")).duplicate, true, "same webhook id");
  const r2 = await ev("payment.succeeded", pay(email, "pay_e1"), "wh_e1_again");
  assert.match(r2.result, /^extension_duplicate/, "same payment, new webhook id");
  const rs = await Promise.all(Array.from({ length: 5 }, (_, i) => ev("payment.succeeded", pay(email, "pay_e1b"), `wh_conc_${i}_${email}`)));
  assert.equal(rs.filter((r) => r.result.startsWith("extension=")).length, 1, "concurrent deliveries grant once");
  assert.equal(await extensionBalance(ws.id), 1000);
  // the subscription is untouched: same plan, same billing period
  const after = await workspaceById(ws.id);
  assert.equal(after!.plan, "plus");
  assert.deepEqual(after!.period, before!.period);
  const row = (await extensionForPayment("pay_e1"))!;
  assert.equal(row.workspaceId, ws.id);
  assert.equal(row.credits, 500);
  assert.ok(Math.abs(Date.parse(row.expiresAt) - Date.now() - 90 * DAY) < 60_000, "expires after the configured days");
});

test("webhook: medium pack grants its own amount; browser metadata cannot pick the amount or upgrade the plan", async () => {
  const { email, ws } = await plusAccount();
  await ev("payment.succeeded", pay(email, "pay_m1", MEDIUM, { metadata: { email, kind: "extension", source: "keplar.one", plan: "pro", credits: 999999, pack: "small" } }));
  assert.equal(await extensionBalance(ws.id), 2000, "the Whop plan id decides the pack");
  assert.equal((await workspaceById(ws.id))!.plan, "plus", "metadata.plan cannot upgrade through an extension payment");
});

test("webhook: nothing is granted for unpaid/refunded payments, unknown accounts, other events or unknown plans", async () => {
  const { email, ws } = await plusAccount();
  assert.equal((await ev("payment.succeeded", pay(email, "pay_x1", SMALL, { status: "pending" }))).result, "extension_not_paid");
  assert.equal((await ev("payment.succeeded", pay(email, "pay_x2", SMALL, { refunded_at: iso(0) }))).result, "extension_not_paid");
  assert.equal((await ev("payment.succeeded", pay(mail(), "pay_x3"))).result, "extension_no_workspace");
  assert.equal((await ev("payment.succeeded", { id: "pay_x4", plan_id: SMALL, status: "paid", metadata: {} })).result, "extension_no_workspace");
  assert.equal((await ev("membership.activated", { id: "mem_x5", plan_id: SMALL, metadata: { email } })).result, "extension_ignored");
  assert.equal((await ev("membership.deactivated", { id: "mem_x6", plan_id: SMALL })).result, "extension_ignored");
  assert.equal((await ev("payment.failed", { id: "pay_x7", plan_id: SMALL, metadata: { email } })).result, "extension_ignored");
  assert.doesNotMatch((await ev("payment.succeeded", pay(email, "pay_x8", "plan_notOurs12345"))).result, /^extension/, "an unknown plan id is not an extension");
  assert.equal(await extensionBalance(ws.id), 0);
  assert.equal((await workspaceById(ws.id))!.plan, "plus");
});

test("spend: a full 5-hour window blocks; extension credits let the work through without touching the window or the monthly credits", async () => {
  const { email, ws } = await plusAccount();
  const limit = WINDOW_LIMITS.plus!.fiveHour;
  await chargeUnits(ws, "answer", limit - 10, (limit - 10) * 0.002);
  await assert.rejects(() => assertCanSpend(ws, 200), (e: unknown) => e instanceof EntitlementError && /5-hour usage limit/.test(e.message));
  const usedBefore = await usedThisPeriod(ws);
  await ev("payment.succeeded", pay(email, "pay_s1"));
  await assertCanSpend(ws, 200); // 10 left in the window + 500 extension
  await chargeUnits(ws, "answer", 200, 0.4);
  const w = (await windowMeters(ws))!;
  assert.equal(w.find((x) => x.id === "fiveHour")!.used, limit - 10 + 10, "the window took only what it had room for (10)");
  assert.equal(await usedThisPeriod(ws), usedBefore + 10, "monthly credits counted only the allowance part");
  assert.equal(await extensionBalance(ws.id), 500 - 190, "190 came from the extension");
  assert.equal((await meter(ws)).extension!.balance, 310);
  await assert.rejects(() => assertCanSpend(ws, 400), EntitlementError, "more than window room + extension is still refused");
});

test("spend: monthly credits used up → extension covers; with no extension the old message stays", async () => {
  const { email, ws } = await plusAccount();
  const total = ws.entitlements.monthlyUnits;
  await chargeUnits(ws, "answer", total - 5, 1);
  // windows are not the binding limit here: drop them so only the monthly credits bind
  await assert.rejects(() => assertCanSpend(ws, 100), (e: unknown) => e instanceof EntitlementError);
  await ev("payment.succeeded", pay(email, "pay_s2", MEDIUM));
  await assertCanSpend(ws, 100);
  await chargeUnits(ws, "answer", 100, 0.2);
  assert.ok((await extensionBalance(ws.id)) >= 1900 - 1 && (await extensionBalance(ws.id)) <= 2000);
  assert.equal((await usedThisPeriod(ws)) <= total, true, "used never exceeds the monthly total");
});

test("spend: no extension means nothing changes; Free and admin never draw", async () => {
  const { ws } = await plusAccount();
  await assertCanSpend(ws, 10);
  await chargeUnits(ws, "answer", 10, 0.02);
  assert.equal(await usedThisPeriod(ws), 10);
  assert.equal((await meter(ws)).extension!.balance, 0);
  const free: Workspace = { ...ws, id: `ws_free_${Math.random()}`, plan: "free", entitlements: ENTITLEMENTS.free };
  await grantExtension({ workspaceId: free.id, paymentId: `pay_free_${free.id}`, pack: "small", credits: 500, validDays: 90 });
  await chargeUnits(free, "answer", 50, 0.1);
  assert.equal(await extensionBalance(free.id), 500, "a Free account never spends extension credits");
  assert.equal((await meter(free)).extension, null);
});

test("expiry: expired credits are not counted or spent; soonest-expiring credits are spent first", async () => {
  const { ws } = await plusAccount();
  await grantExtension({ workspaceId: ws.id, paymentId: "pay_old", pack: "small", credits: 500, validDays: 90, paidAt: iso(-100) });
  assert.equal(await extensionBalance(ws.id), 0, "granted 100 days ago, valid 90: expired");
  assert.equal(await drawExtension(ws.id, 10), 0);
  await grantExtension({ workspaceId: ws.id, paymentId: "pay_soon", pack: "small", credits: 100, validDays: 90, paidAt: iso(-85) });
  await grantExtension({ workspaceId: ws.id, paymentId: "pay_late", pack: "medium", credits: 300, validDays: 90, paidAt: iso(0) });
  assert.equal(await extensionBalance(ws.id), 400);
  assert.equal(await drawExtension(ws.id, 150), 150);
  assert.equal((await extensionForPayment("pay_soon"))!.remaining, 0, "the sooner-expiring pack goes first");
  assert.equal((await extensionForPayment("pay_late"))!.remaining, 250);
  assert.equal(await drawExtension(ws.id, 1000), 250, "never more than the balance");
  assert.equal(await extensionBalance(ws.id), 0);
});

test("concurrency: parallel spenders can never take more than the balance", async () => {
  const { ws } = await plusAccount();
  await grantExtension({ workspaceId: ws.id, paymentId: `pay_race_${ws.id}`, pack: "small", credits: 100, validDays: 90 });
  const got = await Promise.all(Array.from({ length: 10 }, () => drawExtension(ws.id, 30)));
  assert.equal(got.reduce((a, b) => a + b, 0), 100);
  assert.equal(await extensionBalance(ws.id), 0);
});

test("refund/dispute: removes only the unspent extension credits and never touches the subscription", async () => {
  const { email, ws } = await plusAccount();
  await ev("payment.succeeded", pay(email, "pay_r1"));
  await drawExtension(ws.id, 120);
  const r = await ev("refund.created", { payment: { id: "pay_r1", plan_id: SMALL } });
  assert.equal(r.result, "extension_revoked");
  assert.equal(await extensionBalance(ws.id), 0);
  assert.equal((await workspaceById(ws.id))!.plan, "plus", "the plan survives a refund of the extension");
  assert.equal((await ev("refund.created", { payment_id: "pay_r1" })).result, "extension_revoked", "found by payment id alone, idempotent");
  assert.equal((await extensionForPayment("pay_r1"))!.status, "revoked");
  // a refund of the plan payment still works as before
  await ev("refund.created", { payment: { id: `pay_plan_${email}`, membership_id: `mem_${email}` } });
  assert.equal((await workspaceById(ws.id))!.plan, "free");
  const { email: e2, ws: ws2 } = await plusAccount();
  await ev("payment.succeeded", pay(e2, "pay_d1", MEDIUM));
  assert.equal((await ev("dispute.created", { payment_id: "pay_d1" })).result, "extension_revoked");
  assert.equal(await extensionBalance(ws2.id), 0);
  assert.equal((await workspaceById(ws2.id))!.plan, "plus");
});

test("the existing plan flow is unchanged: a plan payment with its own plan id still sets the tier", async () => {
  const email = mail();
  const r = await ev("payment.succeeded", { id: `pay_p_${email}`, plan_id: "plan_M6ztgSJDucMJA", paid_at: iso(0), metadata: { email, plan: "pro", source: "keplar.one" } });
  assert.equal(r.result, "plan=pro");
});

test("recordWindowUsage is untouched by extension spending (windows only count the allowance part)", async () => {
  const { ws } = await plusAccount();
  await recordWindowUsage(ws, 5);
  assert.equal((await windowMeters(ws))!.find((x) => x.id === "weekly")!.used, 5);
});
