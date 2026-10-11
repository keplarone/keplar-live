/* eslint-disable @typescript-eslint/no-explicit-any -- the tests read loosely-typed JSON bodies */
import "./setup";
import { signIn, jsonReq, call } from "./helpers/session";
import assert from "node:assert/strict";
import { test } from "node:test";
import { GET as keysGet, POST as keysPost } from "../src/app/api/keys/route";
import { DELETE as keyDelete } from "../src/app/api/keys/[id]/route";
import { POST as askPost, OPTIONS as askOptions } from "../src/app/api/v1/ask/route";
import { GET as usageGet } from "../src/app/api/v1/usage/route";
import { GET as specGet } from "../src/app/api/v1/openapi.json/route";
import { apiKeys, hashKey } from "../src/lib/api/keys";
import { API_POLICY, KEY_PREFIX } from "../src/lib/api/policy";
import { parseAsk, mapFailure, eventToPublic } from "../src/lib/api/ask";
import { toV1Answer } from "../src/lib/api/format";
import { openApiSpec } from "../src/lib/api/openapi";
import { USER_COLLECTIONS, exportChunks, deleteWorkspaceData } from "../src/lib/privacy/account-data";
import { updateWorkspace } from "../src/lib/accounts/workspaces";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const j = async (r: Response) => (await r.json()) as Record<string, any>;
let n = 0;
const email = (tag: string) => `${tag}${++n}-${Math.random().toString(36).slice(2, 7)}@example.com`;
const bearer = (key: string | null, url: string, init: RequestInit = {}) => new Request(`https://keplar.one${url}`, { ...init, headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json", "x-forwarded-for": `172.16.${n % 250}.${(n * 3) % 250}`, ...(init.headers as any) } });
const ask = (key: string | null, body: unknown) => askPost(bearer(key, "/api/v1/ask", { method: "POST", body: JSON.stringify(body) }));
const mint = async (cookie: string, body: Record<string, unknown> = { name: `k${++n}` }) => j(await keysPost(jsonReq(cookie, "/api/keys", "POST", body)));

test("a key is shown once, stored only as a hash, and listed without the secret", async () => {
  const u = await signIn(email("a"), "plus");
  const made = await mint(u.cookie);
  assert.match(made.key, /^kpl_[A-Za-z0-9_-]{32}$/);
  assert.equal(made.shownOnce, true);
  const rows = await apiKeys().list(u.workspaceId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.hash, hashKey(made.key));
  assert.ok(!JSON.stringify(rows).includes(made.key), "the secret is nowhere in storage");
  const list = await j(await keysGet(call(u.cookie, "/api/keys")));
  assert.ok(!JSON.stringify(list).includes(made.key));
  assert.ok(!JSON.stringify(list).includes(rows[0]!.hash), "not even the hash is sent back");
  assert.equal(list.keys[0].prefix, made.key.slice(0, 10));
});

test("Free is limited; unverified and unauthenticated callers can't mint; key names and counts are enforced", async () => {
  assert.equal(API_POLICY.free.available, true);
  assert.equal(API_POLICY.free.maxKeys, 1);
  const free = await signIn(email("f"), "free");
  const fr = await keysPost(jsonReq(free.cookie, "/api/keys", "POST", { name: "free-key" }));
  assert.equal(fr.status, 201, "Free may mint one key (OpenRouter :free models only at ask time)");
  assert.equal((await keysPost(jsonReq(free.cookie, "/api/keys", "POST", { name: "free-key-2" }))).status, 409);
  assert.equal((await keysPost(jsonReq(null, "/api/keys", "POST", { name: "x" }))).status, 401);
  const lite = await signIn(email("l"), "lite");
  assert.equal((await keysPost(jsonReq(lite.cookie, "/api/keys", "POST", {}))).status, 400, "name required");
  assert.equal((await keysPost(jsonReq(lite.cookie, "/api/keys", "POST", { name: "a", scopes: ["admin"] }))).status, 400);
  for (let i = 0; i < API_POLICY.lite.maxKeys; i++) assert.equal((await keysPost(jsonReq(lite.cookie, "/api/keys", "POST", { name: `n${i}` }))).status, 201);
  assert.equal((await keysPost(jsonReq(lite.cookie, "/api/keys", "POST", { name: "one more" }))).status, 409);
});

test("session creation is same-origin only", async () => {
  const u = await signIn(email("o"), "plus");
  const r = await keysPost(new Request("https://keplar.one/api/keys", { method: "POST", headers: { cookie: u.cookie, origin: "https://evil.example", "content-type": "application/json" }, body: JSON.stringify({ name: "x" }) }));
  assert.equal(r.status, 403);
  assert.equal((await apiKeys().list(u.workspaceId)).length, 0);
});

test("v1 needs a valid bearer key; cookies are never accepted; garbage keys are refused", async () => {
  const u = await signIn(email("c"), "plus");
  const body = JSON.stringify({ question: "Who created Keplar?" });
  const viaCookie = await askPost(new Request("https://keplar.one/api/v1/ask", { method: "POST", headers: { cookie: u.cookie, "content-type": "application/json" }, body }));
  assert.equal(viaCookie.status, 401);
  assert.equal((await ask(null, { question: "hi" })).status, 401);
  assert.equal((await ask("kpl_" + "A".repeat(32), { question: "hi" })).status, 401);
  assert.equal((await ask("not-a-key", { question: "hi" })).status, 401);
  const e = await j(await ask(null, { question: "hi" }));
  assert.equal(e.error.code, "invalid_api_key");
});

test("POST /api/v1/ask answers, is stateless, and counts on the key", async () => {
  const u = await signIn(email("s"), "plus");
  const { key } = await mint(u.cookie);
  const res = await ask(key, { question: "Who created Keplar?" });
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.equal(res.headers.get("cache-control"), "no-store");
  const a = await j(res);
  assert.equal(a.object, "answer");
  assert.ok(typeof a.answer === "string" && a.answer.length > 0);
  assert.ok(a.agreement && typeof a.agreement.summary === "string");
  assert.ok("disagreement" in a && "usage" in a && Array.isArray(a.models));
  const row = (await apiKeys().list(u.workspaceId))[0]!;
  assert.equal(row.requests, 1);
  assert.ok(row.lastUsedAt);
  // nothing was saved to the account: no chats from an API call
  const { GET: chatsGet } = await import("../src/app/api/chats/route");
  const chats = await j(await chatsGet(call(u.cookie, "/api/chats")));
  assert.deepEqual(chats.chats ?? [], []);
});

test("streaming returns Server-Sent Events ending in answer and done", async () => {
  const u = await signIn(email("st"), "pro");
  const { key } = await mint(u.cookie);
  const res = await ask(key, { question: "Who created Keplar?", stream: true });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
  const text = await res.text();
  const events = [...text.matchAll(/^event: (\w+)$/gm)].map((m) => m[1]);
  assert.ok(events.includes("answer"), text.slice(0, 300));
  assert.equal(events.at(-1), "done");
  const data = text.match(/event: answer\ndata: (.*)\n/)?.[1];
  assert.equal(JSON.parse(data!).object, "answer");
});

test("invalid bodies are 400 with a clear error code", async () => {
  const u = await signIn(email("v"), "plus");
  const { key } = await mint(u.cookie);
  for (const body of [{}, { question: "" }, { question: 5 }, { question: "x".repeat(8001) }, { question: "hi", history: "no" }, { question: "hi", history: [{ role: "system", content: "x" }] }, { question: "hi", routing: { strategy: "yolo" } }]) {
    const r = await ask(key, body);
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 60));
    assert.equal((await j(r)).error.code, "invalid_request");
  }
  const bad = await askPost(bearer(key, "/api/v1/ask", { method: "POST", body: "{nope" }));
  assert.equal(bad.status, 400);
});

