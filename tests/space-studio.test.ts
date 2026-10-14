import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { call, jsonReq, signIn } from "./helpers/session";
import { applyBillingEvent, cloudDecision, effectivePlan, MODELS, planLink, planUnlink, REAUTH_MS, route, type Identity, type Subscription } from "../src/lib/space-studio/core";
import { requireSpaceCloud } from "../src/lib/space-studio/cloud";
import { addCloudMinutes, commitLink, identityIndex, indexKey, indexReader, loadIdentities, loadSubscription, SPACE_INDEX_WS, subscriptions } from "../src/lib/space-studio/store";
import { signPayload } from "../src/lib/space-studio/billing";
import { planChat, runSpaceChat, validateChatBody } from "../src/lib/space-studio/chat";
import { jobs as robloxJobs, type CloudJob } from "../src/lib/roblox-cloud/model";
import { runSlice } from "../src/lib/roblox-cloud/worker";
import { deleteWorkspaceData } from "../src/lib/privacy/account-data";
import type { Workspace } from "../src/lib/create/platform/workspace";

const NOW = Date.parse("2026-10-13T12:00:00Z");
const future = new Date(NOW + 30 * 864e5).toISOString();
const sub = (plan: Subscription["plan"], status: Subscription["status"] = "active", periodEnd: string | null = future): Subscription => ({ plan, status, periodEnd, appliedEvents: [], updatedAt: new Date(NOW).toISOString(), lastEventAt: 1 });
const idle = { runningJobs: 0, minutesThisMonth: 0 };
const store = async (wsId: string, s: Subscription | null) => {
  await subscriptions().remove(wsId, "sub");
  if (s) await subscriptions().insert({ id: "sub", workspaceId: wsId, sub: s });
};
const ws = (id: string) => ({ id, plan: "free", userId: "u", anonymous: false }) as unknown as Workspace;

/* ── plans and the cloud gate ─────────────────────────────────────────── */

test("cloud: Free and Plus are denied; Pro, Team and Enterprise are allowed", () => {
  assert.equal(cloudDecision(null, NOW, idle).allowed, false);
  for (const p of ["free", "plus"] as const) {
    const d = cloudDecision(sub(p), NOW, idle);
    assert.equal(d.allowed, false);
    assert.equal(!d.allowed && d.code, "space_cloud_requires_pro");
  }
  for (const p of ["pro", "team", "enterprise"] as const) assert.equal(cloudDecision(sub(p), NOW, idle).allowed, true, p);
});

test("cloud: expired, canceled, revoked and downgraded subscriptions are denied; a past periodEnd falls back to Free", () => {
  for (const st of ["expired", "canceled", "revoked"] as const) assert.equal(cloudDecision(sub("pro", st), NOW, idle).allowed, false, st);
  assert.equal(cloudDecision(sub("plus"), NOW, idle).allowed, false, "downgraded to Plus");
  const lapsed = sub("pro", "active", new Date(NOW - 1000).toISOString());
  assert.equal(effectivePlan(lapsed, NOW), "free");
  assert.equal(cloudDecision(lapsed, NOW, idle).allowed, false);
});

test("cloud: concurrency and monthly quota limits", () => {
  const c = cloudDecision(sub("pro"), NOW, { runningJobs: 2, minutesThisMonth: 0 });
  assert.equal(!c.allowed && c.code, "space_cloud_concurrency");
  assert.equal(cloudDecision(sub("team"), NOW, { runningJobs: 2, minutesThisMonth: 0 }).allowed, true);
  const q = cloudDecision(sub("pro"), NOW, { runningJobs: 0, minutesThisMonth: 600 });
  assert.equal(!q.allowed && q.code, "space_cloud_quota");
});

