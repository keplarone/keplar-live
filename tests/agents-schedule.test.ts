import "./setup";
import { signIn, jsonReq } from "./helpers/session";
import { test } from "node:test";
import assert from "node:assert/strict";
import { testWorkspace } from "./helpers/workspace";
import { updateWorkspace } from "@/lib/accounts/workspaces";
import { createAgent, runAgent, updateAgent, validateSchedule } from "@/lib/business/agents";
import { activities, agents, approvals, auditLog, connections, contacts, inbox, runs } from "@/lib/business/repo";
import { findDueRuns, nextRunFor, planLimit, tick } from "@/lib/business/scheduler";
import { cadenceName, cronWindowMinutes, effectiveCadence, minIntervalFor, scheduleDriver } from "@/lib/business/schedule-limits";
import { monitorDeps, watchedLines } from "@/lib/business/monitor";
import { EntitlementError } from "@/lib/create/platform/plans";
import { workspaceById } from "@/lib/create/platform/workspace";
import { now } from "@/lib/create/platform/ids";
import { GET as cronGET } from "@/app/api/cron/agents/route";
import { cronStatus } from "@/lib/ops/health";
import { POST as agentsPOST } from "@/app/api/business/agents/route";
import { PATCH as agentPATCH } from "@/app/api/business/agents/[id]/route";

const PAST = "2026-09-01T00:00:00.000Z";
// 2026-10-04 12:00:30 UTC = 08:00 in New York (EDT)
const EIGHT_AM_NY = new Date("2026-10-04T12:00:30Z");

test("plan cadence limits: Plus daily, Pro hourly, Business 15 minutes; Free and Lite have no scheduled agents", async () => {
  assert.deepEqual([minIntervalFor("free"), minIntervalFor("lite"), minIntervalFor("plus"), minIntervalFor("pro"), minIntervalFor("business")], [Infinity, Infinity, 1440, 60, 15]);
  const plus = await testWorkspace("sl-plus", "plus");
  assert.equal(validateSchedule(plus, { cron: "0 8 * * *", tz: "America/New_York" }).label, "Every day at 08:00 (America/New_York)");
  assert.throws(() => validateSchedule(plus, { cron: "0 * * * *" }), (e) => e instanceof EntitlementError && e.upgradeTo === "pro" && /once a day/.test(e.message));
  const pro = await testWorkspace("sl-pro", "pro");
  assert.equal(validateSchedule(pro, { cron: "0 * * * *" }).cron, "0 * * * *");
  assert.throws(() => validateSchedule(pro, { cron: "*/5 * * * *" }), (e) => e instanceof EntitlementError && e.upgradeTo === "business");
  const biz = await testWorkspace("sl-biz", "business");
  assert.equal(validateSchedule(biz, { cron: "*/15 * * * *" }).cron, "*/15 * * * *");
  assert.throws(() => validateSchedule(biz, { cron: "*/10 * * * *" }), /every 10 minutes/);
  assert.throws(() => validateSchedule(plus, { cron: "nope" }), /isn't valid/);
  assert.throws(() => validateSchedule(plus, { cron: "0 8 * * *", tz: "Mars/Base" }), /time zone/);
  assert.throws(() => validateSchedule({ plan: "free", admin: false }, { cron: "0 8 * * *" }), (e) => e instanceof EntitlementError && e.upgradeTo === "plus");
  assert.equal(cadenceName(1440), "once a day");
});

test("the honest cadence: the daily Hobby cron says so; Inngest says 5 minutes", () => {
  assert.equal(scheduleDriver(false), "vercel-cron");
  assert.equal(effectiveCadence("vercel-cron", 1440).precisionMinutes, 1440);
  assert.match(effectiveCadence("vercel-cron", 1440).note, /once a day/);
  assert.equal(effectiveCadence("inngest").precisionMinutes, 5);
  assert.equal(cronWindowMinutes({}, false), 1440);
  assert.equal(cronWindowMinutes({}, true), 60);
  assert.equal(cronWindowMinutes({ KEPLAR_AGENT_CRON_WINDOW_MINUTES: "15" }, false), 15);
  assert.equal(cronWindowMinutes({ KEPLAR_AGENT_CRON_WINDOW_MINUTES: "1" }, false), 1440, "a window under 5 minutes is ignored");
});

test("daily brief: real figures from the owner's own data, written to the inbox, nothing outbound; a quiet day says so without a model call", async () => {
  const ws = await testWorkspace("brief", "plus");
  const a = await createAgent(ws, "daily-brief");
  assert.equal(a.trigger.type === "schedule" && a.trigger.tz, "America/New_York");
  const quiet = await runAgent(ws, a.id, "manual", {}, { forceApproval: true });
  assert.equal(quiet.status, "succeeded");
  const q = (await inbox().list(ws.id, (m) => m.from === "Daily brief"))[0];
  assert.match(q.body, /Quiet day/);
  await contacts().insert({ id: "c_b1", workspaceId: ws.id, name: "Ada Lovelace", email: "ada@example.org", source: "form", projectId: null, tags: [], createdAt: now(), lastActivityAt: now() });
  const busy = await runAgent(ws, a.id, "manual", {}, { forceApproval: true });
  assert.equal(busy.status, "succeeded");
  const b = (await inbox().list(ws.id, (m) => m.from === "Daily brief")).sort((x, y) => y.at.localeCompare(x.at))[0];
  assert.match(b.body, /1 new lead/);
  assert.equal((await approvals().list(ws.id)).length, 0, "a brief queues nothing to send");
  assert.equal(b.direction, "in");
});

test("scheduled daily brief fires at 08:00 New York time, once, and shows the next run in that zone", async () => {
  const ws = await testWorkspace("brief-sched", "plus");
  const a = await createAgent(ws, "daily-brief");
  await agents().update(ws.id, a.id, { createdAt: PAST });
  assert.deepEqual((await findDueRuns(new Date("2026-10-04T13:00:30Z"))).filter((d) => d.agentId === a.id), [], "13:00 UTC is 09:00 in New York: not due");
  const first = await tick(EIGHT_AM_NY);
  const mine = first.results.filter((r) => r.agentId === a.id);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].outcome, "ran");
  assert.equal((await tick(EIGHT_AM_NY)).results.filter((r) => r.agentId === a.id).length, 0, "the slot is claimed: never twice");
  const next = (await nextRunFor(ws.id, EIGHT_AM_NY)).find((n) => n.agentId === a.id)!;
  assert.equal(next.next, "2026-10-05T12:00:00.000Z");
  assert.equal(next.tz, "America/New_York");
  // after the clocks change the same 08:00 wall time is 13:00 UTC
  assert.equal((await nextRunFor(ws.id, new Date("2026-11-01T12:30:00Z"))).find((n) => n.agentId === a.id)!.next, "2026-11-01T13:00:00.000Z");
});

