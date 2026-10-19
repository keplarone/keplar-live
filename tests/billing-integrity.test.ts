import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { NotificationTypeV2 } from "@apple/app-store-server-library";
import { handleWhopEvent, refreshClaim } from "@/lib/billing/sync";
import { decodedFromFixture } from "@/lib/billing/apple";
import { applyDecodedAppleEvent, notificationIdFor } from "@/lib/billing/apple-sync";
import { ensureWorkspaceForUser, getWorkspace, workspaceForEmail } from "@/lib/accounts/workspaces";
import { collection } from "@/lib/create/platform/store";

const DAY = 864e5;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();
const payment = (email: string, paidAt: string, membership = "active") => ({ status: "paid", paid_at: paidAt, metadata: { email, plan: "plus" }, membership: { id: "mem_ri", status: membership } });

test("refresh plan: a deactivated membership is not re-granted from the payment that preceded the cancellation", async () => {
  const email = `refresh-${Math.random().toString(36).slice(2, 7)}@example.com`;
  await handleWhopEvent({ type: "payment.succeeded", data: { id: "pay_ri1", membership_id: "mem_ri", paid_at: iso(-2), metadata: { email, plan: "plus" } } }, `wh_ri1_${email}`);
  await handleWhopEvent({ type: "membership.deactivated", data: { id: "mem_ri" } }, `wh_ri2_${email}`);
  const row = (await workspaceForEmail(email))!;
  assert.equal(row.billing.status, "canceled");
  assert.ok(row.billing.canceledAt, "the cancellation time is recorded");

  // Whop still lists the old payment with membership "active" (stale): Refresh must not resurrect the plan.
  assert.equal(refreshClaim([payment(email, iso(-2))], email, row.billing, row.updatedAt), null);
  // A payment made after the cancellation (a real resubscribe whose webhook was lost) is honoured.
  const later = new Date(Date.parse(row.billing.canceledAt!) + 60_000).toISOString();
  assert.equal(refreshClaim([payment(email, later)], email, row.billing, row.updatedAt)?.plan, "plus");
});

test("refresh plan: refunds and disputes block it, active accounts pick the best paid claim", () => {
  const email = "refresh-best@example.com";
  assert.equal(refreshClaim([payment(email, iso(-1))], email, { status: "unpaid" }), null);
  assert.equal(refreshClaim([payment(email, iso(-1))], email, { status: "active" })?.plan, "plus");
  assert.equal(refreshClaim([payment(email, iso(-1), "expired")], email, { status: "active" }), null, "an ended membership never counts");
  assert.equal(refreshClaim([payment("someone-else@example.com", iso(-1))], email, { status: "active" }), null, "another person's payment never counts");
  // A cancelled row from before canceledAt existed falls back to its last update.
  assert.equal(refreshClaim([payment(email, iso(-3))], email, { status: "canceled" }, iso(-1)), null);
  assert.equal(refreshClaim([payment(email, iso(0))], email, { status: "canceled" }, iso(-1))?.plan, "plus");
});

test("apple: concurrent deliveries of one notification apply exactly once and the claim keeps the real result", async () => {
  const decoded = decodedFromFixture({ transactionId: "3000000001", originalTransactionId: "3000000001", productId: "one.keplar.plus.monthly", purchaseDateMs: Date.now(), expiresDateMs: Date.now() + 30 * DAY })!;
  const ws = await ensureWorkspaceForUser({ id: "user_apple_race", email: "apple-race@example.com" });
  const rs = await Promise.all(Array.from({ length: 6 }, () => applyDecodedAppleEvent({ notificationUUID: "notif_race_1", type: NotificationTypeV2.SUBSCRIBED, workspace: ws, decoded })));
  assert.equal(rs.filter((r) => r.result === "plan=plus").length >= 1, true);
  assert.equal(rs.filter((r) => r.result !== "plan=plus" && r.result !== "processing").length, 0);
  const rows = await collection<{ id: string; workspaceId: string; result: string }>("apple_billing_events").listSystem((r) => r.id === "notif_race_1");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].result, "plan=plus");
  assert.equal((await getWorkspace(ws.id))!.plan, "plus");
});

test("apple: a stale processing claim is taken over, a fresh one is a duplicate", async () => {
  const decoded = decodedFromFixture({ transactionId: "3000000002", originalTransactionId: "3000000002", productId: "one.keplar.pro.monthly", purchaseDateMs: Date.now(), expiresDateMs: Date.now() + 30 * DAY })!;
  const ws = await ensureWorkspaceForUser({ id: "user_apple_stale", email: "apple-stale@example.com" });
  const store = collection<{ id: string; workspaceId: string; type: string; at: string; result: string }>("apple_billing_events");
  await store.insert({ id: "notif_fresh", workspaceId: "system", type: "SUBSCRIBED", at: new Date().toISOString(), result: "processing" });
  assert.equal((await applyDecodedAppleEvent({ notificationUUID: "notif_fresh", type: NotificationTypeV2.SUBSCRIBED, workspace: ws, decoded })).result, "processing");
  assert.equal((await getWorkspace(ws.id))!.plan, "free", "a duplicate never applies");
  await store.insert({ id: "notif_stale", workspaceId: "system", type: "SUBSCRIBED", at: new Date(Date.now() - 5 * 60_000).toISOString(), result: "processing" });
  assert.equal((await applyDecodedAppleEvent({ notificationUUID: "notif_stale", type: NotificationTypeV2.SUBSCRIBED, workspace: ws, decoded })).result, "plan=pro");
});

test("apple: a notification without a UUID dedupes on its signed payload, not the clock", () => {
  assert.equal(notificationIdFor("uuid-1", "jws"), "uuid-1");
  assert.equal(notificationIdFor(undefined, "header.payload.sig"), notificationIdFor("", "header.payload.sig"));
  assert.notEqual(notificationIdFor(undefined, "a.b.c"), notificationIdFor(undefined, "a.b.d"));
  assert.match(notificationIdFor(null, "x"), /^apple_[0-9a-f]{32}$/);
});
