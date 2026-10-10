import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleWhopEvent } from "@/lib/billing/sync";
import { planLapsed, updateWorkspace, workspaceForEmail, workspaces } from "@/lib/accounts/workspaces";
import { workspaceById } from "@/lib/create/platform/workspace";
import { chargeUnits, usedThisPeriod } from "@/lib/create/platform/compute";
import { collection } from "@/lib/create/platform/store";

const DAY = 864e5;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();
let n = 0;
const mail = () => `life${++n}-${Math.random().toString(36).slice(2, 6)}@example.com`;
const ev = (type: string, data: Record<string, unknown>, id = `wh_${Math.random().toString(36).slice(2)}`) => handleWhopEvent({ type, data }, id);

test("billing: concurrent deliveries of one webhook-id apply exactly once", async () => {
  const email = mail();
  const data = { id: "pay_c1", membership_id: "mem_c1", paid_at: iso(0), metadata: { email, plan: "plus" } };
  const rs = await Promise.all(Array.from({ length: 6 }, () => ev("payment.succeeded", data, "wh_same_id")));
  assert.equal(rs.filter((r) => !r.duplicate).length, 1, "exactly one delivery is applied");
  assert.equal((await workspaceForEmail(email))!.plan, "plus");
  const rows = await collection<{ id: string; workspaceId: string; result: string }>("billing_events").listSystem((r) => r.id === "wh_same_id");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].result, "plan=plus", "the claim row ends with the real result, not 'processing'");
});

test("billing: a failed handler releases the claim so the retry is processed; a stuck claim is taken over", async () => {
  const email = mail();
  const data = { id: "pay_r1", membership_id: "mem_r1", paid_at: iso(0), metadata: { email, plan: "plus" } };
  const store = collection<{ id: string; workspaceId: string; type: string; at: string; result: string }>("billing_events");
  // a crashed instance left a fresh "processing" claim → a concurrent delivery is a duplicate
  await store.insert({ id: "wh_fresh", workspaceId: "system", type: "payment.succeeded", at: new Date().toISOString(), result: "processing" });
  assert.equal((await ev("payment.succeeded", data, "wh_fresh")).duplicate, true);
  // ...but one older than 2 minutes is retried
  await store.insert({ id: "wh_stale", workspaceId: "system", type: "payment.succeeded", at: new Date(Date.now() - 5 * 60_000).toISOString(), result: "processing" });
  const r = await ev("payment.succeeded", data, "wh_stale");
  assert.equal(r.duplicate, false);
  assert.equal(r.result, "plan=plus");
  // handler throws (store error) → claim removed
  const ws = workspaces();
  const orig = ws.findSystemBy.bind(ws);
  ws.findSystemBy = async () => { throw new Error("db down"); };
  await assert.rejects(ev("membership.deactivated", { id: "mem_r1" }, "wh_boom"));
  ws.findSystemBy = orig;
  assert.equal(await store.get("system", "wh_boom"), null, "claim released after failure");
  assert.equal((await ev("membership.deactivated", { id: "mem_r1" }, "wh_boom")).result, "plan=free", "Whop's retry succeeds");
});

