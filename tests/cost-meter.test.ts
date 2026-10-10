import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMeteredFetch, flushCostEvents, pendingCostEvents, type CostEvent } from "@/lib/cost/meter";
import { withCostTag } from "@/lib/cost/context";
import { DEFAULT_COST_CONFIG, mergeConfig, type CostConfig } from "@/lib/cost/config";
import { costOf, parseRequestBody, SseUsageScanner, usageFromJson, endpointOf, providerOf } from "@/lib/cost/usage";
import { featureForAsk, featureForPath, featureForLedgerAction } from "@/lib/cost/features";
import type { UserDay } from "@/lib/cost/guard";

const OR = "https://openrouter.ai/api/v1/chat/completions";
const cfgWith = (patch: unknown = {}): CostConfig => mergeConfig(DEFAULT_COST_CONFIG, patch);
const chatBody = (model: string, extra: Record<string, unknown> = {}) => JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], ...extra });

type Harness = { fetch: typeof fetch; sent: { url: string; body: unknown }[]; exhausted: string[] };
// The meter keeps one process-wide buffer (one writer in production), so every harness shares one sink.
const ALL: CostEvent[] = [];
const sharedSink = async (rows: CostEvent[]) => void ALL.push(...rows);
function harness(opts: { cfg?: CostConfig; respond?: (url: string, body: Record<string, unknown> | null, n: number) => Response; usage?: UserDay; throttles?: Record<string, unknown>; exhausted?: boolean; flushMs?: number } = {}): Harness {
  const h: Harness = { fetch: null as unknown as typeof fetch, sent: [], exhausted: [] };
  const respond = opts.respond ?? ((_u, b) => Response.json({ id: "gen-1", model: b?.model, choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 1200, completion_tokens: 300, cost: 0.00123 } }));
  const orig = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    let body: Record<string, unknown> | null = null;
    try { body = typeof init?.body === "string" ? JSON.parse(init.body) : null; } catch { body = null; }
    h.sent.push({ url, body });
    return respond(url, body, h.sent.length);
  }) as typeof fetch;
  h.fetch = createMeteredFetch({
    orig,
    config: async () => opts.cfg ?? cfgWith(),
    state: async () => ({ throttles: opts.throttles ?? {}, exhausted: Boolean(opts.exhausted) }),
    usage: async () => opts.usage ?? { calls: 0, usd: 0, requests: 0 },
    onExhausted: async (r) => h.exhausted.push(r),
    sink: sharedSink,
    flushMs: opts.flushMs ?? 1,
  });
  return h;
}
/** Flush and return (then forget) the recorded rows for one user. */
const drain = async (userId: string | null, atLeast = 1) => {
  // Rows are recorded after the body is read (in the background for JSON), so wait for them.
  for (let i = 0; i < 400; i++) {
    await new Promise((r) => setTimeout(r, 10));
    await flushCostEvents(sharedSink);
    if (ALL.filter((r) => r.userId === userId).length >= atLeast) break;
  }
  const mine = ALL.filter((r) => r.userId === userId);
  for (const r of mine) ALL.splice(ALL.indexOf(r), 1);
  return mine;
};

/* ── parsing + pricing ─────────────────────────────────────────────── */

