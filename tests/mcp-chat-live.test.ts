/**
 * One real chat tool, end to end, against a public docs server already listed in popular.ts.
 * Nothing here stands in for that server: discovery and the tool call are ordinary HTTPS.
 * The planner reply is supplied in the test so this does not spend a model call. The call itself
 * still goes through runChatTools → runChatAutoCall → authorize() → callTool.
 */
import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { auditLog, mcpReceipts, mcpTools } from "../src/lib/business/repo";
import { chatTools, runChatTools, type Planner } from "../src/lib/mcp/chat";
import { addServer, CHAT_AGENT, runChatAutoCall, setChatAutoRun, setGrant, updateTool } from "../src/lib/mcp/gateway";
import { POPULAR_CONNECTORS } from "../src/lib/mcp/popular";
import { testWorkspace } from "./helpers/workspace";

const TOOL = "search_cloudflare_documentation";
const QUERY = "Workers KV";

test("chat: Cloudflare Docs is a real call through authorize, and the grant starts off", { timeout: 60_000 }, async () => {
  const connector = POPULAR_CONNECTORS.find((c) => c.id === "cf-docs");
  assert.ok(connector);
  assert.equal(connector.auth, "none");
  assert.equal(connector.url, "https://docs.mcp.cloudflare.com/mcp");

  const ws = await testWorkspace("cf-docs-live", "pro");
  const server = await addServer(ws, { name: connector.name, url: connector.url, authType: "none" });
  assert.equal(server.status, "connected", server.statusReason ?? "not connected");
  assert.equal(server.url, connector.url);

  const tools = await mcpTools().list(ws.id, (t) => t.serverId === server.id);
  const search = tools.find((t) => t.name === TOOL);
  assert.ok(search, `expected ${TOOL} among ${tools.map((t) => t.name).join(", ")}`);
  assert.equal(search.serverHints.readOnly, true, "the server's own hint is read-only; Keplar still does not trust it");
  for (const t of tools) {
    assert.equal(t.enabled, false, t.name);
    assert.equal(t.risk, "unknown", t.name);
    assert.equal(t.autoRun, false, t.name);
  }
  assert.deepEqual(await chatTools(ws), [], "no grant, so Ask is not offered the tool");

  const planner: Planner = async () => ({ text: JSON.stringify({ calls: [{ tool: "t1", args: { query: QUERY } }] }) });
  const ignored = await runChatTools({ ws, prompt: `Search ${connector.name} for ${QUERY}`, planner, emit: () => undefined });
  assert.deepEqual([ignored.planned, ignored.uses.length, ignored.block], [false, 0, ""]);

  await assert.rejects(
    runChatAutoCall(ws, { serverId: server.id, tool: TOOL, args: { query: QUERY }, idempotencyKey: "chat:live-off" }),
    (e: { code?: string }) => e.code === "tool_disabled",
  );
  assert.equal((await mcpReceipts().list(ws.id)).length, 0, "a refused call never reaches the server");

  await updateTool(ws, server.id, search.id, { enabled: true, risk: "read", autoRun: true });
  await setGrant(ws, server.id, CHAT_AGENT, { tools: [TOOL], maxCallsPerDay: 5, maxUnitsPerMonth: 50 });
  await setChatAutoRun(ws, true);

  const listed = await chatTools(ws);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].ref, "t1");
  assert.equal(listed[0].tool.name, TOOL);

  const events: { status: string }[] = [];
  const ran = await runChatTools({
    ws,
    prompt: `Search the ${connector.name} app for ${QUERY}`,
    planner,
    emit: (u) => events.push(u),
    turnId: "turn_cf_docs_live",
  });
  assert.equal(ran.planned, true);
  assert.deepEqual(ran.uses.map((u) => u.status), ["done"]);
  assert.deepEqual(events.map((e) => e.status), ["running", "done"]);
  assert.match(ran.uses[0].receiptId ?? "", /^mcr_/);
  assert.match(ran.block, /<untrusted_tool_output server="Cloudflare Docs" tool="search_cloudflare_documentation"/);
  assert.ok(ran.block.length > 200, "the docs server returned a real body");
  assert.match(ran.block, /cloudflare/i);
  assert.doesNotMatch(ran.block, /results for /);

  const receipt = (await mcpReceipts().list(ws.id)).find((r) => r.id === ran.uses[0].receiptId);
  assert.ok(receipt);
  assert.equal(receipt.status, "ok");
  assert.equal(receipt.via, "auto");
  assert.equal(receipt.actor, "agent:chat");
  assert.equal(receipt.tool, TOOL);
  assert.ok(receipt.bytes > 50);

  const audits = await auditLog().list(ws.id, (e) => e.action === "authorize");
  assert.ok(audits.some((a) => a.detail === "allow mcp.call allow"), "the call was allowed by authorize()");
});