test("billing: failed payment keeps access until the period ends and records past_due; renewal clears it and resets usage", async () => {
  const email = mail();
  await ev("payment.succeeded", { id: "pay_f1", membership_id: "mem_f1", paid_at: iso(-30), renewal_period_end: iso(1), metadata: { email, plan: "plus" } });
  let row = (await workspaceForEmail(email))!;
  const w0 = (await workspaceById(row.id))!;
  await chargeUnits(w0, "answer", 500, 1);
  assert.equal(await usedThisPeriod((await workspaceById(row.id))!), 500);

  assert.equal((await ev("payment.failed", { id: "pay_f2", membership_id: "mem_f1" })).result, "past_due");
  row = (await workspaceForEmail(email))!;
  assert.equal(row.plan, "plus", "still Plus until the paid period ends");
  assert.equal(row.billing.status, "past_due");
  assert.ok(row.billing.paymentFailedAt);

  // renewal succeeds (no plan metadata on renewals: the stored plan is kept) → active, new period, usage counter restarts
  const paidAt = iso(0);
  assert.equal((await ev("payment.succeeded", { id: "pay_f3", membership_id: "mem_f1", paid_at: paidAt, renewal_period_end: iso(31), metadata: {} })).result, "plan=plus");
  row = (await workspaceForEmail(email))!;
  assert.equal(row.billing.status, "active");
  assert.equal(row.billing.paymentFailedAt, null);
  assert.equal(row.billing.periodStart, paidAt);
  assert.equal(await usedThisPeriod((await workspaceById(row.id))!), 0, "usage resets at the new period");

  // an unknown membership with no workspace never creates a plan
  assert.equal((await ev("payment.failed", { id: "pay_x", membership_id: "mem_unknown" })).result, "no_workspace");
});

test("billing: cancel at period end keeps the plan, flags it, and can be undone; deactivation then moves to Free", async () => {
  const email = mail();
  await ev("payment.succeeded", { id: "pay_k1", membership_id: "mem_k1", paid_at: iso(0), metadata: { email, plan: "pro" } });
  assert.equal((await ev("membership.cancel_at_period_end_changed", { id: "mem_k1", cancel_at_period_end: true })).result, "cancel_at_period_end");
  let row = (await workspaceForEmail(email))!;
  assert.equal(row.plan, "pro");
  assert.equal(row.billing.cancelAtPeriodEnd, true);
  assert.equal((await ev("membership.cancel_at_period_end_changed", { id: "mem_k1", cancel_at_period_end: false })).result, "renewal_resumed");
  assert.equal((await workspaceForEmail(email))!.billing.cancelAtPeriodEnd, false);
  await ev("membership.deactivated", { id: "mem_k1" });
  row = (await workspaceForEmail(email))!;
  assert.equal(row.plan, "free");
  assert.equal(row.billing.status, "canceled");
  assert.equal(row.billing.subscriptionId, null);
});

test("billing: downgrade Pro → Plus changes the plan and its credits", async () => {
  const email = mail();
  await ev("membership.activated", { id: "mem_d1", created_at: iso(0), metadata: { email, plan: "pro" } });
  const row = (await workspaceForEmail(email))!;
  assert.equal((await workspaceById(row.id))!.entitlements.monthlyUnits, 13_500);
  await ev("membership.activated", { id: "mem_d1", created_at: iso(0), metadata: { email, plan: "plus" } });
  assert.equal((await workspaceById(row.id))!.plan, "plus");
  assert.equal((await workspaceById(row.id))!.entitlements.monthlyUnits, 6_000);
});

test("entitlement: a paid plan whose period ended past the grace window without renewal or cancel webhook falls back to Free", async () => {
  const email = mail();
  await ev("payment.succeeded", { id: "pay_l1", membership_id: "mem_l1", paid_at: iso(-40), renewal_period_end: iso(-10), metadata: { email, plan: "plus" } });
  const row = (await workspaceForEmail(email))!;
  assert.equal(planLapsed(row), true);
  assert.equal((await workspaceById(row.id))!.plan, "free", "10 days past the end → Free");
  await updateWorkspace(row.id, { billing: { periodEnd: iso(-1) } });
  assert.equal(planLapsed((await workspaceForEmail(email))!), false, "inside the 3-day grace");
  assert.equal((await workspaceById(row.id))!.plan, "plus");
  assert.equal(planLapsed({ plan: "plus", billing: { ...row.billing, periodEnd: null } }), false, "no recorded period end → never expired by guesswork");
  assert.equal(planLapsed({ plan: "free", billing: { ...row.billing, periodEnd: iso(-100) } }), false);
});