test("a once-a-day check catches up the latest slot of the last 24 hours (Hobby cron)", async () => {
  const ws = await testWorkspace("catchup", "plus");
  const a = await createAgent(ws, "daily-brief");
  await agents().update(ws.id, a.id, { createdAt: PAST });
  // the cron fires at 13:05 UTC, an hour after the 12:00 UTC slot
  const due = (await findDueRuns(new Date("2026-10-04T13:05:00Z"), 24 * 60)).filter((d) => d.agentId === a.id);
  assert.deepEqual(due.map((d) => d.slot), ["2026-10-04T12:00:00.000Z"]);
  assert.equal((await findDueRuns(new Date("2026-10-04T13:05:00Z"), 15)).filter((d) => d.agentId === a.id).length, 0, "the 5-minute window alone would have missed it");
});

test("page monitor: baseline, no change, change with added/removed lines, keyword mode; the alert stays in the inbox", async () => {
  const ws = await testWorkspace("mon", "plus");
  let page = "<html><head><title>x</title><script>var t=Date.now()</script></head><body><h1>Pricing</h1><p>Plan A costs 10 dollars</p><p>Plan B costs 20 dollars</p></body></html>";
  monitorDeps.read = async () => page;
  const a = await createAgent(ws, "monitor", undefined, undefined, { monitor: { url: "https://example.com/pricing" } });
  assert.equal(a.name, "Watch example.com");
  const r1 = await runAgent(ws, a.id, "manual", {}, { forceApproval: true });
  assert.match(r1.steps.map((s) => s.text).join("|"), /starting copy/);
  const r2 = await runAgent(ws, a.id, "manual", {}, { forceApproval: true });
  assert.match(r2.steps.map((s) => s.text).join("|"), /No change/);
  assert.equal((await inbox().list(ws.id, (m) => m.from === "Page monitor")).length, 0);
  page = page.replace("Plan B costs 20 dollars", "Plan B costs 25 dollars");
  const r3 = await runAgent(ws, a.id, "manual", {}, { forceApproval: true });
  assert.match(r3.steps.map((s) => s.text).join("|"), /1 line added, 1 removed/);
  const alert = (await inbox().list(ws.id, (m) => m.from === "Page monitor"))[0];
  assert.match(alert.body, /Plan B costs 25 dollars/);
  assert.match(alert.body, /Removed \(1\)/);
  assert.equal((await approvals().list(ws.id)).length, 0, "a monitor never sends anything outside Keplar");
  assert.ok((await agents().get(ws.id, a.id))?.monitor?.lastChangeAt);

  // keyword: only lines containing the word count
  const k = await createAgent(ws, "monitor", "Keyword watch", undefined, { monitor: { url: "https://example.com/pricing", keyword: "plan a" } });
  await runAgent(ws, k.id, "manual", {}, { forceApproval: true });
  page = page.replace("Plan B costs 25 dollars", "Plan B costs 30 dollars");
  const rk = await runAgent(ws, k.id, "manual", {}, { forceApproval: true });
  assert.match(rk.steps.map((s) => s.text).join("|"), /No change/, "a change elsewhere on the page is not an alert");
  assert.deepEqual(watchedLines(page, "plan a"), ["Plan A costs 10 dollars"]);
});

