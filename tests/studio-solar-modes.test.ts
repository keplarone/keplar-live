import "./setup";
import { jsonReq, signIn } from "./helpers/session"; // before the routes: it sets the test auth secret the auth module reads at load
import { POST as studioPOST } from "../src/app/api/studio/agent/route";
import { POST as blenderPOST } from "../src/app/api/blender/agent/route";
import { GET as modesGET } from "../src/app/api/studio/modes/route";
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { testWorkspace } from "./helpers/workspace";
import { USD_PER_UNIT } from "../src/lib/create/platform/compute";
import { METER_MARGIN } from "../src/lib/orchestration/limits";
import { BLENDER_PROFILE } from "../src/lib/blender/agent";
import { buildTools, ROBLOX_CREDIT_RATE, ROBLOX_MODEL_DEFAULT, runStudioTurn, STUDIO_LIMITS, STUDIO_PROFILE, validateMessages } from "../src/lib/studio/agent";
import { creditsForTokens, DEFAULT_SOLAR_MODE, outputCreditsMax, parseSolarMode, SOLAR_MODE_IDS, SOLAR_MODES, SOLAR_TECHNICAL_DETAILS, solarMode, type SolarModeCredits, type SolarPricing } from "../src/lib/studio/solar-modes";
import { chargedUnitsForUsd, profileForMode, RESERVE_INPUT_TOKENS, reserveCreditsFor, solarModeTable, solarPricing } from "../src/lib/studio/solar-modes-server";

