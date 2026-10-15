import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { testWorkspace } from "./helpers/workspace";
import { decide } from "@/lib/business/agents";
import { approvalClaims, approvals, connections, runs, tableRows } from "@/lib/business/repo";
import { executeOAuthAction } from "@/lib/business/oauth-connectors";
import { sealSecret } from "@/lib/mcp/crypto";
import { HttpError } from "@/lib/create/platform/http";
import { now } from "@/lib/create/platform/ids";
import { USER_COLLECTIONS } from "@/lib/privacy/account-data";
import type { Approval, OutboundAction } from "@/lib/business/types";

/* A5: approving must execute exactly once, the run status must reflect failures, and provider calls must time out. */
async function fixture(label: string, actions: OutboundAction[]) {
  const ws = await testWorkspace(label, "pro");
  await connections().insert({ id: `conn_${label}_sheets`, workspaceId: ws.id, connector: "sheets", status: "connected", account: "Sheets", tokenEnc: null, scopes: [], connectedAt: now(), tools: {} } as never);
  const runId = `run_${label}`;
  await runs().insert({ id: runId, workspaceId: ws.id, agentId: "agt_x", trigger: "manual", status: "waiting_approval", steps: [], units: 0, startedAt: now(), endedAt: null });
  const ids: string[] = [];
  for (const [i, action] of actions.entries()) {
    const ap: Approval = { id: `apr_${label}_${i}`, workspaceId: ws.id, agentId: "agt_x", runId, action, status: "pending", decidedAt: null, createdAt: now() };
    await approvals().insert(ap);
    ids.push(ap.id);
  }
  return { ws, runId, ids };
}
const row = (sheet: string): OutboundAction => ({ type: "sheets.append", connector: "sheets", sheet, row: ["x", 1] });

test("two concurrent approvals of the same action execute it once; the loser gets 409", async () => {
  const { ws, ids } = await fixture("claim-race", [row("Race sheet")]);
  const results = await Promise.allSettled([decide(ws, ids[0], "approve"), decide(ws, ids[0], "approve"), decide(ws, ids[0], "approve")]);
  const ok = results.filter((r) => r.status === "fulfilled");
  const refused = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  assert.equal(ok.length, 1, JSON.stringify(results.map((r) => (r.status === "rejected" ? String(r.reason) : "ok"))));
  assert.ok(refused.every((r) => r.reason instanceof HttpError && r.reason.status === 409));
  assert.equal((await tableRows().list(ws.id, (r) => r.sheet === "Race sheet")).length, 1, "the row was written exactly once");
  assert.equal((await approvals().get(ws.id, ids[0]))?.status, "sent");
  assert.ok(await approvalClaims().get(ws.id, ids[0]), "the claim row is stored");
});

test("an existing claim refuses a second decision with 'already being processed'", async () => {
  const { ws, ids } = await fixture("claim-held", [row("Held sheet")]);
  await approvalClaims().insert({ id: ids[0], workspaceId: ws.id, decision: "approve", by: "owner", at: now() });
  await assert.rejects(decide(ws, ids[0], "approve"), (e: unknown) => e instanceof HttpError && e.status === 409 && /already being processed/.test(e.message));
  assert.equal((await tableRows().list(ws.id, (r) => r.sheet === "Held sheet")).length, 0);
});

test("run status after decisions: failed if any action failed, succeeded only when all were sent or rejected", async () => {
  const bad: OutboundAction = { type: "email.send", connector: "gmail", to: "x@example.org", subject: "Hi", body: "Hello" }; // Gmail isn't connected: fails
  const f = await fixture("claim-status", [row("Status sheet"), bad]);
  await decide(f.ws, f.ids[0], "approve");
  assert.equal((await runs().get(f.ws.id, f.runId))?.status, "waiting_approval", "still waiting while one is pending");
  const failed = await decide(f.ws, f.ids[1], "approve");
  assert.equal(failed?.status, "failed");
  const run = await runs().get(f.ws.id, f.runId);
  assert.equal(run?.status, "failed");
  assert.match(run?.error ?? "", /1 of 2 actions failed/);

  const g = await fixture("claim-status-ok", [row("Ok sheet"), row("Ok sheet 2")]);
  await decide(g.ws, g.ids[0], "approve");
  await decide(g.ws, g.ids[1], "reject");
  assert.equal((await runs().get(g.ws.id, g.runId))?.status, "succeeded");
});

test("biz_approval_claims is part of the account's data", () => {
  assert.ok((USER_COLLECTIONS as readonly string[]).includes("biz_approval_claims"));
});

test("connector calls carry a timeout and a timeout is reported as 'may or may not have happened'", async () => {
  const ws = await testWorkspace("claim-timeout", "pro");
  const rowId = "conn_timeout_gmail";
  await connections().insert({ id: rowId, workspaceId: ws.id, connector: "gmail", status: "connected", account: "me@example.com", tokenEnc: sealSecret(JSON.stringify({ access: "tok" }), ws.id, rowId), scopes: ["gmail.send"], connectedAt: now(), tools: { send_email: true } });
  const real = globalThis.fetch;
  let sawSignal = false;
  globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
    sawSignal = init?.signal instanceof AbortSignal;
    const e = new Error("The operation was aborted due to timeout");
    e.name = "TimeoutError";
    throw e;
  }) as typeof fetch;
  try {
    await assert.rejects(executeOAuthAction(ws.id, { type: "email.send", connector: "gmail", to: "x@example.org", subject: "Hi", body: "Hello" }), (e: unknown) => e instanceof HttpError && e.status === 504 && /may or may not have happened/.test(e.message));
    assert.ok(sawSignal, "the provider call was given an AbortSignal");
  } finally {
    globalThis.fetch = real;
  }
});
