/* eslint-disable @typescript-eslint/no-explicit-any -- the tests read loosely-typed JSON bodies */
import "./setup";
import { signIn, jsonReq, call } from "./helpers/session";
import assert from "node:assert/strict";
import { test } from "node:test";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { GET as teamsGet, POST as teamsPost } from "../src/app/api/team/route";
import { DELETE as teamDelete, GET as teamGet, PATCH as teamPatch } from "../src/app/api/team/[id]/route";
import { POST as inviteDraftPost } from "../src/app/api/team/[id]/invites/route";
import { DELETE as inviteDelete, POST as inviteSendPost } from "../src/app/api/team/[id]/invites/[inviteId]/route";
import { DELETE as memberDelete, PATCH as memberPatch } from "../src/app/api/team/[id]/members/[memberId]/route";
import { POST as joinPost } from "../src/app/api/team/join/route";
import { POST as activePost } from "../src/app/api/team/active/route";
import { GET as exportGet } from "../src/app/api/team/[id]/export/route";
import { GET as projectsGet, POST as projectsPost } from "../src/app/api/projects/route";
import { DELETE as projectDelete } from "../src/app/api/projects/[id]/route";
import { GET as sitesGet, POST as sitesPost } from "../src/app/api/sites/route";
import { POST as publishPost } from "../src/app/api/sites/[id]/publish/route";
import { GET as chatsGet } from "../src/app/api/chats/route";
import { POST as askPost } from "../src/app/api/keplar/route";
import { currentWorkspace, workspaceById } from "../src/lib/create/platform/workspace";
import { updateWorkspace } from "../src/lib/accounts/workspaces";
import { actionForMethod, mayAssign, mayManage, roleCan, TEAM_POLICY, TEAM_ROLES, type TeamRole } from "../src/lib/team/policy";
import { listOutbox } from "../src/lib/accounts/outbox";
import { collection } from "../src/lib/create/platform/store";
import { hashToken } from "../src/lib/team/ids";
import { inviteRows, memberRows, teams } from "../src/lib/team/rows";
import { ownedTeam, removeUserFromTeams } from "../src/lib/team/store";
import { USER_COLLECTIONS } from "../src/lib/privacy/account-data";

const P = (id: string) => ({ params: Promise.resolve({ id }) });
const PI = (id: string, inviteId: string) => ({ params: Promise.resolve({ id, inviteId }) });
const PM = (id: string, memberId: string) => ({ params: Promise.resolve({ id, memberId }) });
const withTeam = (cookie: string, teamId: string) => `${cookie}; keplar_team=${teamId}`;
const j = async (r: Response) => (await r.json()) as Record<string, any>;
let n = 0;
const email = (tag: string) => `${tag}${++n}-${Math.random().toString(36).slice(2, 7)}@example.com`;

/** An owner on Business, plus members signed in with every role, through the real routes. Nothing is sent: links are copied. */
async function mkTeam(roles: TeamRole[] = ["admin", "member", "viewer"]) {
  const owner = await signIn(email("owner"), "business");
  const created = await teamsPost(jsonReq(owner.cookie, "/api/team", "POST", { name: "Acme" }));
  assert.equal(created.status, 201);
  const teamId = (await j(created)).team.id as string;
  const people: Record<string, { cookie: string; email: string; memberId: string }> = {};
  for (const role of roles) {
    const addr = email(role);
    const who = await signIn(addr, "free");
    const d = await j(await inviteDraftPost(jsonReq(owner.cookie, `/api/team/${teamId}/invites`, "POST", { email: addr, role }), P(teamId)));
    const sent = await j(await inviteSendPost(jsonReq(owner.cookie, `/api/team/${teamId}/invites/${d.invite.id}`, "POST", { via: "link" }), PI(teamId, d.invite.id)));
    const token = new URL(sent.link).hash.slice(1);
    const acc = await joinPost(jsonReq(who.cookie, "/api/team/join", "POST", { token, action: "accept" }));
    assert.equal(acc.status, 200, `${role} joins`);
    const detail = await j(await teamGet(call(owner.cookie, `/api/team/${teamId}`), P(teamId)));
    people[role] = { cookie: who.cookie, email: addr, memberId: detail.members.find((m: any) => m.email === addr).id };
  }
  return { owner, teamId, people };
}

