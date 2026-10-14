import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { call, jsonReq, signIn } from "./helpers/session";
import { applyBillingEvent, cloudDecision, effectivePlan, MODELS, planLink, planUnlink, REAUTH_MS, route, type Identity, type Subscription } from "../src/lib/space-studio/core";
import { requireSpaceCloud } from "../src/lib/space-studio/cloud";
import { addCloudMinutes, commitLink, identityIndex, indexKey, indexReader, loadIdentities, loadSubscription, SPACE_INDEX_WS, subscriptions } from "../src/lib/space-studio/store";
import { signPayload } from "../src/lib/space-studio/billing";
import { effortBudgets, planChat, runSpaceChat, validateChatBody } from "../src/lib/space-studio/chat";
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
    loadCreditUsage: async () => ({ fiveHour: 0, week: 0, month: 0, previousMonth: 0 }),
    addCredits: async (_w: string, credits: number) => { charged += credits; },
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
  assert.equal(charged, 1); // $0.01 is one credit
  assert.equal(out.usage.credits, 1);
  assert.equal(out.credits.remaining, 1_000 - 1); // Plus: 500 a month plus a full month carried over

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
  assert.equal(b.pricing.published, true);
  assert.equal(b.pricing.checkoutOpen, false);
  assert.equal(b.pricing.prices.pro.monthlyUsd, 32);
  assert.equal(b.credits, null);
  const a = await signIn("space-me@example.com");
  const me = await (await GET(call(a.cookie, "/api/space-studio/me"))).json();
  assert.equal(me.signedIn, true);
  assert.equal(me.email, "space-me@example.com");
  assert.equal(me.features.cloud, false);
  assert.equal(me.credits.plan, "free");
  assert.equal(me.credits.remaining, 30);
  assert.deepEqual(me.credits.windows.map((w: { label: string }) => w.label), ["5-hour limit", "Weekly limit"]);
  assert.deepEqual(me.models.map((m: { id: string; available: boolean }) => [m.id, m.available]), [["orbit", true], ["nebula", true], ["solar", false], ["nova", false]]);
});

test("nothing sent to clients names the provider or the underlying model", async () => {
  const { MODELS, publicView } = await import("@/lib/space-studio/core");
  const views = JSON.stringify(MODELS.map((m) => publicView(m, true)));
  assert.doesNotMatch(views, /anthropic|claude|haiku|sonnet|opus/i);
  assert.doesNotMatch(JSON.stringify(MODELS), /anthropic|claude|haiku|sonnet|opus/i);
});

test("chat credits: Free limits stop a call before it starts, and the answer is capped to what's left", async () => {
  const { capForCredits } = await import("@/lib/space-studio/chat");
  const { creditBalance } = await import("@/lib/space-studio/core");
  const NOW = Date.parse("2026-10-14T12:30:00Z");
  const nebula = MODELS.find((m) => m.id === "nebula")!;
  const used = (fiveHour: number, week = fiveHour) => creditBalance("free", { fiveHour, week, month: 0, previousMonth: 0 }, NOW);
  const err = (f: () => unknown) => { try { f(); return null; } catch (e) { return `${(e as { status: number }).status} ${(e as { code: string }).code}`; } };
  assert.equal(err(() => capForCredits(nebula, 100, used(30), NOW)), "402 credits_exhausted");
  assert.equal(err(() => capForCredits(nebula, 100, used(10, 120), NOW)), "402 credits_exhausted"); // weekly limit binds
  // 30 credits left = $0.30: Nebula's full 12k-token answer ($0.12) fits.
  assert.equal(capForCredits(nebula, 100, used(0), NOW).maxTokens, nebula.budgets.maxOutputTokens);
  // 2 credits left = $0.02: the answer is capped so the call can't cost more than that.
  const tight = capForCredits(nebula, 100, used(28), NOW);
  assert.ok(tight.maxTokens < nebula.budgets.maxOutputTokens && tight.maxTokens >= 600);
  assert.ok(tight.maxTokens * 10 / 1e6 <= 0.02);
  // A long conversation with 1 credit left can't even pay for its prompt.
  assert.equal(err(() => capForCredits(nebula, 60_000, used(29), NOW)), "402 credits_low");

  let charged = 0;
  const body = validateChatBody({ model: "orbit", messages: [{ role: "user", content: "hi" }], workspace: "general" });
  await assert.rejects(runSpaceChat(ws("ws_free"), body, { sub: null, robloxRequired: false, robloxLinked: false, now: NOW }, {
    key: "k", env: {}, loadCreditUsage: async () => ({ fiveHour: 30, week: 30, month: 0, previousMonth: 0 }), addCredits: async () => { charged++; },
    fetch: (async () => { throw new Error("must not be called"); }) as never,
  }), (e: { status: number; code: string; message: string }) => e.status === 402 && e.code === "credits_exhausted" && /5-hour limit/.test(e.message));
  assert.equal(charged, 0);
});

/* ── experiences, stats, beacon ───────────────────────────────────────── */

type Route = (url: URL, init?: RequestInit) => Response | Promise<Response> | null;
const realFetch = globalThis.fetch;
const fetchLog: string[] = [];
function mockFetch(route: Route) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    fetchLog.push(url.href);
    const r = await route(url, init);
    if (r) return r;
    return new Response("not mocked", { status: 599 });
  }) as typeof fetch;
}
const restoreFetch = () => { globalThis.fetch = realFetch; };

/** A fake Roblox: places 1001/1002/... -> universes 9001/9002/...; place 404 is unknown; live counters from `live`. */
const live = new Map<string, { playing: number; visits: number; favoritedCount: number }>();
function robloxMock(extra?: Route): Route {
  return (url, init) => {
    const m = /^\/universes\/v1\/places\/(\d+)\/universe$/.exec(url.pathname);
    if (url.hostname === "apis.roblox.com" && m) return m[1] === "404" ? Response.json({ errors: [{ message: "not found" }] }, { status: 404 }) : Response.json({ universeId: Number(m[1]) + 8000 });
    if (url.hostname === "games.roblox.com" && url.pathname === "/v1/games") {
      const ids = (url.searchParams.get("universeIds") ?? "").split(",").filter((x) => x && x !== "9999");
      return Response.json({ data: ids.map((id) => ({ id: Number(id), rootPlaceId: Number(id) - 8000, name: `Game ${id}`, ...(live.get(id) ?? { playing: 5, visits: 100, favoritedCount: 7 }) })) });
    }
    if (url.hostname === "thumbnails.roblox.com" && url.pathname === "/v1/games/icons") return Response.json({ data: [{ targetId: 1, state: "Completed", imageUrl: "https://tr.rbxcdn.com/icon.png" }] });
    return extra ? extra(url, init) : null;
  };
}