test("requireSpaceCloud reads the STORED subscription, stored jobs and stored minutes", async () => {
  const id = "ws_space_gate";
  await store(id, null);
  await assert.rejects(requireSpaceCloud({ id }, { now: NOW }), (e: { status: number; code: string }) => e.status === 403 && e.code === "space_cloud_requires_pro");
  await store(id, sub("pro"));
  assert.equal((await requireSpaceCloud({ id }, { now: NOW })).plan, "pro");
  // two running Space Studio jobs fill Pro's concurrency
  const t = new Date(NOW).toISOString();
  for (const n of [1, 2]) await robloxJobs().insert({ id: `rc_gate${n}`, workspaceId: id, status: "running", product: "space-studio", createdAt: t, updatedAt: t } as unknown as CloudJob);
  await robloxJobs().insert({ id: "rc_gate_other", workspaceId: id, status: "running", createdAt: t, updatedAt: t } as unknown as CloudJob); // not Space Studio: not counted
  await assert.rejects(requireSpaceCloud({ id }, { now: NOW }), (e: { code: string }) => e.code === "space_cloud_concurrency");
  assert.equal((await requireSpaceCloud({ id }, { now: NOW, excludeJobId: "rc_gate1" })).plan, "pro");
  for (const n of [1, 2]) await robloxJobs().remove(id, `rc_gate${n}`);
  await addCloudMinutes(id, 600, NOW);
  await assert.rejects(requireSpaceCloud({ id }, { now: NOW }), (e: { code: string }) => e.code === "space_cloud_quota");
});

test("direct API: a client-supplied plan is ignored (stored Free + body plan pro -> 403)", async () => {
  const a = await signIn("space-free@example.com", "pro"); // a Keplar Pro plan does not grant Space Studio cloud either
  const { POST } = await import("@/app/api/space-studio/cloud/jobs/route");
  const r = await POST(jsonReq(a.cookie, "/api/space-studio/cloud/jobs", "POST", { kind: "roblox", plan: "pro", features: { cloud: true }, goal: "Make a lobby with a timer", maxUnits: 100, maxMinutes: 60, place: { name: "Game" } }));
  assert.equal(r.status, 403);
  assert.equal((await r.json()).code, "space_cloud_requires_pro");
  assert.equal(await loadSubscription(a.workspaceId), null);
  // GET /cloud: ineligible is not an error, just empty lists
  const { GET } = await import("@/app/api/space-studio/cloud/route");
  const g = await GET(call(a.cookie, "/api/space-studio/cloud"));
  assert.equal(g.status, 200);
  const body = await g.json();
  assert.equal(body.eligible, false);
  assert.deepEqual([body.roblox.jobs, body.blender.jobs], [[], []]);
});

test("worker: a Space Studio job whose plan lapsed stops safely at the next slice with the Space Studio reason", async () => {
  const id = "ws_space_worker";
  await store(id, null);
  const { ensureWorkspaceForUser } = await import("@/lib/accounts/workspaces");
  const row = await ensureWorkspaceForUser({ id: "user_space_worker", email: "space-worker@example.com" });
  const t = new Date().toISOString();
  const job = { id: "rc_space_w", workspaceId: row.id, createdAt: t, updatedAt: t, expiresAt: t, place: { id: "", name: "G" }, goal: "Something long", mode: "until_done", maxUnits: 100, maxMinutes: 60, status: "queued", tree: "", scriptCount: 0, slices: 0, plan: [], log: [], usage: { units: 0, usd: 0, turns: 0, promptTokens: 0, completionTokens: 0 }, messages: [], stall: 0, failures: 0, product: "space-studio" } as unknown as CloudJob;
  await robloxJobs().insert(job);
  const out = await runSlice(row.id, job.id, { trigger: async () => undefined } as never);
  assert.equal(out.status, "stopped");
  const after = await robloxJobs().get(row.id, job.id);
  assert.equal(after?.stopReason, "Space Studio cloud access ended");
});

/* ── billing webhook ──────────────────────────────────────────────────── */

const SECRET = "space-webhook-test-secret";
async function hook(payload: unknown, opts: { secret?: string; ts?: number; sig?: string } = {}) {
  const { POST } = await import("@/app/api/space-studio/billing/webhook/route");
  const raw = JSON.stringify(payload);
  const ts = String(Math.floor((opts.ts ?? Date.now()) / 1000));
  return POST(new Request("https://keplar.one/api/space-studio/billing/webhook", { method: "POST", headers: { "content-type": "application/json", "x-space-timestamp": ts, "x-space-signature": opts.sig ?? signPayload(opts.secret ?? SECRET, ts, raw) }, body: raw }));
}

