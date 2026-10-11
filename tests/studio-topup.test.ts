import "./setup";
import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { testWorkspace } from "./helpers/workspace";
import { getWorkspace, updateWorkspace } from "@/lib/accounts/workspaces";
import { configureStudioTopUp, customTopUpConfig, runStudioTopUp, studioTopUpQuote, studioTopUpState, syncStudioTopUp, revokeStudioTopUp } from "@/lib/billing/studio-topup";
import { extensionBalance, drawExtension, grantExtension } from "@/lib/create/platform/extensions";
import { collection } from "@/lib/create/platform/store";
import { setControls } from "@/lib/ops/controls";
import { handleWhopEvent } from "@/lib/billing/sync";
import { POST } from "@/app/api/billing/studio-topup/route";
import type { TopUpPayment } from "@/lib/billing/studio-topup-whop";

const realFetch = globalThis.fetch;
const members = new Map<string, string>();
const payments = new Map<string, TopUpPayment>();
let creates = 0;
let price = 5;
let paymentState = "paid";
let timeout = false;
let wrongMember = false;
let denied = false;
let onCards: (() => Promise<void>) | undefined;
let n = 0;

beforeEach(() => {
  members.clear(); payments.clear(); creates = 0; price = 5; paymentState = "paid"; timeout = false; wrongMember = false; denied = false; onCards = undefined;
  process.env.WHOP_API_KEY = "fake-test-key";
  process.env.WHOP_COMPANY_ID = "biz_test";
  process.env.WHOP_WEBHOOK_SECRET = "fake-test-secret";
  process.env.WHOP_EXTENSION_PLAN_SMALL = "plan_small12345";
  delete process.env.WHOP_EXTENSION_PLAN_MEDIUM;
  process.env.KEPLAR_EXTENSION_CREDITS_SMALL = "1500";
  process.env.KEPLAR_STUDIO_TOPUP_CREDITS_PER_USD = "0";
  globalThis.fetch = (async (input, init) => {
    const u = new URL(String(input));
    assert.equal(u.origin, "https://api.whop.com", "No real provider calls in this test");
    if (u.pathname.includes("/memberships/")) {
      const id = u.pathname.split("/").pop()!;
      const user = members.get(id);
      assert.ok(user);
      return Response.json({ id, status: "active", company: { id: "biz_test" }, user: { id: user }, member: { id: wrongMember ? "mber_other" : `mber_${user}` } });
    }
    if (u.pathname.includes("/variants/")) return Response.json({ id: "plan_small12345", account: { id: "biz_test" }, plan_type: "one_time", currency: "usd", initial_price: price, tax_type: "exclusive" });
    if (u.pathname.endsWith("/payment_methods")) {
      assert.ok(u.searchParams.get("member_id")?.startsWith("mber_"));
      assert.equal(u.searchParams.get("future_usage"), "off_session");
      assert.equal(u.searchParams.get("expired"), "false");
      assert.equal(u.searchParams.get("broken"), "false");
      if (onCards) await onCards();
      return Response.json({ data: [{ id: "payt_card", payment_method_type: "card", card: { last4: "4242", brand: "visa", expired: false } }] });
    }
    if (u.pathname.endsWith("/payments") && init?.method === "POST") {
      creates++;
      if (denied) return Response.json({ error: "missing permission" }, { status: 403 });
      const b = JSON.parse(String(init.body));
      assert.equal(b.account_id, "biz_test");
      assert.equal(b.payment_method_id, "payt_card");
      if (b.plan) {
        assert.equal(b.plan_id, undefined);
        assert.equal(b.plan.currency, "usd");
        assert.equal(b.plan.plan_type, "one_time");
        assert.equal(b.plan.renewal_price, undefined);
        assert.equal(b.plan.product.external_identifier, "keplar-studio-custom-credits");
      } else assert.equal(b.plan_id, "plan_small12345");
      assert.equal(b.capture, true);
      const id = `pay_${++n}`;
      const amount = b.plan?.initial_price ?? price;
      const p: TopUpPayment = { id, status: paymentState, substatus: paymentState === "paid" ? "succeeded" : paymentState === "void" ? "failed" : "pending", company: { id: "biz_test" }, member: { id: b.member_id }, user: { id: b.member_id.slice(5) }, plan: { id: b.plan_id ?? "plan_custom12345" }, metadata: b.metadata, currency: "usd", total: amount, subtotal: amount, paid_at: new Date().toISOString() };
      payments.set(id, p);
      if (timeout) throw new Error("Connection timed out AFTER Whop accepted the charge");
      return Response.json(p);
    }
    if (u.pathname.includes("/payments/")) return Response.json(payments.get(u.pathname.split("/").pop()!)!);
    throw new Error(`Unexpected test request: ${u.pathname}`);
  }) as typeof fetch;
});
afterEach(async () => { globalThis.fetch = realFetch; await setControls({ pauseAgents: false }, "test"); });