test("experience links: game URLs, place ids and universe:<id>; anything else is refused", async () => {
  const { parseExperienceLink } = await import("../src/lib/space-studio/experiences");
  assert.deepEqual(parseExperienceLink("https://www.roblox.com/games/920587237/Adopt-Me"), { placeId: "920587237" });
  assert.deepEqual(parseExperienceLink("www.roblox.com/games/920587237"), { placeId: "920587237" });
  assert.deepEqual(parseExperienceLink("https://www.roblox.com/de/games/12345/x?privateServerLinkCode=1"), { placeId: "12345" });
  assert.deepEqual(parseExperienceLink("https://www.roblox.com/games/start?placeId=777"), { placeId: "777" });
  assert.deepEqual(parseExperienceLink(" 920587237 "), { placeId: "920587237" });
  assert.deepEqual(parseExperienceLink("universe:383310974"), { universeId: "383310974" });
  for (const bad of ["", "https://evil.example/games/1", "https://www.roblox.com/catalog/1", "universe:abc", "0", "javascript:alert(1)", 42]) {
    assert.throws(() => parseExperienceLink(bad), (e: { code: string }) => e.code === "bad_link", String(bad));
  }
});

test("experiences: add (Roblox lookups), list, duplicates, unknown games, the limit of 10, rotate and delete", async () => {
  const a = await signIn("space-exp@example.com");
  const coll = await import("@/app/api/space-studio/experiences/route");
  const one = await import("@/app/api/space-studio/experiences/[universeId]/route");
  const rot = await import("@/app/api/space-studio/experiences/[universeId]/beacon/route");
  const { POST: beaconPost } = await import("@/app/api/space-studio/beacon/route");
  const params = (universeId: string) => ({ params: Promise.resolve({ universeId }) });
  const hello = (token: string) => beaconPost(new Request("https://keplar.one/api/space-studio/beacon", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ events: [] }) }));
  mockFetch(robloxMock());
  try {
    assert.equal((await coll.GET(call(null, "/api/space-studio/experiences"))).status, 401);
    const r = await coll.POST(jsonReq(a.cookie, "/api/space-studio/experiences", "POST", { link: "https://www.roblox.com/games/1001/My-Obby" }));
    assert.equal(r.status, 201);
    const added = await r.json();
    assert.deepEqual(added.experience, { universeId: "9001", placeId: "1001", name: "Game 9001", iconUrl: "https://tr.rbxcdn.com/icon.png", addedAt: added.experience.addedAt, beacon: { connected: false, lastEventAt: null } });
    assert.match(added.beacon.token, /^ssb_[A-Za-z0-9_-]{43}$/);
    assert.ok(added.beacon.script.includes(added.beacon.token));
    // only the hash is stored
    const { experiences, beaconIndex, BEACON_WS, hashToken } = await import("../src/lib/space-studio/experiences");
    assert.ok(!JSON.stringify(await experiences().list(a.workspaceId)).includes(added.beacon.token));
    assert.equal((await beaconIndex().get(BEACON_WS, hashToken(added.beacon.token)))?.owner, a.workspaceId);

    const uni = await coll.POST(jsonReq(a.cookie, "/api/space-studio/experiences", "POST", { link: "universe:9002" }));
    assert.equal(uni.status, 201);
    assert.equal((await uni.json()).experience.placeId, "1002", "root place from Roblox");
    const dup = await coll.POST(jsonReq(a.cookie, "/api/space-studio/experiences", "POST", { link: "1001" }));
    assert.equal(dup.status, 409);
    assert.equal((await dup.json()).code, "experience_exists");
    for (const link of ["404", "universe:9999"]) {
      const nf = await coll.POST(jsonReq(a.cookie, "/api/space-studio/experiences", "POST", { link }));
      assert.equal(nf.status, 404, link);
      assert.equal((await nf.json()).code, "experience_not_found");
    }
    const list = await (await coll.GET(call(a.cookie, "/api/space-studio/experiences"))).json();
    assert.deepEqual(list.experiences.map((e: { universeId: string }) => e.universeId), ["9001", "9002"]);

    for (let p = 1003; p <= 1010; p++) assert.equal((await coll.POST(jsonReq(a.cookie, "/api/space-studio/experiences", "POST", { link: String(p) }))).status, 201);
    const full = await coll.POST(jsonReq(a.cookie, "/api/space-studio/experiences", "POST", { link: "1011" }));
    assert.equal(full.status, 409);
    assert.equal((await full.json()).code, "too_many_experiences");

    // rotation: the old token stops working, the new one works and marks the beacon connected
    assert.equal((await hello(added.beacon.token)).status, 200);
    const rotated = await (await rot.POST(jsonReq(a.cookie, "/api/space-studio/experiences/9001/beacon", "POST"), params("9001"))).json();
    assert.notEqual(rotated.token, added.beacon.token);
    assert.ok(rotated.script.includes(rotated.token));
    assert.equal((await hello(added.beacon.token)).status, 401);
    assert.equal((await hello(rotated.token)).status, 200);
    const after = await (await coll.GET(call(a.cookie, "/api/space-studio/experiences"))).json();
    assert.equal(after.experiences[0].beacon.connected, true);

    // another account can't touch it
    const b = await signIn("space-exp-other@example.com");
    assert.equal((await one.DELETE(jsonReq(b.cookie, "/api/space-studio/experiences/9001", "DELETE"), params("9001"))).status, 404);
    // delete: gone, token dead
    assert.equal((await one.DELETE(jsonReq(a.cookie, "/api/space-studio/experiences/9001", "DELETE"), params("9001"))).status, 200);
    assert.equal((await hello(rotated.token)).status, 401);
    assert.equal((await one.DELETE(jsonReq(a.cookie, "/api/space-studio/experiences/9001", "DELETE"), params("9001"))).status, 404);
    assert.equal((await (await coll.GET(call(a.cookie, "/api/space-studio/experiences"))).json()).experiences.length, 9);
  } finally {
    restoreFetch();
  }
});