test("webhook: 503 without a secret; forged and stale signatures rejected; duplicates and older events never change the plan", async () => {
  delete process.env.SPACE_STUDIO_BILLING_WEBHOOK_SECRET;
  const a = await signIn("space-billing@example.com");
  const ev = (id: string, type: string, plan: string, occurredAt: number) => ({ id, type, workspaceId: a.workspaceId, plan, periodEnd: future, occurredAt });
  assert.equal((await hook(ev("e0", "subscription.activated", "pro", 1000))).status, 503);
  process.env.SPACE_STUDIO_BILLING_WEBHOOK_SECRET = SECRET;
  try {
    assert.equal((await hook(ev("e1", "subscription.activated", "pro", 1000), { secret: "wrong-secret" })).status, 401, "forged");
    assert.equal((await hook(ev("e1", "subscription.activated", "pro", 1000), { sig: "sha256=" + "0".repeat(64) })).status, 401, "forged hex");
    assert.equal((await hook(ev("e1", "subscription.activated", "pro", 1000), { ts: Date.now() - 6 * 60_000 })).status, 401, "stale");
    assert.equal(await loadSubscription(a.workspaceId), null);

    const ok = await hook(ev("e1", "subscription.activated", "pro", 1000));
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).status, "applied");
    assert.equal((await loadSubscription(a.workspaceId))?.plan, "pro");

    // a newer cancel, then a replay of the activation and an older "renewed" arriving late
    assert.equal((await (await hook(ev("e2", "subscription.canceled", "pro", 3000))).json()).status, "applied");
    assert.equal((await (await hook(ev("e1", "subscription.activated", "pro", 1000))).json()).status, "duplicate");
    assert.equal((await (await hook(ev("e3", "subscription.renewed", "enterprise", 2000))).json()).status, "stale");
    const s = await loadSubscription(a.workspaceId);
    assert.equal(s?.status, "canceled");
    assert.equal(s?.plan, "pro");
    assert.equal(effectivePlan(s, Date.now()), "free");
    assert.equal(s?.appliedEvents.filter((x) => x === "wh:e1").length, 1);

    // malformed / unknown plan / unknown account
    assert.equal((await hook({ ...ev("e4", "subscription.activated", "ultra", 4000) })).status, 400);
    assert.equal((await hook({ ...ev("e5", "subscription.activated", "pro", 5000), workspaceId: "ws_nobody" })).status, 404);
  } finally {
    delete process.env.SPACE_STUDIO_BILLING_WEBHOOK_SECRET;
  }
});

test("core applyBillingEvent: same id twice is a no-op", () => {
  const e = { id: "x", type: "subscription.activated" as const, plan: "pro" as const, periodEnd: future, occurredAt: 10 };
  const one = applyBillingEvent(null, e, "t").sub;
  const two = applyBillingEvent(one, e, "t2");
  assert.equal(two.changed, false);
  assert.deepEqual(two.sub, one);
});

/* ── identities ───────────────────────────────────────────────────────── */

const rb = (subject: string, label: string | null = null): Identity => ({ provider: "roblox", subject, label, linkedAt: new Date(NOW).toISOString(), canSignIn: false });
const keplar: Identity = { provider: "keplar", subject: "u1", label: "a@example.com", linkedAt: new Date(NOW).toISOString(), canSignIn: true };

test("link: an identity owned by another account is refused, and the index claim is race-safe", async () => {
  const first = await planLink("ws_link_a", [], rb("777"), indexReader, NOW, NOW);
  assert.ok(first.ok);
  assert.deepEqual(await commitLink("ws_link_a", rb("777"), first.ok ? first.identities : []), { ok: true });
  const second = await planLink("ws_link_b", [], rb("777"), indexReader, NOW, NOW);
  assert.equal(!second.ok && second.code, "identity_conflict");
  // both planned before either committed: only one commit can win
  const [x, y] = await Promise.all([commitLink("ws_race_a", rb("888"), [rb("888")]), commitLink("ws_race_b", rb("888"), [rb("888")])]);
  assert.equal([x, y].filter((r) => r.ok).length, 1);
  assert.equal([x, y].filter((r) => !r.ok && r.code === "identity_conflict").length, 1);
});

