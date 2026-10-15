/* eslint-disable @typescript-eslint/no-explicit-any -- the tests read loosely-typed JSON bodies */
import "./setup";
import { signIn, jsonReq, call } from "./helpers/session";
import assert from "node:assert/strict";
import { test } from "node:test";
import { POST as teamsPost } from "../src/app/api/team/route";
import { GET as teamGet } from "../src/app/api/team/[id]/route";
import { POST as inviteDraftPost } from "../src/app/api/team/[id]/invites/route";
import { POST as inviteSendPost } from "../src/app/api/team/[id]/invites/[inviteId]/route";
import { DELETE as memberDelete } from "../src/app/api/team/[id]/members/[memberId]/route";
import { POST as joinPost } from "../src/app/api/team/join/route";
import { GET as accountGet } from "../src/app/api/business/account/route";
import { GET as agentsGet } from "../src/app/api/business/agents/route";
import { POST as haltPost } from "../src/app/api/business/agents/halt/route";
import { POST as agentsPost } from "../src/app/api/business/agents/route";
import { PATCH as agentPatch } from "../src/app/api/business/agents/[id]/route";
import { POST as decidePost } from "../src/app/api/business/approvals/[id]/route";
import { GET as banksGet, DELETE as banksDelete } from "../src/app/api/business/banks/route";
import { POST as plaidStart } from "../src/app/api/business/banks/plaid/start/route";
import { POST as stripeBankSession } from "../src/app/api/business/banks/stripe/session/route";
import { POST as connectorsPost } from "../src/app/api/business/connectors/route";
import { POST as connectorToolsPost } from "../src/app/api/business/connectors/tools/route";
import { POST as oauthStart } from "../src/app/api/business/connectors/oauth/start/route";
import { GET as paymentsGet, POST as paymentsPost } from "../src/app/api/business/payments/route";
import { POST as onboardingPost } from "../src/app/api/business/payments/onboarding/route";
import { POST as paymentsRefresh } from "../src/app/api/business/payments/refresh/route";
import { auditLog } from "../src/lib/business/repo";
import { updateWorkspace } from "../src/lib/accounts/workspaces";
import { knownTier, seatsForTier, ENTERPRISE_SEATS } from "../src/lib/business/seats";

const P = (id: string) => ({ params: Promise.resolve({ id }) });
const PI = (id: string, inviteId: string) => ({ params: Promise.resolve({ id, inviteId }) });
const PM = (id: string, memberId: string) => ({ params: Promise.resolve({ id, memberId }) });
const j = async (r: Response) => (await r.json()) as Record<string, any>;
let n = 0;
const email = (tag: string) => `${tag}${++n}-${Math.random().toString(36).slice(2, 7)}@example.com`;

async function invite(owner: { cookie: string }, teamId: string, addr: string, role: string) {
  const d = await inviteDraftPost(jsonReq(owner.cookie, `/api/team/${teamId}/invites`, "POST", { email: addr, role }), P(teamId));
  if (d.status !== 201) return d;
  const id = (await j(d)).invite.id as string;
  const sent = await j(await inviteSendPost(jsonReq(owner.cookie, `/api/team/${teamId}/invites/${id}`, "POST", { via: "link" }), PI(teamId, id)));
  return new URL(sent.link).hash.slice(1);
}

/** A Business owner with a known tier (an enterprise contract key here), a team, and people who joined with each role. */
async function businessTeam(lookupKey = "enterprise:acme-test", roles: string[] = ["member", "viewer"]) {
  const owner = await signIn(email("owner"), "business");
  await updateWorkspace(owner.workspaceId, { billing: { lookupKey, status: "active" } });
  const teamId = (await j(await teamsPost(jsonReq(owner.cookie, "/api/team", "POST", { name: "Acme" })))).team.id as string;
  const people: Record<string, { cookie: string; email: string }> = {};
  for (const role of roles) {
    const addr = email(role);
    const who = await signIn(addr, "free");
    const token = await invite(owner, teamId, addr, role);
    assert.equal(typeof token, "string", `${role} invited`);
    assert.equal((await joinPost(jsonReq(who.cookie, "/api/team/join", "POST", { token, action: "accept" }))).status, 200, `${role} joins`);
    people[role] = { cookie: who.cookie, email: addr };
  }
  return { owner, teamId, people };
}