test("bucketing: max per bucket per experience, summed across experiences, only buckets with samples", async () => {
  const { bucketMaxSum, bucketSum } = await import("../src/lib/space-studio/stats");
  const t = (m: number) => new Date(Date.UTC(2026, 9, 14, 12, m)).toISOString();
  const pts = bucketMaxSum([
    { universeId: "a", t: t(0), v: 3 }, { universeId: "a", t: t(5), v: 9 }, { universeId: "a", t: t(20), v: 4 },
    { universeId: "b", t: t(1), v: 10 }, { universeId: "b", t: t(14), v: 2 },
  ], 15 * 60_000);
  assert.deepEqual(pts, [{ t: t(0), v: 19 }, { t: t(15), v: 4 }]); // 45-minute bucket has no samples: no point
  assert.deepEqual(bucketSum([{ t: t(0), v: 7 }, { t: t(1), v: 6 }, { t: t(59), v: 1 }], 3_600_000), [{ t: t(0), v: 14 }]);
});

test("stats: samples once a minute, 1h/24h from minute samples, 7d from hourly maxima, universe=all sums; nothing invented", async () => {
  const { addExperience } = await import("../src/lib/space-studio/experiences");
  const { statsFor } = await import("../src/lib/space-studio/stats");
  const wsId = "ws_space_stats";
  mockFetch(robloxMock());
  try {
    await addExperience(wsId, "2001");
    await addExperience(wsId, "2002");
    const T0 = Date.UTC(2026, 9, 14, 10, 0, 30);
    // before any sample: no counters, no points
    const empty = await statsFor(wsId, "all", "1h", T0 - 1, { sample: false });
    assert.equal(empty.now, null);
    assert.deepEqual(empty.ccu, { points: [], peak: null, sampledSince: null });
    assert.deepEqual(empty.robux, { earned: null, pending: null, pendingWindowHours: 72, lastSaleAt: null });
    assert.equal(empty.revenue.connected, false);

    live.set("10001", { playing: 10, visits: 1000, favoritedCount: 50 });
    live.set("10002", { playing: 4, visits: 200, favoritedCount: 9 });
    fetchLog.length = 0;
    await statsFor(wsId, "all", "1h", T0);
    assert.equal(fetchLog.filter((u) => u.includes("games.roblox.com")).length, 1, "one call for both universes");
    fetchLog.length = 0;
    await statsFor(wsId, "all", "1h", T0 + 30_000);
    assert.equal(fetchLog.length, 0, "younger than 60 s: no new sample");
    live.set("10001", { playing: 25, visits: 1010, favoritedCount: 51 });
    await statsFor(wsId, "all", "1h", T0 + 61_000);
    live.set("10001", { playing: 7, visits: 1020, favoritedCount: 51 });
    const s = await statsFor(wsId, "10001", "1h", T0 + 2 * 61_000);
    assert.deepEqual(s.ccu.points.map((p) => p.v), [10, 25, 7]);
    assert.equal(s.ccu.peak, 25);
    assert.deepEqual(s.now, { playing: 7, visits: 1020, favorites: 51, at: new Date(T0 + 2 * 61_000).toISOString() });
    assert.equal(s.ccu.sampledSince, new Date(T0).toISOString());

    const all = await statsFor(wsId, "all", "24h", T0 + 2 * 61_000, { sample: false });
    assert.deepEqual(all.ccu.points, [{ t: new Date(Date.UTC(2026, 9, 14, 10, 0)).toISOString(), v: 25 + 4 }], "15-min bucket: max per experience, summed");
    assert.deepEqual(all.now && [all.now.playing, all.now.visits, all.now.favorites], [7 + 4, 1020 + 200, 51 + 9]);
    const week = await statsFor(wsId, "all", "7d", T0 + 2 * 61_000, { sample: false });
    assert.deepEqual(week.ccu.points, [{ t: new Date(Date.UTC(2026, 9, 14, 10)).toISOString(), v: 29 }], "hourly maxima");

    // a universe Roblox doesn't return gets no sample
    const before = (await statsFor(wsId, "10002", "1h", T0 + 10 * 60_000, { sample: false })).ccu.points.length;
    live.delete("10002");
    globalThis.fetch = (async () => Response.json({ data: [] })) as typeof fetch;
    assert.equal((await statsFor(wsId, "10002", "1h", T0 + 10 * 60_000)).ccu.points.length, before);
    await assert.rejects(statsFor(wsId, "123", "1h", T0), (e: { code: string }) => e.code === "experience_not_found");
  } finally {
    restoreFetch();
  }
});

test("stats route: auth, range and universe validation", async () => {
  const { GET } = await import("@/app/api/space-studio/stats/route");
  assert.equal((await GET(call(null, "/api/space-studio/stats"))).status, 401);
  const a = await signIn("space-stats-route@example.com");
  const bad = await GET(call(a.cookie, "/api/space-studio/stats?range=1y"));
  assert.equal(bad.status, 400);
  assert.equal((await GET(call(a.cookie, "/api/space-studio/stats?universe=x"))).status, 400);
  const ok = await (await GET(call(a.cookie, "/api/space-studio/stats?universe=all&range=7d"))).json();
  assert.deepEqual(ok, { range: "7d", universe: "all", now: null, ccu: { points: [], peak: null, sampledSince: null }, revenue: { connected: false, points: [], total: 0, sales: 0, bySource: { product: 0, gamepass: 0 } }, robux: { earned: null, pending: null, pendingWindowHours: 72, lastSaleAt: null } });
});

async function beaconFor(wsId: string, place: string) {
  const { addExperience } = await import("../src/lib/space-studio/experiences");
  mockFetch(robloxMock());
  try {
    return (await addExperience(wsId, place)).beacon.token;
  } finally {
    restoreFetch();
  }
}
const beaconReq = (token: string | null, body: unknown, raw?: string) =>
  new Request("https://keplar.one/api/space-studio/beacon", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: raw ?? JSON.stringify(body) });

