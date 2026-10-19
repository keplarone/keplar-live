import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { signIn, call } from "./helpers/session";
import { jobRows, type CoreJob } from "@/lib/core/jobs";
import { agents, approvals, mcpReceipts, runs } from "@/lib/business/repo";
import { CHAT_AGENT } from "@/lib/mcp/gateway";
import { fromAgentRun, fromChatTools, fromCoreJob } from "@/lib/runs/project";
import type { Agent, AgentRun, Approval } from "@/lib/business/types";
import type { McpReceipt } from "@/lib/mcp/types";
import type { RunView } from "@/lib/runs/types";

const iso = (minsAgo = 0) => new Date(Date.now() - minsAgo * 60_000).toISOString();
let n = 0;
const uid = (p: string) => `${p}_${Date.now().toString(36)}${++n}`;

const SECRET_CONTEXT = "ATTACHED-FILE-TEXT-must-never-leave";
const SCRATCH = "scratch-work-must-never-leave";

function coreJob(workspaceId: string, o: Partial<CoreJob> = {}): CoreJob {
  return {
    id: uid("cj"), workspaceId, status: "paused", createdAt: iso(30), updatedAt: iso(5), expiresAt: new Date(Date.now() + 86_400_000).toISOString(), slices: 1, checks: [],
    prompt: "What is the take-home pay on $80,000 after the 2026 bands?", context: SECRET_CONTEXT, depth: "thorough", plan: "plus",
    steps: [
      { id: "s1", title: "Work out the tax per band", kind: "math", status: "done", attempts: 1, work: SCRATCH },
      { id: "s2", title: "Add the bands up", kind: "math", status: "active", attempts: 1 },
    ],
    markdown: "", answerId: "a1", usedCalls: 9, usedMs: 80_000, needs: { math: true, code: false }, kind: "math",
    ...o,
  } as CoreJob;
}

const approval = (workspaceId: string, o: Partial<Approval>): Approval => ({
  id: uid("apr"), workspaceId, agentId: "agt_1", runId: "run_1", status: "pending", decidedAt: null, createdAt: iso(10), risk: "low",
  action: { type: "email.send", connector: "gmail", to: "sam@example.com", subject: "Your invoice", body: "Hi Sam" },
  ...o,
});

const agentRun = (workspaceId: string, o: Partial<AgentRun> = {}): AgentRun => ({
  id: uid("run"), workspaceId, agentId: "agt_1", trigger: "manual", status: "waiting_approval", steps: [{ at: iso(11), text: "Started (manual)", units: 0 }], units: 3, startedAt: iso(11), endedAt: null, ...o,
});

const kinds = (r: RunView) => r.outcomes.map((o) => o.kind);

test("a paused Core job needs the person, offers Keep working, and never exposes context or scratch work", () => {
  const r = fromCoreJob(coreJob("w1", {
    checks: [
      { kind: "execution", label: "Ran the calculation", outcome: "passed" },
      { kind: "cross-model", label: "Checked by a second model", outcome: "passed" },
      { kind: "critique", label: "Totals add up", outcome: "failed", detail: "Band 3 was counted twice" },
    ],
  }));
  assert.equal(r.status, "needs_you");
  assert.deepEqual(r.next, { label: "Keep working", keepWorking: true });
  assert.deepEqual(kinds(r), ["verified", "reviewed", "open", "open"]);
  assert.equal(r.outcomes[2].evidence, "Band 3 was counted twice");
  assert.deepEqual(r.steps.map((s) => s.state), ["done", "active"]);
  const wire = JSON.stringify(r);
  assert.ok(!wire.includes(SECRET_CONTEXT) && !wire.includes(SCRATCH));
});

test("a finished Core job is generated content plus what its checks proved; a model's review is never called verified", () => {
  const r = fromCoreJob(coreJob("w1", {
    status: "done",
    result: { markdown: "**$62,800** take-home.", core: { depth: "thorough", asked: "thorough", reason: "", steps: [], rounds: 2, checks: [{ kind: "cross-model", label: "Checked by a second model", outcome: "fixed" }], confidence: { level: "high", score: 0.9, words: "Fairly sure" }, use: {} as never, stoppedBy: "time" } },
  }), { withResult: true });
  assert.equal(r.status, "done");
  assert.deepEqual(kinds(r), ["generated", "reviewed", "open"]);
  assert.equal(r.outcomes[0].evidence, "2 rounds · Fairly sure");
  assert.match(r.outcomes[2].text, /time limit/);
  assert.equal(r.result, "**$62,800** take-home.");
  assert.equal(r.next, undefined);
});