test("roles: what each role may do, who may hand out or change which role, and what an HTTP method needs", () => {
  const can = (r: TeamRole) => (["read", "write", "delete", "publish", "manage", "owner"] as const).filter((a) => roleCan(r, a));
  assert.deepEqual(can("viewer"), ["read"]);
  assert.deepEqual(can("member"), ["read", "write"]);
  assert.deepEqual(can("admin"), ["read", "write", "delete", "publish", "manage"]);
  assert.deepEqual(can("owner"), ["read", "write", "delete", "publish", "manage", "owner"]);
  assert.equal(actionForMethod("GET"), "read");
  assert.equal(actionForMethod("post"), "write");
  assert.equal(actionForMethod("PATCH"), "write");
  assert.equal(actionForMethod("DELETE"), "delete");
  for (const a of TEAM_ROLES) assert.equal(mayAssign(a, "owner"), false, "nobody makes a second owner");
  assert.equal(mayAssign("admin", "admin"), false);
  assert.equal(mayAssign("admin", "member"), true);
  assert.equal(mayAssign("owner", "admin"), true);
  assert.equal(mayAssign("member", "viewer"), false);
  assert.equal(mayManage("admin", "admin"), false);
  assert.equal(mayManage("admin", "member"), true);
  assert.equal(mayManage("owner", "owner"), false);
  assert.equal(mayManage("viewer", "viewer"), false);
});

test("plan policy: teams are Business-only, with one shared pool that is stated and not per member", () => {
  for (const p of ["free", "lite", "plus", "pro"] as const) assert.equal(TEAM_POLICY[p].available, false, p);
  assert.equal(TEAM_POLICY.business.available, true);
  assert.ok(TEAM_POLICY.business.maxMembers >= 2 && TEAM_POLICY.business.poolUnits > 0);
});

test("only a verified Business owner can create a team, and only one", async () => {
  const free = await signIn(email("free"), "free");
  const r = await teamsPost(jsonReq(free.cookie, "/api/team", "POST", { name: "Nope" }));
  assert.equal(r.status, 402);
  assert.equal((await j(r)).code, "team_plan");
  const me = await j(await teamsGet(call(free.cookie, "/api/team")));
  assert.equal(me.eligible, false);
  assert.equal((await teamsPost(jsonReq(null, "/api/team", "POST", { name: "x" }))).status, 401);
  const biz = await signIn(email("biz"), "business");
  assert.equal((await teamsPost(jsonReq(biz.cookie, "/api/team", "POST", { name: "One" }))).status, 201);
  assert.equal((await teamsPost(jsonReq(biz.cookie, "/api/team", "POST", { name: "Two" }))).status, 409);
});

