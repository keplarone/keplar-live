import "./setup";
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { signIn, jsonReq, call } from "./helpers/session";
import { testWorkspace } from "./helpers/workspace";
import { FakeMcp, FakeOAuth, installFakeNetwork, restoreNetwork } from "./helpers/fake-mcp";
import { addOAuthServer, completeOAuth, publicServer, runToolCall, startOAuth, updateTool } from "../src/lib/mcp/gateway";
import { openSecret } from "../src/lib/mcp/crypto";
import { auditLog, mcpOauth, mcpReceipts, mcpServers, mcpTools } from "../src/lib/business/repo";
import { parseChallenge, redirectUri } from "../src/lib/mcp/oauth";
import * as servers from "../src/app/api/mcp/servers/route";
import * as startRoute from "../src/app/api/mcp/servers/[id]/oauth/route";
import * as callback from "../src/app/api/mcp/oauth/callback/route";
import type { Workspace } from "../src/lib/create/platform/workspace";

afterEach(() => restoreNetwork());
const j = async (r: Response) => (await r.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

const search = { name: "search", description: "Search", inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] }, run: (a: Record<string, unknown>) => ({ text: `found ${String(a.q)}` }) };

function world(label: string, oauthOpts: ConstructorParameters<typeof FakeOAuth>[1] = {}, mcpOpts: { prmResource?: string } = {}) {
  const as = new FakeOAuth(`auth.${label}.example.com`, oauthOpts);
  const mcp = new FakeMcp(`mcp.${label}.example.com`, { tools: [search], oauthCheck: as.valid, oauthAs: as.host, ...mcpOpts });
  installFakeNetwork([as, mcp]);
  return { as, mcp, url: `https://${mcp.host}/mcp` };
}
const q = (cb: string) => { const u = new URL(cb); return { state: u.searchParams.get("state"), code: u.searchParams.get("code"), error: u.searchParams.get("error"), iss: u.searchParams.get("iss") }; };

async function connectOAuth(ws: Workspace, w: ReturnType<typeof world>, name = "Linear") {
  const r = await addOAuthServer(ws, { name, url: w.url });
  assert.ok(r.authorizationUrl, "error" in r ? String(r.error) : "no url");
  const cb = w.as.approve(r.authorizationUrl as string);
  const out = await completeOAuth(ws, q(cb));
  return { r, cb, out, id: r.server.id };
}

test("oauth: parses the WWW-Authenticate challenge", () => {
  assert.deepEqual(parseChallenge('Bearer realm="x", resource_metadata="https://a.example.com/.well-known/oauth-protected-resource", scope="read write"'), { resourceMetadata: "https://a.example.com/.well-known/oauth-protected-resource", scope: "read write" });
  assert.deepEqual(parseChallenge(undefined), {});
});