test("an agent run waiting on an approval needs the person; once sent it is done with the send as evidence", () => {
  const run = agentRun("w1");
  const pending = approval("w1", { runId: run.id });
  const waiting = fromAgentRun(run, "Invoice reminders", [pending]);
  assert.equal(waiting.status, "needs_you");
  assert.deepEqual(waiting.outcomes, [{ kind: "proposed", text: "Email to sam@example.com: Your invoice", evidence: "Waiting for your approval · low risk" }]);
  assert.equal(waiting.next?.view, "approvals");

  const sent = fromAgentRun(run, "Invoice reminders", [{ ...pending, status: "sent", decidedAt: iso(1), result: "Sent via Gmail" }]);
  assert.equal(sent.status, "done");
  assert.deepEqual(sent.outcomes, [{ kind: "done", text: "Email to sam@example.com: Your invoice", evidence: "Sent via Gmail" }]);
  assert.equal(sent.steps.at(-1)?.text, "Sent: Email to sam@example.com: Your invoice");
  assert.equal(sent.next, undefined);

  const declined = fromAgentRun(run, "Invoice reminders", [{ ...pending, status: "rejected", decidedAt: iso(1) }]);
  assert.equal(declined.status, "stopped");
  assert.deepEqual(declined.outcomes, []);
});

test("an agent run blocked on a connector says what is missing and claims nothing", () => {
  const r = fromAgentRun(agentRun("w1", { status: "failed", error: "Connect Gmail first.", endedAt: iso(2), needs: [{ connector: "gmail", label: "Gmail", problem: "not_connected" }] }), "Lead follow-up", []);
  assert.equal(r.status, "failed");
  assert.deepEqual(r.outcomes, [{ kind: "open", text: "Connect Gmail to run this" }]);
  assert.equal(r.next?.view, "agents");
  assert.equal(r.steps.at(-1)?.state, "failed");
});

test("a connected-app call only counts as done when its receipt says it worked", () => {
  const ap = approval("w1", { agentId: CHAT_AGENT, runId: "mcpc_t1", status: "sent", decidedAt: iso(1), action: { type: "mcp.call", connector: "mcp", serverId: "srv", serverName: "Linear", tool: "create_issue", args: {}, toolRisk: "write", idempotencyKey: "k" } });
  const receipt = (status: McpReceipt["status"]): McpReceipt => ({ id: "rc", workspaceId: "w1", serverId: "srv", serverName: "Linear", tool: "create_issue", actor: "owner", agentId: CHAT_AGENT, via: "approval", approvalId: ap.id, argsHash: "h", argsPreview: "{}", status, error: status === "ok" ? undefined : "The app returned an error.", startedAt: iso(1), endedAt: iso(1), durationMs: 1200, attempts: 1, bytes: 10, truncated: false, removedLines: 0, units: 0 });
  const ok = fromChatTools("mcpc_t1", [ap], new Map([[ap.id, receipt("ok")]]));
  assert.equal(ok.title, "Linear: create_issue");
  assert.deepEqual(ok.outcomes, [{ kind: "done", text: "Linear: create_issue", evidence: "Completed in 1.2 s" }]);
  const bad = fromChatTools("mcpc_t1", [ap], new Map([[ap.id, receipt("tool_error")]]));
  assert.equal(bad.outcomes[0].kind, "open");
  assert.equal(bad.outcomes[0].evidence, "The app returned an error.");
});