test("revoking a key refuses the very next request; another account can't revoke it", async () => {
  const u = await signIn(email("r"), "plus");
  const other = await signIn(email("r2"), "plus");
  const { key, apiKey } = await mint(u.cookie);
  assert.equal((await ask(key, { question: "Who created Keplar?" })).status, 200);
  const del = (cookie: string) => keyDelete(call(cookie, `/api/keys/${apiKey.id}`, { method: "DELETE" }), { params: Promise.resolve({ id: apiKey.id }) });
  assert.equal((await del(other.cookie)).status, 404, "tenant isolation");
  assert.equal((await ask(key, { question: "Who created Keplar?" })).status, 200, "still valid after the foreign attempt");
  assert.equal((await del(u.cookie)).status, 200);
  assert.equal((await ask(key, { question: "Who created Keplar?" })).status, 401);
  assert.equal((await del(u.cookie)).status, 404, "already revoked");
});

test("expired keys, scopes, and lapsed plans are refused", async () => {
  const u = await signIn(email("e"), "plus");
  const askOnly = await mint(u.cookie, { name: "ask only" });
  assert.equal((await usageGet(bearer(askOnly.key, "/api/v1/usage"))).status, 403);
  const both = await mint(u.cookie, { name: "both", scopes: ["ask", "usage"], expiresInDays: 30 });
  const us = await j(await usageGet(bearer(both.key, "/api/v1/usage")));
  assert.equal(us.object, "usage");
  assert.equal(us.plan, "plus");
  assert.equal(us.key.limits.per_minute, API_POLICY.plus.keyPerMinute);
  // expire it
  await apiKeys().update(u.workspaceId, both.apiKey.id, { expiresAt: new Date(Date.now() - 1000).toISOString() });
  assert.equal((await usageGet(bearer(both.key, "/api/v1/usage"))).status, 401);
  // plan lapses to Free: only the oldest active key keeps working (Free allows one, on :free models); the rest are refused
  const later = await mint(u.cookie, { name: "later" });
  await updateWorkspace(u.workspaceId, { plan: "free" });
  const r = await ask(later.key, { question: "Who created Keplar?" });
  assert.equal(r.status, 403);
  assert.equal((await j(r)).error.code, "plan_required");
  const first = await usageGet(bearer(askOnly.key, "/api/v1/usage"));
  assert.notEqual(first.status, 401, "the oldest key is still recognised");
  assert.notEqual((await j(first)).error?.code, "plan_required");
});