test("page monitor: private addresses and bad URLs are refused up front; a changed URL starts a fresh baseline", async () => {
  const ws = await testWorkspace("mon2", "plus");
  for (const url of ["http://localhost:3000/x", "https://169.254.169.254/latest", "https://10.0.0.5/", "not a url", "ftp://example.com/a", ""]) {
    await assert.rejects(() => createAgent(ws, "monitor", undefined, undefined, { monitor: { url } }), /public address|full public address/);
  }
  monitorDeps.read = async () => "<p>hello there friend</p>";
  const a = await createAgent(ws, "monitor", undefined, undefined, { monitor: { url: "https://example.com/a" } });
  await runAgent(ws, a.id, "manual", {}, { forceApproval: true });
  assert.ok((await agents().get(ws.id, a.id))?.monitor?.hash);
  await updateAgent(ws, a.id, { monitor: { url: "https://example.com/b" } });
  assert.equal((await agents().get(ws.id, a.id))?.monitor?.hash, undefined);
});

test("lead follow-up sweep: drafts for unanswered leads only, always awaiting approval, never stacks duplicates", async () => {
  const ws = await testWorkspace("sweep", "pro");
  await connections().insert({ id: "conn_sweep_gmail", workspaceId: ws.id, connector: "gmail", status: "connected", account: "me@example.com", tokenEnc: null, scopes: ["gmail.send"], connectedAt: now(), tools: { send_email: true } });
  const old = new Date(Date.now() - 3 * 864e5).toISOString();
  for (const [i, name] of ["Ann Lee", "Bo Chan", "Cy Dunn"].entries()) await contacts().insert({ id: `c_sw${i}`, workspaceId: ws.id, name, email: `${name.split(" ")[0].toLowerCase()}@example.org`, source: "form", projectId: null, tags: [], createdAt: old, lastActivityAt: old });
  await activities().insert({ id: "act_sw1", workspaceId: ws.id, contactId: "c_sw1", kind: "email_sent", text: "answered", at: now() });
  const a = await createAgent(ws, "lead-sweep");
  await updateAgent(ws, a.id, { autoSend: true });
  const run = await runAgent(ws, a.id, "schedule:test", {}, { forceApproval: true });
  assert.equal(run.status, "waiting_approval");
  const aps = await approvals().list(ws.id, (x) => x.runId === run.id);
  assert.deepEqual(aps.map((x) => (x.action.type === "email.send" ? x.action.to : "")).sort(), ["ann@example.org", "cy@example.org"], "the already-answered lead is skipped");
  assert.ok(aps.every((x) => x.status === "pending"));
  const again = await runAgent(ws, a.id, "schedule:test2", {}, { forceApproval: true });
  assert.equal((await approvals().list(ws.id, (x) => x.runId === again.id)).length, 0, "leads with a draft already waiting are not drafted twice");
});

test("lead follow-up sweep without Gmail connected does not run or invent output", async () => {
  const ws = await testWorkspace("sweep-nogmail", "pro");
  const a = await createAgent(ws, "lead-sweep");
  const run = await runAgent(ws, a.id, "manual", {}, { forceApproval: true });
  assert.equal(run.status, "failed");
  assert.equal(run.needs?.[0].connector, "gmail");
});

test("plan limits apply at run time: Free/Lite never run scheduled agents (so never touch the Free pool); scheduled runs per day are capped", async () => {
  const ws = await testWorkspace("downgrade", "plus");
  const a = await createAgent(ws, "daily-brief");
  await agents().update(ws.id, a.id, { createdAt: PAST });
  await updateWorkspace(ws.id, { plan: "free" }); // the subscription ended
  const out = await tick(EIGHT_AM_NY);
  const mine = out.results.find((r) => r.agentId === a.id)!;
  assert.deepEqual([mine.outcome, mine.reason], ["skipped", "plan"]);
  assert.equal((await runs().list(ws.id)).length, 0, "no run, no model call, no Usage");
  assert.ok((await auditLog().list(ws.id, (e) => e.action === "agent.schedule.skipped")).length >= 1);
  assert.equal((await tick(EIGHT_AM_NY)).results.filter((r) => r.agentId === a.id).length, 0, "a final refusal is not retried");

  await updateWorkspace(ws.id, { plan: "plus" });
  const plus = (await workspaceById(ws.id))!;
  for (let i = 0; i < 12; i++) await runs().insert({ id: `run_cap${i}`, workspaceId: ws.id, agentId: a.id, trigger: "schedule:2026-10-04T0" + i, status: "succeeded", steps: [], units: 0, startedAt: "2026-10-04T05:00:00.000Z", endedAt: null });
  assert.match((await planLimit(plus, "2026-10-04T12:00:00.000Z")) ?? "", /Reached 12 scheduled runs today/);
  assert.equal(await planLimit(plus, "2026-10-05T12:00:00.000Z"), null);
});