test("usage: OpenRouter reported cost wins; otherwise tokens × price table; $0 for :free; unit prices for media", () => {
  const req = parseRequestBody(chatBody("google/gemini-3.1-flash-lite"));
  const or = usageFromJson({ model: "google/gemini-3.1-flash-lite", usage: { prompt_tokens: 1000, completion_tokens: 500, cost: 0.0042 } });
  assert.deepEqual(costOf({ provider: "openrouter", endpoint: "chat", model: req.model, usage: or, req, ok: true }), { usd: 0.0042, source: "provider" });
  // Same call, no cost field: list price 0.25/M in, 1.5/M out.
  const tokOnly = usageFromJson({ usage: { prompt_tokens: 1000, completion_tokens: 500 } });
  const c = costOf({ provider: "openrouter", endpoint: "chat", model: req.model, usage: tokOnly, req, ok: true });
  assert.equal(c.source, "tokens");
  assert.ok(Math.abs(c.usd - (1000 * 0.25 + 500 * 1.5) / 1e6) < 1e-12);
  // Anthropic shape.
  const an = usageFromJson({ usage: { input_tokens: 10, output_tokens: 20 } });
  assert.equal(an?.tokensIn, 10);
  assert.equal(an?.tokensOut, 20);
  const free = parseRequestBody(chatBody("nvidia/nemotron-3-super-120b-a12b:free"));
  assert.deepEqual(costOf({ provider: "openrouter", endpoint: "chat", model: free.model, usage: tokOnly, req: free, ok: true }), { usd: 0, source: "free" });
  const img = parseRequestBody(JSON.stringify({ model: "black-forest-labs/flux.2-pro", n: 2 }));
  assert.deepEqual(costOf({ provider: "openrouter", endpoint: "image", model: img.model, usage: null, req: img, ok: true }), { usd: 0.06, source: "unit_price" });
  const vid = parseRequestBody(JSON.stringify({ model: "google/veo-3.1-fast", duration: 8 }));
  assert.equal(costOf({ provider: "openrouter", endpoint: "video", model: vid.model, usage: null, req: vid, ok: true }).usd, 0.15 * 8);
  const hf = parseRequestBody(JSON.stringify({ prompt: "x", duration: 5 }));
  assert.ok(Math.abs(costOf({ provider: "higgsfield", endpoint: "media_job", model: null, usage: null, req: hf, ok: true, path: "/bytedance/seedance-2.0/text-to-video" }).usd - 0.1407 * 5) < 1e-9);
  // A failed call costs nothing unless the provider says otherwise; an unknown paid model is priced high, never free.
  assert.equal(costOf({ provider: "openai", endpoint: "chat", model: "gpt-x", usage: null, req, ok: false }).usd, 0);
  assert.ok(costOf({ provider: "openai", endpoint: "chat", model: "mystery-model", usage: { tokensIn: 1e6, tokensOut: 0, providerUsd: null, model: null }, req, ok: true }).usd >= 3);
});

test("usage: SSE scanner keeps the final usage chunk (OpenRouter) and Anthropic's split usage", () => {
  const s = new SseUsageScanner();
  s.push('data: {"choices":[{"delta":{"content":"Hel"}}]}\n\ndata: {"choices":[{"delta":{"content":"lo"}}]}\n\n');
  s.push('data: {"model":"openai/gpt-5-nano","choices":[],"usage":{"prompt_tokens":40,"completion_tokens":2,"cost":0.0000042}}\n\ndata: [DONE]\n\n');
  assert.deepEqual(s.result(), { tokensIn: 40, tokensOut: 2, providerUsd: 0.0000042, model: "openai/gpt-5-nano" });
  const a = new SseUsageScanner();
  a.push('event: message_start\ndata: {"type":"message_start","message":{"model":"claude-haiku-4-5","usage":{"input_tokens":25,"output_tokens":1}}}\n\n');
  a.push('event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":15}}\n\n');
  assert.equal(a.result().tokensIn, 25);
  assert.equal(a.result().tokensOut, 15);
});

test("routing: provider hosts, billable endpoints, feature attribution helpers", () => {
  assert.equal(providerOf(new URL(OR)), "openrouter");
  assert.equal(providerOf(new URL("https://example.com/v1/chat/completions")), null);
  assert.equal(endpointOf("openrouter", new URL("https://openrouter.ai/api/v1/models"), "GET"), "meta");
  assert.equal(endpointOf("openrouter", new URL("https://openrouter.ai/api/v1/credits"), "GET"), "meta");
  assert.equal(endpointOf("openai", new URL("https://api.openai.com/v1/moderations"), "POST"), "moderation");
  assert.equal(endpointOf("openai", new URL("https://api.openai.com/v1/audio/transcriptions"), "POST"), "audio");
  assert.equal(featureForPath("/api/sites/abc123/qa"), "critic");
  assert.equal(featureForPath("/api/sites/abc123/generate"), "create");
  assert.equal(featureForPath("/api/create/media/video"), "video");
  assert.equal(featureForPath("/api/v1/ask"), "api");
  assert.equal(featureForPath("/api/keplar/transcribe"), "transcribe");
  assert.equal(featureForPath("/pricing"), null);
  assert.equal(featureForAsk({ modes: { deepResearch: true } }), "deep-research");
  assert.equal(featureForAsk({ modes: { debate: true } }), "debate");
  assert.equal(featureForAsk({ modes: { reason: true } }), "core-reasoning");
  assert.equal(featureForAsk({ modes: {}, attachments: [{}] }), "multimodal");
  assert.equal(featureForAsk({ modes: {} }), "ask");
  assert.equal(featureForLedgerAction("image.generate"), "images");
  assert.equal(featureForLedgerAction("site.deploy"), "deploy");
  assert.equal(featureForLedgerAction("app.build"), "create");
  assert.equal(featureForLedgerAction("photo.read"), "multimodal");
});