test("link: equal emails/labels never merge accounts (keyed by provider subject only)", async () => {
  await commitLink("ws_mail_a", rb("901", "same@example.com"), [rb("901", "same@example.com")]);
  const b = await planLink("ws_mail_b", [], rb("902", "same@example.com"), indexReader, NOW, NOW);
  assert.ok(b.ok);
  await commitLink("ws_mail_b", rb("902", "same@example.com"), b.ok ? b.identities : []);
  assert.equal(await indexReader.ownerOf("roblox", "901"), "ws_mail_a");
  assert.equal(await indexReader.ownerOf("roblox", "902"), "ws_mail_b");
  assert.deepEqual((await loadIdentities("ws_mail_a")).map((i) => i.subject), ["901"]);
});

test("unlink: the last sign-in method is refused; a stale sign-in needs re-auth", async () => {
  assert.equal((planUnlink([keplar], "keplar", NOW, NOW) as { code?: string }).code, "managed_by_account");
  const g = { provider: "google" as const, subject: "g1", label: null, linkedAt: "", canSignIn: true };
  assert.equal((planUnlink([g, { ...g, provider: "roblox" as const, canSignIn: false }], "google", NOW, NOW) as { code?: string }).code, "last_method");
  assert.equal((planUnlink([keplar, rb("1")], "roblox", NOW - REAUTH_MS - 1, NOW) as { code?: string }).code, "reauth_required");
  assert.equal((planUnlink([keplar, rb("1")], "roblox", null, NOW) as { code?: string }).code, "reauth_required");
  assert.ok(planUnlink([keplar, rb("1")], "roblox", NOW, NOW).ok);
  const late = await planLink("ws_x", [keplar], rb("5"), indexReader, NOW - REAUTH_MS - 1, NOW);
  assert.equal(!late.ok && late.code, "reauth_required");

  // through the route: the Keplar account is the only sign-in method
  const a = await signIn("space-unlink@example.com");
  const { DELETE, GET } = await import("@/app/api/space-studio/identities/route");
  const r = await DELETE(jsonReq(a.cookie, "/api/space-studio/identities", "DELETE", { provider: "keplar" }));
  assert.equal(r.status, 409);
  assert.equal((await r.json()).code, "managed_by_account");
  const ids = await (await GET(call(a.cookie, "/api/space-studio/identities"))).json();
  assert.equal(ids.identities.find((i: { provider: string }) => i.provider === "keplar").label, "space-unlink@example.com");
});

test("roblox link start: 401 signed out, 503 when not configured", async () => {
  const { GET } = await import("@/app/api/space-studio/identities/roblox/start/route");
  assert.equal((await GET(call(null, "/api/space-studio/identities/roblox/start"))).status, 401);
  const a = await signIn("space-start@example.com");
  delete process.env.ROBLOX_OAUTH_CLIENT_ID;
  const r = await GET(call(a.cookie, "/api/space-studio/identities/roblox/start"));
  assert.equal(r.status, 503);
  assert.equal((await r.json()).code, "roblox_not_configured");
  process.env.ROBLOX_OAUTH_CLIENT_ID = "cid";
  process.env.ROBLOX_OAUTH_CLIENT_SECRET = "csecret";
  try {
    const go = await GET(call(a.cookie, "/api/space-studio/identities/roblox/start"));
    assert.equal(go.status, 302);
    const u = new URL(go.headers.get("location")!);
    assert.equal(u.origin + u.pathname, "https://apis.roblox.com/oauth/v1/authorize");
    assert.equal(u.searchParams.get("redirect_uri"), "https://keplar.one/api/space-studio/identities/roblox/callback");
    assert.equal(u.searchParams.get("code_challenge_method"), "S256");
    assert.equal(u.searchParams.get("scope"), "openid profile");
    const c = go.headers.get("set-cookie")!;
    assert.match(c, /HttpOnly/);
    assert.match(c, /SameSite=Lax/);
    assert.match(c, /Secure/);
    assert.ok(!c.includes(u.searchParams.get("state")!), "state is sealed, not in clear");
  } finally {
    delete process.env.ROBLOX_OAUTH_CLIENT_ID;
    delete process.env.ROBLOX_OAUTH_CLIENT_SECRET;
  }
});