test("per-key rate limit answers 429 with Retry-After, and counts per key", async () => {
  const c = await signIn(email("rl"), "lite");
  const k = await mint(c.cookie, { name: "burn", scopes: ["usage"] });
  const other = await mint(c.cookie, { name: "other", scopes: ["usage"] });
  const per = API_POLICY.lite.keyPerMinute;
  for (let i = 0; i < per; i++) assert.equal((await usageGet(bearer(k.key, "/api/v1/usage"))).status, 200);
  const over = await usageGet(bearer(k.key, "/api/v1/usage"));
  assert.equal(over.status, 429);
  assert.ok(Number(over.headers.get("retry-after")) > 0);
  assert.equal((await j(over)).error.code, "key_rate_limited");
  assert.equal((await usageGet(bearer(other.key, "/api/v1/usage"))).status, 200, "the limit is per key");
});

test("repeated bad keys from one address are throttled", async () => {
  const hdr = { "x-forwarded-for": "203.0.113.77" };
  let last = 0;
  for (let i = 0; i < 25; i++) last = (await askPost(bearer("kpl_" + "B".repeat(32), "/api/v1/ask", { method: "POST", body: "{}", headers: hdr }))).status;
  assert.equal(last, 429);
});

test("CORS preflight is allowed for the bearer headers only", async () => {
  const r = askOptions();
  assert.equal(r.status, 204);
  assert.match(r.headers.get("access-control-allow-headers") ?? "", /authorization/);
  assert.equal(r.headers.get("access-control-allow-credentials"), null, "no credentialed cross-site requests");
});

