import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { testWorkspace } from "./helpers/workspace";
import { createAgent, FRESH_FORM_CONTACT_MS, knownEmails, runAgent, updateAgent } from "@/lib/business/agents";
import { emit } from "@/lib/business/events";
import { approvals, connections, contacts, runs } from "@/lib/business/repo";
import { now } from "@/lib/create/platform/ids";

/*
 * A4: a public form creates a contact and emits form.submitted; the lead follow-up agent must never auto-send from the owner's
 * Gmail on that (attacker-controlled name/link), even with auto-send on. Only a run the owner starts by hand may auto-send.
 */
const waitFor = async <T>(fn: () => Promise<T | null | undefined | false>, ms = 4000): Promise<T> => {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 25)); }
};
const old = new Date(Date.now() - 3 * 864e5).toISOString();

async function setup(label: string) {
  const ws = await testWorkspace(label, "pro");
  await connections().insert({ id: `conn_${label}_gmail`, workspaceId: ws.id, connector: "gmail", status: "connected", account: "me@example.com", tokenEnc: null, scopes: ["gmail.send"], connectedAt: now(), tools: { send_email: true } });
  // A long-known customer: the firewall rates a reply to them as low/medium risk, so only forceApproval keeps it from auto-sending.
  await contacts().insert({ id: `c_${label}_known`, workspaceId: ws.id, name: "Kim Known", email: `kim-${label}@example.org`, source: "manual", projectId: null, tags: [], createdAt: old, lastActivityAt: old });
  const a = await createAgent(ws, "lead-followup");
  await updateAgent(ws, a.id, { autoSend: true });
  return { ws, agentId: a.id, contactId: `c_${label}_known` };
}

test("event-triggered runs never auto-send, even with auto-send on and a known recipient", async () => {
  const { ws, agentId, contactId } = await setup("evtform");
  const run = await runAgent(ws, agentId, "form.submitted", { contactId });
  assert.equal(run.status, "waiting_approval");
  const aps = await approvals().list(ws.id, (x) => x.runId === run.id);
  assert.equal(aps.length, 1);
  assert.equal(aps[0].status, "pending", "a form-triggered reply waits for the owner");
  // Any unknown/unattended trigger fails closed too.
  const other = await runAgent(ws, agentId, "order.paid", { contactId });
  assert.ok((await approvals().list(ws.id, (x) => x.runId === other.id)).every((x) => x.status === "pending"));
});

test("the queued agent.run job (emit → enqueue) runs with forceApproval", async () => {
  const { ws, agentId, contactId } = await setup("evtqueue");
  await emit(ws.id, "form.submitted", { contactId });
  const run = await waitFor(async () => (await runs().list(ws.id, (r) => r.agentId === agentId && r.status !== "running"))[0]);
  assert.equal(run.trigger, "form.submitted");
  const aps = await approvals().list(ws.id, (x) => x.runId === run.id);
  assert.ok(aps.length >= 1 && aps.every((x) => x.status === "pending"), JSON.stringify(aps.map((x) => x.status)));
});

test("a manual run by the owner still goes straight to sending (auto-send) for a known contact", async () => {
  const { ws, agentId, contactId } = await setup("evtmanual");
  const run = await runAgent(ws, agentId, "manual", { contactId });
  const aps = await approvals().list(ws.id, (x) => x.runId === run.id);
  // The test Gmail row has no stored token, so the send itself fails, but it was attempted at once rather than queued.
  assert.equal(aps.filter((x) => x.status === "pending").length, 0, JSON.stringify(run.steps));
  assert.ok(run.steps.some((s) => /Reconnect this app|Auto-sent/.test(s.text)), JSON.stringify(run.steps));
});

test("a contact a public form created in the last hour is not 'known' to the firewall", async () => {
  const ws = await testWorkspace("evtknown", "pro");
  await contacts().insert({ id: "c_fresh", workspaceId: ws.id, name: "<a href=x>", email: "fresh@example.org", source: "form", projectId: null, tags: [], createdAt: now(), lastActivityAt: now() });
  await contacts().insert({ id: "c_oldform", workspaceId: ws.id, name: "Old", email: "oldform@example.org", source: "form", projectId: null, tags: [], createdAt: old, lastActivityAt: old });
  await contacts().insert({ id: "c_manual", workspaceId: ws.id, name: "Man", email: "manual@example.org", source: "manual", projectId: null, tags: [], createdAt: now(), lastActivityAt: now() });
  const known = await knownEmails(ws.id);
  assert.equal(known.has("fresh@example.org"), false);
  assert.equal(known.has("oldform@example.org"), true);
  assert.equal(known.has("manual@example.org"), true);
  assert.equal((await knownEmails(ws.id, Date.now() + FRESH_FORM_CONTACT_MS + 1000)).has("fresh@example.org"), true);
});