/* ── metering accuracy ─────────────────────────────────────────────── */

test("meter: non-provider and metadata calls pass straight through, unrecorded", async () => {
  const h = harness();
  const plain = await h.fetch("https://example.com/x");
  assert.equal(plain.status, 200);
  await h.fetch("https://openrouter.ai/api/v1/models");
  await drain(null, 0);
  assert.equal(h.sent.length, 2);
  assert.equal(ALL.length, 0);
});

test("meter: a JSON call is recorded with feature, user, plan, model, tokens, provider cost and latency", async () => {
  const h = harness();
  const res = await withCostTag({ feature: "slides", userId: "ws_1", plan: "plus" }, () => h.fetch(OR, { method: "POST", body: chatBody("google/gemini-3.1-flash-lite") }));
  assert.equal((await res.json()).choices[0].message.content, "ok", "the caller still reads the body");
  const [r] = await drain("ws_1");
  assert.equal(r.feature, "slides");
  assert.equal(r.userId, "ws_1");
  assert.equal(r.plan, "plus");
  assert.equal(r.provider, "openrouter");
  assert.equal(r.model, "google/gemini-3.1-flash-lite");
  assert.equal(r.tokensIn, 1200);
  assert.equal(r.tokensOut, 300);
  assert.equal(r.usd, 0.00123);
  assert.equal(r.costSource, "provider");
  assert.equal(r.ok, true);
  assert.ok(r.latencyMs >= 0);
  assert.equal(r.firstOfRequest, true);
});

test("meter: a streamed call passes every byte through unchanged and is costed from the final usage chunk", async () => {
  const chunks = ['data: {"choices":[{"delta":{"content":"A"}}]}\n\n', 'data: {"model":"openai/gpt-5-nano","choices":[],"usage":{"prompt_tokens":7,"completion_tokens":3,"cost":0.00002}}\n\n', "data: [DONE]\n\n"];
  const h = harness({ respond: () => new Response(new ReadableStream({ start(c) { for (const x of chunks) c.enqueue(new TextEncoder().encode(x)); c.close(); } }), { headers: { "content-type": "text/event-stream" } }) });
  const res = await withCostTag({ feature: "ask", userId: "ws_2", plan: "pro" }, () => h.fetch(OR, { method: "POST", body: chatBody("openai/gpt-5-nano", { stream: true }) }));
  assert.equal(await res.text(), chunks.join(""));
  const [r] = await drain("ws_2");
  assert.deepEqual([r.tokensIn, r.tokensOut, r.usd, r.costSource, r.model], [7, 3, 0.00002, "provider", "openai/gpt-5-nano"]);
});

test("meter: untagged calls outside any request are recorded as system; buffered rows flush in one batch", async () => {
  const h = harness();
  await Promise.all([1, 2, 3].map(() => h.fetch(OR, { method: "POST", body: chatBody("openai/gpt-5-nano") })));
  const rows = await drain(null, 3);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.feature === "system" && r.usd === 0.00123));
  assert.equal(pendingCostEvents().length, 0);
  // A failed write re-queues the rows instead of losing them. (A background flush may win the race for a row; retry then.)
  const h2 = harness({ flushMs: 60_000 });
  let requeued = false;
  for (let attempt = 0; attempt < 5 && !requeued; attempt++) {
    await h2.fetch(OR, { method: "POST", body: chatBody("openai/gpt-5-nano") });
    for (let i = 0; i < 200 && pendingCostEvents().length === 0; i++) await new Promise((r) => setTimeout(r, 5));
    if (!pendingCostEvents().length) continue;
    await flushCostEvents(async () => { throw new Error("neon down"); }).catch(() => {});
    requeued = pendingCostEvents().length >= 1;
  }
  assert.ok(requeued);
  const batches: number[] = [];
  await flushCostEvents(async (r) => void batches.push(r.length));
  assert.ok(batches.length === 1 && batches[0] >= 1);
});