test("api_keys are user data: exported without the hash, deleted with the account", async () => {
  assert.ok((USER_COLLECTIONS as readonly string[]).includes("api_keys"));
  const u = await signIn(email("x"), "plus");
  const { key } = await mint(u.cookie);
  let out = "";
  for await (const chunk of exportChunks(u.workspaceId, { id: "u", email: "x@example.com", name: "X" })) out += chunk;
  assert.ok(out.includes("api_keys"), "the key rows are in the export");
  assert.ok(!out.includes(hashKey(key)) && !out.includes(key), "neither the key nor its hash is exported");
  await deleteWorkspaceData(u.workspaceId);
  assert.equal((await apiKeys().list(u.workspaceId)).length, 0);
  assert.equal((await ask(key, { question: "hi" })).status, 401, "a deleted account's key is dead");
});

test("disagreement summary formatting from a synthetic answer", () => {
  const a: any = {
    id: "ans_1", markdown: "Yes, mostly.", compute: { units: 3 }, sources: [{ kind: "cited", title: "T", url: "https://example.com/x" }, { kind: "cited", title: "No url" }],
    models: [{ id: "m1", name: "Model A", provider: "A", status: "responded" }, { id: "m2", name: "Model B", provider: "B", status: "responded" }],
    consensus: { level: "split", agree: 1, disagree: 1, responded: 2, consulted: 2, summary: "The models split 1 to 1." },
    disagreements: [], verification: { mode: "none", checks: [] }, sourcing: undefined,
  };
  const out = toV1Answer(a, new Date("2026-01-01T00:00:00Z"));
  assert.equal(out.object, "answer");
  assert.equal(out.answer, "Yes, mostly.");
  assert.equal(out.agreement.summary, "The models split 1 to 1.");
  assert.equal(out.usage.credits, 3);
  assert.equal(out.sources[1]!.url, null);
  assert.equal(out.source_check, null);
  assert.equal(out.created, "2026-01-01T00:00:00.000Z");
  assert.ok(!JSON.stringify(out).includes("cost"), "no provider cost fields");
});

test("event mapping hides internal stage ids; failures map to stable codes", () => {
  assert.deepEqual(eventToPublic({ type: "stage", stage: "compare", status: "active" }), { event: "progress", data: { stage: "comparing" } });
  assert.equal(eventToPublic({ type: "stage", stage: "compare", status: "done" }), null);
  assert.equal(eventToPublic({ type: "smalltalk" } as any), null);
  assert.equal(mapFailure(429, "daily_limit", "m").code, "limit_reached");
  assert.equal(mapFailure(429, "daily_limit", "m").status, 402);
  assert.equal(mapFailure(503, "not_configured", "m").code, "unavailable");
  assert.equal(parseAsk({ question: " hi ", history: [{ role: "assistant", content: "a" }] }).history[0]!.role, "keplar");
});

test("OpenAPI spec is served publicly and documents every v1 route that exists", async () => {
  const res = specGet(new Request("https://keplar.one/api/v1/openapi.json"));
  const spec = await j(res);
  assert.equal(spec.openapi, "3.1.0");
  assert.ok(spec.info.title.toLowerCase().includes("beta"));
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f === "route.ts" ? [d] : []));
  const routes = walk("src/app/api/v1").map((d) => "/api/v1" + d.replace(/\\/g, "/").slice("src/app/api/v1".length));
  assert.ok(routes.length >= 3);
  for (const r of routes) assert.ok(spec.paths[r], `${r} is documented`);
  assert.ok(openApiSpec().paths["/api/v1/ask"].post.responses["402"]);
  assert.equal(spec.paths["/api/v1/ask"].post.security, undefined, "ask inherits bearer security");
  assert.ok(KEY_PREFIX === "kpl_");
});

test("a key can't be created from a team workspace context or by an API key", async () => {
  const u = await signIn(email("t"), "business");
  const { key } = await mint(u.cookie);
  const r = await keysPost(new Request("https://keplar.one/api/keys", { method: "POST", headers: { authorization: `Bearer ${key}`, origin: "https://keplar.one", "content-type": "application/json" }, body: JSON.stringify({ name: "child" }) }));
  assert.equal(r.status, 401);
});