async function account() {
  const ws = await testWorkspace(`topup${++n}`, "plus");
  await updateWorkspace(ws.id, { billing: { status: "active", customerId: ws.userId, subscriptionId: `mem_${ws.userId}` } });
  members.set(`mem_${ws.userId}`, ws.userId!);
  return { ...ws, entitlements: { ...ws.entitlements, monthlyUnits: 0 } };
}
async function enable(ws: Awaited<ReturnType<typeof account>>, monthlyLimit = 3) {
  const q = await studioTopUpQuote(ws);
  await configureStudioTopUp(ws, { enabled: true, quoteId: q.quoteId, pack: "small", methodId: "payt_card", monthlyLimit });
  return q;
}

test("off by default; consent saves exact terms without charging; disabling prevents a charge", async () => {
  const ws = await account();
  assert.equal((await studioTopUpState(ws)).enabled, false);
  await assert.rejects(runStudioTopUp(ws), /Enable auto top-up/);
  await enable(ws);
  assert.equal(creates, 0);
  assert.equal((await studioTopUpState(ws)).choice?.priceUsd, 5);
  await configureStudioTopUp(ws, { enabled: false });
  await assert.rejects(runStudioTopUp(ws), /Enable auto top-up/);
  assert.equal(creates, 0);
});

test("paid charge grants once, preserves subscription and never charges while credits remain", async () => {
  const ws = await account(); await enable(ws);
  assert.equal((await runStudioTopUp(ws)).status, "ready");
  assert.equal(await extensionBalance(ws.id), 1500);
  const p = [...payments.values()][0];
  await handleWhopEvent({ type: "payment.succeeded", data: p as Record<string, unknown> }, `wh_${++n}`);
  await syncStudioTopUp(p as Record<string, unknown>);
  assert.equal((await runStudioTopUp(ws)).status, "ready");
  assert.equal(await extensionBalance(ws.id), 1500);
  assert.equal(creates, 1);
  assert.equal((await getWorkspace(ws.id))?.plan, "plus");
  assert.equal((await getWorkspace(ws.id))?.billing.subscriptionId, `mem_${ws.userId}`);
});

test("concurrent requests create only one payment; pending payment grants nothing", async () => {
  const ws = await account(); await enable(ws); paymentState = "pending";
  const results = await Promise.all(Array.from({ length: 8 }, () => runStudioTopUp(ws)));
  assert.ok(results.every((r) => r.status === "pending"));
  assert.equal(creates, 1); assert.equal(await extensionBalance(ws.id), 0);
  const p = [...payments.values()][0]; p.status = "paid"; p.substatus = "succeeded";
  assert.equal((await runStudioTopUp(ws)).status, "ready");
  assert.equal(creates, 1); assert.equal(await extensionBalance(ws.id), 1500);
});

test("ambiguous timeout stays locked through disable/re-enable and is recovered by webhook", async () => {
  const ws = await account(); await enable(ws); timeout = true;
  assert.equal((await runStudioTopUp(ws)).status, "pending");
  await configureStudioTopUp(ws, { enabled: false }); await enable(ws);
  for (let i = 0; i < 3; i++) assert.equal((await runStudioTopUp(ws)).status, "pending");
  assert.equal(creates, 1); assert.equal(await extensionBalance(ws.id), 0);
  await syncStudioTopUp([...payments.values()][0] as Record<string, unknown>);
  assert.equal(await extensionBalance(ws.id), 1500); assert.equal(creates, 1);
});

test("price or membership changes require new consent and do not charge", async () => {
  const ws = await account(); await enable(ws); price = 6;
  await assert.rejects(runStudioTopUp(ws), /payment details changed/);
  price = 5; wrongMember = true;
  await assert.rejects(runStudioTopUp(ws), /payment details changed/);
  assert.equal(creates, 0);
});

test("monthly limit survives re-enabling and stops further purchases", async () => {
  const ws = await account(); await enable(ws, 1);
  await runStudioTopUp(ws); await drawExtension(ws.id, 1500);
  await enable(ws, 1);
  await assert.rejects(runStudioTopUp(ws), /monthly auto top-up limit/);
  assert.equal(creates, 1);
});

test("a failed card is not retried automatically", async () => {
  const ws = await account(); await enable(ws); paymentState = "void";
  await assert.rejects(runStudioTopUp(ws), /did not complete/);
  await assert.rejects(runStudioTopUp(ws), /Review your last payment/);
  assert.equal(creates, 1); assert.equal(await extensionBalance(ws.id), 0);
});

test("operator pause cannot trigger a purchase", async () => {
  const ws = await account(); await enable(ws);
  await setControls({ pauseAgents: true }, "test");
  await assert.rejects(runStudioTopUp(ws), /paused/);
  assert.equal(creates, 0);
});

test("manual credits arriving during card verification prevent an unnecessary top-up", async () => {
  const ws = await account(); await enable(ws);
  onCards = async () => { await grantExtension({ workspaceId: ws.id, paymentId: `manual_${++n}`, pack: "small", credits: 1500, validDays: 90 }); };
  assert.equal((await runStudioTopUp(ws)).status, "ready"); assert.equal(creates, 0);
});

test("disable during provider verification prevents the charge", async () => {
  const ws = await account(); await enable(ws);
  onCards = async () => { await configureStudioTopUp(ws, { enabled: false }); };
  await assert.rejects(runStudioTopUp(ws), /settings changed/); assert.equal(creates, 0);
});