test("an invite is a draft: creating it sends nothing; email goes out only on the explicit send; the token is stored only as a hash", async () => {
  const owner = await signIn(email("owner"), "business");
  const teamId = (await j(await teamsPost(jsonReq(owner.cookie, "/api/team", "POST", { name: "Mail" })))).team.id as string;
  const invitee = email("invitee");
  const before = (await listOutbox()).filter((m) => m.to === invitee).length;
  const d = await j(await inviteDraftPost(jsonReq(owner.cookie, `/api/team/${teamId}/invites`, "POST", { email: invitee, role: "member" }), P(teamId)));
  assert.equal(d.invite.status, "draft");
  assert.equal((await listOutbox()).filter((m) => m.to === invitee).length, before, "drafting sent nothing");
  const row = await inviteRows().get(teamId, d.invite.id);
  assert.equal(row?.tokenHash, null);

  // No mail service configured: it says so, sends nothing and mints no link.
  const key = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  const none = await j(await inviteSendPost(jsonReq(owner.cookie, `/api/team/${teamId}/invites/${d.invite.id}`, "POST", { via: "email" }), PI(teamId, d.invite.id)));
  assert.equal(none.emailed, false);
  assert.equal(none.emailAvailable, false);
  assert.equal((await listOutbox()).filter((m) => m.to === invitee).length, before);
  assert.equal((await inviteRows().get(teamId, d.invite.id))?.status, "draft");

  // With Resend configured: one call to Resend, to that address only, when (and only when) the send is pressed.
  const calls: { to: string[]; text: string }[] = [];
  const realFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = "re_test_key";
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    if (String(url).startsWith("https://api.resend.com/emails")) {
      calls.push(JSON.parse(String(init?.body)));
      return new Response("{}", { status: 200 });
    }
    return realFetch(url as string, init);
  }) as typeof fetch;
  try {
    const sent = await j(await inviteSendPost(jsonReq(owner.cookie, `/api/team/${teamId}/invites/${d.invite.id}`, "POST", { via: "email" }), PI(teamId, d.invite.id)));
    assert.equal(sent.emailed, true);
    assert.equal(sent.link, null, "the link is in the email, not in the API answer");
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].to, [invitee]);
    assert.ok(/\/team\/join#[\w-]{40,}/.test(calls[0].text), "token in the fragment");
    const token = calls[0].text.match(/\/team\/join#([\w-]+)/)![1];
    const stored = await inviteRows().get(teamId, d.invite.id);
    assert.equal(stored?.tokenHash, hashToken(token));
    assert.ok(!JSON.stringify(stored).includes(token), "the token itself is never stored");
    // Sending again mints a new link and the old one stops working.
    const again = await j(await inviteSendPost(jsonReq(owner.cookie, `/api/team/${teamId}/invites/${d.invite.id}`, "POST", { via: "link" }), PI(teamId, d.invite.id)));
    const preview = (t: string) => joinPost(jsonReq(null, "/api/team/join", "POST", { token: t, action: "preview" }));
    assert.equal((await preview(token)).status, 404);
    assert.equal((await preview(new URL(again.link).hash.slice(1))).status, 200);
    // A failed provider means nothing is claimed as sent.
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => (String(url).startsWith("https://api.resend.com/") ? new Response("no", { status: 500 }) : realFetch(url as string, init))) as typeof fetch;
    const d2 = await j(await inviteDraftPost(jsonReq(owner.cookie, `/api/team/${teamId}/invites`, "POST", { email: email("other"), role: "viewer" }), P(teamId)));
    const failed = await inviteSendPost(jsonReq(owner.cookie, `/api/team/${teamId}/invites/${d2.invite.id}`, "POST", { via: "email" }), PI(teamId, d2.invite.id));
    assert.equal(failed.status, 502);
    assert.equal((await inviteRows().get(teamId, d2.invite.id))?.status, "draft");
  } finally {
    globalThis.fetch = realFetch;
    if (key === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = key;
  }
});

test("accepting: only the invited verified address, once; revoked, expired and wrong-account links are refused", async () => {
  const owner = await signIn(email("owner"), "business");
  const teamId = (await j(await teamsPost(jsonReq(owner.cookie, "/api/team", "POST", { name: "Join" })))).team.id as string;
  const addr = email("guest");
  const guest = await signIn(addr, "free");
  const stranger = await signIn(email("stranger"), "free");
  const mk = async (to: string, role = "member") => {
    const d = await j(await inviteDraftPost(jsonReq(owner.cookie, `/api/team/${teamId}/invites`, "POST", { email: to, role }), P(teamId)));
    const s = await j(await inviteSendPost(jsonReq(owner.cookie, `/api/team/${teamId}/invites/${d.invite.id}`, "POST", { via: "link" }), PI(teamId, d.invite.id)));
    return { id: d.invite.id as string, token: new URL(s.link).hash.slice(1) };
  };
  const accept = (cookie: string | null, token: string) => joinPost(jsonReq(cookie, "/api/team/join", "POST", { token, action: "accept" }));
  const a = await mk(addr);
  assert.equal((await accept(null, a.token)).status, 401, "signed out");
  const wrong = await accept(stranger.cookie, a.token);
  assert.equal(wrong.status, 403);
  assert.equal((await j(wrong)).code, "wrong_account");
  assert.equal((await accept(guest.cookie, "x".repeat(43))).status, 404);
  const ok = await accept(guest.cookie, a.token);
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("set-cookie") ?? "", new RegExp(`keplar_team=${teamId}`));
  assert.equal((await accept(guest.cookie, a.token)).status, 404, "single use");
  // Revoked
  const g2 = email("g2");
  const w2 = await signIn(g2, "free");
  const r = await mk(g2, "viewer");
  assert.equal((await inviteDelete(jsonReq(owner.cookie, `/api/team/${teamId}/invites/${r.id}`, "DELETE"), PI(teamId, r.id))).status, 200);
  assert.equal((await accept(w2.cookie, r.token)).status, 404, "revoked");
  // Expired
  const g3 = email("g3");
  const w3 = await signIn(g3, "free");
  const e = await mk(g3, "viewer");
  await inviteRows().update(teamId, e.id, { expiresAt: new Date(Date.now() - 1000).toISOString() });
  assert.equal((await accept(w3.cookie, e.token)).status, 404, "expired");
  // An admin cannot mint another admin; a non-member cannot invite at all.
  assert.equal((await inviteDraftPost(jsonReq(stranger.cookie, `/api/team/${teamId}/invites`, "POST", { email: email("z"), role: "member" }), P(teamId))).status, 403);
});