const ENV = process.env.OPENROUTER_API_KEY;
const realFetch = globalThis.fetch;
afterEach(() => {
  if (ENV === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = ENV;
  globalThis.fetch = realFetch;
});

const reply = (usage: Record<string, unknown> = { prompt_tokens: 1000, completion_tokens: 100, cost: 0.01 }) =>
  new Response(JSON.stringify({ model: "anthropic/claude-opus-5.5", provider: "Anthropic", choices: [{ finish_reason: "stop", message: { content: "Done." } }], usage }), { status: 200, headers: { "content-type": "application/json" } });

test("modes: five, in order, with the product labels and internal ids", () => {
  assert.deepEqual(SOLAR_MODES.map((m) => [m.label, m.id]), [["Light", "low"], ["Medium", "medium"], ["High", "high"], ["Max", "max"], ["Ultimate+", "ultracode"]]);
  assert.deepEqual([...SOLAR_MODE_IDS], ["low", "medium", "high", "max", "ultracode"]);
  for (const m of SOLAR_MODES) assert.ok(m.description.length > 10 && m.description.length < 140 && !m.description.includes("\n"), m.id);
});

test("modes: strict parsing (missing is Medium; labels, casing and other types are rejected)", () => {
  assert.equal(DEFAULT_SOLAR_MODE, "medium");
  assert.equal(parseSolarMode(undefined), "medium");
  assert.equal(parseSolarMode(null), "medium");
  for (const id of SOLAR_MODE_IDS) assert.equal(parseSolarMode(id), id);
  for (const bad of ["", "Light", "MEDIUM", "ultimate", "Ultimate+", "xhigh", " low", 1, true, {}, ["low"]]) assert.equal(parseSolarMode(bad), null, JSON.stringify(bad));
  assert.throws(() => solarMode("nope" as never), /Unknown Solar mode/);
});

test("budgets: Medium is today's behaviour; thinking stays below max_tokens; each mode thinks more than the one before; reply room never shrinks below Light's", () => {
  const med = solarMode("medium").budgets;
  assert.deepEqual(med.studio, { reasoningTokens: 3000, maxOutputTokens: 20000 });
  assert.deepEqual(med.studio, { reasoningTokens: STUDIO_PROFILE.reasoningTokens, maxOutputTokens: STUDIO_PROFILE.maxOutputTokens });
  assert.deepEqual(med.blender, { reasoningTokens: BLENDER_PROFILE.reasoningTokens, maxOutputTokens: BLENDER_PROFILE.maxOutputTokens });
  for (const surface of ["studio", "blender"] as const) {
    const bs = SOLAR_MODES.map((m) => m.budgets[surface]);
    const lightRoom = bs[0]!.maxOutputTokens - bs[0]!.reasoningTokens;
    bs.forEach((b, i) => {
      assert.ok(b.reasoningTokens >= 1024 && b.reasoningTokens < b.maxOutputTokens, `${surface} ${i}`);
      assert.ok(b.maxOutputTokens <= 128_000, "within Opus 5.5's output cap");
      assert.ok(b.maxOutputTokens - b.reasoningTokens >= lightRoom, `${surface} ${i} reply room`);
      if (i > 0) {
        assert.ok(b.reasoningTokens > bs[i - 1]!.reasoningTokens, `${surface} ${i} thinks more`);
        assert.ok(b.maxOutputTokens > bs[i - 1]!.maxOutputTokens, `${surface} ${i} larger cap`);
      }
    });
  }
});

const studioPricing: SolarPricing = { inputPer1M: 4, outputPer1M: 20, margin: 1.1, creditRate: 0.7, usdPerCredit: 0.002, chargeMultiplier: 1 };

test("credits: worst-case arithmetic matches the charge (price x margin x credit rate / $0.002, rounded up, then the multiplier)", () => {
  // Medium Studio: 20,000 output tokens x $20/M = $0.40; x 1.1 x 0.7 = $0.308; / 0.002 = 154 credits.
  assert.equal(outputCreditsMax(studioPricing, solarMode("medium").budgets.studio), 154);
  // Ultimate+ Studio: 38,000 x $20/M = $0.76 -> 0.5852 / 0.002 = 292.6 -> 293.
  assert.equal(outputCreditsMax(studioPricing, solarMode("ultracode").budgets.studio), 293);
  // Blender is charged at the full rate (credit rate 1): 8,000 x $20/M = $0.16 x 1.1 = 0.176 / 0.002 = 88.
  assert.equal(outputCreditsMax({ ...studioPricing, creditRate: 1 }, solarMode("medium").budgets.blender), 88);
  assert.equal(creditsForTokens(studioPricing, 0, 0), 0, "nothing used, nothing charged");
  assert.equal(creditsForTokens(studioPricing, 10, 0), 1, "at least one credit once anything is used");
  assert.equal(creditsForTokens({ ...studioPricing, chargeMultiplier: 1.5 }, 0, 20_000), 231, "multiplier applied after rounding, like chargeUnits");
  // The same float arithmetic as runStudioTurn's charge for a spread of token counts.
  for (const [i, o] of [[0, 1], [12_345, 6_789], [90_000, 20_000], [1, 38_000], [250_000, 3_333]] as const) {
    assert.equal(creditsForTokens(studioPricing, i, o), chargedUnitsForUsd((i * 4 + o * 20) / 1_000_000, ROBLOX_CREDIT_RATE), `${i}/${o}`);
  }
});

test("credits: the server prices modes from the real catalog price, margin, credit rate and credit size", async () => {
  const p = (await solarPricing("studio"))!;
  assert.deepEqual(p, { inputPer1M: 4, outputPer1M: 20, margin: METER_MARGIN, creditRate: ROBLOX_CREDIT_RATE, usdPerCredit: USD_PER_UNIT, chargeMultiplier: p.chargeMultiplier });
  assert.equal((await solarPricing("blender"))!.creditRate, 1);
  // Reserve: Medium stays at today's 300; deeper modes reserve their full output cap plus the input allowance.
  assert.equal(RESERVE_INPUT_TOKENS, 90_000);
  const flat = { ...p, chargeMultiplier: 1 };
  assert.equal(reserveCreditsFor(flat, "studio", "medium"), STUDIO_LIMITS.reserveUnits);
  assert.equal(reserveCreditsFor(flat, "studio", "low"), 300);
  assert.equal(reserveCreditsFor(flat, "studio", "ultracode"), creditsForTokens(flat, 90_000, 38_000));
  assert.equal(reserveCreditsFor(flat, "studio", "ultracode"), 432);
  for (const id of SOLAR_MODE_IDS) assert.ok(reserveCreditsFor(flat, "studio", id) >= outputCreditsMax(flat, solarMode(id).budgets.studio), `${id} reserve covers its output cap`);
  const table = (await solarModeTable("studio"))!;
  assert.deepEqual(table.map((r) => r.id), [...SOLAR_MODE_IDS]);
  assert.equal(table[1]!.maxOutputTokens, 20_000);
});

test("turn: each mode's budgets reach OpenRouter as reasoning.max_tokens and max_tokens, the turn echoes the mode, the lock stays", async () => {
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  const ws = await testWorkspace("solar-modes-turn", "pro");
  for (const surface of ["studio", "blender"] as const) {
    for (const m of SOLAR_MODES) {
      let sent: { model: string; max_tokens: number; reasoning: unknown; models?: unknown } | null = null;
      const f = (async (_u: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return reply(); }) as unknown as typeof fetch;
      const profile = await profileForMode(surface, m.id);
      assert.equal(profile.meter, surface === "studio" ? "studio.agent" : "blender.agent");
      assert.equal(profile.lockedModel, surface === "studio" ? true : undefined, "the model lock is the surface's, unchanged");
      const turn = await runStudioTurn(ws, { messages: validateMessages([{ role: "user", content: "hi" }]), tools: buildTools([]) }, { fetch: f }, profile);
      const body = sent as unknown as { model: string; max_tokens: number; reasoning: unknown; models?: unknown };
      assert.equal(body.max_tokens, m.budgets[surface].maxOutputTokens, `${surface} ${m.id}`);
      assert.deepEqual(body.reasoning, { max_tokens: m.budgets[surface].reasoningTokens }, `${surface} ${m.id}`);
      assert.equal(body.model, ROBLOX_MODEL_DEFAULT);
      assert.equal(body.models, undefined);
      assert.equal(turn.mode, m.id);
    }
  }
});

test("turn: without a mode the profiles behave exactly as before (Medium budgets, mode null for callers like Roblox Cloud)", async () => {
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  const ws = await testWorkspace("solar-modes-none", "pro");
  let body: { max_tokens?: number; reasoning?: unknown } = {};
  const turn = await runStudioTurn(ws, { messages: validateMessages([{ role: "user", content: "hi" }]), tools: [] }, { fetch: (async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return reply(); }) as unknown as typeof fetch });
  assert.equal(body.max_tokens, 20_000);
  assert.deepEqual(body.reasoning, { max_tokens: 3_000 });
  assert.equal(turn.mode, null);
});