test("beacon: token auth, validation, idempotency by event id, body and batch limits, rate limit per token", async () => {
  const { POST } = await import("@/app/api/space-studio/beacon/route");
  const token = await beaconFor("ws_space_beacon", "3001");
  const nowSec = Math.floor(Date.now() / 1000);
  const ev = (id: string, over: Record<string, unknown> = {}) => ({ id, kind: "product", itemId: 55, robux: 100, at: nowSec - 60, ...over });

  assert.equal((await POST(beaconReq(null, { events: [] }))).status, 401);
  assert.equal((await POST(beaconReq("ssb_" + "x".repeat(43), { events: [] }))).status, 401);
  assert.equal((await POST(beaconReq("not-a-token", { events: [] }))).status, 401);

  const ok = await POST(beaconReq(token, { events: [ev("a"), ev("b", { kind: "gamepass", robux: 25 })] }));
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { accepted: 2, duplicates: 0 });
  assert.deepEqual(await (await POST(beaconReq(token, { events: [ev("a"), ev("c")] }))).json(), { accepted: 1, duplicates: 1 });
  assert.deepEqual(await (await POST(beaconReq(token, { events: [ev("d"), ev("d")] }))).json(), { accepted: 1, duplicates: 1 });

  const code = async (body: unknown, raw?: string) => { const r = await POST(beaconReq(token, body, raw)); return `${r.status} ${(await r.json()).code ?? ""}`; };
  assert.equal(await code({ events: [ev("f", { at: nowSec + 11 * 60 })] }), "400 invalid_event");
  assert.equal(await code({ events: [ev("o", { at: nowSec - 8 * 86_400 })] }), "400 invalid_event");
  assert.equal(await code({ events: [ev("k", { kind: "subscription" })] }), "400 invalid_event");
  assert.equal(await code({ events: [ev("r", { robux: 1.5 })] }), "400 invalid_event");
  assert.equal(await code({ events: [ev("r", { robux: 1_000_001 })] }), "400 invalid_event");
  assert.equal(await code({ events: [ev("x".repeat(65))] }), "400 invalid_event");
  assert.equal(await code({ events: [ev("i", { itemId: -1 })] }), "400 invalid_event");
  assert.equal(await code({ events: Array.from({ length: 51 }, (_, i) => ev(`m${i}`)) }), "400 invalid_event");
  assert.equal(await code({ events: [] }, "{not json"), "400 invalid_event");
  assert.equal(await code(null, JSON.stringify({ events: [], pad: "x".repeat(33 * 1024) })), "413 too_large");
  // nothing from a rejected batch was stored
  const { sales } = await import("../src/lib/space-studio/beacon");
  assert.equal((await sales().list("ws_space_beacon")).length, 4);

  // 120 requests a minute per token
  const token2 = await beaconFor("ws_space_beacon_rate", "3002");
  let limited = 0;
  for (let i = 0; i < 125; i++) if ((await POST(beaconReq(token2, { events: [] }))).status === 429) limited++;
  assert.equal(limited, 5);
  assert.equal((await POST(beaconReq(token, { events: [] }))).status, 200, "other tokens are not affected");
});

test("revenue: net Robux is 70% rounded down per sale; totals, sources, earned and the 72-hour pending estimate", async () => {
  const { netRobux, statsFor } = await import("../src/lib/space-studio/stats");
  const { beaconOwner, ingest, validateEvents } = await import("../src/lib/space-studio/beacon");
  assert.deepEqual([netRobux(100), netRobux(99), netRobux(1), netRobux(0), netRobux(1_000_000)], [70, 69, 0, 0, 700_000]);
  const wsId = "ws_space_revenue";
  const token = await beaconFor(wsId, "4001");
  const exp = (await beaconOwner(`Bearer ${token}`))!;
  const now = Date.now();
  const sec = (msAgo: number) => Math.floor((now - msAgo) / 1000);
  const events = validateEvents({ events: [
    { id: "p1", kind: "product", itemId: 1, robux: 99, at: sec(10 * 60_000) }, // 69, last hour
    { id: "p2", kind: "product", itemId: 1, robux: 10, at: sec(2 * 3_600_000) }, // 7, last 24h
    { id: "g1", kind: "gamepass", itemId: 2, robux: 500, at: sec(50 * 3_600_000) }, // 350, last 72h
    { id: "g2", kind: "gamepass", itemId: 2, robux: 1000, at: sec(5 * 86_400_000) }, // 700, older than 72h
  ] }, now / 1000);
  assert.deepEqual(await ingest(exp, events, now), { accepted: 4, duplicates: 0 });
  assert.deepEqual(await ingest(exp, events, now), { accepted: 0, duplicates: 4 }, "replays never count twice");

  const h1 = await statsFor(wsId, "12001", "1h", now, { sample: false });
  assert.equal(h1.revenue.connected, true);
  assert.equal(h1.revenue.total, 69);
  assert.equal(h1.revenue.sales, 1);
  assert.equal(h1.revenue.points.length, 1);
  assert.equal(h1.robux.earned, 69);
  assert.equal(h1.robux.pending, 69 + 7 + 350, "pending: everything from the last 72 hours, whatever the range");
  assert.equal(h1.robux.lastSaleAt, new Date(sec(10 * 60_000) * 1000).toISOString());
  const d1 = await statsFor(wsId, "12001", "24h", now, { sample: false });
  assert.deepEqual([d1.revenue.total, d1.revenue.sales, d1.revenue.bySource.product, d1.revenue.bySource.gamepass], [76, 2, 76, 0]);
  const d7 = await statsFor(wsId, "all", "7d", now, { sample: false });
  assert.deepEqual([d7.revenue.total, d7.revenue.sales, d7.revenue.bySource.product, d7.revenue.bySource.gamepass], [1126, 4, 76, 1050]);
  assert.equal(d7.robux.earned, 1126);
  assert.equal(d7.revenue.points.reduce((n, p) => n + p.v, 0), 1126);
});