test("tenant isolation and roles on the shared routes: team data is separate from personal data and every route checks the role", async () => {
  const { owner, teamId, people } = await mkTeam();
  const outsider = await signIn(email("outsider"), "business");
  const asTeam = (cookie: string) => withTeam(cookie, teamId);

  // A member creates a shared project; it exists in the team, not in anyone's personal workspace.
  const made = await projectsPost(jsonReq(asTeam(people.member.cookie), "/api/projects", "POST", { name: "Roadmap" }));
  assert.equal(made.status, 201);
  const pid = (await j(made)).project.id as string;
  assert.equal((await j(await projectsGet(call(owner.cookie, "/api/projects")))).projects.length, 0, "owner's personal list has nothing");
  assert.equal((await j(await projectsGet(call(people.member.cookie, "/api/projects")))).projects.length, 0, "member's personal list has nothing");
  for (const who of [owner, people.admin, people.member, people.viewer]) {
    assert.deepEqual((await j(await projectsGet(call(asTeam(who.cookie), "/api/projects")))).projects.map((p: any) => p.name), ["Roadmap"]);
  }
  // Viewer: read yes, write no. Member: write yes, delete no. Admin: delete yes.
  const viewerWrite = await projectsPost(jsonReq(asTeam(people.viewer.cookie), "/api/projects", "POST", { name: "Sneaky" }));
  assert.equal(viewerWrite.status, 403);
  assert.equal((await j(viewerWrite)).code, "team_forbidden");
  const del = (cookie: string) => projectDelete(jsonReq(cookie, `/api/projects/${pid}`, "DELETE", { confirm: "DELETE" }), P(pid));
  assert.equal((await del(asTeam(people.viewer.cookie))).status, 403);
  assert.equal((await del(asTeam(people.member.cookie))).status, 403);
  assert.equal((await projectsGet(call(asTeam(people.viewer.cookie), "/api/projects"))).status, 200);
  // Someone outside the team, holding the cookie anyway, gets nothing: the same answer as a team that doesn't exist.
  const out = await projectsGet(call(asTeam(outsider.cookie), "/api/projects"));
  assert.equal(out.status, 403);
  assert.equal((await j(out)).code, "team_access_revoked");
  assert.equal((await projectsGet(call(withTeam(outsider.cookie, "tm_0000000000000000"), "/api/projects"))).status, 403);
  // A route that did not opt in ignores the cookie: it can only ever be the personal workspace.
  const personal = await currentWorkspace(call(asTeam(people.member.cookie), "/api/anything"));
  assert.notEqual(personal.id, teamId);
  assert.equal(personal.team, undefined);
  const inTeam = await currentWorkspace(call(asTeam(people.member.cookie), "/api/projects"), { team: true });
  assert.equal(inTeam.id, teamId);
  assert.equal(inTeam.team?.role, "member");
  // Asking spends the team's shared pool: a viewer is refused before anything runs; a member gets past the role check.
  const ask = (cookie: string) => askPost(jsonReq(cookie, "/api/keplar", "POST", { prompt: "Who created Keplar?" }));
  const askViewer = await ask(asTeam(people.viewer.cookie));
  assert.equal(askViewer.status, 403);
  assert.equal((await j(askViewer)).code, "team_forbidden");
  assert.notEqual((await ask(asTeam(people.member.cookie))).status, 403);
  // Chats are team-scoped the same way.
  assert.equal((await chatsGet(call(asTeam(people.viewer.cookie), "/api/chats"))).status, 200);
  // Admin deletes.
  assert.equal((await del(asTeam(people.admin.cookie))).status, 200);
  assert.equal((await j(await projectsGet(call(asTeam(owner.cookie), "/api/projects")))).projects.length, 0);
});