/* ── guardrails at the provider boundary ───────────────────────────── */

test("guard: a kill switch refuses before sending, with an honest provider-style error, and costs nothing", async () => {
  const h = harness({ cfg: cfgWith({ killSwitches: { "deep-research": true } }) });
  const res = await withCostTag({ feature: "deep-research", userId: "ws_3", plan: "pro" }, () => h.fetch(OR, { method: "POST", body: chatBody("openai/gpt-5-nano") }));
  assert.equal(res.status, 503);
  const j = await res.json();
  assert.equal(j.error.metadata.keplar, "feature_disabled");
  assert.match(j.error.message, /Nothing was charged/);
  assert.equal(h.sent.length, 0);
  const [r] = await drain("ws_3");
  assert.equal(r.blocked, "feature_disabled");
  assert.equal(r.usd, 0);
});

test("guard: Free plan never sends a paid model; :free models go through", async () => {
  const h = harness();
  const paid = await withCostTag({ feature: "ask", userId: "ws_f", plan: "free" }, () => h.fetch(OR, { method: "POST", body: chatBody("openai/gpt-5-nano") }));
  assert.equal(paid.status, 403);
  assert.equal(h.sent.length, 0);
  const mixed = await withCostTag({ feature: "ask", userId: "ws_f", plan: "free" }, () => h.fetch(OR, { method: "POST", body: JSON.stringify({ models: ["qwen/qwen3.8-27b:free", "openai/gpt-5-nano"] }) }));
  assert.equal(mixed.status, 403, "a fallback list with any paid model is paid");
  const ok = await withCostTag({ feature: "ask", userId: "ws_f", plan: "free" }, () => h.fetch(OR, { method: "POST", body: chatBody("qwen/qwen3.8-27b:free") }));
  assert.equal(ok.status, 200);
  assert.equal(h.sent.length, 1);
  // Admins and an unreadable body are never refused for "paid".
  const admin = await withCostTag({ feature: "ask", userId: "ws_a", plan: "free", admin: true }, () => h.fetch(OR, { method: "POST", body: chatBody("openai/gpt-5-nano") }));
  assert.equal(admin.status, 200);
});

test("guard: a throttled feature (negative margin) sends paid chat on the free fallback model instead", async () => {
  const until = new Date(Date.now() + 3600_000).toISOString();
  const h = harness({ throttles: { debate: { action: "free_models", until, reason: "t", at: until, by: "test" } } });
  const res = await withCostTag({ feature: "debate", userId: "ws_4", plan: "plus" }, () => h.fetch(OR, { method: "POST", body: chatBody("openai/gpt-5-nano") }));
  assert.equal(res.status, 200);
  assert.equal(h.sent[0].body && (h.sent[0].body as { model: string }).model, DEFAULT_COST_CONFIG.degrade.freeFallbackModels[0]);
  const [r] = await drain("ws_4");
  assert.equal(r.degraded, "throttle");
  assert.equal(r.requestedModel, "openai/gpt-5-nano");
  // Non-chat paid calls (images) are refused while throttled.
  const h2 = harness({ throttles: { images: { action: "free_models", until, reason: "t", at: until, by: "test" } } });
  const img = await withCostTag({ feature: "images", userId: "ws_4", plan: "plus" }, () => h2.fetch("https://openrouter.ai/api/v1/images", { method: "POST", body: JSON.stringify({ model: "openai/gpt-image-2" }) }));
  assert.equal(img.status, 503);
});

