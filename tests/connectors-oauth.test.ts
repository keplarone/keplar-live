import "./setup";
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { testWorkspace } from "./helpers/workspace";
import { CONNECTORS, execute, listConnections } from "../src/lib/business/connectors";
import { authorizeUrl, completeAuthorization, rfc822, setToolEnabled, signState, verifyState } from "../src/lib/business/oauth-connectors";
import { connections } from "../src/lib/business/repo";
import { createAgent, runAgent } from "../src/lib/business/agents";
import { inspectAction } from "../src/lib/business/firewall";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of ["GOOGLE_CONNECT_CLIENT_ID", "GOOGLE_CONNECT_CLIENT_SECRET", "SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET", "GITHUB_CONNECT_CLIENT_ID", "GITHUB_CONNECT_CLIENT_SECRET"]) delete process.env[k];
});
type Call = { url: string; method: string; body: string; auth: string | null };
function fakeNet(routes: Record<string, (c: Call) => { status?: number; json: unknown }>) {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const h = new Headers(init?.headers);
    const c: Call = { url, method: init?.method ?? "GET", body: String(init?.body ?? ""), auth: h.get("authorization") };
    calls.push(c);
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) return new Response(JSON.stringify({ error: "unrouted" }), { status: 404 });
    const r = routes[key](c);
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return calls;
}
const setGoogle = () => {
  process.env.GOOGLE_CONNECT_CLIENT_ID = "gid";
  process.env.GOOGLE_CONNECT_CLIENT_SECRET = "gsecret-value";
};

test("connectors: OAuth providers are Not configured until their env keys exist, and say which names to set", async () => {
  const ws = await testWorkspace("conn-nc");
  const list = await listConnections(ws.id);
  for (const id of ["gmail", "gcal", "slack", "github"]) {
    const c = list.find((x) => x.id === id)!;
    assert.equal(c.configured, false, id);
    assert.ok(c.needsEnv.length === 2 && c.needsEnv.every((n) => /^[A-Z_]+$/.test(n)), id);
    assert.equal(c.connection, null);
  }
  assert.throws(() => authorizeUrl(ws.id, "gmail"), (e: { code?: string }) => e.code === "not_configured");
  assert.equal(list.find((x) => x.id === "outlook")!.configured, false, "Outlook stays honestly unconfigured");
  assert.equal(CONNECTORS.github.label, "GitHub");
});

test("connectors: state is signed, bound to a workspace + connector, and expires", () => {
  const s = signState("ws1", "slack");
  assert.deepEqual(verifyState(s), { workspaceId: "ws1", connector: "slack" });
  assert.equal(verifyState(s + "x"), null);
  assert.equal(verifyState(s.replace(/^[^.]+/, "e30")), null);
  assert.equal(verifyState(signState("ws1", "slack", 1000, Date.now() - 5000)), null, "expired");
});

test("connectors: authorize URL carries client id, scopes, redirect and signed state; tokens are stored encrypted and tools start OFF", async () => {
  setGoogle();
  const ws = await testWorkspace("conn-gmail");
  const u = new URL(authorizeUrl(ws.id, "gmail"));
  assert.equal(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(u.searchParams.get("client_id"), "gid");
  assert.match(u.searchParams.get("scope")!, /gmail\.send/);
  assert.doesNotMatch(u.searchParams.get("scope")!, /readonly|mail\.google\.com/, "least privilege: send only");
  assert.equal(verifyState(u.searchParams.get("state")!)?.workspaceId, ws.id);
  fakeNet({
    "https://oauth2.googleapis.com/token": () => ({ json: { access_token: "ya29.ACCESS", refresh_token: "1//REFRESH", expires_in: 3600 } }),
    "https://openidconnect.googleapis.com": () => ({ json: { email: "me@example.com" } }),
  });
  const conn = await completeAuthorization(ws.id, "gmail", "code123");
  assert.equal(conn.account, "me@example.com");
  assert.ok(conn.tokenEnc && !conn.tokenEnc.includes("ya29") && !conn.tokenEnc.includes("REFRESH"));
  const pub = (await listConnections(ws.id)).find((c) => c.id === "gmail")!;
  assert.equal(JSON.stringify(pub).includes("ya29"), false, "no token in the API payload");
  assert.deepEqual(pub.tools.map((t) => [t.id, t.enabled]), [["send_email", false]]);
});

test("connectors: a tool that is off cannot run; once on, Gmail really sends through the API; writes still need the firewall", async () => {
  setGoogle();
  const ws = await testWorkspace("conn-send");
  const calls = fakeNet({
    "https://oauth2.googleapis.com/token": () => ({ json: { access_token: "ya29.A", refresh_token: "r", expires_in: 3600 } }),
    "https://openidconnect.googleapis.com": () => ({ json: { email: "me@example.com" } }),
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send": () => ({ json: { id: "m1" } }),
  });
  await completeAuthorization(ws.id, "gmail", "c");
  const action = { type: "email.send", connector: "gmail", to: "lead@example.com", subject: "Hello — ünï", body: "Thanks for reaching out." } as const;
  await assert.rejects(execute(ws.id, "owner", action), (e: { code?: string }) => e.code === "tool_disabled");
  assert.equal(calls.filter((c) => c.url.includes("messages/send")).length, 0, "nothing was sent while the tool was off");
  await setToolEnabled(ws.id, "gmail", "send_email", true);
  const summary = await execute(ws.id, "owner", action);
  assert.match(summary, /Email sent to lead@example.com/);
  const sent = calls.find((c) => c.url.includes("messages/send"))!;
  assert.equal(sent.auth, "Bearer ya29.A");
  const raw = Buffer.from(JSON.parse(sent.body).raw, "base64url").toString("utf8");
  assert.match(raw, /^To: lead@example.com\r\nSubject: =\?UTF-8\?B\?/);
  assert.equal(inspectAction(action).autoSendAllowed, false, "emails to non-contacts never auto-send");
  // a provider refusal is reported, not swallowed
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: "Invalid Credentials ya29.A" } }), { status: 401 })) as typeof fetch;
  await assert.rejects(execute(ws.id, "owner", action), (e: Error) => /refused/.test(e.message) && !e.message.includes("ya29.A"));
});