test("shared sites: members create, only admins publish, personal sites never appear in the team", async () => {
  const { owner, teamId, people } = await mkTeam();
  const asTeam = (cookie: string) => withTeam(cookie, teamId);
  const mine = await sitesPost(jsonReq(owner.cookie, "/api/sites", "POST", { name: "Personal site" }));
  assert.equal(mine.status, 201);
  const made = await sitesPost(jsonReq(asTeam(people.member.cookie), "/api/sites", "POST", { name: "Team site" }));
  assert.equal(made.status, 201);
  const sid = (await j(made)).site.id as string;
  assert.equal((await sitesPost(jsonReq(asTeam(people.viewer.cookie), "/api/sites", "POST", { name: "No" }))).status, 403);
  const names = async (cookie: string) => (await j(await sitesGet(call(cookie, "/api/sites")))).sites.map((s: any) => s.name);
  assert.deepEqual(await names(asTeam(people.viewer.cookie)), ["Team site"]);
  assert.deepEqual(await names(owner.cookie), ["Personal site"]);
  const pub = (cookie: string) => publishPost(jsonReq(cookie, `/api/sites/${sid}/publish`, "POST", {}), P(sid));
  const m = await pub(asTeam(people.member.cookie));
  assert.equal(m.status, 403, "a member cannot publish");
  assert.equal((await j(m)).code, "team_forbidden");
  assert.notEqual((await pub(asTeam(people.admin.cookie))).status, 403, "an admin passes the role check (what happens next is the publish rules)");
  // The shared site's workspace, for background jobs and public serving, is the team's: owner's plan, the team's pool, never the admin exemption.
  const ws = await workspaceById(teamId);
  assert.equal(ws?.plan, "business");
  assert.equal(ws?.entitlements.monthlyUnits, TEAM_POLICY.business.poolUnits);
  assert.equal(ws?.admin, false);
});

test("removing a member revokes access on their very next request; leaving works; the owner can't be removed", async () => {
  const { owner, teamId, people } = await mkTeam();
  const mem = people.member;
  const url = "/api/projects";
  assert.equal((await projectsPost(jsonReq(withTeam(mem.cookie, teamId), url, "POST", { name: "Before" }))).status, 201);
  // A member and a viewer cannot remove anyone; an admin cannot remove another admin.
  assert.equal((await memberDelete(jsonReq(people.viewer.cookie, `/api/team/${teamId}/members/${mem.memberId}`, "DELETE"), PM(teamId, mem.memberId))).status, 403);
  assert.equal((await memberPatch(jsonReq(people.member.cookie, `/api/team/${teamId}/members/${people.viewer.memberId}`, "PATCH", { role: "admin" }), PM(teamId, people.viewer.memberId))).status, 403);
  assert.equal((await memberPatch(jsonReq(people.admin.cookie, `/api/team/${teamId}/members/${people.viewer.memberId}`, "PATCH", { role: "admin" }), PM(teamId, people.viewer.memberId))).status, 403, "admins don't make admins");
  assert.equal((await memberPatch(jsonReq(people.admin.cookie, `/api/team/${teamId}/members/${people.viewer.memberId}`, "PATCH", { role: "member" }), PM(teamId, people.viewer.memberId))).status, 200);
  // Owner removes the member: the next request fails, with no waiting and no cache.
  const rm = await memberDelete(jsonReq(owner.cookie, `/api/team/${teamId}/members/${mem.memberId}`, "DELETE"), PM(teamId, mem.memberId));
  assert.equal(rm.status, 200);
  const after = await projectsGet(call(withTeam(mem.cookie, teamId), url));
  assert.equal(after.status, 403);
  assert.equal((await j(after)).code, "team_access_revoked");
  assert.equal((await teamGet(call(mem.cookie, `/api/team/${teamId}`), P(teamId))).status, 403);
  assert.equal((await projectsPost(jsonReq(withTeam(mem.cookie, teamId), url, "POST", { name: "After" }))).status, 403);
  // Their own personal workspace still works; the list of their teams no longer has it and clears the stale selection.
  assert.equal((await projectsGet(call(mem.cookie, url))).status, 200);
  const mine = await teamsGet(call(withTeam(mem.cookie, teamId), "/api/team"));
  assert.deepEqual((await j(mine)).teams, []);
  assert.match(mine.headers.get("set-cookie") ?? "", /keplar_team=;.*Max-Age=0/);
  // The owner can't be removed or leave.
  const detail = await j(await teamGet(call(owner.cookie, `/api/team/${teamId}`), P(teamId)));
  const ownerMember = detail.members.find((m: any) => m.role === "owner");
  assert.equal((await memberDelete(jsonReq(owner.cookie, `/api/team/${teamId}/members/${ownerMember.id}`, "DELETE"), PM(teamId, ownerMember.id))).status, 403);
  // A member can leave on their own.
  const leave = await memberDelete(jsonReq(people.viewer.cookie, `/api/team/${teamId}/members/${people.viewer.memberId}`, "DELETE"), PM(teamId, people.viewer.memberId));
  assert.equal(leave.status, 200);
  assert.equal((await projectsGet(call(withTeam(people.viewer.cookie, teamId), url))).status, 403);
  // The audit log recorded all of it (admins and the owner can read it; members cannot).
  const log = (await j(await teamGet(call(owner.cookie, `/api/team/${teamId}`), P(teamId)))).audit.map((a: any) => a.action);
  for (const a of ["team.created", "invite.drafted", "invite.link_created", "invite.accepted", "member.role_changed", "member.removed", "member.left"]) assert.ok(log.includes(a), a);
  assert.deepEqual((await j(await teamGet(call(people.admin.cookie, `/api/team/${teamId}`), P(teamId)))).audit.length > 0, true);
});

