import "./setup";
import { signIn, jsonReq } from "./helpers/session";
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAT_INFO, CHAT_TEMPLATES, pickTemplate, plannedNodes, previewAction, runNodes, stepNode, type FlowApproval } from "@/lib/business/chat-flow";
import { activities, approvals, connections, contacts } from "@/lib/business/repo";
import { now } from "@/lib/create/platform/ids";
import { POST as fromChat } from "@/app/api/business/agents/from-chat/route";
import { POST as decideRoute } from "@/app/api/business/approvals/[id]/route";

test("pickTemplate: plain keywords pick the workflow; unclear messages pick none", () => {
  assert.equal(pickTemplate("Every Monday, summarize new leads and draft follow-ups")?.template, "lead-sweep");
  assert.equal(pickTemplate("Follow up with anyone who filled in the contact form")?.template, "lead-sweep");
  assert.equal(pickTemplate("Send me a daily brief every morning")?.template, "daily-brief");
  assert.equal(pickTemplate("Post a weekly report of revenue to Slack")?.template, "weekly-report");
  assert.equal(pickTemplate("Remind clients whose proposals are still open")?.template, "invoice-reminder");
  assert.equal(pickTemplate("Draft an instagram post about our new mug")?.template, "social-post");
  const mon = pickTemplate("Watch https://example.com/pricing. and tell me when it mentions refund");
  assert.deepEqual(mon, { template: "monitor", monitor: { url: "https://example.com/pricing", keyword: "refund" } });
  assert.equal(pickTemplate("What's the capital of France?"), null);
  assert.equal(pickTemplate("https://example.com is a nice site"), null, "a link alone is not a monitor request");
});

test("the chat card's names and schedules match the real workflows", async () => {
  const { TEMPLATES } = await import("@/lib/business/agents");
  for (const t of CHAT_TEMPLATES) {
    assert.equal(CHAT_INFO[t].name, TEMPLATES[t].name, t);
    const tr = TEMPLATES[t].trigger;
    assert.equal(CHAT_INFO[t].trigger, "label" in tr ? tr.label : "", t);
  }
});

test("step lines map to the card they belong to", () => {
  assert.equal(stepNode("Started (chat)"), "start");
  assert.equal(stepNode("Found 3 leads nobody has answered yet"), "data");
  assert.equal(stepNode("Drafted 2 follow-ups; each waits for your approval"), "draft");
  assert.equal(stepNode("2 model calls"), "draft");
  assert.equal(stepNode("Queued email.send for your approval"), "approval");
  assert.equal(stepNode("Scheduled run: queued email.send for your approval"), "approval");
  assert.equal(stepNode("Failed: boom"), "fail");
});

const ap = (status: FlowApproval["status"], i = 0): FlowApproval => ({ id: `apr_${i}`, status, risk: "medium", preview: { kind: "email.send", to: `p${i}@example.org`, title: "Following up", body: "Hi" } });
const TRIGGER = "Weekdays at 09:00 (America/New_York)";

