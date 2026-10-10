import "./setup";
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { testWorkspace } from "./helpers/workspace";
import { banksView, connectorsView, hideSetupDetail, offeredTemplates, templateOffered } from "../src/lib/business/visibility";
import { listBanks } from "../src/lib/business/plaid";
import { TEMPLATES } from "../src/lib/business/agents";
import { connections } from "../src/lib/business/repo";
import { HttpError } from "../src/lib/create/platform/http";
import { id, now } from "../src/lib/create/platform/ids";

afterEach(() => {
  for (const k of ["GOOGLE_CONNECT_CLIENT_ID", "GOOGLE_CONNECT_CLIENT_SECRET", "SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET", "PLAID_CLIENT_ID", "PLAID_SECRET"]) delete process.env[k];
});
const TECH = /GOOGLE_CONNECT|SLACK_CLIENT|GITHUB_CONNECT|PLAID_|redirect|callback|server environment|Not configured|MS_OAUTH/i;

test("visibility: regular users see only configured connectors, with no env names, redirect URIs or setup text anywhere in the payload", async () => {
  const ws = await testWorkspace("vis-user");
  const v = await connectorsView(ws.id, false);
  assert.deepEqual(v.connectors.map((c) => c.id), ["sheets"], "only the built-in Sheets is configured");
  assert.equal(v.setupNeeded, undefined);
  assert.doesNotMatch(JSON.stringify(v), TECH);
  assert.ok(!("needsEnv" in v.connectors[0]) && !("redirectUri" in v.connectors[0]) && !("setup" in v.connectors[0]));
});

test("visibility: configuring a connector's keys makes it appear for regular users", async () => {
  process.env.GOOGLE_CONNECT_CLIENT_ID = "gid";
  process.env.GOOGLE_CONNECT_CLIENT_SECRET = "gsecret";
  const ws = await testWorkspace("vis-google");
  const v = await connectorsView(ws.id, false);
  assert.deepEqual(v.connectors.map((c) => c.id).sort(), ["gcal", "gmail", "sheets"]);
  assert.doesNotMatch(JSON.stringify(v), TECH);
  assert.doesNotMatch(JSON.stringify(v), /gsecret/);
});

test("visibility: admins get an admin-only 'Setup needed' list with env names and the redirect URI", async () => {
  const ws = await testWorkspace("vis-admin");
  const v = await connectorsView(ws.id, true);
  const ids = v.setupNeeded!.map((x) => x.id).sort();
  assert.deepEqual(ids, ["github", "gmail", "gcal", "outlook", "slack", "social", "stripe"].sort());
  const g = v.setupNeeded!.find((x) => x.id === "gcal")!;
  assert.deepEqual(g.needsEnv, ["GOOGLE_CONNECT_CLIENT_ID", "GOOGLE_CONNECT_CLIENT_SECRET"]);
  assert.match(g.redirectUri!, /\/api\/business\/connectors\/oauth\/callback$/);
  assert.ok(!v.connectors.some((c) => ids.includes(c.id)), "never in both lists");
});

test("visibility: a connector that is already connected stays visible so it can be switched off", async () => {
  const ws = await testWorkspace("vis-connected");
  await connections().insert({ id: id("conn"), workspaceId: ws.id, connector: "slack", status: "connected", account: "Acme", tokenEnc: null, scopes: [], connectedAt: now(), tools: { post_message: false } } as never);
  const v = await connectorsView(ws.id, false);
  assert.ok(v.connectors.some((c) => c.id === "slack"));
  assert.doesNotMatch(JSON.stringify(v), TECH);
});

test("visibility: banks are fully hidden from regular users without Plaid keys; admins see setup; configured shows for everyone", async () => {
  const ws = await testWorkspace("vis-bank");
  const user = banksView(await listBanks(ws.id, true), false);
  assert.deepEqual(user, { hidden: true });
  const admin = banksView(await listBanks(ws.id, true), true) as { hidden: true; setupNeeded: { id: string; needsEnv: string[] }[] };
  assert.equal(admin.hidden, true);
  assert.deepEqual(admin.setupNeeded.find((x) => x.id === "plaid")!.needsEnv, ["PLAID_CLIENT_ID", "PLAID_SECRET"]);
  assert.deepEqual(admin.setupNeeded.find((x) => x.id === "stripe-fc")!.needsEnv, ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY"]);
  assert.doesNotMatch(JSON.stringify(admin), /Coming soon|does not allow/);
  process.env.PLAID_CLIENT_ID = "cid";
  process.env.PLAID_SECRET = "plaid-secret-value";
  const on = banksView(await listBanks(ws.id, false), false) as { hidden?: boolean; configured: boolean };
  assert.equal(on.hidden, undefined);
  assert.equal(on.configured, true);
  assert.doesNotMatch(JSON.stringify(on), /PLAID_|plaid-secret/);
});

test("visibility: agent templates that need a hidden connector are not offered", () => {
  const all = Object.keys(TEMPLATES);
  assert.deepEqual(offeredTemplates(all), ["mcp-task", "daily-brief", "monitor", "scheduled-question", "event-reply"], "no keys: Gmail, Slack and Social templates all hidden; the brief, the monitor, scheduled questions and the event responder (its own address and webhook, approval-only) need no connector");
  process.env.GOOGLE_CONNECT_CLIENT_ID = "gid";
  process.env.GOOGLE_CONNECT_CLIENT_SECRET = "gs";
  assert.deepEqual(offeredTemplates(all).sort(), ["daily-brief", "event-reply", "invoice-reminder", "lead-followup", "lead-sweep", "mcp-task", "monitor", "scheduled-question"]);
  process.env.SLACK_CLIENT_ID = "sid";
  process.env.SLACK_CLIENT_SECRET = "ss";
  assert.equal(templateOffered("weekly-report"), true);
  assert.equal(templateOffered("social-post"), false, "the social scheduler is never available");
});

test("visibility: 'not configured' errors lose their env var names for regular users but not admins", () => {
  const e = new HttpError(503, "Gmail isn't configured yet. Add GOOGLE_CONNECT_CLIENT_ID and GOOGLE_CONNECT_CLIENT_SECRET to the server environment.", "not_configured");
  const user = hideSetupDetail(e, false) as HttpError;
  assert.doesNotMatch(user.message, TECH);
  assert.equal(hideSetupDetail(e, true), e);
  const other = new HttpError(400, "Unknown connector.");
  assert.equal(hideSetupDetail(other, false), other);
});
