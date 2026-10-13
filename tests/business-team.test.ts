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
async function businessTeam(lookupKey = "enterprise:acme-test") {
  const owner = await signIn(email("owner"), "business");
  await updateWorkspace(owner.workspaceId, { billing: { lookupKey, status: "active" } });
  const teamId = (await j(await teamsPost(jsonReq(owner.cookie, "/api/team", "POST", { name: "Acme" })))).team.id as string;
  const people: Record<string, { cookie: string; email: string }> = {};
  for (const role of ["member", "viewer"]) {
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
  assert.equal((await memberDelete(call(owner.cookie, `/api/team/${teamId}/members/${m.id}`, "DELETE"), PM(teamId, m.id))).status, 200);
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
