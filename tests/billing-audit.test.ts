import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { claimFromPayment, extract } from "@/lib/billing/sync";
import { EMBED_SOURCE } from "@/lib/billing/embed";

test("embedded checkout: browser-set metadata can never grant a tier (only a known Whop plan id can)", () => {
  const ids = extract({ id: "pay_1", plan_id: "plan_unknownCheap1", metadata: { source: EMBED_SOURCE, plan: "pro", email: "x@y.com" } });
  assert.equal(ids.plan, null);
  const claim = claimFromPayment({ status: "paid", paid_at: new Date().toISOString(), plan: { id: "plan_unknownCheap1" }, metadata: { source: EMBED_SOURCE, plan: "pro", email: "x@y.com" } }, "x@y.com");
  assert.equal(claim, null);
});

test("hosted checkout (server-set metadata) still decides the tier", () => {
  const ids = extract({ id: "pay_2", metadata: { email: "x@y.com", plan: "plus", workspace_id: "ws" } });
  assert.equal(ids.plan, "plus");
});