test("turn: a profile whose thinking is not below max_tokens never reaches the provider; deeper modes reserve more credits", async () => {
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  const ws = await testWorkspace("solar-modes-misconfig", "pro");
  let called = 0;
  const f = (async () => { called++; return reply(); }) as unknown as typeof fetch;
  await assert.rejects(runStudioTurn(ws, { messages: validateMessages([{ role: "user", content: "hi" }]), tools: [] }, { fetch: f }, { ...STUDIO_PROFILE, reasoningTokens: 20_000, maxOutputTokens: 20_000 }), /misconfigured/);
  assert.equal(called, 0, "thinking >= max_tokens never reaches the provider");
  const ultra = await profileForMode("studio", "ultracode");
  assert.ok((ultra.reserveUnits ?? 0) > STUDIO_LIMITS.reserveUnits);
});

test("routes: an unknown mode is a 400 before anything is charged; a missing mode runs Medium; the response echoes the mode", async () => {
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  const user = await signIn("solar-modes-route@example.com", "pro");
  for (const [POST, path] of [[studioPOST, "/api/studio/agent"], [blenderPOST, "/api/blender/agent"]] as const) {
    let called = 0;
    globalThis.fetch = (async () => { called++; return reply(); }) as unknown as typeof fetch;
    for (const bad of ["Light", "ultimate", 3, { id: "low" }]) {
      const r = await POST(jsonReq(user.cookie, path, "POST", { messages: [{ role: "user", content: "hi" }], tools: [], mode: bad }));
      assert.equal(r.status, 400, `${path} ${JSON.stringify(bad)}`);
      assert.match(((await r.json()) as { error: string }).error, /Unknown mode/);
    }
    assert.equal(called, 0, "a bad mode never reaches the model");
    const sent: { max_tokens: number; reasoning: { max_tokens: number } }[] = [];
    globalThis.fetch = (async (_u: string, init: RequestInit) => { sent.push(JSON.parse(String(init.body))); return reply(); }) as unknown as typeof fetch;
    const surface = path.includes("blender") ? "blender" : "studio";
    const none = await POST(jsonReq(user.cookie, path, "POST", { messages: [{ role: "user", content: "hi" }], tools: [] }));
    assert.equal(none.status, 200, await none.clone().text());
    assert.equal(((await none.json()) as { mode: string }).mode, "medium");
    assert.equal(sent.at(-1)!.max_tokens, solarMode("medium").budgets[surface].maxOutputTokens);
    const high = await POST(jsonReq(user.cookie, path, "POST", { messages: [{ role: "user", content: "hi" }], tools: [], mode: "high" }));
    assert.equal(((await high.json()) as { mode: string }).mode, "high");
    assert.equal(sent.at(-1)!.reasoning.max_tokens, solarMode("high").budgets[surface].reasoningTokens);
  }
});

