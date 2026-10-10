import "./setup";
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { signIn, jsonReq, call } from "./helpers/session";
import { FakeMcp, installFakeNetwork, restoreNetwork } from "./helpers/fake-mcp";
import { openSecret, sealSecret, secretsAvailable } from "../src/lib/mcp/crypto";
import { exportChunks } from "../src/lib/privacy/account-data";
import { approvals, auditLog, mcpReceipts, mcpServers } from "../src/lib/business/repo";
import * as servers from "../src/app/api/mcp/servers/route";
import * as server from "../src/app/api/mcp/servers/[id]/route";
import * as testRoute from "../src/app/api/mcp/servers/[id]/test/route";
import * as callRoute from "../src/app/api/mcp/servers/[id]/call/route";
import * as grantsRoute from "../src/app/api/mcp/servers/[id]/grants/route";
import * as toolRoute from "../src/app/api/mcp/servers/[id]/tools/[toolId]/route";
import * as approvalRoute from "../src/app/api/business/approvals/[id]/route";

afterEach(() => restoreNetwork());
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const toolCtx = (id: string, toolId: string) => ({ params: Promise.resolve({ id, toolId }) });
const j = async (r: Response) => (await r.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SECRET = "tok_SuperSecretValue_91ab27cd";
const echoTool = { name: "echo", description: "Echo", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }, run: (a: Record<string, unknown>) => ({ text: String(a.text) }) };

test("mcp api: secrets never leave the server: not in any response, row, export, audit entry, receipt or log; only AES-GCM ciphertext is stored", async () => {
  const logs: string[] = [];
  const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  for (const k of ["log", "warn", "error", "info"] as const) console[k] = (...a: unknown[]) => void logs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
  try {
    const a = await signIn("mcp-secret@example.com", "pro");
    const fake = new FakeMcp("sec.example.com", { tools: [echoTool], bearer: SECRET });
    installFakeNetwork([fake]);
    const created = await servers.POST(jsonReq(a.cookie, "/api/mcp/servers", "POST", { name: "Sec", url: "https://sec.example.com/mcp", authType: "bearer", secret: SECRET }));
    assert.equal(created.status, 201);
    const body = await j(created);
    assert.equal(body.server.status, "connected");
    assert.equal(body.server.hasSecret, true);
    assert.equal("secretEnc" in body.server, false);
    const everything = [JSON.stringify(body)];
    everything.push(JSON.stringify(await j(await servers.GET(call(a.cookie, "/api/mcp/servers")))));
    const detail = await j(await server.GET(call(a.cookie, `/api/mcp/servers/${body.server.id}`), idCtx(body.server.id)));
    everything.push(JSON.stringify(detail));
    // Wrong token: the failure reason must not echo the token (the fake server echoes the Authorization header in its 401 body).
    await server.PATCH(jsonReq(a.cookie, "/x", "PATCH", { secret: "wrong_TokenValue_0000" }), idCtx(body.server.id));
    const failed = await j(await testRoute.POST(jsonReq(a.cookie, "/x", "POST", {}), idCtx(body.server.id)));
    assert.equal(failed.server.status, "failed");
    everything.push(JSON.stringify(failed));
    // Put the right one back; run a call that echoes its input.
    await server.PATCH(jsonReq(a.cookie, "/x", "PATCH", { secret: SECRET }), idCtx(body.server.id));
    assert.equal((await j(await testRoute.POST(jsonReq(a.cookie, "/x", "POST", {}), idCtx(body.server.id)))).server.status, "connected");
    const t = detail.tools.find((x: { name: string }) => x.name === "echo");
    await toolRoute.PATCH(jsonReq(a.cookie, "/x", "PATCH", { enabled: true, risk: "read" }), toolCtx(body.server.id, t.id));
    const ran = await j(await callRoute.POST(jsonReq(a.cookie, "/x", "POST", { tool: "echo", args: { text: "hi" } }), idCtx(body.server.id)));
    assert.equal(ran.status, "completed");
    everything.push(JSON.stringify(ran));

    const row = (await mcpServers().list(a.workspaceId))[0];
    assert.ok(row.secretEnc?.startsWith("m1."));
    assert.ok(!row.secretEnc!.includes(SECRET) && !Buffer.from(row.secretEnc!.split(".")[3], "base64").toString("latin1").includes(SECRET));
    assert.equal(openSecret(row.secretEnc, a.workspaceId, row.id), SECRET);
    assert.equal(openSecret(row.secretEnc, "ws_other", row.id), null, "another tenant's key can't open it");
    assert.equal(openSecret(row.secretEnc, a.workspaceId, "mcp_other"), null, "bound to its row");
    assert.equal(openSecret(row.secretEnc!.replace(/.$/, (c) => (c === "A" ? "B" : "A")), a.workspaceId, row.id), null, "tamper detected");
    // Export: the user's own data download holds neither plain text nor the ciphertext.
    let exported = "";
    for await (const c of exportChunks(a.workspaceId, { id: "u", email: "mcp-secret@example.com", name: "x" })) exported += c;
    everything.push(exported);
    everything.push(JSON.stringify(await auditLog().list(a.workspaceId)), JSON.stringify(await mcpReceipts().list(a.workspaceId)));
    const flat = everything.join("\n");
    for (const needle of [SECRET, "wrong_TokenValue_0000"]) assert.ok(!flat.includes(needle), `leaked ${needle.slice(0, 8)}…`);
    assert.ok(!exported.includes(row.secretEnc!), "ciphertext isn't exported either");
    assert.ok(!logs.join("\n").includes(SECRET), "never logged");
  } finally {
    Object.assign(console, orig);
  }
});