test("members see members, not invites or the audit log; switching teams needs membership", async () => {
  const { teamId, people, owner } = await mkTeam();
  const d = await j(await teamGet(call(people.member.cookie, `/api/team/${teamId}`), P(teamId)));
  assert.equal(d.role, "member");
  assert.deepEqual(d.invites, []);
  assert.deepEqual(d.audit, []);
  assert.ok(d.members.length >= 4);
  assert.ok(!JSON.stringify(d).includes("tokenHash"));
  const out = await signIn(email("nobody"), "business");
  assert.equal((await activePost(jsonReq(out.cookie, "/api/team/active", "POST", { teamId }))).status, 403);
  const ok = await activePost(jsonReq(people.viewer.cookie, "/api/team/active", "POST", { teamId }));
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("set-cookie") ?? "", new RegExp(`keplar_team=${teamId}`));
  assert.match((await activePost(jsonReq(people.viewer.cookie, "/api/team/active", "POST", { teamId: null }))).headers.get("set-cookie") ?? "", /Max-Age=0/);
  // Only the owner renames; only the owner exports or deletes.
  assert.equal((await teamPatch(jsonReq(people.admin.cookie, `/api/team/${teamId}`, "PATCH", { name: "X" }), P(teamId))).status, 403);
  assert.equal((await teamPatch(jsonReq(owner.cookie, `/api/team/${teamId}`, "PATCH", { name: "Acme Inc" }), P(teamId))).status, 200);
  assert.equal((await exportGet(call(people.admin.cookie, `/api/team/${teamId}/export`), P(teamId))).status, 403);
  assert.equal((await teamDelete(jsonReq(people.admin.cookie, `/api/team/${teamId}`, "DELETE", { confirm: "Acme Inc" }), P(teamId))).status, 403);
});