test("connectors: Slack, Calendar and GitHub call the real endpoints, high-risk ones never auto-send", async () => {
  process.env.SLACK_CLIENT_ID = "sid";
  process.env.SLACK_CLIENT_SECRET = "ssecret";
  process.env.GITHUB_CONNECT_CLIENT_ID = "ghid";
  process.env.GITHUB_CONNECT_CLIENT_SECRET = "ghsecret";
  setGoogle();
  const ws = await testWorkspace("conn-multi");
  const calls = fakeNet({
    "https://slack.com/api/oauth.v2.access": () => ({ json: { ok: true, access_token: "xoxb-1", team: { name: "Acme" } } }),
    "https://slack.com/api/chat.postMessage": (c) => ({ json: JSON.parse(c.body).channel === "#nope" ? { ok: false, error: "channel_not_found" } : { ok: true } }),
    "https://github.com/login/oauth/access_token": () => ({ json: { access_token: "gho_1" } }),
    "https://api.github.com/user": () => ({ json: { login: "octo" } }),
    "https://api.github.com/repos/octo/repo/issues": () => ({ json: { html_url: "https://github.com/octo/repo/issues/7" } }),
    "https://oauth2.googleapis.com/token": () => ({ json: { access_token: "ya29.C", expires_in: 3600 } }),
    "https://openidconnect.googleapis.com": () => ({ json: { email: "me@example.com" } }),
    "https://www.googleapis.com/calendar/v3/calendars/primary/events": () => ({ json: { htmlLink: "https://calendar.google.com/e/1" } }),
  });
  for (const c of ["slack", "github", "gcal"] as const) {
    await completeAuthorization(ws.id, c, "c");
  }
  await setToolEnabled(ws.id, "slack", "post_message", true);
  await setToolEnabled(ws.id, "github", "create_issue", true);
  await setToolEnabled(ws.id, "gcal", "create_event", true);
  assert.match(await execute(ws.id, "owner", { type: "slack.post", connector: "slack", channel: "#general", text: "Weekly report ready" }), /Posted to #general/);
  await assert.rejects(execute(ws.id, "owner", { type: "slack.post", connector: "slack", channel: "#nope", text: "x" }), /channel_not_found/);
  const gh = { type: "github.issue", connector: "github", repo: "octo/repo", title: "Bug", body: "Details" } as const;
  assert.match(await execute(ws.id, "owner", gh), /issues\/7/);
  await assert.rejects(execute(ws.id, "owner", { ...gh, repo: "../../etc" }), (e: { code?: string }) => e.code === "bad_repo");
  const cal = { type: "gcal.event", connector: "gcal", title: "Call", description: "Intro", start: "2026-10-05T15:00:00-04:00", end: "2026-10-05T15:30:00-04:00" } as const;
  assert.match(await execute(ws.id, "owner", cal), /Calendar event created/);
  assert.equal(inspectAction(gh).autoSendAllowed, false);
  assert.equal(inspectAction(cal).autoSendAllowed, false);
  assert.equal(calls.find((c) => c.url.includes("chat.postMessage"))!.auth, "Bearer xoxb-1");
  assert.equal(inspectAction({ type: "github.issue", connector: "github", repo: "o/r", title: "t", body: "my key sk_live_abcdefghijklmnopqrstuvwx" }).blocked !== null, true, "credentials in an issue body are blocked");
});

test("connectors: an agent that needs Gmail/Slack refuses to run when it isn't connected: no Usage, no drafts, a clear Connect message", async () => {
  const ws = await testWorkspace("conn-needs", "pro");
  const agent = await createAgent(ws, "lead-followup");
  const run = await runAgent(ws, agent.id, "manual", {});
  assert.equal(run.status, "failed");
  assert.equal(run.units, 0);
  assert.deepEqual(run.needs?.map((n) => [n.connector, n.problem]), [["gmail", "not_connected"]]);
  assert.match(run.error ?? "", /Needs Gmail\. Connect Gmail under Connectors/);
  assert.match(run.error ?? "", /Nothing was drafted, sent, or made up/);
  const report = await createAgent(ws, "weekly-report");
  const r2 = await runAgent(ws, report.id, "manual", {});
  assert.deepEqual(r2.needs?.map((n) => n.connector), ["slack"]);
  // connected but every tool still off: still refuses, and says which switch to flip
  process.env.SLACK_CLIENT_ID = "sid";
  process.env.SLACK_CLIENT_SECRET = "ssecret";
  fakeNet({ "https://slack.com/api/oauth.v2.access": () => ({ json: { ok: true, access_token: "xoxb-2", team: { name: "Acme" } } }) });
  await completeAuthorization(ws.id, "slack", "c");
  const r3 = await runAgent(ws, report.id, "manual", {});
  assert.deepEqual(r3.needs?.map((n) => n.problem), ["tool_off"]);
  assert.match(r3.error ?? "", /Turn on the Slack tool/);
  assert.equal((await connections().list(ws.id)).length, 1);
});

test("connectors: rfc822 strips header injection from the subject", () => {
  assert.doesNotMatch(rfc822("a@b.co", "Hi\r\nBcc: x@y.z", "b"), /\r\nBcc:/);
});