test("oauth: discovery -> dynamic registration -> PKCE sign-in -> tokens sealed -> tools listed -> call uses the token", async () => {
  const ws = await testWorkspace("oa-flow", "pro");
  const w = world("flow");
  const r = await addOAuthServer(ws, { name: "Linear", url: w.url });
  assert.equal(r.server.authType, "oauth");
  assert.deepEqual([r.server.status, r.server.statusKind], ["connecting", "oauth_pending"]);
  const au = new URL(r.authorizationUrl as string);
  assert.equal(au.host, w.as.host);
  assert.equal(au.searchParams.get("response_type"), "code");
  assert.equal(au.searchParams.get("code_challenge_method"), "S256");
  assert.equal(au.searchParams.get("redirect_uri"), redirectUri());
  assert.equal(au.searchParams.get("resource"), w.url);
  assert.ok((au.searchParams.get("state") ?? "").length >= 40, "unguessable state");
  const reg = w.as.requests.find((x) => x.path === "/register");
  assert.deepEqual(JSON.parse(reg!.body).redirect_uris, [redirectUri()]);
  assert.equal(JSON.parse(reg!.body).token_endpoint_auth_method, "none");
  assert.equal(w.mcp.calls.length, 0);

  const pending = (await mcpOauth().list(ws.id))[0];
  assert.ok(!JSON.stringify(pending).includes(au.searchParams.get("code_challenge") as string), "the PKCE verifier/challenge material is only in the sealed blob");

  const out = await completeOAuth(ws, q(w.as.approve(r.authorizationUrl as string)));
  assert.deepEqual(out, { ok: true, reason: "ok", serverId: r.server.id });
  const row = (await mcpServers().get(ws.id, r.server.id))!;
  assert.equal(row.status, "connected");
  assert.equal(row.toolCount, 1);
  assert.equal((await mcpOauth().list(ws.id)).length, 0, "the pending sign-in is gone (single use)");
  // Tokens are sealed: not in the row in clear, readable only with the workspace + row binding.
  const tokens = JSON.parse(openSecret(row.secretEnc, ws.id, row.id) as string);
  assert.ok(tokens.accessToken.startsWith("acc-") && tokens.refreshToken.startsWith("ref-"));
  assert.ok(!JSON.stringify(row).includes(tokens.accessToken) && !JSON.stringify(row).includes(tokens.refreshToken));
  assert.equal(openSecret(row.secretEnc, ws.id, "someone-else"), null);
  const pub = JSON.stringify(publicServer(row));
  assert.ok(!pub.includes(tokens.accessToken) && !pub.includes(tokens.refreshToken) && !pub.includes("secretEnc"));
  assert.ok(w.mcp.requests.filter((x) => x.rpc).every((x, i) => i === 0 || x.headers.authorization?.startsWith("Bearer acc-")), "after sign-in every request carries the token");

  const tool = (await mcpTools().list(ws.id))[0];
  await updateTool(ws, row.id, tool.id, { enabled: true, risk: "read" });
  const res = await runToolCall(ws, { serverId: row.id, tool: "search", args: { q: "x" }, idempotencyKey: "oauth-call-1", agentId: null, via: "manual" });
  assert.equal(res.status, "ok");
  // Nothing sensitive in audit entries or receipts.
  const logs = JSON.stringify([await auditLog().list(ws.id), await mcpReceipts().list(ws.id)]);
  for (const secret of [tokens.accessToken, tokens.refreshToken, "code_verifier"]) assert.ok(!logs.includes(secret), secret);
});

test("oauth: tokens refresh before they expire (rotating refresh token stored); a 401 renews once and retries; a revoked refresh asks to sign in again", async () => {
  const ws = await testWorkspace("oa-refresh", "pro");
  const w = world("refresh");
  const { id } = await connectOAuth(ws, w);
  const tool = (await mcpTools().list(ws.id))[0];
  await updateTool(ws, id, tool.id, { enabled: true, risk: "read" });
  const seal = async () => JSON.parse(openSecret((await mcpServers().get(ws.id, id))!.secretEnc, ws.id, id) as string);
  const first = await seal();
  const call = (k: string) => runToolCall(ws, { serverId: id, tool: "search", args: { q: k }, idempotencyKey: `oauth-r-${k}-xx`, agentId: null, via: "manual" });

  // 1. Expired access token: refreshed first, then the call goes through with the new token.
  const row = (await mcpServers().get(ws.id, id))!;
  const { sealSecret } = await import("../src/lib/mcp/crypto");
  await mcpServers().update(ws.id, id, { secretEnc: sealSecret(JSON.stringify({ ...first, expiresAt: Date.now() - 1000 }), ws.id, row.id) });
  assert.equal((await call("one")).status, "ok");
  const second = await seal();
  assert.notEqual(second.accessToken, first.accessToken);
  assert.notEqual(second.refreshToken, first.refreshToken, "the rotated refresh token was stored");
  assert.equal(w.as.requests.filter((x) => x.body.includes("grant_type=refresh_token")).length, 1);

  // 2. Access token revoked early (still "valid" by the clock): 401 -> renew once -> retry succeeds.
  w.as.revokeAccess();
  assert.equal((await call("two")).status, "ok");
  assert.equal(w.as.requests.filter((x) => x.body.includes("grant_type=refresh_token")).length, 2);

  // 3. Refresh token revoked: the call fails honestly and the connection says to sign in again.
  w.as.revokeAccess();
  w.as.revokeRefresh();
  await assert.rejects(call("three"), (e: { message?: string }) => /sign in|accept/i.test(e.message ?? ""));
  const after = (await mcpServers().get(ws.id, id))!;
  assert.deepEqual([after.status, after.statusKind], ["failed", "oauth_reauth"]);
  assert.doesNotMatch(JSON.stringify(after), /acc-|ref-/);
});