test("cards: planned, then filled from the real run; pending approvals read 'Awaiting you'; approved and in-app runs say so", () => {
  const planned = plannedNodes("lead-sweep", TRIGGER);
  assert.deepEqual(planned.map((n) => [n.label, n.value, n.state]), [["Schedule", "Weekdays", "pending"], ["CRM leads", "Not run yet", "pending"], ["Draft follow-ups", "Not run yet", "pending"], ["Owner approval", "Required", "pending"]]);
  assert.equal(planned[0].sub, "09:00 · America/New_York");

  const live = runNodes("lead-sweep", TRIGGER, ["Started (chat)"], []);
  assert.deepEqual(live.map((n) => n.state), ["done", "active", "pending", "pending"]);

  const steps = ["Started (chat)", "Found 3 leads nobody has answered yet", "Drafted 2 follow-ups; each waits for your approval", "2 model calls", "Queued email.send for your approval", "Queued email.send for your approval"];
  const waiting = runNodes("lead-sweep", TRIGGER, steps, [ap("pending", 0), ap("pending", 1)], { status: "waiting_approval" });
  assert.deepEqual(waiting.map((n) => [n.value, n.state]), [["Weekdays", "done"], ["3 new leads", "done"], ["2 drafts", "done"], ["Awaiting you", "waiting"]]);
  assert.match(waiting[3].sub, /2 follow-up emails · nothing sends without you/);

  const done = runNodes("lead-sweep", TRIGGER, steps, [ap("sent", 0), ap("sent", 1)], { status: "waiting_approval" });
  assert.deepEqual([done[3].value, done[3].state], ["Approved", "done"]);
  const failed = runNodes("lead-sweep", TRIGGER, steps, [ap("failed", 0), ap("sent", 1)], { status: "waiting_approval" });
  assert.deepEqual([failed[3].value, failed[3].state], ["Partly sent", "failed"]);
  const rejected = runNodes("lead-sweep", TRIGGER, steps, [ap("rejected", 0), ap("rejected", 1)], { status: "waiting_approval" });
  assert.deepEqual([rejected[3].value, rejected[3].sub], ["Rejected", "Nothing was sent"]);

  const none = runNodes("lead-sweep", TRIGGER, ["Started (chat)", "Found 0 leads nobody has answered yet"], [], { status: "succeeded" });
  assert.deepEqual(none.map((n) => n.value), ["Weekdays", "0 new leads", "Nothing to draft", "Nothing to approve"]);

  const brief = runNodes("daily-brief", "Every day at 08:00 (America/New_York)", ["Started (chat)", "Read the last 24 hours of leads, orders, approvals and agent runs", "Put the brief in your Keplar inbox (nothing was sent outside Keplar)"], [], { status: "succeeded" });
  assert.deepEqual([brief[2].value, brief[3].value, brief[3].sub], ["Put the brief in your Keplar inbox", "Not needed", "Nothing left Keplar"]);

  const needs = runNodes("lead-sweep", TRIGGER, ["Started (chat)", "Connect Gmail first"], [], { status: "failed", needs: [{ label: "Gmail" }] });
  assert.deepEqual(needs.map((n) => n.state), ["done", "failed", "skipped", "skipped"]);
  assert.equal(needs[1].value, "Needs Gmail");

  const crash = runNodes("lead-sweep", TRIGGER, ["Started (chat)", "Failed: Model unavailable"], [], { status: "failed", error: "Model unavailable" });
  assert.equal(crash[1].state, "failed");
  assert.equal(crash[1].sub, "Model unavailable");
});

test("approval preview shows the recipient and the exact text", () => {
  assert.deepEqual(previewAction({ type: "email.send", connector: "gmail", to: "a@b.org", subject: "Hi", body: "Body", contactId: null }), { kind: "email.send", to: "a@b.org", title: "Hi", body: "Body" });
  assert.equal(previewAction({ type: "slack.post", connector: "slack", channel: "#general", text: "T" }).to, "#general");
});

// Gmail is offered only when the server has Google OAuth keys (visibility.ts); these tests run as a server that has them.
process.env.GOOGLE_CONNECT_CLIENT_ID ||= "gid-test";
process.env.GOOGLE_CONNECT_CLIENT_SECRET ||= "gsecret-test";

const lines = async (res: Response) => (await res.text()).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);