test("mcp api: sealed secrets need a configured server secret in production, and a Free account can't add anything", async () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = { n: env.NODE_ENV, s: env.BETTER_AUTH_SECRET };
  try {
    env.NODE_ENV = "production";
    delete env.BETTER_AUTH_SECRET;
    assert.equal(secretsAvailable(), false);
    assert.throws(() => sealSecret("x", "ws", "row"), /secrets_unavailable/);
    env.BETTER_AUTH_SECRET = "a-long-enough-production-secret-0123456789";
    assert.equal(secretsAvailable(), true);
  } finally {
    env.NODE_ENV = saved.n;
    env.BETTER_AUTH_SECRET = saved.s;
  }
  const free = await signIn("mcp-free@example.com", "free");
  const list = await j(await servers.GET(call(free.cookie, "/api/mcp/servers")));
  assert.equal(list.allowed, false);
  assert.equal(list.upgradeTo, "plus");
  assert.deepEqual(list.servers, []);
  const r = await servers.POST(jsonReq(free.cookie, "/api/mcp/servers", "POST", { name: "x", url: "https://x.example.com/mcp" }));
  assert.equal(r.status, 402);
  assert.equal((await j(r)).code, "entitlement");
});

test("mcp api: strict per-user isolation across every route", async () => {
  const a = await signIn("mcp-iso-a@example.com", "pro");
  const b = await signIn("mcp-iso-b@example.com", "pro");
  const fake = new FakeMcp("iso.example.com", { tools: [echoTool] });
  installFakeNetwork([fake]);
  const created = await j(await servers.POST(jsonReq(a.cookie, "/api/mcp/servers", "POST", { name: "A's", url: "https://iso.example.com/mcp" })));
  const sid = created.server.id as string;
  const detail = await j(await server.GET(call(a.cookie, `/api/mcp/servers/${sid}`), idCtx(sid)));
  const tid = detail.tools[0].id as string;
  await toolRoute.PATCH(jsonReq(a.cookie, "/x", "PATCH", { enabled: true, risk: "write" }), toolCtx(sid, tid));
  const q = await j(await callRoute.POST(jsonReq(a.cookie, "/x", "POST", { tool: "echo", args: { text: "mine" } }), idCtx(sid)));
  assert.equal(q.status, "awaiting_approval");
  const calls = fake.requests.length;

  // B sees nothing, and every route on A's ids is a 404 that changes nothing.
  assert.deepEqual((await j(await servers.GET(call(b.cookie, "/api/mcp/servers")))).servers, []);
  assert.equal((await server.GET(call(b.cookie, "/x"), idCtx(sid))).status, 404);
  assert.equal((await server.PATCH(jsonReq(b.cookie, "/x", "PATCH", { name: "pwn", secret: "stolen-12345678" }), idCtx(sid))).status, 404);
  assert.equal((await testRoute.POST(jsonReq(b.cookie, "/x", "POST", {}), idCtx(sid))).status, 404);
  assert.equal((await toolRoute.PATCH(jsonReq(b.cookie, "/x", "PATCH", { enabled: false, risk: "read", autoRun: true }), toolCtx(sid, tid))).status, 404);
  assert.equal((await grantsRoute.PUT(jsonReq(b.cookie, "/x", "PUT", { agentId: "agt_x", tools: ["echo"] }), idCtx(sid))).status, 404);
  assert.equal((await callRoute.POST(jsonReq(b.cookie, "/x", "POST", { tool: "echo", args: { text: "x" } }), idCtx(sid))).status, 404);
  assert.equal((await j(await server.DELETE(jsonReq(b.cookie, "/x", "DELETE"), idCtx(sid)))).removed, false);
  const ap = (await approvals().list(a.workspaceId))[0];
  assert.equal((await approvalRoute.POST(jsonReq(b.cookie, "/x", "POST", { decision: "approve" }), idCtx(ap.id))).status, 404);
  assert.equal(fake.requests.length, calls, "no request reached the server on B's behalf");
  const still = await mcpServers().get(a.workspaceId, sid);
  assert.equal(still?.name, "A's");
  assert.equal((await approvals().get(a.workspaceId, ap.id))?.status, "pending");
  assert.equal((await mcpReceipts().list(b.workspaceId)).length, 0);
  // B can connect the same address independently; A's tools/policy are untouched.
  const bs = await j(await servers.POST(jsonReq(b.cookie, "/api/mcp/servers", "POST", { name: "B's", url: "https://iso.example.com/mcp" })));
  assert.equal(bs.server.status, "connected");
  assert.notEqual(bs.server.id, sid);
  const aTool = (await j(await server.GET(call(a.cookie, "/x"), idCtx(sid)))).tools[0];
  assert.deepEqual([aTool.enabled, aTool.risk], [true, "write"]);
  // A can approve their own.
  const ok = await approvalRoute.POST(jsonReq(a.cookie, "/x", "POST", { decision: "approve" }), idCtx(ap.id));
  assert.equal(ok.status, 200);
  assert.equal((await j(ok)).approval.status, "sent");
});

test("mcp api: anonymous callers are refused on every connected-apps route", async () => {
  const id = idCtx("x");
  const rs = await Promise.all([
    servers.GET(call(null, "/x")), servers.POST(jsonReq(null, "/x", "POST", {})), server.GET(call(null, "/x"), id), server.PATCH(jsonReq(null, "/x", "PATCH", {}), id), server.DELETE(jsonReq(null, "/x", "DELETE"), id),
    testRoute.POST(jsonReq(null, "/x", "POST", {}), id), callRoute.POST(jsonReq(null, "/x", "POST", {}), id), grantsRoute.PUT(jsonReq(null, "/x", "PUT", {}), id), toolRoute.PATCH(jsonReq(null, "/x", "PATCH", {}), toolCtx("x", "y")),
  ]);
  assert.deepEqual(rs.map((r) => r.status), Array(rs.length).fill(401));
});