test("oauth: state is bound to the signed-in workspace, single use and short-lived; iss mismatch and denial are handled", async () => {
  const wsA = await testWorkspace("oa-state-a", "pro");
  const wsB = await testWorkspace("oa-state-b", "pro");
  const w = world("state");
  const a = await addOAuthServer(wsA, { name: "A", url: w.url });
  const cb = w.as.approve(a.authorizationUrl as string);
  // Another account presenting A's state (login CSRF / link sharing): refused, and A's sign-in is untouched.
  assert.deepEqual(await completeOAuth(wsB, q(cb)), { ok: false, reason: "state" });
  assert.equal((await mcpOauth().list(wsA.id)).length, 1);
  assert.deepEqual(await completeOAuth(wsA, { state: "garbage", code: "x" }), { ok: false, reason: "state" });
  assert.deepEqual(await completeOAuth(wsA, { state: null, code: "x" }), { ok: false, reason: "state" });
  // Right owner: works once; the replay fails.
  assert.equal((await completeOAuth(wsA, q(cb))).ok, true);
  assert.deepEqual(await completeOAuth(wsA, q(cb)), { ok: false, reason: "state" });

  // Expired.
  const w2 = world("state2");
  const e = await addOAuthServer(wsA, { name: "E", url: w2.url });
  const pend = (await mcpOauth().list(wsA.id))[0];
  await mcpOauth().update(wsA.id, pend.id, { expiresAt: new Date(Date.now() - 1000).toISOString() });
  assert.deepEqual(await completeOAuth(wsA, q(w2.as.approve(e.authorizationUrl as string))), { ok: false, reason: "state" });

  // iss mismatch (RFC 9207 mix-up defence) and user denial.
  const w3 = world("state3");
  const m = await addOAuthServer(wsA, { name: "M", url: w3.url });
  const mix = q(w3.as.approve(m.authorizationUrl as string));
  assert.equal((await completeOAuth(wsA, { ...mix, iss: "https://evil.example.com" })).reason, "state");
  assert.equal((await mcpServers().get(wsA.id, m.server.id))?.status, "failed");
  const w4 = world("state4");
  const d = await addOAuthServer(wsA, { name: "D", url: w4.url });
  const den = await completeOAuth(wsA, q(w4.as.approve(d.authorizationUrl as string, true)));
  assert.deepEqual([den.ok, den.reason], [false, "denied"]);
  assert.equal((await mcpServers().get(wsA.id, d.server.id))?.statusKind, "oauth_denied");
});

