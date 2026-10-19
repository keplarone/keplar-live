import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { auditLog, mcpTools } from "../src/lib/business/repo";
import { addServer, runToolCall, updateTool } from "../src/lib/mcp/gateway";
import { authorize, registerSecurityGate } from "../src/lib/security/authorize";
import { registerToolCallSecurityGate, runSecurityGate, toolCallOpinion, toolCallSecurityGate } from "../src/lib/security/tool-gate";
import { FakeMcp, installFakeNetwork, restoreNetwork } from "./helpers/fake-mcp";
import { testWorkspace } from "./helpers/workspace";

const actor = { id: "user_gate", kind: "owner" as const };
const workspace = { id: "ws_security_gate", plan: "pro" as const };

test("runSecurityGate: secret, missing route auth and unsafe execution, failAt defaults to high", () => {
  const secret = "const key = 'sk_live_abcdefghijklmnop1234';";
  const route = "export async function POST(req: Request) { return new Response('ok'); }";
  const authed = "export async function POST(req: Request) { const ws = await currentWorkspace(req); return new Response(ws.id); }";
  const exec = "child_process.execSync('id')";

  const all = runSecurityGate({
    files: [
      { path: "src/pay.ts", contents: secret },
      { path: "src/app/api/open/route.ts", contents: route },
      { path: "src/app/api/mcp/servers/route.ts", contents: authed },
      { path: "src/run.ts", contents: exec },
      { path: "src/ok.ts", contents: "export const n = 1;" },
    ],
  });
  assert.equal(all.failAt, "high");
  assert.equal(all.ok, false);
  assert.deepEqual(all.checksRun, ["hard-coded-secret", "missing-route-auth", "unsafe-execution"]);
  assert.deepEqual(
    all.findings.map((f) => [f.check, f.severity, f.path]),
    [
      ["hard-coded-secret", "critical", "src/pay.ts"],
      ["missing-route-auth", "high", "src/app/api/open/route.ts"],
      ["unsafe-execution", "high", "src/run.ts"],
    ],
  );
  assert.doesNotMatch(JSON.stringify(all.findings), /sk_live/);

  const highOnly = runSecurityGate({ files: [{ path: "src/app/api/open/route.ts", contents: route }] }, { failAt: "critical" });
  assert.equal(highOnly.ok, true, "a high finding does not fail when failAt is critical");
  assert.equal(highOnly.findings.length, 1);

  const secretsOff = runSecurityGate({ files: [{ path: "src/pay.ts", contents: secret }] }, { checks: ["unsafe-execution"] });
  assert.equal(secretsOff.ok, true);
  assert.deepEqual(secretsOff.checksRun, ["unsafe-execution"]);
  assert.deepEqual(secretsOff.findings, []);
});

test("a security gate cannot turn a deny into an allow", async () => {
  registerToolCallSecurityGate();
  const loosen = registerSecurityGate({
    name: "test.loosen",
    evaluate() {
      return { decision: "allow" };
    },
  });
  try {
    const denied = await authorize({
      actor: { ...actor, role: "viewer" },
      workspace,
      action: "site.publish",
      teamAction: "publish",
    });
    assert.equal(denied.outcome, "deny");
    if (denied.outcome === "deny") assert.equal(denied.code, "team_forbidden");

    const opinion = toolCallOpinion(
      {
        actor: { id: "chat", kind: "chat" },
        workspace,
        action: "mcp.call",
        mcpCall: { serverId: "s", tool: "search", args: { query: "Workers KV" }, idempotencyKey: "k", agentId: "chat", via: "auto" },
      },
      { outcome: "deny", status: 403, code: "tool_disabled", message: "That tool is turned off." },
    );
    assert.equal(opinion, null, "a clean call does not vote allow");
    assert.notEqual(toolCallSecurityGate.evaluate, undefined);
  } finally {
    loosen();
  }
});

test("tool-call gate refuses unsafe execution and does not loosen a secret denial", async () => {
  registerToolCallSecurityGate();
  const ws = await testWorkspace("gate-call", "pro");
  const fake = new FakeMcp("gate.mcp.example.com", {
    tools: [{ name: "search", description: "Search docs", inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] }, run: (a) => ({ text: `results ${String(a.q)}` }) }],
  });
  installFakeNetwork([fake]);
  try {
    const server = await addServer(ws, { name: "Docs", url: "https://gate.mcp.example.com/mcp", authType: "none" });
    const tool = (await mcpTools().list(ws.id, (t) => t.serverId === server.id))[0];
    await updateTool(ws, server.id, tool.id, { enabled: true, risk: "read" });

    const alreadyDenied = toolCallOpinion(
      {
        actor,
        workspace: ws,
        action: "mcp.call",
        mcpCall: { serverId: server.id, tool: "search", args: { q: "sk_live_abcdefghijklmnop1234" }, idempotencyKey: "sec", agentId: null, via: "manual" },
      },
      { outcome: "deny", status: 422, code: "firewall_blocked", message: "The text contains an API key. It was not sent." },
    );
    assert.equal(alreadyDenied, null, "a secret does not replace an existing denial with an allow");

    const secretOpinion = toolCallOpinion(
      {
        actor,
        workspace: ws,
        action: "mcp.call",
        mcpCall: { serverId: server.id, tool: "search", args: { q: "sk_live_abcdefghijklmnop1234" }, idempotencyKey: "sec", agentId: null, via: "manual" },
      },
      { outcome: "allow" },
    );
    assert.equal(secretOpinion?.decision, "deny");
    if (secretOpinion?.decision === "deny") {
      assert.equal(secretOpinion.code, "secret_in_args");
      assert.doesNotMatch(secretOpinion.message, /sk_live/);
    }

    await assert.rejects(
      runToolCall(ws, { serverId: server.id, tool: "search", args: { q: "sk_live_abcdefghijklmnop1234" }, idempotencyKey: "sec-1", agentId: null, via: "manual" }),
      (e: { code?: string }) => e.code === "firewall_blocked",
    );

    await assert.rejects(
      runToolCall(ws, { serverId: server.id, tool: "search", args: { q: "child_process.execSync('id')" }, idempotencyKey: "exec-1", agentId: null, via: "manual" }),
      (e: { code?: string }) => e.code === "unsafe_execution",
    );
    assert.equal(fake.calls.length, 0, "neither call reached the server");

    const ok = await runToolCall(ws, { serverId: server.id, tool: "search", args: { q: "Workers KV" }, idempotencyKey: "ok-1", agentId: null, via: "manual" });
    assert.equal(ok.status, "ok");
    assert.equal(fake.calls.length, 1);

    const audits = await auditLog().list(ws.id, (e) => e.action === "authorize");
    assert.ok(audits.some((a) => a.detail === "deny mcp.call firewall_blocked"));
    assert.ok(audits.some((a) => a.detail === "deny mcp.call unsafe_execution"));
    assert.doesNotMatch(JSON.stringify(audits), /sk_live|execSync/);
  } finally {
    restoreNetwork();
  }
});
