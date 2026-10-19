import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcile, runReconciliation } from "@/lib/billing/reconcile";
import { emptyBilling, ensureWorkspaceForUser, updateWorkspace } from "@/lib/accounts/workspaces";
import { collection } from "@/lib/create/platform/store";
import { GET as reconcileCron } from "@/app/api/cron/billing-reconcile/route";

const NOW = Date.parse("2026-10-19T05:25:00Z");
const DAY = 864e5;
const iso = (d: number) => new Date(NOW + d * DAY).toISOString();
const ws = (id: string, plan: string, billing: Partial<ReturnType<typeof emptyBilling>> = {}) => ({ id, plan, ownerEmail: `${id}@example.com`, billing: { ...emptyBilling(), ...billing } }) as Parameters<typeof reconcile>[0]["workspaces"][number];

test("reconcile: each mismatch kind is found, consistent rows are not", () => {
  const f = reconcile({
    workspaces: [
      ws("w_ok", "plus", { status: "active", periodEnd: iso(10), subscriptionId: "mem_ok" }),
      ws("w_free", "free", { status: "none" }),
      ws("w_grace", "plus", { status: "past_due", periodEnd: iso(-2) }),
      ws("w_lapsed", "pro", { status: "active", periodEnd: iso(-5) }),
      ws("w_revoked", "plus", { status: "canceled", periodEnd: iso(5) }),
      ws("w_freeactive", "free", { status: "active" }),
      ws("w_refund", "plus", { status: "active", periodEnd: iso(20), subscriptionId: "mem_r" }),
      ws("w_apple", "pro", { status: "active", periodEnd: iso(20), subscriptionId: "apple_1000" }),
    ],
    payments: [{ id: "pay_r", membershipId: "mem_r", refundedAt: iso(-1) }, { id: "pay_ok", membershipId: "mem_ok" }],
    appleSubs: [{ id: "1000", boundWorkspaceId: "w_apple", status: "expired" }],
    claims: [
      { id: "wh_stuck", at: iso(-0.1), result: "processing", source: "whop" },
      { id: "wh_fresh", at: new Date(NOW - 60_000).toISOString(), result: "processing", source: "whop" },
      { id: "wh_done", at: iso(-1), result: "plan=plus", source: "whop" },
    ],
  }, NOW);
  assert.deepEqual(f.map((x) => `${x.kind}:${x.ref}`).sort(), [
    "apple_ended_still_paid:w_apple",
    "free_marked_active:w_freeactive",
    "lapsed_still_paid:w_lapsed",
    "refunded_still_paid:w_refund",
    "revoked_status_paid:w_revoked",
    "stuck_webhook:wh_stuck",
  ]);
  for (const x of f) assert.doesNotMatch(x.detail, /@/, "no email address in a finding");
});

test("reconcile run: reads the real collections, changes nothing, alerts once with counts", async () => {
  const w = await ensureWorkspaceForUser({ id: "user_reconcile_1", email: "reconcile-1@example.com" });
  await updateWorkspace(w.id, { plan: "pro", billing: { status: "active", periodEnd: new Date(Date.now() - 10 * DAY).toISOString() } });
  await collection<{ id: string; workspaceId: string; type: string; at: string; result: string }>("billing_events").insert({ id: "wh_reconcile_stuck", workspaceId: "system", type: "payment.succeeded", at: new Date(Date.now() - 3_600_000).toISOString(), result: "processing" });
  const sent: { subject: string; text: string }[] = [];
  const r = await runReconciliation(Date.now(), async (subject, text) => { sent.push({ subject, text }); });
  assert.ok(r.findings.some((f) => f.kind === "lapsed_still_paid" && f.ref === w.id));
  assert.ok(r.findings.some((f) => f.kind === "stuck_webhook" && f.ref === "wh_reconcile_stuck"));
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /Nothing was changed automatically/);
  assert.doesNotMatch(sent[0].text, /reconcile-1@example\.com/);
  const after = await collection<{ id: string; workspaceId: string; plan: string }>("accounts_workspaces").get(w.id, w.id);
  assert.equal(after?.plan, "pro", "report only: the row is untouched");
});

test("reconcile cron: 401 without the ops secret", async () => {
  assert.equal((await reconcileCron(new Request("https://keplar.one/api/cron/billing-reconcile"))).status, 401);
});