test("oauth: refuses unsafe or unsupported authorization servers with a reason (no PKCE, no registration, issuer mismatch, private endpoints, resource mismatch, token redirect)", async () => {
  const cases: [string, ConstructorParameters<typeof FakeOAuth>[1], { prmResource?: string }, RegExp, string][] = [
    ["nopkce", { noS256: true }, {}, /PKCE/, "oauth_unsupported"],
    ["noreg", { noRegistration: true }, {}, /pre-registered/, "oauth_unsupported"],
    ["issuer", { issuer: "https://other.example.com" }, {}, /identified itself differently/, "oauth_failed"],
    ["private", { tokenEndpoint: "https://169.254.169.254/token" }, {}, /private or internal/, "oauth_failed"],
    ["http", { authorizationEndpoint: "http://auth.http.example.com/authorize" }, {}, /Only https?:\/\//, "oauth_failed"],
    ["resource", {}, { prmResource: "https://victim.example.com/mcp" }, /different resource/, "oauth_failed"],
  ];
  for (const [label, o, m, re, kind] of cases) {
    const ws = await testWorkspace(`oa-bad-${label}`, "business"); // the sign-in start is rate limited per account
    const w = world(label, o, m);
    const r = await addOAuthServer(ws, { name: label, url: w.url });
    assert.equal(r.authorizationUrl, null, label);
    assert.match(String((r as { error?: string }).error), re, label);
    assert.equal(r.server.status, "failed", label);
    assert.equal(r.server.statusKind, kind, label);
  }
  // A token endpoint that redirects is not followed (the code and verifier would travel with it).
  const ws = await testWorkspace("oa-bad-redir", "business");
  const w = world("redir", { tokenRedirect: "https://evil.example.com/steal" });
  const r = await addOAuthServer(ws, { name: "redir", url: w.url });
  const out = await completeOAuth(ws, q(w.as.approve(r.authorizationUrl as string)));
  assert.deepEqual([out.ok, out.reason], [false, "failed"]);
  assert.equal((await mcpServers().get(ws.id, r.server.id))?.status, "failed");
  assert.ok(!JSON.stringify(await mcpServers().get(ws.id, r.server.id)).includes("code-"));
});

test("oauth: a server that doesn't ask for sign-in, bearer connections and Free accounts can't start it; restart replaces the earlier attempt", async () => {
  const ws = await testWorkspace("oa-misc", "plus");
  const open = new FakeMcp("open.example.com", { tools: [search] });
  installFakeNetwork([open]);
  const r = await addOAuthServer(ws, { name: "open", url: "https://open.example.com/mcp" });
  assert.match(String((r as { error?: string }).error), /didn't ask for sign-in/);

  const w = world("restart");
  const a = await addOAuthServer(ws, { name: "R", url: w.url });
  const first = await mcpOauth().list(ws.id);
  await startOAuth(ws, a.server.id);
  const second = await mcpOauth().list(ws.id, (x) => x.serverId === a.server.id);
  assert.equal(second.length, 1, "only the newest attempt is kept");
  assert.notEqual(second[0].id, first.find((x) => x.serverId === a.server.id)?.id);
  await assert.rejects(addOAuthServer({ ...ws, plan: "free" } as Workspace, { name: "x", url: w.url }), /Plus/);
});

test("oauth api: start via route, callback needs the owner's session and never reflects the query; Free is refused", async () => {
  const a = await signIn("oa-api@example.com", "pro");
  const w = world("api");
  const created = await j(await servers.POST(jsonReq(a.cookie, "/api/mcp/servers", "POST", { name: "Linear", url: w.url, authType: "oauth" })));
  assert.ok(created.authorizationUrl && created.server.statusKind === "oauth_pending");
  assert.ok(!JSON.stringify(created).includes("secretEnc"));
  const cb = w.as.approve(created.authorizationUrl);
  const path = cb.replace("https://keplar.one", "");
  // Anonymous browser: sent to sign in, nothing consumed.
  const anon = await callback.GET(new Request(cb));
  assert.equal(anon.status, 302);
  assert.match(anon.headers.get("location") ?? "", /\/signin/);
  assert.equal((await mcpOauth().list(a.workspaceId)).length, 1);
  // Another account: refused as "state".
  const other = await signIn("oa-api-other@example.com", "pro");
  const wrong = await callback.GET(call(other.cookie, path));
  assert.match(wrong.headers.get("location") ?? "", /mcp_oauth=state/);
  // The owner: connected; the redirect only carries our fixed vocabulary + the server id.
  const ok = await callback.GET(call(a.cookie, `${path}&evil=%3Cscript%3E`));
  assert.equal(ok.status, 302);
  const loc = new URL(ok.headers.get("location") ?? "");
  assert.equal(loc.origin, "https://keplar.one");
  assert.equal(loc.pathname, "/app");
  assert.equal(loc.searchParams.get("mcp_oauth"), "ok");
  assert.ok(!loc.search.includes("evil") && !loc.search.includes("script"));
  assert.equal((await mcpServers().get(a.workspaceId, created.server.id))?.status, "connected");
  // Restart for an existing connection through the route.
  const again = await j(await startRoute.POST(jsonReq(a.cookie, "/x", "POST", {}), idCtx(created.server.id)));
  assert.ok(again.authorizationUrl);
  assert.equal((await startRoute.POST(jsonReq(other.cookie, "/x", "POST", {}), idCtx(created.server.id))).status, 404, "another account can't start a sign-in on it");

  const free = await signIn("oa-api-free@example.com", "free");
  assert.equal((await servers.POST(jsonReq(free.cookie, "/api/mcp/servers", "POST", { name: "x", url: w.url, authType: "oauth" }))).status, 402);
});