test("account deletion frees the Roblox claim so it can be linked again", async () => {
  await commitLink("ws_del_a", rb("4242"), [rb("4242")]);
  assert.equal(await indexReader.ownerOf("roblox", "4242"), "ws_del_a");
  await deleteWorkspaceData("ws_del_a");
  assert.equal(await identityIndex().get(SPACE_INDEX_WS, indexKey("roblox", "4242")), null);
  assert.deepEqual(await loadIdentities("ws_del_a"), []);
  const again = await planLink("ws_del_b", [], rb("4242"), indexReader, NOW, NOW);
  assert.ok(again.ok);
});

/* ── routing and chat ─────────────────────────────────────────────────── */

test("router: never switches without allowEscalation, and only to a model the plan allows", () => {
  const hard = "Design the multiplayer architecture for the entire game with anti-cheat";
  const off = route("orbit", hard, { allowEscalation: false, allowed: () => true });
  assert.equal(off.served.id, "orbit");
  assert.equal(off.suggestion?.to, "nebula");
  const on = route("orbit", hard, { allowEscalation: true, allowed: () => true });
  assert.equal(on.served.id, "nebula");
  const notAllowed = route("nebula", hard + "x".repeat(2000), { allowEscalation: true, allowed: (id) => id !== "solar" });
  assert.equal(notAllowed.served.id, "nebula");
  assert.equal(route("nova", hard, { allowEscalation: true, allowed: () => true }).served.id, "nova");
});

test("chat: body validation rejects unknown models, too many or oversized messages, and over-budget context", () => {
  const msg = (content: string) => ({ role: "user", content });
  const code = (f: () => unknown) => { try { f(); return null; } catch (e) { return (e as { code: string }).code; } };
  assert.equal(code(() => validateChatBody({ model: "gpt", messages: [msg("hi")], workspace: "general" })), "unknown_model");
  assert.equal(code(() => validateChatBody({ model: "orbit", messages: [msg("hi")], workspace: "unity" })), "bad_request");
  assert.equal(code(() => validateChatBody({ model: "orbit", messages: Array.from({ length: 41 }, () => msg("hi")), workspace: "general" })), "too_many_messages");
  assert.equal(code(() => validateChatBody({ model: "nova", messages: [msg("x".repeat(20_001))], workspace: "general" })), "too_large");
  assert.equal(code(() => validateChatBody({ model: "orbit", messages: [msg("x".repeat(15_000)), { role: "assistant", content: "y".repeat(15_000) }, msg("z".repeat(15_000))], workspace: "general" })), "too_large"); // 45k > Orbit's 40k
  const ok = validateChatBody({ model: "orbit", messages: [msg("hi")], workspace: "general", plan: "enterprise" });
  assert.equal(ok.model, "orbit");
  assert.ok(!("plan" in ok));
});

test("chat: plan and Roblox-link gates come from the server, before any call", () => {
  const b = (model: string, workspace = "general") => validateChatBody({ model, messages: [{ role: "user", content: "hello" }], workspace });
  const code = (f: () => unknown) => { try { f(); return null; } catch (e) { return `${(e as { status: number }).status} ${(e as { code: string }).code}`; } };
  assert.equal(code(() => planChat(b("nova"), { sub: null, robloxRequired: false, robloxLinked: false })), "402 plan_required");
  assert.equal(code(() => planChat(b("solar"), { sub: sub("plus"), robloxRequired: false, robloxLinked: false })), null);
  assert.equal(code(() => planChat(b("orbit", "roblox"), { sub: null, robloxRequired: true, robloxLinked: false })), "403 roblox_link_required");
  assert.equal(code(() => planChat(b("orbit", "roblox"), { sub: null, robloxRequired: false, robloxLinked: false })), null);
  assert.equal(code(() => planChat(b("orbit", "blender"), { sub: null, robloxRequired: true, robloxLinked: false })), null);
});

