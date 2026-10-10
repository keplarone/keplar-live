import "./setup";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installFakeNeon } from "./helpers/fake-neon";
import { signIn } from "./helpers/session";
import { neonQuery } from "@/lib/create/platform/neon";
import { digests, listMeta, pickSnippets, recentDigests, recordTurn, searchDigests, setSummary, eraseAllDigests } from "@/lib/memory/digest";
import { addItems, listItems } from "@/lib/memory/repo";
import { setExtractDeps } from "@/lib/memory/extract";
import { workspaceIdForUser } from "@/lib/accounts/workspaces";
import { POST as keplarPOST } from "@/app/api/keplar/route";
import { freeRoster } from "@/lib/orchestration/live-catalog";

// These tests exercise memory reaching the models. On Free that only happens when the endpoints cannot train (deny); the Free gate itself is covered by free-privacy.test.ts.
process.env.KEPLAR_FREE_DATA_COLLECTION = "deny";

// The same memory code against real Postgres semantics (PGlite behind a fake Neon endpoint): full-text search, ordering,
// the GIN index, and the persistent-login tables (keplar_users / keplar_sessions) that decide whose memory it is.
let fake: Awaited<ReturnType<typeof installFakeNeon>> = null;
before(async () => {
  fake = await installFakeNeon();
  if (fake) process.env.DATABASE_URL = fake.url;
});
after(() => {
  setExtractDeps(undefined);
  fake?.restore();
});

let ipn = 0;
const ip = () => `10.66.${(++ipn >> 8) & 255}.${ipn & 255}`;
async function chat(cookie: string | null, prompt: string, extra: Record<string, unknown> = {}) {
  const res = await keplarPOST(new Request("https://keplar.one/api/keplar", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip(), ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ prompt, ...extra }) }));
  const text = await res.text();
  const events = res.headers.get("content-type")?.includes("ndjson") ? (text.trim().split("\n").map((l) => JSON.parse(l)) as { type: string; [k: string]: unknown }[]) : [];
  return { res, events, text, answer: (events.find((e) => e.type === "answer") as { answer?: { markdown?: string } } | undefined)?.answer?.markdown, memory: events.find((e) => e.type === "memory") as { enabled: boolean; saved: number; summarized?: boolean } | undefined };
}

test("Postgres full-text search: ranked, OR of stemmed terms, per account, own chat excluded, GIN index in place", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const a = await signIn("pg-a@example.com", "free");
  const b = await signIn("pg-b@example.com", "free");
  await recordTurn({ chatId: "thr_pg_1", workspaceId: a.workspaceId, title: "Bread", prompt: "How often should I feed my sourdough starter?", answer: "Feed a sourdough starter once or twice a day at room temperature.", at: 3000 });
  await recordTurn({ chatId: "thr_pg_2", workspaceId: a.workspaceId, title: "Pasta", prompt: "How long should I knead pasta dough?", answer: "About ten minutes.", at: 2000 });
  await recordTurn({ chatId: "thr_pg_3", workspaceId: a.workspaceId, title: "Running", prompt: "Plan my marathon training", answer: "Run four times a week, long run on Sunday.", at: 1000 });
  await recordTurn({ chatId: "thr_pg_b", workspaceId: b.workspaceId, title: "Secret", prompt: "My sourdough secret recipe", answer: "private", at: 5000 });

  const hits = await searchDigests(a.workspaceId, "how do I feed my sourdough starter in winter");
  assert.deepEqual(hits.map((h) => h.id), ["thr_pg_1"], "only the matching chat, never account B's");
  assert.ok(hits[0].log.length === 1 && hits[0].text.includes("sourdough"));
  assert.deepEqual((await searchDigests(a.workspaceId, "feeding starters", {})).map((h) => h.id), ["thr_pg_1"], "stemming: feeding/starters match feed/starter");
  assert.deepEqual(await searchDigests(a.workspaceId, "how often should I feed my sourdough starter", { excludeId: "thr_pg_1" }), []);
  const two = await searchDigests(a.workspaceId, "knead dough and plan marathon training");
  assert.deepEqual(new Set(two.map((h) => h.id)), new Set(["thr_pg_2", "thr_pg_3"]), "OR semantics across terms");
  assert.deepEqual(await searchDigests(a.workspaceId, "quantum chromodynamics lattice"), []);
  assert.deepEqual(await searchDigests(a.workspaceId, "what is it"), []);
  // hostile text in the prompt cannot change the query (terms are [a-z0-9] words only)
  assert.equal((await searchDigests(a.workspaceId, "sourdough'); DROP TABLE keplar_rows; -- | & !")).length, 1);
  assert.ok(Number((await neonQuery("SELECT count(*) AS n FROM keplar_rows"))[0].n) > 0);

  const snips = pickSnippets(hits, "how do I feed my sourdough starter in winter");
  assert.match(snips[0]?.text ?? "", /Feed a sourdough starter once or twice a day/);

  const idx = await neonQuery("SELECT indexdef FROM pg_indexes WHERE indexname = 'keplar_rows_chat_fts'");
  assert.match(String(idx[0]?.indexdef), /gin/i);
  // the planner can use it: the query predicate is the index expression
  const meta = await listMeta(a.workspaceId);
  assert.deepEqual(meta.map((m) => m.id), ["thr_pg_1", "thr_pg_2", "thr_pg_3"], "newest first, without transcripts");
  assert.equal("text" in meta[0], false);
  assert.deepEqual((await recentDigests(a.workspaceId, { excludeId: "thr_pg_1", limit: 1 })).map((m) => m.id), ["thr_pg_2"]);
  await setSummary(a.workspaceId, "thr_pg_1", "Learned how to feed a sourdough starter.");
  assert.equal((await digests().get(a.workspaceId, "thr_pg_1"))?.summarySource, "model");
  assert.equal(await eraseAllDigests(b.workspaceId), 1);
  assert.equal((await listMeta(b.workspaceId)).length, 0);
  assert.equal((await listMeta(a.workspaceId)).length, 3, "other accounts untouched");
});