test("beacon script: embeds the token and endpoint, hooks both purchase events, needs HTTP requests on", async () => {
  const { beaconScript } = await import("../src/lib/space-studio/beacon-script");
  const { newBeaconToken } = await import("../src/lib/space-studio/experiences");
  const token = newBeaconToken();
  const s = beaconScript(token);
  assert.ok(s.includes(`local TOKEN = "${token}"`));
  assert.ok(s.includes('"https://keplar.one/api/space-studio/beacon"'));
  assert.match(s, /MarketplaceService\.PromptProductPurchaseFinished:Connect\(function\(userId, productId, isPurchased\)/);
  assert.match(s, /MarketplaceService\.PromptGamePassPurchaseFinished:Connect\(function\(player, gamePassId, wasPurchased\)/);
  assert.match(s, /GetProductInfo\(id, infoType\)/);
  assert.match(s, /Enum\.InfoType\.Product/);
  assert.match(s, /Enum\.InfoType\.GamePass/);
  assert.match(s, /PriceInRobux/);
  assert.match(s, /HttpService:GenerateGUID\(false\)/);
  assert.match(s, /HttpService:RequestAsync/);
  assert.match(s, /\["Authorization"\] = "Bearer " \.\. TOKEN/);
  assert.match(s, /game:BindToClose/);
  assert.match(s, /FLUSH_EVERY = 15/);
  assert.match(s, /Allow HTTP Requests/);
  assert.match(s, /pcall/);
  assert.doesNotMatch(s, /anthropic|claude/i);
  assert.throws(() => beaconScript('x" .. os.exit() .. "'));
});

test("cron space-stats: 401 without the cron secret; listed in vercel.json hourly", async () => {
  const { GET } = await import("@/app/api/cron/space-stats/route");
  delete process.env.CRON_SECRET;
  assert.equal((await GET(new Request("https://keplar.one/api/cron/space-stats"))).status, 401);
  const { readFileSync } = await import("node:fs");
  const crons = (JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] }).crons;
  assert.ok(crons.some((c) => c.path === "/api/cron/space-stats" && c.schedule === "11 * * * *"));
});

/* ── onboarding profile and parental consent ──────────────────────────── */

test("profile validation: real past dates within 120 years, age bands, consents, the parent's email for under-13s", async () => {
  const { ageFrom, ageBandOf, validateProfile } = await import("../src/lib/space-studio/profile");
  const at = Date.UTC(2026, 9, 14);
  assert.equal(ageFrom("2013-10-14", at), 13);
  assert.equal(ageFrom("2013-10-15", at), 12);
  assert.equal(ageFrom("2008-10-14", at), 18);
  assert.deepEqual([ageBandOf(12), ageBandOf(13), ageBandOf(17), ageBandOf(18)], ["under13", "13to17", "13to17", "adult"]);
  const code = (f: () => unknown) => { try { f(); return null; } catch (e) { return (e as { code: string }).code; } };
  for (const d of ["2023-02-30", "2026-10-15", "1905-01-01", "14/10/2000", "2000-1-1", 20000101, null]) assert.equal(code(() => ageFrom(d, at)), "bad_birth_date", String(d));
  assert.equal(ageFrom("2024-02-29", at), 2);
  const consents = { productEmails: false, improveWithUsage: true };
  assert.equal(code(() => validateProfile({ birthDate: "1990-05-05" }, "me@example.com", at)), "bad_consents");
  assert.equal(code(() => validateProfile({ birthDate: "2016-05-05", consents }, "me@example.com", at)), "parent_email_required");
  assert.equal(code(() => validateProfile({ birthDate: "2016-05-05", consents, parentEmail: "nope" }, "me@example.com", at)), "bad_parent_email");
  assert.equal(code(() => validateProfile({ birthDate: "2016-05-05", consents, parentEmail: "ME@example.com" }, "me@example.com", at)), "bad_parent_email");
  assert.equal(code(() => validateProfile({ birthDate: "1990-05-05", consents, goals: "ship" }, "me@example.com", at)), "bad_request");
  const adult = validateProfile({ birthDate: "1990-05-05", consents, role: " Builder ", goals: ["ship", "ship", "learn"], parentEmail: "x@example.com" }, "me@example.com", at);
  assert.deepEqual([adult.ageBand, adult.role, adult.goals, adult.parentEmail], ["adult", "Builder", ["ship", "learn"], null]);
});

test("profile route + parental consent: under-13s wait for the parent; chat is refused until the emailed link is approved", async () => {
  const a = await signIn("space-kid@example.com");
  const prof = await import("@/app/api/space-studio/profile/route");
  const consent = await import("@/app/api/space-studio/profile/consent/route");
  const chat = await import("@/app/api/space-studio/chat/route");
  const me = await import("@/app/api/space-studio/me/route");
  const { listOutbox } = await import("@/lib/accounts/outbox");
  assert.equal((await prof.GET(call(null, "/api/space-studio/profile"))).status, 401);
  assert.deepEqual(await (await prof.GET(call(a.cookie, "/api/space-studio/profile"))).json(), { profile: null });
  assert.deepEqual((await (await me.GET(call(a.cookie, "/api/space-studio/me"))).json()).onboarding, { completed: false, ageBand: null, parentConsent: "not_needed" });

  const year = new Date().getUTCFullYear() - 10;
  const body = { birthDate: `${year}-01-01`, role: "student", experience: "beginner", goals: ["make a game"], workspaces: ["roblox"], consents: { productEmails: false, improveWithUsage: false }, parentEmail: "parent@example.com" };
  const r = await prof.POST(jsonReq(a.cookie, "/api/space-studio/profile", "POST", body));
  assert.equal(r.status, 200);
  const p = (await r.json()).profile;
  assert.deepEqual(p, { completed: true, ageBand: "under13", role: "student", experience: "beginner", goals: ["make a game"], workspaces: ["roblox"], consents: { productEmails: false, improveWithUsage: false }, parentConsent: { status: "awaiting_parent", emailSent: false } }); // no Resend key in tests: honestly not sent
  assert.ok(!JSON.stringify(p).includes(String(year)), "the birth date is never returned");
  assert.deepEqual((await (await me.GET(call(a.cookie, "/api/space-studio/me"))).json()).onboarding, { completed: true, ageBand: "under13", parentConsent: "awaiting_parent" });

  const chatBody = { model: "orbit", workspace: "general", messages: [{ role: "user", content: "hi" }] };
  const blocked = await chat.POST(jsonReq(a.cookie, "/api/space-studio/chat", "POST", chatBody));
  assert.equal(blocked.status, 403);
  assert.equal((await blocked.json()).code, "parent_consent_required");

  // the birth date can't be re-answered to get around the gate
  const locked = await prof.POST(jsonReq(a.cookie, "/api/space-studio/profile", "POST", { ...body, birthDate: "1990-01-01" }));
  assert.equal(locked.status, 409);
  assert.equal((await locked.json()).code, "birth_date_locked");

  // the parent's link: GET shows a page and approves nothing; POST approves once
  const mail = (await listOutbox()).find((m) => m.to === "parent@example.com")!;
  assert.ok(mail && !mail.text.includes(String(year)) && !mail.text.includes("space-kid@example.com"), "no birth date, account email masked");
  const link = new URL(mail.text.match(/https:\/\/\S+/)![0]);
  assert.equal(link.pathname, "/api/space-studio/profile/consent");
  const token = link.searchParams.get("token")!;
  const page = await consent.GET(call(null, `/api/space-studio/profile/consent?token=${token}`));
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<form method="post">/);
  assert.equal((await chat.POST(jsonReq(a.cookie, "/api/space-studio/chat", "POST", chatBody))).status, 403, "opening the page approves nothing");
  const cross = await consent.POST(new Request(`https://keplar.one/api/space-studio/profile/consent?token=${token}`, { method: "POST", headers: { origin: "https://evil.example" } }));
  assert.equal(cross.status, 403);
  const form = new FormData();
  form.set("token", token);
  const ok = await consent.POST(new Request("https://keplar.one/api/space-studio/profile/consent", { method: "POST", headers: { origin: "https://keplar.one" }, body: form }));
  assert.equal(ok.status, 200);
  assert.equal((await consent.POST(new Request("https://keplar.one/api/space-studio/profile/consent", { method: "POST", headers: { origin: "https://keplar.one" }, body: form }))).status, 404, "single use");
  assert.deepEqual((await (await prof.GET(call(a.cookie, "/api/space-studio/profile"))).json()).profile.parentConsent, { status: "approved" });
  const after = await chat.POST(jsonReq(a.cookie, "/api/space-studio/chat", "POST", chatBody));
  assert.notEqual((await after.json()).code, "parent_consent_required");

  // expired and unknown tokens
  assert.equal((await consent.GET(call(null, "/api/space-studio/profile/consent?token=nope"))).status, 404);
  const { lookupConsent, parentConsents, CONSENT_WS } = await import("../src/lib/space-studio/profile");
  const { createHash } = await import("node:crypto");
  const old = "o".repeat(43);
  await parentConsents().insert({ id: createHash("sha256").update(old).digest("hex"), workspaceId: CONSENT_WS, owner: a.workspaceId, createdAt: "", expiresAt: new Date(Date.now() - 1).toISOString() });
  assert.deepEqual(await lookupConsent(old), { ok: false, reason: "expired" });

  // adults and teens need no consent
  const t = await signIn("space-adult@example.com");
  const ad = await (await prof.POST(jsonReq(t.cookie, "/api/space-studio/profile", "POST", { ...body, birthDate: "1990-01-01", parentEmail: undefined }))).json();
  assert.deepEqual([ad.profile.ageBand, ad.profile.parentConsent], ["adult", { status: "not_needed" }]);
});