test("chat: the served profile's prompt and budgets are sent; another model's answer is discarded, not charged", async () => {
  const body = validateChatBody({ model: "solar", messages: [{ role: "user", content: "Why does my RemoteEvent fire twice?" }], workspace: "roblox" });
  const sent: Record<string, unknown>[] = [];
  let charged = 0;
  const deps = (model: string) => ({
    key: "k", env: {},
    assertCanSpend: (async () => undefined) as never,
    chargeUnits: (async (_w: unknown, _a: string, units: number) => { charged += units; return units; }) as never,
    fetch: (async (_u: unknown, init: RequestInit) => { sent.push(JSON.parse(String(init.body))); return Response.json({ model, choices: [{ message: { content: "Answer.\nESCALATE: needs a full audit" } }], usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.01 } }); }) as typeof fetch,
  });
  const gate = { sub: sub("plus"), robloxRequired: false, robloxLinked: false };
  const out = await runSpaceChat(ws("ws_chat"), body, gate, deps("anthropic/claude-opus-5.5-20261001"));
  const solar = MODELS.find((m) => m.id === "solar")!;
  assert.equal(sent[0]!.model, "anthropic/claude-opus-5.5");
  assert.equal(sent[0]!.max_tokens, solar.budgets.maxOutputTokens);
  assert.deepEqual(sent[0]!.reasoning, { max_tokens: solar.budgets.reasoningTokens });
  assert.match(String((sent[0]!.messages as { content: string }[])[0]!.content), /^You are Solar 5\.4/);
  assert.equal(out.text, "Answer.");
  assert.deepEqual(out.escalation, { suggested: true, to: "nova", reason: "needs a full audit" });
  assert.deepEqual(Object.keys(out.served).sort(), ["id", "name"]); // the client never learns which foundation model answered
  assert.ok(charged > 0);

  const orbit = validateChatBody({ model: "orbit", messages: [{ role: "user", content: "hi" }], workspace: "general" });
  const before = charged;
  sent.length = 0;
  await assert.rejects(runSpaceChat(ws("ws_chat"), orbit, gate, deps("openai/gpt-5")), (e: { status: number; code: string }) => e.status === 503 && e.code === "model_mismatch");
  assert.equal(charged, before);
  assert.equal("reasoning" in sent[0]!, false, "no reasoning block for Orbit");
});

test("GET /me signed out: 200, signedIn false, Free defaults and the model list without system prompts", async () => {
  const { GET } = await import("@/app/api/space-studio/me/route");
  const r = await GET(call(null, "/api/space-studio/me"));
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.signedIn, false);
  assert.equal(b.plan.id, "free");
  assert.equal(b.models.length, 4);
  assert.ok(b.models.every((m: Record<string, unknown>) => !("system" in m) && m.customization === "specialized configuration (no fine-tuning)"));
  assert.equal(b.pricing.published, false);
  const a = await signIn("space-me@example.com");
  const me = await (await GET(call(a.cookie, "/api/space-studio/me"))).json();
  assert.equal(me.signedIn, true);
  assert.equal(me.email, "space-me@example.com");
  assert.equal(me.features.cloud, false);
  assert.deepEqual(me.models.map((m: { id: string; available: boolean }) => [m.id, m.available]), [["orbit", true], ["nebula", true], ["solar", false], ["nova", false]]);
});

test("nothing sent to clients names the provider or the underlying model", async () => {
  const { MODELS, publicView } = await import("@/lib/space-studio/core");
  const views = JSON.stringify(MODELS.map((m) => publicView(m, true)));
  assert.doesNotMatch(views, /anthropic|claude|haiku|sonnet|opus/i);
  assert.doesNotMatch(JSON.stringify(MODELS), /anthropic|claude|haiku|sonnet|opus/i);
});