test("modes endpoint: the priced table for both surfaces plus the provider disclosure", async () => {
  const r = await modesGET();
  assert.equal(r.status, 200);
  const j = (await r.json()) as { defaultMode: string; modes: { studio: SolarModeCredits[]; blender: SolarModeCredits[] }; technical: typeof SOLAR_TECHNICAL_DETAILS };
  assert.equal(j.defaultMode, "medium");
  assert.deepEqual(j.modes.studio.map((m) => m.label), ["Light", "Medium", "High", "Max", "Ultimate+"]);
  const med = j.modes.studio[1]!;
  assert.equal(med.reasoningTokens, 3000);
  assert.ok(med.outputCreditsMax >= 154, "at least the unmultiplied ceiling");
  assert.ok(j.modes.blender.every((m) => m.reserveCredits >= m.outputCreditsMax));
  assert.equal(j.technical.foundationModel, "Claude Opus 5.5");
});

test("disclosure: one Anthropic model through OpenRouter, modes are configurations, the id matches the lock", () => {
  const t = SOLAR_TECHNICAL_DETAILS;
  assert.equal(t.developer, "Anthropic");
  assert.equal(t.servedThrough, "OpenRouter");
  assert.equal(t.openRouterModelId, ROBLOX_MODEL_DEFAULT);
  assert.match(t.summary, /execution configurations of that one model/);
  assert.match(t.summary, /not separately trained models/);
  const all = JSON.stringify(t).toLowerCase();
  for (const claim of ["faster", "smarter", "better", "best", "accurate", "guarantee"]) assert.ok(!all.includes(claim), `no performance claim: ${claim}`);
});

test("solar-modes.ts stays client-safe (no server imports)", () => {
  const src = readFileSync("src/lib/studio/solar-modes.ts", "utf8");
  assert.doesNotMatch(src, /^import (?!type)/m);
  assert.ok(!/server-only|node:|process\.env/.test(src));
});

test("usage: the per-turn log line records the mode", async () => {
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  const ws = await testWorkspace("solar-modes-log", "pro");
  const lines: string[] = [];
  const orig = console.info;
  console.info = (...a: unknown[]) => { lines.push(a.map(String).join(" ")); };
  try {
    await runStudioTurn(ws, { messages: validateMessages([{ role: "user", content: "hi" }]), tools: [] }, { fetch: (async () => reply()) as unknown as typeof fetch }, await profileForMode("studio", "max"));
  } finally { console.info = orig; }
  assert.ok(lines.some((l) => /\[studio\.agent\].* mode max:/.test(l)), lines.join("\n"));
});
