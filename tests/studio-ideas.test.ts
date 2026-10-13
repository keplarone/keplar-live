import "./setup";
import { jsonReq, signIn } from "./helpers/session"; // before the routes: it sets the test auth secret the auth module reads at load
import { GET as ideasGET, POST as ideasPOST } from "../src/app/api/studio/ideas/route";
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { testWorkspace } from "./helpers/workspace";
import { usedThisMonth } from "../src/lib/create/platform/compute";
import { IDEA_LIMITS, ideaBuildPrompt, MARKET_AS_OF, MARKET_SIGNAL_IDS, MARKET_SIGNALS, MARKET_SOURCES, type GameIdea } from "../src/lib/studio/idea-market";
import { generateIdeas, IDEAS_PROFILE, IDEAS_SYSTEM, IDEAS_TOOL, IDEAS_TOOL_NAME, ideasCreditCeiling, parseIdeas } from "../src/lib/studio/ideas";

const ENV = process.env.OPENROUTER_API_KEY;
const FETCH = globalThis.fetch;
afterEach(() => { if (ENV === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = ENV; globalThis.fetch = FETCH; });

const idea = (over: Partial<Record<keyof GameIdea, unknown>> = {}) => ({
  title: "Lantern Keepers", hook: "Keep the lights on while something hunts you in the dark.", signals: ["gap-horror-escape", "gap-coop-obby"],
  coreLoop: "Carry fuel between lanterns as a team; each lit room opens the next.", twist: "The monster only moves when no lantern sees it.",
  session: "10-minute runs, playable on phones.", monetization: "Lantern skins and a private-server pass.", firstBuild: "Three rooms, lantern fuel, one monster with line-of-sight AI, and a round UI.",
  ...over,
});

const modelReply = (args: unknown, cost = 0.05) => new Response(JSON.stringify({
  model: "anthropic/claude-opus-5.5",
  choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "t1", type: "function", function: { name: IDEAS_TOOL_NAME, arguments: JSON.stringify(args) } }] } }],
  usage: { prompt_tokens: 3_000, completion_tokens: 2_000, cost },
}), { status: 200, headers: { "content-type": "application/json" } });

test("market signals: unique ids, a known source each, an as-of date, and they are the tool's only allowed ids", () => {
  assert.equal(new Set(MARKET_SIGNAL_IDS).size, MARKET_SIGNALS.length);
  assert.match(MARKET_AS_OF, /^\d{4}-\d{2}-\d{2}$/);
  for (const sig of MARKET_SIGNALS) {
    assert.ok(MARKET_SOURCES[sig.source].url.startsWith("https://"), sig.id);
    assert.ok(sig.label && sig.stat && sig.note, sig.id);
  }
  const items = IDEAS_TOOL.inputSchema.properties.ideas.items.properties.signals.items;
  assert.deepEqual([...items.enum], [...MARKET_SIGNAL_IDS]);
  for (const id of MARKET_SIGNAL_IDS) assert.ok(IDEAS_SYSTEM.includes(id), `the prompt lists ${id}`);
});

test("ideas: unknown signals are dropped, an idea without a known signal or a field is dropped, text is capped and tidied", () => {
  const out = parseIdeas({ ideas: [
    idea({ signals: ["gap-horror-escape", "made-up-signal", "gap-horror-escape"] }),
    idea({ title: "No signals", signals: ["made-up-signal"] }),
    idea({ title: "  Spaced \n  title  ", twist: "x".repeat(500) }),
    idea({ title: "" }),
    idea({ title: "Fifth, past the cap" }),
  ] });
  assert.deepEqual(out.map((i) => i.title), ["Lantern Keepers", "Spaced title"]);
  assert.deepEqual(out[0]!.signals, ["gap-horror-escape"]);
  assert.equal(out[1]!.twist.length, 220);
  assert.deepEqual(parseIdeas(null), []);
  assert.deepEqual(parseIdeas({ ideas: "nope" }), []);
});

test("ideas: the build brief carries the title, loop, twist and first build", () => {
  const p = ideaBuildPrompt(parseIdeas({ ideas: [idea()] })[0]!);
  for (const s of ["Lantern Keepers", "Core loop:", "Twist:", "Start with:", "line-of-sight"]) assert.ok(p.includes(s), s);
});

test("ideas: one locked Opus 5.5 turn with only the ideas tool and small budgets, charged at its real cost", async () => {
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  const ws = await testWorkspace("studio-ideas", "plus");
  const before = await usedThisMonth(ws);
  let sent: { model: string; tools: { function: { name: string } }[]; max_tokens: number; messages: { role: string; content: unknown }[] } | null = null;
  const f = (async (_u: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return modelReply({ ideas: [idea(), idea({ title: "Two" }), idea({ title: "Three" })] }); }) as unknown as typeof fetch;
  const r = await generateIdeas(ws, { brief: "horror with friends", scope: "weekend" }, { fetch: f });
  const body = sent!;
  assert.equal(body.model, "anthropic/claude-opus-5.5");
  assert.deepEqual(body.tools.map((t) => t.function.name), [IDEAS_TOOL_NAME]);
  assert.equal(body.max_tokens, IDEAS_PROFILE.maxOutputTokens);
  assert.match(JSON.stringify(body.messages.at(-1)!.content), /horror with friends/);
  assert.equal(r.ideas.length, IDEA_LIMITS.count);
  assert.ok(r.units > 0);
  assert.equal((await usedThisMonth(ws)) - before, r.units);
});

test("ideas: a reply without usable ideas is an error the page can show", async () => {
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  const ws = await testWorkspace("studio-ideas-empty", "plus");
  const f = (async () => modelReply({ ideas: [idea({ signals: ["nope"] })] })) as unknown as typeof fetch;
  await assert.rejects(generateIdeas(ws, { brief: "", scope: "full" }, { fetch: f }), /didn't return usable ideas/);
});

test("ideas: the credit ceiling covers the whole output cap", async () => {
  const ceiling = await ideasCreditCeiling();
  assert.ok(typeof ceiling === "number" && ceiling > 0);
});

test("ideas route: Studio plans only; a set comes back with what it cost", async () => {
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  const free = await signIn("studio-ideas-free@example.com", "free");
  let called = 0;
  globalThis.fetch = (async () => { called++; return modelReply({ ideas: [] }); }) as unknown as typeof fetch;
  const denied = await ideasPOST(jsonReq(free.cookie, "/api/studio/ideas", "POST", { brief: "pets" }));
  assert.equal(denied.status, 402);
  assert.match(((await denied.json()) as { error: string }).error, /Lite, Plus and Pro/);
  assert.equal(called, 0, "no model call on a free plan");
  const user = await signIn("studio-ideas-route@example.com", "pro");
  const g = await ideasGET(jsonReq(user.cookie, "/api/studio/ideas", "GET"));
  assert.equal(g.status, 200);
  assert.ok(((await g.json()) as { maxCredits: number }).maxCredits > 0);
  globalThis.fetch = (async () => modelReply({ ideas: [idea(), idea({ title: "Two" }), idea({ title: "Three" })] })) as unknown as typeof fetch;
  const r = await ideasPOST(jsonReq(user.cookie, "/api/studio/ideas", "POST", { brief: "pets", scope: "full" }));
  assert.equal(r.status, 200, await r.clone().text());
  const j = (await r.json()) as { ideas: GameIdea[]; units: number };
  assert.equal(j.ideas.length, 3);
  assert.ok(j.units > 0);
});
