import "./setup";
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { testWorkspace } from "./helpers/workspace";
import { CONNECTORS, execute } from "../src/lib/business/connectors";
import { completeAuthorization, setToolEnabled } from "../src/lib/business/oauth-connectors";
import { auditLog } from "../src/lib/business/repo";
import { LIVE_VERIFIED, UNVERIFIED_NOTE, isLiveVerified } from "../src/lib/business/verification";
import { UnverifiedNote } from "../src/components/business/UnverifiedNote";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of ["GOOGLE_CONNECT_CLIENT_ID", "GOOGLE_CONNECT_CLIENT_SECRET", "SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET", "GITHUB_CONNECT_CLIENT_ID", "GITHUB_CONNECT_CLIENT_SECRET"]) delete process.env[k];
});

test("verification registry: every connector is listed, and none claims live verification without a date", () => {
  for (const id of Object.keys(CONNECTORS)) assert.ok(id in LIVE_VERIFIED, `${id} missing from LIVE_VERIFIED`);
  for (const [id, v] of Object.entries(LIVE_VERIFIED)) if (v.verified) assert.match(v.verifiedOn ?? "", /^\d{4}-\d{2}-\d{2}$/, `${id} needs verifiedOn`);
  // Today nothing has been run against a real provider account. If this fails because you verified one for real, update the entry AND docs/connectors.md.
  assert.deepEqual(Object.entries(LIVE_VERIFIED).filter(([, v]) => v.verified), []);
  assert.equal(isLiveVerified("gmail"), false);
});

test("UI: the unverified note renders with its honest wording; the Connectors and Connected-apps screens include it and label each card", async () => {
  const html = renderToStaticMarkup(createElement(UnverifiedNote));
  assert.match(html, /have not yet been verified end-to-end with real accounts/);
  assert.match(html, /data-testid="unverified-note"/);
  assert.equal(UNVERIFIED_NOTE.includes("verified with real accounts") || UNVERIFIED_NOTE.includes("verified end-to-end with real accounts"), true);
  const { readFileSync } = await import("node:fs");
  const biz = readFileSync("src/components/business/BusinessOS.tsx", "utf8");
  const mcp = readFileSync("src/components/business/McpConnections.tsx", "utf8");
  assert.match(biz, /<UnverifiedNote className=\{s\.notice\} \/>/);
  assert.match(biz, /isLiveVerified\(c\.id\)[\s\S]{0,80}UNVERIFIED_LABEL/);
  assert.match(biz, /isLiveVerified\(name\.toLowerCase\(\)\)/);
  assert.match(mcp, /<UnverifiedNote className=\{s\.notice\} \/>/);
});

test("nothing fakes success: provider 500, network failure and non-JSON replies all reject, the secret never leaks, and no success is audited", async () => {
  process.env.GOOGLE_CONNECT_CLIENT_ID = "gid"; process.env.GOOGLE_CONNECT_CLIENT_SECRET = "gsecret";
  process.env.SLACK_CLIENT_ID = "sid"; process.env.SLACK_CLIENT_SECRET = "ssecret";
  process.env.GITHUB_CONNECT_CLIENT_ID = "ghid"; process.env.GITHUB_CONNECT_CLIENT_SECRET = "ghsecret";
  const ws = await testWorkspace("conn-honesty");
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const j = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
    if (url.startsWith("https://oauth2.googleapis.com/token")) return j({ access_token: "ya29.SECRETTOKEN", refresh_token: "1//R", expires_in: 3600 });
    if (url.startsWith("https://openidconnect.googleapis.com")) return j({ email: "me@example.com" });
    if (url.startsWith("https://slack.com/api/oauth.v2.access")) return j({ ok: true, access_token: "xoxb-SECRET", team: { name: "Acme" } });
    if (url.startsWith("https://github.com/login/oauth/access_token")) return j({ access_token: "gho_SECRET" });
    if (url.startsWith("https://api.github.com/user")) return j({ login: "octo" });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  for (const c of ["gmail", "gcal", "slack", "github"] as const) await completeAuthorization(ws.id, c, "c");
  await setToolEnabled(ws.id, "gmail", "send_email", true);
  await setToolEnabled(ws.id, "gcal", "create_event", true);
  await setToolEnabled(ws.id, "slack", "post_message", true);
  await setToolEnabled(ws.id, "github", "create_issue", true);
  const actions = [
    { type: "email.send", connector: "gmail", to: "lead@example.com", subject: "Hi", body: "Thanks." },
    { type: "gcal.event", connector: "gcal", title: "Call", description: "Intro", start: "2026-10-05T15:00:00-04:00", end: "2026-10-05T15:30:00-04:00" },
    { type: "slack.post", connector: "slack", channel: "#general", text: "Report" },
    { type: "github.issue", connector: "github", repo: "octo/repo", title: "Bug", body: "Details" },
  ] as const;
  const before = (await auditLog().list(ws.id)).length;
  const failures: [string, typeof fetch][] = [
    ["HTTP 500", (async () => new Response("upstream exploded ya29.SECRETTOKEN xoxb-SECRET", { status: 500 })) as typeof fetch],
    ["HTML error page", (async () => new Response("<html>Bad gateway</html>", { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch],
    ["network down", (async () => { throw new TypeError("fetch failed"); }) as typeof fetch],
  ];
  for (const [label, f] of failures) {
    globalThis.fetch = f;
    for (const a of actions) {
      let result: unknown = "no error";
      try { result = await execute(ws.id, "owner", a); } catch (e) { result = e; }
      assert.ok(result instanceof Error, `${a.connector} / ${label}: must reject, got ${JSON.stringify(result)}`);
      assert.doesNotMatch((result as Error).message, /SECRET|ya29|xoxb|gho_/, `${a.connector} / ${label}: no secret in the error`);
    }
  }
  assert.equal((await auditLog().list(ws.id)).length, before, "failed actions write no 'success' audit rows");
});