test("user id is stable with keplar_users/keplar_sessions: a second device sees the same memory, saved chats and summaries", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const email = "stable-a@example.com";
  const first = await signIn(email, "free");
  const users = await neonQuery("SELECT id FROM keplar_users WHERE email = $1", [email]);
  assert.equal(users.length, 1, "the account row exists");
  assert.equal(workspaceIdForUser(String(users[0].id)), first.workspaceId, "workspace (and so memory) hangs off the stored user id");
  assert.ok((await neonQuery("SELECT 1 FROM keplar_sessions WHERE user_id = $1", [String(users[0].id)])).length >= 1, "a session row exists for that user");

  await addItems(first.workspaceId, [{ text: "The user is writing a thesis on bees.", kind: "project" }], "auto");
  await recordTurn({ chatId: "thr_stable_1", workspaceId: first.workspaceId, title: "Bees", prompt: "What do bees pollinate most?", answer: "Almonds and apples.", at: Date.now() - 3600 * 1000 });
  await setSummary(first.workspaceId, "thr_stable_1", "Asked what bees pollinate most.");

  // the same person signs in again (new session, other device): same workspace, same memory
  const second = await signIn(email, "free");
  assert.equal(second.workspaceId, first.workspaceId);
  assert.notEqual(second.cookie, first.cookie);
  const r = await chat(second.cookie, "what did we talk about last time?", { chatId: "thr_stable_2", tz: "UTC" });
  assert.match(r.answer ?? "", /Asked what bees pollinate most/, "recall works from the new session");
  assert.equal(r.memory?.enabled, true);
  assert.equal((await listItems(second.workspaceId)).length, 1);

  // another person does not see it
  const other = await signIn("stable-b@example.com", "free");
  assert.notEqual(other.workspaceId, first.workspaceId);
  assert.doesNotMatch((await chat(other.cookie, "what did we talk about last time?")).answer ?? "", /bees/i);
});

test("end to end on Postgres: answer → digest + summary + notes saved, 'Memory updated' reported, next new chat is told about it", async (t) => {
  if (!fake) return t.skip("@electric-sql/pglite is not installed");
  const u = await signIn("stable-a@example.com", "free");
  const calls: string[] = [];
  setExtractDeps({ models: [freeRoster[0]], registry: { once: async (i) => { calls.push(i.prompt); return { ok: true, text: /Summary so far/.test(i.prompt) ? "Talked about training for a marathon in April." : JSON.stringify({ facts: [{ text: "The user is training for a marathon in April.", kind: "goal" }] }) }; } } });
  const sent: string[] = [];
  const real = globalThis.fetch;
  const env = { OPENROUTER_API_KEY: "sk-or-test", OPENAI_API_KEY: "sk-test", NVIDIA_API_KEY: "nvapi-test", KEPLAR_LIVE_MODELS: "1" };
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) { prev[k] = process.env[k]; process.env[k] = v; }
  const inner = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (/neon\.tech/.test(url)) return inner(input, init);
    sent.push(String(init?.body ?? ""));
    return new Response(JSON.stringify({ id: "x", model: "m", choices: [{ index: 0, message: { role: "assistant", content: "Run three easy days and one long run each week." }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 8 } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const r = await chat(u.cookie, "I'm training for a marathon in April. How should I structure a weekly running plan?", { history: [], chatId: "thr_stable_3", tz: "UTC" });
    assert.ok(r.answer, r.text.slice(0, 300));
    assert.deepEqual({ enabled: r.memory?.enabled, saved: r.memory?.saved, summarized: r.memory?.summarized }, { enabled: true, saved: 1, summarized: true });
    const d = await digests().get(u.workspaceId, "thr_stable_3");
    assert.match(d?.summary ?? "", /marathon in April/);
    sent.length = 0;
    await chat(u.cookie, "Give me a nutrition plan for the weeks before my big race next spring", { history: [], chatId: "thr_stable_4", tz: "UTC" });
    const body = sent.find((b) => b.includes("KEPLAR_RECENT_CHATS")) ?? "";
    assert.match(body, /Talked about training for a marathon in April/, "new chat is told what the last chat was");
    assert.match(body, /marathon in April/);
  } finally {
    globalThis.fetch = real;
    for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});