test("chat gate: parent consent is checked before anything else", () => {
  const b = validateChatBody({ model: "orbit", messages: [{ role: "user", content: "hello" }], workspace: "general" });
  assert.throws(() => planChat(b, { sub: null, robloxRequired: false, robloxLinked: false, parentConsentRequired: true }), (e: { status: number; code: string }) => e.status === 403 && e.code === "parent_consent_required");
  assert.doesNotThrow(() => planChat(b, { sub: null, robloxRequired: false, robloxLinked: false, parentConsentRequired: false }));
});

/* ── effort ───────────────────────────────────────────────────────────── */

test("effort: validated, scales budgets; Orbit (no reasoning) only gets output scaling", async () => {
  const msg = [{ role: "user", content: "hi" }];
  assert.equal(validateChatBody({ model: "orbit", messages: msg, workspace: "general" }).effort, "medium");
  assert.equal(validateChatBody({ model: "orbit", messages: msg, workspace: "general", effort: "ultracode" }).effort, "ultracode");
  assert.throws(() => validateChatBody({ model: "orbit", messages: msg, workspace: "general", effort: "max" }), (e: { status: number }) => e.status === 400);
  const solar = MODELS.find((m) => m.id === "solar")!.budgets;
  const orbit = MODELS.find((m) => m.id === "orbit")!.budgets;
  assert.deepEqual(effortBudgets(solar, "medium"), solar);
  const low = effortBudgets(solar, "low");
  assert.deepEqual([low.reasoningTokens, low.maxOutputTokens, low.maxUsdPerTask], [0, 12_000, 1.5]);
  const high = effortBudgets(solar, "high");
  assert.deepEqual([high.reasoningTokens, high.maxOutputTokens, high.maxUsdPerTask], [6_000, 20_000, 2.25]);
  const extra = effortBudgets(solar, "extra");
  assert.deepEqual([extra.reasoningTokens, extra.maxOutputTokens, extra.maxUsdPerTask], [8_000, 25_000, 3]);
  const ultra = effortBudgets(solar, "ultracode");
  assert.deepEqual([ultra.reasoningTokens, ultra.maxOutputTokens, ultra.maxUsdPerTask], [8_000, 25_000, 4.5]);
  const o = effortBudgets(orbit, "extra");
  assert.deepEqual([o.reasoningTokens, o.maxOutputTokens], [0, 5_000]);
});