test("Business seats follow the tier bought; an unknown tier keeps the team policy", () => {
  const env = { WHOP_PLAN_BIZ_STARTER_MONTHLY: "plan_StarterTest01", WHOP_PLAN_BIZ_GROWTH_MONTHLY: "plan_GrowthTest01", WHOP_PLAN_BIZ_SCALE_MONTHLY: "plan_ScaleTest001" };
  assert.equal(knownTier(null, "plan_GrowthTest01", env), "growth");
  assert.equal(knownTier(null, "enterprise:acme", env), "enterprise");
  assert.equal(knownTier(null, null, env), null, "no recorded plan: the team policy applies, nobody is locked out");
  assert.deepEqual([seatsForTier("starter"), seatsForTier("growth"), seatsForTier("scale"), seatsForTier("enterprise")], [1, 5, 15, ENTERPRISE_SEATS]);
});

test("an invited teammate works in the owner's Business workspace with their role", async () => {
  const { owner, people } = await businessTeam();
  const mine = await j(await accountGet(call(people.member.cookie, "/api/business/account")));
  assert.equal(mine.active, true, "a teammate on a free personal plan gets the Business workspace");
  assert.equal(mine.member.role, "member");
  assert.equal(mine.member.teamName, "Acme");
  // The same agents as the owner: one workspace, not a copy.
  const ownerAgents = await j(await agentsGet(call(owner.cookie, "/api/business/agents")));
  const theirs = await j(await agentsGet(call(people.viewer.cookie, "/api/business/agents")));
  assert.deepEqual(theirs.agents?.map((a: any) => a.id), ownerAgents.agents?.map((a: any) => a.id));
  // Viewers read; they can't change anything. Editors can.
  const denied = await haltPost(jsonReq(people.viewer.cookie, "/api/business/agents/halt", "POST", { halted: true }));
  assert.equal(denied.status, 403);
  assert.equal((await j(denied)).code, "team_forbidden");
  assert.equal((await haltPost(jsonReq(people.member.cookie, "/api/business/agents/halt", "POST", { halted: true }))).status, 200);
  assert.equal((await haltPost(jsonReq(owner.cookie, "/api/business/agents/halt", "POST", { halted: false }))).status, 200);
});

test("removing a teammate ends their Business access on the next request", async () => {
  const { owner, teamId, people } = await businessTeam();
  const detail = await j(await teamGet(call(owner.cookie, `/api/team/${teamId}`), P(teamId)));
  const m = detail.members.find((x: any) => x.email === people.member.email);
  assert.equal((await memberDelete(call(owner.cookie, `/api/team/${teamId}/members/${m.id}`, { method: "DELETE" }), PM(teamId, m.id))).status, 200);
  const after = await j(await accountGet(call(people.member.cookie, "/api/business/account")));
  assert.equal(after.active, false);
  assert.equal(after.member, null);
});

test("a Starter plan has one seat: the owner. Inviting is refused and says why", async () => {
  process.env.WHOP_PLAN_BIZ_STARTER_MONTHLY = "plan_StarterTest01";
  const owner = await signIn(email("starter"), "business");
  await updateWorkspace(owner.workspaceId, { billing: { lookupKey: "plan_StarterTest01", status: "active" } });
  const teamId = (await j(await teamsPost(jsonReq(owner.cookie, "/api/team", "POST", { name: "Solo" })))).team.id as string;
  const r = await invite(owner, teamId, email("x"), "member");
  assert.ok(r instanceof Response);
  assert.equal(r.status, 409);
  assert.match((await j(r)).error, /limit of 1 member/);
  const detail = await j(await teamGet(call(owner.cookie, `/api/team/${teamId}`), P(teamId)));
  assert.equal(detail.capacity.maxMembers, 1);
});