test("route: Agent mode in chat sets up the workflow, streams its steps, queues every email for the owner, and the card's approve goes through the approvals route", async () => {
  const { cookie, workspaceId } = await signIn("chat-agent@example.com", "pro");
  await connections().insert({ id: "conn_chat_gmail", workspaceId, connector: "gmail", status: "connected", account: "me@example.com", tokenEnc: null, scopes: ["gmail.send"], connectedAt: now(), tools: { send_email: true } });
  const old = new Date(Date.now() - 3 * 864e5).toISOString();
  for (const [i, name] of ["Ann Lee", "Bo Chan"].entries()) await contacts().insert({ id: `c_ch${i}`, workspaceId, name, email: `${name.split(" ")[0].toLowerCase()}@example.org`, source: "form", projectId: null, tags: [], createdAt: old, lastActivityAt: old });
  await activities().insert({ id: "act_ch_none", workspaceId, contactId: "c_none", kind: "note", text: "x", at: now() } as never);

  const res = await fromChat(jsonReq(cookie, "/api/business/agents/from-chat", "POST", { template: "lead-sweep" }));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /ndjson/);
  const evs = await lines(res);
  assert.equal(evs[0].type, "agent");
  const agent = evs[0].agent as { id: string; trigger: string; reused: boolean };
  assert.equal(agent.reused, false);
  assert.match(agent.trigger, /Weekdays/);
  const steps = evs.filter((e) => e.type === "step").map((e) => e.text as string);
  assert.equal(steps[0], "Started (chat)");
  assert.ok(steps.some((t) => /Found 2 leads/.test(t)), "the data step streams as it happens");
  assert.equal(steps.filter((t) => /queued email.send for your approval/i.test(t)).length, 2, steps.join(" / "));
  const done = evs.at(-1)!;
  assert.equal(done.type, "done");
  const run = done.run as { status: string };
  assert.equal(run.status, "waiting_approval");
  const aps = done.approvals as FlowApproval[];
  assert.equal(aps.length, 2);
  assert.ok(aps.every((a) => a.status === "pending" && a.preview.kind === "email.send" && a.preview.to?.endsWith("@example.org")));

  // Approve one from the card (the existing approvals route). The Gmail row here has no token, so the send fails and says so.
  const r = await decideRoute(jsonReq(cookie, `/api/business/approvals/${aps[0].id}`, "POST", { decision: "approve" }), { params: Promise.resolve({ id: aps[0].id }) });
  assert.equal(r.status, 200);
  const decided = ((await r.json()) as { approval: { status: string } }).approval;
  assert.ok(["sent", "failed"].includes(decided.status));
  const rej = await decideRoute(jsonReq(cookie, `/api/business/approvals/${aps[1].id}`, "POST", { decision: "reject" }), { params: Promise.resolve({ id: aps[1].id }) });
  assert.equal(((await rej.json()) as { approval: { status: string } }).approval.status, "rejected");

  // Asking again reuses the agent instead of creating a second one, and doesn't redraft leads already handled.
  const again = await lines(await fromChat(jsonReq(cookie, "/api/business/agents/from-chat", "POST", { template: "lead-sweep" })));
  assert.equal((again[0].agent as { id: string; reused: boolean }).id, agent.id);
  assert.equal((again[0].agent as { reused: boolean }).reused, true);
  assert.ok((await approvals().list(workspaceId, (a) => a.status === "pending")).length <= 2);
});

test("route: unknown workflow is refused, a missing connector is reported (not invented), Free is told agents are on Plus", async () => {
  const pro = await signIn("chat-agent-2@example.com", "pro");
  assert.equal((await fromChat(jsonReq(pro.cookie, "/api/business/agents/from-chat", "POST", { template: "mcp-task" }))).status, 400);
  const evs = await lines(await fromChat(jsonReq(pro.cookie, "/api/business/agents/from-chat", "POST", { template: "lead-sweep" })));
  const done = evs.at(-1)!;
  assert.equal(done.type, "done");
  assert.equal((done.run as { status: string }).status, "failed");
  assert.equal((done.run as { needs: { connector: string }[] }).needs[0].connector, "gmail");
  assert.deepEqual(done.approvals, []);
  const free = await signIn("chat-agent-free@example.com", "free");
  const r = await fromChat(jsonReq(free.cookie, "/api/business/agents/from-chat", "POST", { template: "daily-brief" }));
  assert.equal(r.status, 402);
  assert.match(((await r.json()) as { error: string }).error, /Plus/);
  assert.equal((await fromChat(jsonReq(null, "/api/business/agents/from-chat", "POST", { template: "daily-brief" }))).status, 401);
});