test("effort through the provider call: low sends no reasoning; ultracode reviews its draft, charges both calls, and skips the review when credits run out", async () => {
  const sent: Record<string, unknown>[] = [];
  let charged = 0;
  const answers = ["Draft answer.", "Final answer."];
  const deps = (usage: { fiveHour: number; week: number; month: number; previousMonth: number }, cost = 0.02) => ({
    key: "k", env: {},
    loadCreditUsage: async () => usage,
    addCredits: async (_w: string, credits: number) => { charged += credits; },
    fetch: (async (_u: unknown, init: RequestInit) => { const b = JSON.parse(String(init.body)); sent.push(b); return Response.json({ model: b.model, choices: [{ message: { content: answers[(sent.length - 1) % 2] } }], usage: { prompt_tokens: 100, completion_tokens: 50, cost } }); }) as typeof fetch,
  });
  const plus = { sub: sub("plus"), robloxRequired: false, robloxLinked: false };
  const solar = MODELS.find((m) => m.id === "solar")!;

  const low = await runSpaceChat(ws("ws_effort"), validateChatBody({ model: "solar", messages: [{ role: "user", content: "hi" }], workspace: "general", effort: "low" }), plus, deps({ fiveHour: 0, week: 0, month: 0, previousMonth: 0 }));
  assert.equal("reasoning" in sent[0]!, false);
  assert.equal(sent[0]!.max_tokens, Math.floor(solar.budgets.maxOutputTokens * 0.6));
  assert.deepEqual([low.effort, low.passes, low.note], ["low", 1, null]);

  sent.length = 0;
  const high = await runSpaceChat(ws("ws_effort"), validateChatBody({ model: "solar", messages: [{ role: "user", content: "hi" }], workspace: "general", effort: "high" }), plus, deps({ fiveHour: 0, week: 0, month: 0, previousMonth: 0 }));
  assert.deepEqual(sent[0]!.reasoning, { max_tokens: 6_000 });
  assert.equal(high.passes, 1);

  sent.length = 0;
  charged = 0;
  const u = await runSpaceChat(ws("ws_effort"), validateChatBody({ model: "solar", messages: [{ role: "user", content: "Write a DataStore wrapper" }], workspace: "roblox", effort: "ultracode" }), plus, deps({ fiveHour: 0, week: 0, month: 0, previousMonth: 0 }));
  assert.equal(sent.length, 2);
  const review = sent[1]!.messages as { role: string; content: string }[];
  assert.equal(review.at(-2)!.role, "assistant");
  assert.equal(review.at(-2)!.content, "Draft answer.");
  assert.match(review.at(-1)!.content, /bugs, security problems/);
  assert.equal(sent[1]!.model, sent[0]!.model, "same served model");
  assert.deepEqual([u.text, u.passes, u.effort, u.note], ["Final answer.", 2, "ultracode", null]);
  assert.equal(charged, 4, "two calls at 2 credits each");
  assert.equal(u.usage.credits, 4);
  assert.equal(u.credits.remaining, 1_000 - 4);
  // with 100 credits ($1) left, the draft may use a bit less than half of it, so the review can still be paid
  sent.length = 0;
  await runSpaceChat(ws("ws_effort"), validateChatBody({ model: "solar", messages: [{ role: "user", content: "hi" }], workspace: "general", effort: "ultracode" }), plus, deps({ fiveHour: 0, week: 0, month: 400, previousMonth: 500 }));
  const firstMax = sent[0]!.max_tokens as number;
  assert.ok(firstMax < effortBudgets(solar.budgets, "ultracode").maxOutputTokens && firstMax * 20 / 1e6 <= 0.45, String(firstMax));
  assert.equal(sent.length, 2);

  // Free: 30 credits in the window; Nebula costs 25 credits on the first call -> no credits for the review
  sent.length = 0;
  charged = 0;
  const free = { sub: null, robloxRequired: false, robloxLinked: false };
  const skipped = await runSpaceChat(ws("ws_effort_free"), validateChatBody({ model: "nebula", messages: [{ role: "user", content: "hi" }], workspace: "general", effort: "ultracode" }), free, deps({ fiveHour: 0, week: 0, month: 0, previousMonth: 0 }, 0.3));
  assert.equal(sent.length, 1);
  assert.deepEqual([skipped.passes, skipped.text], [1, "Draft answer."]);
  assert.match(skipped.note!, /not enough credits/);
  assert.equal(charged, 30);
});

/* ── /me profile ──────────────────────────────────────────────────────── */

test("GET /me profile: Keplar name or email local part; with Roblox linked, its display name, username and headshot (cached)", async () => {
  const { GET } = await import("@/app/api/space-studio/me/route");
  assert.equal((await (await GET(call(null, "/api/space-studio/me"))).json()).profile, null);
  const a = await signIn("pixel.builder@example.com");
  assert.deepEqual((await (await GET(call(a.cookie, "/api/space-studio/me"))).json()).profile, { displayName: "pixel.builder", username: null, avatarUrl: null });

  await commitLink(a.workspaceId, rb("31337", "builder_31337"), [rb("31337", "builder_31337")]);
  fetchLog.length = 0;
  mockFetch((url) => {
    if (url.hostname === "users.roblox.com" && url.pathname === "/v1/users/31337") return Response.json({ id: 31337, name: "builder_31337", displayName: "Builder" });
    if (url.hostname === "thumbnails.roblox.com" && url.pathname === "/v1/users/avatar-headshot" && url.searchParams.get("userIds") === "31337" && url.searchParams.get("size") === "150x150") return Response.json({ data: [{ targetId: 31337, state: "Completed", imageUrl: "https://tr.rbxcdn.com/head.png" }] });
    return null;
  });
  try {
    const want = { displayName: "Builder", username: "builder_31337", avatarUrl: "https://tr.rbxcdn.com/head.png" };
    assert.deepEqual((await (await GET(call(a.cookie, "/api/space-studio/me"))).json()).profile, want);
    const calls = fetchLog.length;
    assert.deepEqual((await (await GET(call(a.cookie, "/api/space-studio/me"))).json()).profile, want);
    assert.equal(fetchLog.length, calls, "cached for 24 h");
  } finally {
    restoreFetch();
  }
  // Roblox down: names fall back to the linked label, avatar null (never a placeholder image)
  const b = await signIn("space-rbx-down@example.com");
  await commitLink(b.workspaceId, rb("4040", "someone"), [rb("4040", "someone")]);
  mockFetch(() => new Response("down", { status: 503 }));
  try {
    assert.deepEqual((await (await GET(call(b.cookie, "/api/space-studio/me"))).json()).profile, { displayName: "someone", username: "someone", avatarUrl: null });
  } finally {
    restoreFetch();
  }
});

/* ── sign in with Roblox / Google ─────────────────────────────────────── */

