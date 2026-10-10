/**
 * Hang-on-plan regressions: OpenRouter 402 must surface as "Add OpenRouter credits", a stale mid-plan build must fail
 * with Retry (not spin on "Reading your idea…"), and the client stream idle watchdog must be finite.
 */
import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CREDITS_MSG, isCreditsFailure, llm, LlmError, parseJsonObject } from "@/lib/app-builder/llm";
import { APP_MODELS } from "@/lib/app-builder/models";
import { failStaleBuild, builds, type BuildRow } from "@/lib/app-builder/pipeline";
import { now } from "@/lib/create/platform/ids";
import { normalizeDesign } from "@/lib/app-builder/design/tokens";

test("isCreditsFailure: 402 and billing wording are detected; ordinary 503/429 are not", () => {
  assert.equal(isCreditsFailure(402, ""), true);
  assert.equal(isCreditsFailure(402, "Payment Required"), true);
  assert.equal(isCreditsFailure(403, "Insufficient credits on this key"), true);
  assert.equal(isCreditsFailure(400, "add credits at openrouter.ai"), true);
  assert.equal(isCreditsFailure(503, "Service temporarily overloaded"), false);
  assert.equal(isCreditsFailure(429, "Too Many Requests"), false);
  assert.equal(isCreditsFailure(500, "internal"), false);
});

test("llm: paid-model 402 with a free fallback that also 402s fails with credits code and the Add-credits message", async () => {
  process.env.OPENROUTER_API_KEY = "sk-test-hang";
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
    calls.push(body.model ?? "");
    return new Response(JSON.stringify({ error: { message: "Payment required", code: 402 } }), { status: 402, headers: { "content-type": "application/json" } });
  };
  await assert.rejects(
    () => llm([APP_MODELS.flash, APP_MODELS.freeUltra], [{ role: "user", content: "hi" }], { maxTokens: 32, deadline: Date.now() + 30_000, fetchImpl }),
    (e: unknown) => e instanceof LlmError && e.code === "credits" && e.message === CREDITS_MSG,
  );
  assert.deepEqual(calls, [APP_MODELS.flash.id, APP_MODELS.freeUltra.id], "tries paid then free before failing");
  delete process.env.OPENROUTER_API_KEY;
});

test("llm: free-only chain 402 fails immediately with credits (no silent hang spinning the chain)", async () => {
  process.env.OPENROUTER_API_KEY = "sk-test-hang";
  let n = 0;
  const fetchImpl: typeof fetch = async () => {
    n++;
    return new Response("Payment Required", { status: 402 });
  };
  await assert.rejects(
    () => llm([APP_MODELS.freeUltra, APP_MODELS.freeSuper], [{ role: "user", content: "hi" }], { maxTokens: 32, deadline: Date.now() + 30_000, fetchImpl }),
    (e: unknown) => e instanceof LlmError && e.code === "credits" && /OpenRouter is out of credits/.test((e as Error).message),
  );
  assert.equal(n, 1, "first free 402 is terminal — do not burn the whole chain");
  delete process.env.OPENROUTER_API_KEY;
});

test("llm: a successful free fallback after a paid 402 still works (credits are not a hard stop when free models answer)", async () => {
  process.env.OPENROUTER_API_KEY = "sk-test-hang";
  const fetchImpl: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
    if (body.model === APP_MODELS.flash.id) return new Response("{}", { status: 402 });
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0 } }), { status: 200 });
  };
  const r = await llm([APP_MODELS.flash, APP_MODELS.freeUltra], [{ role: "user", content: "hi" }], {
    maxTokens: 32,
    deadline: Date.now() + 30_000,
    fetchImpl,
    accept: (t) => Boolean(parseJsonObject(t)?.ok),
  });
  assert.equal(r.model.id, APP_MODELS.freeUltra.id);
  assert.equal(r.usd, 0);
  delete process.env.OPENROUTER_API_KEY;
});

test("failStaleBuild: a plan-stage row older than the stale window becomes failed with a clear Retry message", async () => {
  const ws = "ws_hang_stale";
  const row: BuildRow = {
    id: "abl_stale1",
    workspaceId: ws,
    siteId: "sit_hang",
    prompt: "a film photo app",
    design: normalizeDesign({}),
    stage: "plan",
    spec: null,
    files: {},
    images: {},
    attempts: 0,
    checks: [],
    verdicts: [],
    visual: null,
    shots: [],
    usd: 0,
    model: null,
    log: [],
    startedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    updatedAt: new Date(Date.now() - 15 * 60_000).toISOString(),
    error: null,
    version: null,
    wave: 0,
    charged: 0,
    units: 0,
    runs: 1,
  };
  await builds().insert(row);
  const failed = await failStaleBuild(row);
  assert.equal(failed.stage, "failed");
  assert.match(failed.error ?? "", /timed out|try again/i);
  assert.match(failed.error ?? "", /while planning/i);
  const gen: BuildRow = { ...row, id: "abl_stale_gen", stage: "generate", updatedAt: new Date(Date.now() - 15 * 60_000).toISOString(), startedAt: new Date(Date.now() - 20 * 60_000).toISOString(), error: null };
  await builds().insert(gen);
  const failedGen = await failStaleBuild(gen);
  assert.equal(failedGen.stage, "failed");
  assert.match(failedGen.error ?? "", /while writing code/i);
  const fresh = { ...row, id: "abl_fresh1", updatedAt: now(), startedAt: now(), stage: "plan" as const, error: null };
  await builds().insert(fresh);
  const still = await failStaleBuild(fresh);
  assert.equal(still.stage, "plan", "a freshly updated plan build is not killed");
});

test("client stream idle watchdog: STREAM_IDLE_MS is finite and the stalled error is wired", () => {
  const src = readFileSync("src/components/create/apps/build-client.ts", "utf8");
  const m = src.match(/STREAM_IDLE_MS\s*=\s*([\d_]+)/);
  assert.ok(m, "STREAM_IDLE_MS exported");
  const ms = Number(m![1].replace(/_/g, ""));
  assert.ok(ms >= 120_000 && ms <= 300_000, `idle ${ms} should be finite but allow a slow plan`);
  assert.match(src, /code:\s*"stalled"/);
  assert.match(src, /stopped responding \(no progress/i);
});

test("pipeline: plan stage streams progress and fails after too many plan-only continues", () => {
  const src = readFileSync("src/lib/app-builder/pipeline.ts", "utf8");
  assert.match(src, /failStaleBuild/);
  assert.match(src, /plan_timeout/);
  assert.match(src, /onDelta/);
  assert.match(src, /group:\s*"plan"/);
  assert.match(src, /STALE_BUILD_MS/);
});