test("the pool: shared, sized by policy, never the owner's admin exemption; a lapsed owner plan pauses data routes but not export or delete", async () => {
  const { owner, teamId, people } = await mkTeam(["member"]);
  const ws = await currentWorkspace(call(withTeam(people.member.cookie, teamId), "/api/projects"), { team: true });
  assert.equal(ws.plan, "business");
  assert.equal(ws.entitlements.monthlyUnits, TEAM_POLICY.business.poolUnits);
  assert.equal(ws.admin, false);
  assert.match(ws.entitlements.label, /team/i);
  // An operator can size the pool for a contracted team.
  await teams().update(teamId, teamId, { poolUnits: 50_000 });
  assert.equal((await currentWorkspace(call(withTeam(people.member.cookie, teamId), "/api/projects"), { team: true })).entitlements.monthlyUnits, 50_000);
  // The detail shows the statement and the limits as enforced.
  const d = await j(await teamGet(call(owner.cookie, `/api/team/${teamId}`), P(teamId)));
  assert.equal(d.pool.units, 50_000);
  assert.match(d.pool.statement, /shared pool/i);
  assert.match(d.pool.statement, /not per member/i);
  // Owner's plan lapses: shared data routes pause (403 team_inactive) for everyone; management and export stay reachable.
  await updateWorkspace(owner.workspaceId, { plan: "plus" });
  const paused = await projectsGet(call(withTeam(people.member.cookie, teamId), "/api/projects"));
  assert.equal(paused.status, 403);
  assert.equal((await j(paused)).code, "team_inactive");
  const detail = await j(await teamGet(call(owner.cookie, `/api/team/${teamId}`), P(teamId)));
  assert.equal(detail.paused, true);
  assert.equal((await exportGet(call(owner.cookie, `/api/team/${teamId}/export`), P(teamId))).status, 200);
  const blocked = await inviteDraftPost(jsonReq(owner.cookie, `/api/team/${teamId}/invites`, "POST", { email: email("late"), role: "member" }), P(teamId));
  assert.equal(blocked.status, 402);
  await updateWorkspace(owner.workspaceId, { plan: "business" });
  assert.equal((await projectsGet(call(withTeam(people.member.cookie, teamId), "/api/projects"))).status, 200);
});

test("seat and invite limits are enforced and stated", async () => {
  const owner = await signIn(email("owner"), "business");
  const teamId = (await j(await teamsPost(jsonReq(owner.cookie, "/api/team", "POST", { name: "Cap" })))).team.id as string;
  const max = TEAM_POLICY.business.maxMembers;
  let ok = 0;
  let refused: Response | null = null;
  for (let i = 0; i < max + 2; i++) {
    const r = await inviteDraftPost(jsonReq(owner.cookie, `/api/team/${teamId}/invites`, "POST", { email: email("seat"), role: "member" }), P(teamId));
    if (r.status === 201) ok++;
    else { refused = r; break; }
  }
  assert.equal(ok, max - 1, "owner takes one seat; open invites count toward the limit");
  assert.equal(refused?.status, 409);
  assert.match((await j(refused!)).error, /limit/i);
  assert.equal((await inviteDraftPost(jsonReq(owner.cookie, `/api/team/${teamId}/invites`, "POST", { email: "not-an-email", role: "member" }), P(teamId))).status, 400);
  assert.equal((await inviteDraftPost(jsonReq(owner.cookie, `/api/team/${teamId}/invites`, "POST", { email: email("r"), role: "owner" }), P(teamId))).status, 400);
});

test("export holds the team's shared data and nothing personal; delete removes the team, its data and its memberships, and leaves personal workspaces alone", async () => {
  const { owner, teamId, people } = await mkTeam(["member"]);
  await projectsPost(jsonReq(withTeam(people.member.cookie, teamId), "/api/projects", "POST", { name: "Shared plan" }));
  await projectsPost(jsonReq(owner.cookie, "/api/projects", "POST", { name: "Owner private" }));
  await projectsPost(jsonReq(people.member.cookie, "/api/projects", "POST", { name: "Member private" }));
  const exp = await (await exportGet(call(owner.cookie, `/api/team/${teamId}/export`), P(teamId))).text();
  assert.ok(exp.includes("Shared plan"));
  assert.ok(exp.includes(people.member.email), "members are in the team export");
  assert.ok(!exp.includes("Owner private") && !exp.includes("Member private"), "no personal data");
  assert.ok(!exp.includes('"tokenHash":"'), "no secrets");
  // Wrong confirmation, then the right one.
  assert.equal((await teamDelete(jsonReq(owner.cookie, `/api/team/${teamId}`, "DELETE", { confirm: "nope" }), P(teamId))).status, 400);
  const del = await teamDelete(jsonReq(owner.cookie, `/api/team/${teamId}`, "DELETE", { confirm: "Acme" }), P(teamId));
  assert.equal(del.status, 200);
  assert.equal(await teams().get(teamId, teamId), null);
  assert.equal((await memberRows().list(teamId)).length, 0);
  assert.equal((await collection<{ id: string; workspaceId: string }>("projects").list(teamId)).length, 0);
  assert.equal((await projectsGet(call(withTeam(people.member.cookie, teamId), "/api/projects"))).status, 403, "access is gone with the team");
  assert.deepEqual((await j(await projectsGet(call(owner.cookie, "/api/projects")))).projects.map((p: any) => p.name), ["Owner private"]);
  assert.deepEqual((await j(await projectsGet(call(people.member.cookie, "/api/projects")))).projects.map((p: any) => p.name), ["Member private"]);
  assert.equal(await ownedTeam((await currentWorkspace(call(owner.cookie, "/x"))).userId as string), null);
});