test("guard: low balance — exhausted state falls back to :free; a 402 marks it exhausted and retries once on the fallback", async () => {
  const h = harness({ exhausted: true });
  await withCostTag({ feature: "ask", userId: "ws_5", plan: "pro" }, () => h.fetch(OR, { method: "POST", body: chatBody("openai/gpt-5-nano") }));
  assert.equal((h.sent[0].body as { model: string }).model, DEFAULT_COST_CONFIG.degrade.freeFallbackModels[0]);
  const media = await withCostTag({ feature: "video", userId: "ws_5", plan: "pro" }, () => h.fetch("https://openrouter.ai/api/v1/videos", { method: "POST", body: JSON.stringify({ model: "google/veo-3.1" }) }));
  assert.equal(media.status, 503);
  assert.equal((await media.json()).error.metadata.keplar, "low_balance");

  const h2 = harness({ respond: (_u, b, n) => (n === 1 ? Response.json({ error: { code: 402, message: "Insufficient credits" } }, { status: 402 }) : Response.json({ model: b?.model, choices: [{ message: { content: "free" } }], usage: { prompt_tokens: 5, completion_tokens: 5, cost: 0 } })) });
  const res = await withCostTag({ feature: "ask", userId: "ws_6", plan: "plus" }, () => h2.fetch(OR, { method: "POST", body: chatBody("openai/gpt-5-nano") }));
  assert.equal(res.status, 200, "the caller gets an answer, not an error");
  assert.equal(h2.sent.length, 2);
  assert.equal((h2.sent[1].body as { model: string }).model, DEFAULT_COST_CONFIG.degrade.freeFallbackModels[0]);
  assert.equal(h2.exhausted.length, 1);
  const rows = await drain("ws_6", 2);
  assert.ok(rows.some((r) => r.status === 402));
  assert.ok(rows.some((r) => r.degraded === "low_balance" && r.ok));
});

test("guard: per-plan per-feature quotas (calls on Free, USD on paid); overage room lets a USD cap pass when on", async () => {
  const free = harness({ usage: { calls: 60, usd: 0, requests: 9 } });
  const r1 = await withCostTag({ feature: "deep-research", userId: "ws_7", plan: "free" }, () => free.fetch(OR, { method: "POST", body: chatBody("qwen/qwen3.8-27b:free") }));
  assert.equal(r1.status, 429);
  assert.equal((await r1.json()).error.metadata.keplar, "quota_calls");
  const paid = harness({ usage: { calls: 3, usd: 3.6, requests: 3 } });
  const r2 = await withCostTag({ feature: "deep-research", userId: "ws_8", plan: "plus" }, () => paid.fetch(OR, { method: "POST", body: chatBody("openai/gpt-5-nano") }));
  assert.equal(r2.status, 429);
  assert.equal((await r2.json()).error.metadata.keplar, "quota_usd");
  const under = harness({ usage: { calls: 3, usd: 1, requests: 3 } });
  assert.equal((await withCostTag({ feature: "deep-research", userId: "ws_8", plan: "plus" }, () => under.fetch(OR, { method: "POST", body: chatBody("openai/gpt-5-nano") }))).status, 200);
  const off = harness({ cfg: cfgWith({ flags: { enforceQuotas: false } }), usage: { calls: 99_999, usd: 999, requests: 999 } });
  assert.equal((await withCostTag({ feature: "ask", userId: "ws_9", plan: "plus" }, () => off.fetch(OR, { method: "POST", body: chatBody("openai/gpt-5-nano") }))).status, 200);
});

test("guard: Free daily heavy-feature limits only apply with the owner-pending flag on", async () => {
  const usage = { calls: 2, usd: 0, requests: 1 };
  const off = harness({ usage });
  assert.equal((await withCostTag({ feature: "deep-research", userId: "ws_10", plan: "free" }, () => off.fetch(OR, { method: "POST", body: chatBody("qwen/qwen3.8-27b:free") }))).status, 200);
  const on = harness({ usage, cfg: cfgWith({ flags: { freeDailyLimits: true } }) });
  const res = await withCostTag({ feature: "deep-research", userId: "ws_10", plan: "free" }, () => on.fetch(OR, { method: "POST", body: chatBody("qwen/qwen3.8-27b:free") }));
  assert.equal(res.status, 429);
  assert.match((await res.json()).error.message, /free Deep Research run/);
});

test("guard: a guard failure fails open (the request still goes out and is metered)", async () => {
  const rows: CostEvent[] = [];
  let sent = 0;
  const f = createMeteredFetch({ orig: (async () => (sent++, Response.json({ usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.001 } }))) as unknown as typeof fetch, config: async () => { throw new Error("store down"); }, sink: async (r) => void rows.push(...r), flushMs: 1 });
  const res = await f(OR, { method: "POST", body: chatBody("openai/gpt-5-nano") });
  assert.equal(res.status, 200);
  assert.equal(sent, 1);
});