test("teammates can't act as the owner: payments, banks, connectors, auto-send/caps are owner only; approvals need owner or admin", async () => {
  const { owner, people } = await businessTeam("enterprise:acme-roles", ["member", "viewer", "admin"]);
  const forbidden = async (r: Response, label: string) => {
    assert.equal(r.status, 403, `${label}: ${r.status} ${await r.clone().text()}`);
    assert.equal((await j(r)).code, "team_forbidden", label);
  };
  for (const role of ["member", "admin", "viewer"]) {
    const c = people[role].cookie;
    await forbidden(await paymentsPost(jsonReq(c, "/api/business/payments", "POST", { businessName: "Mine" })), `${role} payments setup`);
    await forbidden(await onboardingPost(jsonReq(c, "/api/business/payments/onboarding", "POST", {})), `${role} onboarding`);
    await forbidden(await paymentsRefresh(jsonReq(c, "/api/business/payments/refresh", "POST", {})), `${role} payments refresh`);
    await forbidden(await banksGet(call(c, "/api/business/banks?data=1")), `${role} bank data`);
    await forbidden(await banksDelete(jsonReq(c, "/api/business/banks", "DELETE", { id: "x" })), `${role} bank remove`);
    await forbidden(await plaidStart(jsonReq(c, "/api/business/banks/plaid/start", "POST", {})), `${role} plaid start`);
    await forbidden(await stripeBankSession(jsonReq(c, "/api/business/banks/stripe/session", "POST", {})), `${role} stripe bank`);
    await forbidden(await connectorsPost(jsonReq(c, "/api/business/connectors", "POST", { connector: "gmail", action: "disconnect" })), `${role} connector`);
    await forbidden(await connectorToolsPost(jsonReq(c, "/api/business/connectors/tools", "POST", { connector: "gmail", tool: "send", enabled: true })), `${role} connector tools`);
    await forbidden(await oauthStart(jsonReq(c, "/api/business/connectors/oauth/start", "POST", { connector: "gmail" })), `${role} oauth start`);
  }
  // The owner still gets through the role gate (whatever the provider setup then says).
  assert.notEqual((await banksGet(call(owner.cookie, "/api/business/banks"))).status, 403);
  // Teammates see payment status but not the balance and payouts.
  assert.equal((await paymentsGet(call(people.viewer.cookie, "/api/business/payments?details=1"))).status, 200);

  // Agents: an Editor may pause/resume, but not turn on auto-send or change caps.
  const created = await agentsPost(jsonReq(owner.cookie, "/api/business/agents", "POST", { template: "daily-brief" }));
  assert.equal(created.status, 201, await created.clone().text());
  const agentId = (await j(created)).agent.id as string;
  const P1 = { params: Promise.resolve({ id: agentId }) };
  await forbidden(await agentPatch(jsonReq(people.member.cookie, `/api/business/agents/${agentId}`, "PATCH", { autoSend: true }), P1), "member autoSend");
  await forbidden(await agentPatch(jsonReq(people.admin.cookie, `/api/business/agents/${agentId}`, "PATCH", { caps: { maxPerDay: 999 } }), P1), "admin caps");
  assert.equal((await agentPatch(jsonReq(people.member.cookie, `/api/business/agents/${agentId}`, "PATCH", { status: "paused" }), P1)).status, 200);
  assert.equal((await agentPatch(jsonReq(owner.cookie, `/api/business/agents/${agentId}`, "PATCH", { autoSend: true }), P1)).status, 200);

  // Approvals: owner or admin decide; an Editor can't (a missing approval is 404 once past the role gate).
  const PA = { params: Promise.resolve({ id: "apr_missing" }) };
  await forbidden(await decidePost(jsonReq(people.member.cookie, "/api/business/approvals/apr_missing", "POST", { decision: "approve" }), PA), "member decide");
  assert.equal((await decidePost(jsonReq(people.admin.cookie, "/api/business/approvals/apr_missing", "POST", { decision: "approve" }), PA)).status, 404);
  assert.equal((await decidePost(jsonReq(owner.cookie, "/api/business/approvals/apr_missing", "POST", { decision: "reject" }), PA)).status, 404);

  // The audit log names the teammate who acted, not "owner".
  const rows = await auditLog().listSystem((r) => r.action === "agent.updated" && r.target === agentId);
  assert.ok(rows.some((r) => r.actor.startsWith(`member:member:${people.member.email}#`)), JSON.stringify(rows.map((r) => r.actor)));
  assert.ok(rows.some((r) => r.actor === "owner"));
});