test("refunds revoke credits and a late paid event cannot regrant them", async () => {
  const ws = await account(); await enable(ws); await runStudioTopUp(ws);
  const p = [...payments.values()][0];
  assert.equal(await revokeStudioTopUp(p.id, "refund.created"), true);
  await syncStudioTopUp(p as Record<string, unknown>);
  assert.equal(await extensionBalance(ws.id), 0);
  await assert.rejects(runStudioTopUp(ws), /Review your last payment/);
  assert.equal(creates, 1);
});

test("another account cannot use a quote or saved card, and expired quotes are rejected", async () => {
  const ws = await account(); const other = await account(); const q = await studioTopUpQuote(ws);
  const input = { enabled: true, quoteId: q.quoteId, pack: "small", methodId: "payt_card", monthlyLimit: 1 };
  await assert.rejects(configureStudioTopUp(other, input), /expired/);
  await assert.rejects(configureStudioTopUp(ws, { ...input, methodId: "payt_someone_else" }), /Choose a credit pack/);
  await collection<{ id: string; workspaceId: string; expiresAt: number }>("studio_topup_quotes").update(ws.id, q.quoteId, { expiresAt: 0 });
  await assert.rejects(configureStudioTopUp(ws, input), /expired/);
  assert.equal(creates, 0);
});

test("cross-site recharge requests are rejected before billing", async () => {
  const response = await POST(new Request("https://keplar.one/api/billing/studio-topup", { method: "POST", headers: { origin: "https://attacker.example", "content-type": "application/json" }, body: JSON.stringify({ action: "recharge" }) }));
  assert.equal(response.status, 403); assert.equal(creates, 0);
});

test("custom amount uses the approved 120 credits per dollar without configured pack plans", async () => {
  delete process.env.KEPLAR_STUDIO_TOPUP_CREDITS_PER_USD;
  delete process.env.WHOP_EXTENSION_PLAN_SMALL;
  assert.equal(customTopUpConfig()?.creditsPerUsd, 120);
  const ws = await account(); const q = await studioTopUpQuote(ws, 12.50);
  assert.equal(q.offers.length, 1); assert.equal(q.offers[0].credits, 1500);
  assert.equal(q.offers[0].priceUsd, 12.50);
  await configureStudioTopUp(ws, { enabled: true, quoteId: q.quoteId, pack: "custom", methodId: "payt_card", monthlyLimit: 1 });
  assert.equal(creates, 0);
  assert.equal((await runStudioTopUp(ws)).status, "ready");
  assert.equal(creates, 1); assert.equal(await extensionBalance(ws.id), 1500);
  const p = [...payments.values()][0]; assert.equal(p.total, 12.50);
  await handleWhopEvent({ type: "payment.succeeded", data: p as Record<string, unknown> }, `wh_${++n}`);
  assert.equal(await extensionBalance(ws.id), 1500);
  assert.equal((await getWorkspace(ws.id))?.plan, "plus");
});

test("custom quotes reject invalid amounts and changing the rate requires fresh consent", async () => {
  process.env.KEPLAR_STUDIO_TOPUP_CREDITS_PER_USD = "120";
  const ws = await account();
  for (const amount of [-1, 0, 0.01, 501, 10.001, NaN, Infinity]) await assert.rejects(studioTopUpQuote(ws, amount), /Choose an amount/);
  const q = await studioTopUpQuote(ws, 10.01);
  assert.equal(q.offers[0].credits, 1201, "fractional credits round down");
  await configureStudioTopUp(ws, { enabled: true, quoteId: q.quoteId, pack: "custom", methodId: "payt_card", monthlyLimit: 1 });
  process.env.KEPLAR_STUDIO_TOPUP_CREDITS_PER_USD = "100";
  await assert.rejects(runStudioTopUp(ws), /payment details changed/); assert.equal(creates, 0);
});

test("concurrent instantly paid top-ups still charge only once", async () => {
  const ws = await account(); await enable(ws);
  await Promise.all(Array.from({ length: 8 }, () => runStudioTopUp(ws)));
  assert.equal(creates, 1); assert.equal(await extensionBalance(ws.id), 1500);
});

test("a mismatched payment cannot grant credits or start another charge", async () => {
  const ws = await account(); await enable(ws); paymentState = "pending";
  await runStudioTopUp(ws);
  const p = [...payments.values()][0]; p.status = "paid"; p.substatus = "succeeded"; p.user = { id: "someone_else" };
  await assert.rejects(runStudioTopUp(ws), /do not match/);
  assert.equal(await extensionBalance(ws.id), 0); assert.equal(creates, 1);
});

test("missing charge permission is a terminal failure, never an automatic retry", async () => {
  const ws = await account(); await enable(ws); denied = true;
  await assert.rejects(runStudioTopUp(ws), /Whop rejected/);
  await assert.rejects(runStudioTopUp(ws), /Review your last payment/);
  assert.equal(creates, 1); assert.equal(await extensionBalance(ws.id), 0);
});