test("sign in with Roblox: start redirects to Roblox with PKCE; linked accounts get a session, others are sent to sign in and link", async () => {
  const { GET: start } = await import("@/app/api/space-studio/auth/roblox/start/route");
  const { auth } = await import("@/lib/accounts/auth");
  delete process.env.ROBLOX_OAUTH_CLIENT_ID;
  const off = await start(call(null, "/api/space-studio/auth/roblox/start?next=/space-studio"));
  assert.equal(off.status, 302);
  assert.equal(off.headers.get("location"), "https://keplar.one/signin?error=roblox_not_configured&next=%2Fspace-studio");

  process.env.ROBLOX_OAUTH_CLIENT_ID = "cid";
  process.env.ROBLOX_OAUTH_CLIENT_SECRET = "csecret";
  const begin = async (next = "/space-studio") => {
    const r = await start(call(null, `/api/space-studio/auth/roblox/start?next=${encodeURIComponent(next)}`));
    assert.equal(r.status, 302);
    const u = new URL(r.headers.get("location")!);
    return { u, cookie: r.headers.get("set-cookie")! };
  };
  const callback = (q: string, cookie: string | null) => auth.handler(new Request(`https://keplar.one/api/auth/space-studio/roblox/callback?${q}`, { headers: { ...(cookie ? { cookie } : {}), "x-forwarded-for": "10.9.9.9" } }));
  let subject = "777001";
  mockFetch((url) => {
    if (url.href === "https://apis.roblox.com/oauth/v1/token") return Response.json({ access_token: "rbx-access" });
    if (url.href === "https://apis.roblox.com/oauth/v1/userinfo") return Response.json({ sub: subject, preferred_username: "rbx_user" });
    return null;
  });
  try {
    const { u, cookie } = await begin();
    assert.equal(u.origin + u.pathname, "https://apis.roblox.com/oauth/v1/authorize");
    assert.equal(u.searchParams.get("redirect_uri"), "https://keplar.one/api/auth/space-studio/roblox/callback");
    assert.equal(u.searchParams.get("code_challenge_method"), "S256");
    assert.equal(u.searchParams.get("scope"), "openid profile");
    assert.match(cookie, /^space_roblox_signin=.+; Path=\/api\/auth\/space-studio\/roblox; Max-Age=600; HttpOnly; SameSite=Lax; Secure$/);
    const jar = cookie.split(";")[0]!;
    const state = u.searchParams.get("state")!;

    // not linked: nothing signed in, sent to sign in and link
    const nl = await callback(`code=c1&state=${state}`, jar);
    assert.equal(nl.status, 302);
    assert.equal(nl.headers.get("location"), "/signin?error=roblox_not_linked&next=%2Fspace-studio");
    assert.ok(!nl.headers.getSetCookie().some((c) => /session_token=[^;]/.test(c)));

    // wrong state / no cookie
    const b2 = await begin();
    const bad = await callback(`code=c2&state=${"x".repeat(43)}`, b2.cookie.split(";")[0]!);
    assert.equal(bad.headers.get("location"), "/signin?error=state_mismatch&next=%2Fspace-studio");
    assert.equal((await callback(`code=c2&state=${b2.u.searchParams.get("state")}`, null)).headers.get("location"), "/signin?error=state_mismatch&next=%2Fspace-studio");

    // linked: a real session for the owner of the workspace the Roblox account is linked to
    const owner = await signIn("space-rbx-signin@example.com");
    subject = "777002";
    await commitLink(owner.workspaceId, rb(subject), [rb(subject)]);
    const b3 = await begin("/space-studio?view=home");
    const ok = await callback(`code=c3&state=${b3.u.searchParams.get("state")}`, b3.cookie.split(";")[0]!);
    assert.equal(ok.status, 302);
    assert.match(ok.headers.get("location")!, /space-studio%3Fview%3Dhome|\/space-studio\?view=home/);
    const sessionCookie = ok.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const s = await auth.api.getSession({ headers: new Headers({ cookie: sessionCookie }) });
    assert.equal(s?.user.email, "space-rbx-signin@example.com");

    // an open redirect in next is refused
    const b4 = await begin("https://evil.example/");
    assert.equal(b4.u.hostname, "apis.roblox.com");
    subject = "777003";
    assert.equal((await callback(`code=c4&state=${b4.u.searchParams.get("state")}`, b4.cookie.split(";")[0]!)).headers.get("location"), "/signin?error=roblox_not_linked&next=%2Fspace-studio");
    // Roblox said no
    const b5 = await begin();
    assert.equal((await callback(`error=access_denied&state=${b5.u.searchParams.get("state")}`, b5.cookie.split(";")[0]!)).headers.get("location"), "/signin?error=access_denied&next=%2Fspace-studio");
  } finally {
    restoreFetch();
    delete process.env.ROBLOX_OAUTH_CLIENT_ID;
    delete process.env.ROBLOX_OAUTH_CLIENT_SECRET;
  }
});

test("sign in with Google start: falls back to /signin when Google isn't configured", async () => {
  const { GET } = await import("@/app/api/space-studio/auth/google/start/route");
  const r = await GET(call(null, "/api/space-studio/auth/google/start?next=//evil.example"));
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "https://keplar.one/signin?next=%2Fspace-studio");
});

/* ── account deletion ─────────────────────────────────────────────────── */

test("account deletion removes every new Space Studio collection, including the system-scoped beacon and consent rows", async () => {
  const { USER_COLLECTIONS } = await import("../src/lib/privacy/account-data");
  const names = ["space_experiences", "space_beacons", "space_ccu_min", "space_ccu_hour", "space_rev_min", "space_rev_hour", "space_sales", "space_profiles", "space_parent_consents"];
  for (const n of names) assert.ok((USER_COLLECTIONS as readonly string[]).includes(n), n);

  const wsId = "ws_space_delete_all";
  const token = await beaconFor(wsId, "5001");
  const { beaconOwner, ingest } = await import("../src/lib/space-studio/beacon");
  const { recordSample } = await import("../src/lib/space-studio/stats");
  const exp = (await beaconOwner(`Bearer ${token}`))!;
  await ingest(exp, [{ id: "s1", kind: "product", itemId: 1, robux: 10, at: Date.now() / 1000 - 5 }]);
  await recordSample(wsId, "13001", { playing: 1, visits: 2, favorites: 3 }, Date.now());
  const { saveProfile } = await import("../src/lib/space-studio/profile");
  await saveProfile(wsId, "kid@example.com", { birthDate: `${new Date().getUTCFullYear() - 9}-01-01`, ageBand: "under13", role: null, experience: null, goals: [], workspaces: [], consents: { productEmails: false, improveWithUsage: false }, parentEmail: "p@example.com" }, Date.now(), { sendEmail: async () => true });
  const { collection } = await import("../src/lib/create/platform/store");
  const count = async () => {
    const out: Record<string, number> = {};
    for (const n of names) out[n] = (await collection<{ id: string; workspaceId: string; owner?: string }>(n).listSystem((r) => r.workspaceId === wsId || r.owner === wsId)).length;
    return out;
  };
  const before = await count();
  for (const n of names) assert.ok(before[n]! > 0, `${n} has rows before deletion`);
  await deleteWorkspaceData(wsId);
  assert.deepEqual(Object.values(await count()), names.map(() => 0));
  assert.equal(await beaconOwner(`Bearer ${token}`), null);
});