test("GET /api/runs: signed out is refused; each person sees only their own work", async () => {
  const { GET: list } = await import("@/app/api/runs/route");
  const { GET: one } = await import("@/app/api/runs/[id]/route");
  assert.equal((await list(call(null, "/api/runs"))).status, 401);

  const a = await signIn(`runs-a-${Date.now()}@example.com`, "plus");
  const b = await signIn(`runs-b-${Date.now()}@example.com`, "plus");
  const job = await jobRows().insert(coreJob(a.workspaceId));
  await approvals().insert(approval(a.workspaceId, { agentId: CHAT_AGENT, runId: "mcpc_turn9", action: { type: "mcp.call", connector: "mcp", serverId: "srv", serverName: "Notion", tool: "search", args: { q: "x" }, toolRisk: "read", idempotencyKey: "k9" } }));
  await jobRows().insert(coreJob(a.workspaceId, { expiresAt: iso(60) })); // expired: not shown

  const mine = (await (await list(call(a.cookie, "/api/runs"))).json()) as { runs: RunView[] };
  assert.deepEqual(mine.runs.map((r) => r.id).sort(), [`core.${job.id}`, "tools.mcpc_turn9"].sort());
  assert.ok(!JSON.stringify(mine).includes(SECRET_CONTEXT));
  assert.equal(mine.runs.find((r) => r.source === "tools")?.status, "needs_you");

  const theirs = (await (await list(call(b.cookie, "/api/runs"))).json()) as { runs: RunView[] };
  assert.deepEqual(theirs.runs, []);
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  assert.equal((await one(call(b.cookie, `/api/runs/core.${job.id}`), params(`core.${job.id}`))).status, 404);
  assert.equal((await one(call(b.cookie, "/api/runs/tools.mcpc_turn9"), params("tools.mcpc_turn9"))).status, 404);
  assert.equal((await one(call(a.cookie, `/api/runs/core.${job.id}`), params(`core.${job.id}`))).status, 200);
  assert.equal((await one(call(a.cookie, "/api/runs/bogus"), params("bogus"))).status, 404);
});

test("GET /api/runs: a Business owner sees agent runs with their approvals and receipts; a non-Business account does not", async () => {
  const { GET: list } = await import("@/app/api/runs/route");
  const { GET: one } = await import("@/app/api/runs/[id]/route");
  const owner = await signIn(`runs-biz-${Date.now()}@example.com`, "business");
  const agent = await agents().insert({ id: uid("agt"), workspaceId: owner.workspaceId, name: "Weekly report", template: "weekly-report", trigger: { type: "manual", label: "Manual" }, autoSend: false, status: "active", caps: { monthlyUnits: 1000, runsPerDay: 10, outboundPerDay: 10, spendUsdPerMonth: 10 }, createdAt: iso(100), lastRunAt: null } as Agent);
  const run = await runs().insert(agentRun(owner.workspaceId, { agentId: agent.id }));
  const ap = await approvals().insert(approval(owner.workspaceId, { agentId: agent.id, runId: run.id, status: "sent", decidedAt: iso(1), action: { type: "mcp.call", connector: "mcp", serverId: "srv", serverName: "Slack", tool: "post", args: {}, toolRisk: "write", idempotencyKey: "k" } }));
  await mcpReceipts().insert({ id: uid("rc"), workspaceId: owner.workspaceId, serverId: "srv", serverName: "Slack", tool: "post", actor: `agent:${agent.id}`, agentId: agent.id, via: "approval", approvalId: ap.id, argsHash: "h", argsPreview: "{}", status: "ok", startedAt: iso(1), endedAt: iso(1), durationMs: 400, attempts: 1, bytes: 2, truncated: false, removedLines: 0, units: 0 });

  const got = (await (await list(call(owner.cookie, "/api/runs"))).json()) as { runs: RunView[] };
  const r = got.runs.find((x) => x.id === `agent.${run.id}`);
  assert.ok(r);
  assert.equal(r.title, "Weekly report");
  assert.equal(r.status, "done");
  assert.deepEqual(r.outcomes, [{ kind: "done", text: "Slack: post", evidence: "Completed in 0.4 s" }]);

  const plus = await signIn(`runs-nobiz-${Date.now()}@example.com`, "plus");
  assert.equal((await one(call(plus.cookie, `/api/runs/agent.${run.id}`), { params: Promise.resolve({ id: `agent.${run.id}` }) })).status, 404);
});
