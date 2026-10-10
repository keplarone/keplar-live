import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { cronMatches, latestSlot, nextSlot } from "@/lib/business/cron";
import { testWorkspace } from "./helpers/workspace";
import { createAgent, runAgent, setHalted, updateAgent } from "@/lib/business/agents";
import { agents, approvals, auditLog, connections, runs } from "@/lib/business/repo";
import { now } from "@/lib/create/platform/ids";
import { claimId, findDueRuns, runScheduledAgent, scheduleClaims, scheduledTrigger, tick } from "@/lib/business/scheduler";
import { functions } from "@/lib/inngest/functions";
import { inngestEnabled } from "@/lib/inngest/client";

// Monday 2026-09-28 13:02 UTC: the Weekly report slot (0 13 * * 1) was 2 minutes ago.
const MONDAY = new Date("2026-09-28T13:02:30Z");
const SLOT = "2026-09-28T13:00:00.000Z";
const PAST = "2026-09-01T00:00:00.000Z";

test("cron matcher", () => {
  assert.ok(cronMatches("0 13 * * 1", new Date(SLOT)));
  assert.ok(!cronMatches("0 13 * * 1", new Date("2026-09-29T13:00:00Z")));
  assert.ok(cronMatches("*/5 * * * *", new Date("2026-09-28T13:05:00Z")));
  assert.ok(cronMatches("0 15 * * 2,4", new Date("2026-10-01T15:00:00Z"))); // Thursday
  assert.ok(cronMatches("0 14 * * 1-5", new Date("2026-10-02T14:00:00Z"))); // Friday
  assert.ok(cronMatches("0 0 * * 7", new Date("2026-09-27T00:00:00Z"))); // Sunday as 7
  assert.equal(latestSlot("0 13 * * 1", MONDAY, 15), SLOT);
  assert.equal(latestSlot("0 13 * * 1", new Date("2026-09-28T13:20:00Z"), 15), null);
  assert.equal(nextSlot("0 13 * * 1", MONDAY), "2026-10-05T13:00:00.000Z");
  assert.throws(() => cronMatches("61 * * * *", MONDAY));
});

test("scheduled runs execute once, queue outbound for approval, and audit", async () => {
  assert.equal(inngestEnabled(), false, "in-process scheduler without Inngest keys");
  assert.equal(functions.length, 4); // 3 business-agent functions + telemetry retention
  const ws = await testWorkspace("sched", "pro");
  // The weekly report needs Slack: fixture a connected workspace with the post tool on (the OAuth flow itself is tested in connectors-oauth).
  await connections().insert({ id: "conn_sched_slack", workspaceId: ws.id, connector: "slack", status: "connected", account: "Test workspace", tokenEnc: null, scopes: ["chat:write"], connectedAt: now(), tools: { post_message: true } });
  const weekly = await createAgent(ws, "weekly-report");
  const social = await createAgent(ws, "social-post");
  await createAgent(ws, "lead-followup");
  for (const a of [weekly, social]) await agents().update(ws.id, a.id, { createdAt: PAST });
  // Even with auto-send on, unattended scheduled runs must go to the approval queue.
  await updateAgent(ws, weekly.id, { autoSend: true });

  const due = await findDueRuns(MONDAY);
  assert.deepEqual(due.map((d) => d.agentId), [weekly.id], "only the Monday agent is due");

  const r1 = await tick(MONDAY);
  assert.equal(r1.due, 1);
  assert.equal(r1.results[0].outcome, "ran");
  assert.equal(r1.results[0].runStatus, "waiting_approval");
  const run = await runs().get(ws.id, r1.results[0].runId!);
  assert.equal(run?.trigger, scheduledTrigger(SLOT));
  const aps = await approvals().list(ws.id, (a) => a.runId === run!.id);
  assert.equal(aps.length, 2);
  assert.ok(aps.every((a) => a.status === "pending"), "slack + sheets actions wait for the owner");
  const audits = await auditLog().list(ws.id, (e) => e.action === "agent.schedule.ran" && e.target === weekly.id);
  assert.equal(audits.length, 1);

  // Idempotency: the next tick, a re-sent event, or an Inngest retry never re-runs the slot.
  assert.equal((await tick(MONDAY)).due, 0);
  const again = await runScheduledAgent({ workspaceId: ws.id, agentId: weekly.id, slot: SLOT, cron: "0 13 * * 1" });
  assert.equal(again.outcome, "duplicate");
  assert.equal((await runs().list(ws.id, (r) => r.agentId === weekly.id)).length, 1);
});

test("crash after the run was written is not repeated", async () => {
  const ws = await testWorkspace("sched", "pro");
  const a = await createAgent(ws, "weekly-report", "Crash test");
  await agents().update(ws.id, a.id, { createdAt: PAST });
  const slot = "2026-10-05T13:00:00.000Z";
  const run = await runAgent(ws, a.id, scheduledTrigger(slot), {}, { forceApproval: true });
  await scheduleClaims().insert({ id: claimId({ agentId: a.id, slot }), workspaceId: ws.id, agentId: a.id, slot, status: "started", runId: null, attempts: 1, createdAt: slot, updatedAt: slot });
  const out = await runScheduledAgent({ workspaceId: ws.id, agentId: a.id, slot, cron: "0 13 * * 1" });
  assert.equal(out.outcome, "duplicate");
  assert.equal(out.runId, run.id);
  assert.equal((await scheduleClaims().get(ws.id, claimId({ agentId: a.id, slot })))?.status, "done");
});

test("transient failures retry; guardrail refusals are final", async () => {
  const ws = await testWorkspace("sched", "pro");
  const a = await createAgent(ws, "weekly-report", "Retry test");
  await agents().update(ws.id, a.id, { createdAt: PAST });
  const at = new Date("2026-10-12T13:01:00Z");
  let calls = 0;
  const flaky: typeof runAgent = async (...args) => {
    calls += 1;
    if (calls < 3) throw new Error("upstream timeout");
    return runAgent(...args);
  };
  // Only this agent: pause the others created earlier.
  for (const other of await agents().list(ws.id, (x) => x.id !== a.id && x.status === "active")) await agents().update(ws.id, other.id, { status: "paused" });
  const r = await tick(at, { runner: flaky, backoffMs: 1 });
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].outcome, "ran");
  assert.equal(r.results[0].attempts, 3);
  const failures = await auditLog().list(ws.id, (e) => e.action === "agent.schedule.failed" && e.target === a.id);
  assert.equal(failures.length, 2);

  // Halted workspace: skipped once, audited, and not re-dispatched.
  await setHalted(ws, true);
  const at2 = new Date("2026-10-19T13:01:00Z");
  const h = await tick(at2);
  assert.equal(h.results[0].outcome, "skipped");
  assert.equal(h.results[0].reason, "halted");
  assert.equal((await tick(at2)).due, 0);
  assert.ok((await auditLog().list(ws.id, (e) => e.action === "agent.schedule.skipped")).length >= 1);
  await setHalted(ws, false);

  // Paused agents are never due.
  await updateAgent(ws, a.id, { status: "paused" });
  assert.equal((await findDueRuns(new Date("2026-10-26T13:01:00Z"))).length, 0);
});