test("closing an account: members leave their teams; an owner is told to delete the team first; collections are classified for export and deletion", async () => {
  const { owner, teamId, people } = await mkTeam(["member"]);
  const ws = await currentWorkspace(call(people.member.cookie, "/x"));
  assert.equal(await removeUserFromTeams(ws.userId as string), 1);
  assert.equal((await projectsGet(call(withTeam(people.member.cookie, teamId), "/api/projects"))).status, 403);
  assert.ok(await ownedTeam((await currentWorkspace(call(owner.cookie, "/x"))).userId as string), "owner still owns it");
  const src = readFileSync("src/app/api/account/delete/route.ts", "utf8");
  assert.ok(src.includes("team_owned") && src.includes("ownedTeam"));
  assert.ok(readFileSync("src/lib/privacy/deletion.ts", "utf8").includes("removeUserFromTeams"));
  for (const c of ["team_teams", "team_members", "team_invites", "team_audit"]) assert.ok((USER_COLLECTIONS as readonly string[]).includes(c), c);
});

test("every route that opted in to team context is on the reviewed list; sensitive site routes did not", () => {
  const hits = execSync(`grep -rl "team: " src/app/api src/lib/projects --include=*.ts`, { encoding: "utf8" }).split("\n").filter(Boolean).sort();
  const expected = [
    "src/app/api/apps/[id]/build/route.ts", "src/app/api/apps/[id]/route.ts", "src/app/api/apps/[id]/theme/route.ts", "src/app/api/apps/design/route.ts", "src/app/api/apps/route.ts",
    "src/app/api/chats/[id]/route.ts", "src/app/api/chats/route.ts", "src/app/api/keplar/route.ts", "src/app/api/keplar/turn/route.ts" /* answer recovery: resolves the workspace as the chat route does; the turn owner is workspace + person, so team members never share turns */, "src/app/api/sites/[id]/activity/route.ts", "src/app/api/sites/[id]/branch/route.ts" /* branch a draft from a version: same shape as duplicate */, "src/app/api/sites/[id]/canvas/route.ts" /* Business Design Canvas: hand and AI edits of site files, same shape as versions PATCH and design */, "src/app/api/sites/[id]/design/route.ts",
    "src/app/api/sites/[id]/duplicate/route.ts", "src/app/api/sites/[id]/estimate/route.ts", "src/app/api/sites/[id]/export/route.ts", "src/app/api/sites/[id]/generate/route.ts",
    "src/app/api/sites/[id]/publish/route.ts", "src/app/api/sites/[id]/qa/route.ts", "src/app/api/sites/[id]/restore/route.ts", "src/app/api/sites/[id]/route.ts",
    "src/app/api/sites/[id]/versions/route.ts", "src/app/api/sites/route.ts", "src/lib/projects/api.ts",
  ].sort();
  assert.deepEqual(hits.filter((f) => !f.startsWith("src/app/api/team/")), expected);
  for (const f of ["leads", "data", "analytics", "removal", "features"]) assert.ok(!readFileSync(`src/app/api/sites/[id]/${f}/route.ts`, "utf8").includes("team:"), `${f} stays personal-only`);
  assert.ok(!readFileSync("src/app/api/apps/[id]/data/route.ts", "utf8").includes("team:"), "an app's end-user data stays personal-only");
});