test("pause and resume: a paused agent is never due, resuming makes the next slot count", async () => {
  const ws = await testWorkspace("pause", "plus");
  const a = await createAgent(ws, "daily-brief");
  await agents().update(ws.id, a.id, { createdAt: PAST });
  await updateAgent(ws, a.id, { status: "paused" });
  assert.equal((await findDueRuns(EIGHT_AM_NY)).filter((d) => d.agentId === a.id).length, 0);
  assert.equal((await nextRunFor(ws.id, EIGHT_AM_NY)).find((n) => n.agentId === a.id)!.next, null);
  await updateAgent(ws, a.id, { status: "active" });
  assert.equal((await findDueRuns(EIGHT_AM_NY)).filter((d) => d.agentId === a.id).length, 1);
});

test("changing a schedule is checked against the plan, and only scheduled agents have one", async () => {
  const ws = await testWorkspace("edit-sched", "plus");
  const a = await createAgent(ws, "daily-brief");
  const u = await updateAgent(ws, a.id, { schedule: { cron: "30 6 * * 1-5", tz: "Europe/London" } });
  assert.deepEqual(u?.trigger, { type: "schedule", cron: "30 6 * * 1-5", tz: "Europe/London", label: "Weekdays at 06:30 (Europe/London)" });
  await assert.rejects(() => updateAgent(ws, a.id, { schedule: { cron: "*/30 * * * *" } }), EntitlementError);
  const evt = await createAgent(ws, "lead-followup");
  await assert.rejects(() => updateAgent(ws, evt.id, { schedule: { cron: "0 8 * * *" } }), /not on a schedule/);
});

test("API: create with a schedule and edit it; the plan limit answers 402 with the plan to upgrade to", async () => {
  const u = await signIn("agents-api@example.com", "plus");
  const ok = await agentsPOST(jsonReq(u.cookie, "/api/business/agents", "POST", { template: "daily-brief", schedule: { cron: "15 7 * * *", tz: "America/Chicago" } }));
  assert.equal(ok.status, 201);
  const agent = ((await ok.json()) as { agent: { id: string; trigger: { label: string } } }).agent;
  assert.equal(agent.trigger.label, "Every day at 07:15 (America/Chicago)");
  const bad = await agentPATCH(jsonReq(u.cookie, `/api/business/agents/${agent.id}`, "PATCH", { schedule: { cron: "*/5 * * * *" } }), { params: Promise.resolve({ id: agent.id }) });
  assert.equal(bad.status, 402);
  assert.equal(((await bad.json()) as { upgradeTo: string }).upgradeTo, "pro");
});

test("Vercel cron route: 401 without the secret, runs the daily check with it, and records a heartbeat", async () => {
  delete process.env.CRON_SECRET;
  assert.equal((await cronGET(new Request("https://keplar.one/api/cron/agents"))).status, 401, "no secret configured = nobody is authorized");
  process.env.CRON_SECRET = "cron-secret-test";
  try {
    assert.equal((await cronGET(new Request("https://keplar.one/api/cron/agents", { headers: { authorization: "Bearer wrong" } }))).status, 401);
    const res = await cronGET(new Request("https://keplar.one/api/cron/agents", { headers: { authorization: "Bearer cron-secret-test" } }));
    assert.equal(res.status, 200);
    const j = (await res.json()) as { ok: boolean; driver: string; due: number; deferred: number };
    assert.equal(j.ok, true);
    assert.equal(j.driver, "vercel-cron");
    const beat = (await cronStatus()).find((c) => c.name === "agents")!;
    assert.equal(beat.state, "ok");
  } finally {
    delete process.env.CRON_SECRET;
  }
});

test("the time budget defers runs instead of dropping them", async () => {
  const ws = await testWorkspace("budget", "plus");
  const a = await createAgent(ws, "daily-brief");
  await agents().update(ws.id, a.id, { createdAt: PAST });
  const late = await tick(EIGHT_AM_NY, { deadline: Date.now() - 1 });
  assert.ok(late.deferred >= 1);
  assert.equal(late.results.filter((r) => r.agentId === a.id).length, 0);
  assert.equal((await tick(EIGHT_AM_NY)).results.filter((r) => r.agentId === a.id && r.outcome === "ran").length, 1, "the deferred run is still due at the next check");
});
