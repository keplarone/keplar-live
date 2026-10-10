import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { engineDeps, orchestrate } from "@/lib/orchestration/orchestrator";
import { HeuristicClassifier } from "@/lib/orchestration/classifier";
import { createRetriever } from "@/lib/orchestration/retriever";
import { liveEnv } from "@/lib/orchestration/config";
import { POOL_KEY } from "@/lib/orchestration/pool-governor";
import { dayOf, usedToday } from "@/lib/usage/daily";
import {
  budgetSkipped, claimFromCheck, extractCheckableClaims, FREE_NOTE, isFactualQuestion, NONE_NOTE, OFF_NOTE, signSourcing, sourcingFromChecks, sourcingGate, verifySourcing,
} from "@/lib/orchestration/sourcing";
import type { Classification, KeplarAnswer, KeplarRequest, Retriever, VerificationCheck } from "@/lib/orchestration/types";

process.env.BETTER_AUTH_SECRET ||= "test-secret-for-sessions-0123456789abcdefghij";
const cls = (o: Partial<Classification> = {}): Classification => ({ kind: "factual", complexity: "simple", capabilities: [], estimatedInputTokens: 10, estimatedOutputTokens: 50, needsWeb: false, rationale: "", ...o });
const ANSWER = "The Eiffel Tower was completed in 1889 for the World's Fair in Paris. It was designed by the engineering firm of Gustave Eiffel. It is a landmark that many people like to visit.\n\n- The tower is 330 metres tall including its antennas.\n- I think it looks nice.\n\n```js\nconst year = 1889;\n```";

test("claims are picked from the written answer by code: facts with names/numbers, not opinions, questions or code", () => {
  const c = extractCheckableClaims(ANSWER);
  assert.ok(c.length >= 2 && c.length <= 3);
  assert.ok(c.some((x) => x.text.includes("1889")));
  assert.ok(c.every((x) => !/I think/.test(x.text) && !/const year/.test(x.text)));
  assert.ok(c.every((x) => ANSWER.includes(x.text.slice(0, 30))), "every claim is the answer's own words");
  assert.deepEqual(extractCheckableClaims("It depends on many things, and you should think about what matters most to you."), []);
  assert.deepEqual(extractCheckableClaims(""), []);
  assert.equal(extractCheckableClaims(ANSWER, 1).length, 1);
});

test("gate: factual + paid + retriever runs; Free, signed-out, Sensitive and flag-off explain why nothing ran; other questions say nothing", () => {
  const base = { classification: cls(), req: {}, hasRetriever: true };
  assert.deepEqual(sourcingGate({ ...base, plan: "plus" }), { run: true });
  assert.deepEqual(sourcingGate({ ...base, plan: "business" }), { run: true });
  const free = sourcingGate({ ...base, plan: "free" });
  assert.equal(free.run, false);
  assert.equal(!free.run && free.sourcing?.state, "free_plan");
  assert.equal(!free.run && free.sourcing?.note, FREE_NOTE);
  assert.equal(sourcingGate({ ...base, plan: undefined }).run, false);
  const sens = sourcingGate({ ...base, plan: "pro", req: { routing: { tier: "sensitive" } } });
  assert.equal(!sens.run && sens.sourcing?.state, "not_enabled");
  const off = sourcingGate({ ...base, plan: "pro", hasRetriever: false });
  assert.equal(!off.run && off.sourcing?.note, OFF_NOTE);
  const code = sourcingGate({ ...base, plan: "pro", classification: cls({ kind: "code" }) });
  assert.deepEqual(code, { run: false }, "not a factual question: no block at all");
  assert.equal(isFactualQuestion(cls({ kind: "general" }), { modes: { web: true } }), true);
  assert.equal(isFactualQuestion(cls({ kind: "general" }), {}), false);
});

const check = (o: Partial<VerificationCheck>): VerificationCheck => ({ kind: "web", finding: "f", models: [], outcome: "supported", resolution: "Pages agree.", sources: [{ title: "Britannica", url: "https://www.britannica.com/topic/Eiffel-Tower-Paris-France" }], ...o });

test("support states: a claim with no retrieved page is 'no source' whatever a model said; unsafe links are dropped", () => {
  assert.equal(claimFromCheck(check({ outcome: "supported", sources: [] })).support, "no_source");
  assert.equal(claimFromCheck(check({ outcome: "supported", sources: undefined })).support, "no_source");
  assert.equal(claimFromCheck(check({})).support, "supported");
  assert.equal(claimFromCheck(check({ outcome: "contradicted" })).support, "contradicted");
  assert.equal(claimFromCheck(check({ outcome: "inconclusive" })).support, "unsettled");
  const evil = claimFromCheck(check({ sources: [{ title: "x", url: "javascript:alert(1)" }, { title: "y", url: "https://user:pw@example.com/a#frag" }, { title: "dup", url: "https://example.com/a" }] }));
  assert.deepEqual(evil.sources.map((s) => s.url), ["https://example.com/a"], "no javascript: links, no credentials, no fragments, no duplicates");
  assert.equal(claimFromCheck(check({ outcome: "inconclusive", sources: [] })).finding, "", "no finding is shown for a claim without a page");
});

test("card data: says plainly when no source was found; counts supported claims; never claims a check that did not return pages", () => {
  const at = "2026-10-04T12:00:00.000Z";
  const none = sourcingFromChecks([check({ sources: [] }), check({ outcome: "inconclusive", sources: [] })], [{ id: "a", text: "A" }, { id: "b", text: "B" }], { engine: "exa", at });
  assert.equal(none.state, "no_sources");
  assert.equal(none.note, NONE_NOTE);
  assert.ok(none.claims.every((c) => c.support === "no_source"));
  const some = sourcingFromChecks([check({}), check({ outcome: "inconclusive" }), check({ sources: [] })], [{ id: "a", text: "Claim A" }, { id: "b", text: "Claim B" }, { id: "c", text: "Claim C" }], { engine: "exa", at });
  assert.equal(some.state, "checked");
  assert.match(some.note, /^1 of 3 checked claims are supported/);
  assert.deepEqual(some.claims.map((c) => [c.text, c.support]), [["Claim A", "supported"], ["Claim B", "unsettled"], ["Claim C", "no_source"]]);
  assert.equal(some.engine, "exa");
});

test("signature: only the server's own check verifies; tampering, another answer id or a not-run state does not", () => {
  const s = sourcingFromChecks([check({})], [{ id: "a", text: "Claim A" }], { engine: "exa", at: "2026-10-04T12:00:00.000Z" });
  const signed = signSourcing("ans_1", s);
  assert.ok(signed.sig);
  assert.equal(verifySourcing("ans_1", signed), true);
  assert.equal(verifySourcing("ans_2", signed), false);
  assert.equal(verifySourcing("ans_1", { ...signed, claims: [{ ...signed.claims[0], text: "Something else" }] }), false);
  assert.equal(verifySourcing("ans_1", { ...signed, claims: [{ ...signed.claims[0], support: "supported", sources: [...signed.claims[0].sources, { title: "spam", url: "https://spam.example/" }] }] }), false);
  assert.equal(verifySourcing("ans_1", { ...signed, sig: "00" }), false);
  assert.equal(verifySourcing("ans_1", s), false, "unsigned");
  assert.equal(signSourcing("ans_1", budgetSkipped()).sig, undefined, "a skipped check is never signed");
  assert.equal(verifySourcing(undefined, signed), false);
});

/* ─────────────── end to end through the pipeline, with a recording retriever and a stubbed model API ─────────────── */

const FAKE = { OPENROUTER_API_KEY: "sk-or-test", OPENAI_API_KEY: "sk-test", NVIDIA_API_KEY: "nvapi-test", KEPLAR_LIVE_MODELS: "1" };
async function withEnv<T>(vars: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) { prev[k] = process.env[k]; process.env[k] = v; }
  try { return await fn(); } finally { for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}
const SYNTH = "The Eiffel Tower was completed in 1889 for the World's Fair in Paris. It was designed by the engineering firm of Gustave Eiffel.\nRESOLUTION: No disagreement.";
function stub() {
  const realFetch = globalThis.fetch;
  let modelCalls = 0;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const body = JSON.parse(String(init?.body ?? "{}")) as { model: string; messages: { role: string; content: string }[] };
    const sys = body.messages[0].content;
    if (u.includes("nvidia")) return new Response("{}", { status: 403 });
    modelCalls++;
    let content: string;
    if (sys.startsWith("You are Keplar's response classifier")) {
      const n = (body.messages[1].content.match(/### R\d+/g) ?? []).length;
      content = JSON.stringify({ topic: "Eiffel Tower", positions: [{ id: "P1", label: "Completed 1889", summary: "Completed in 1889." }], responses: Array.from({ length: n }, (_, i) => ({ id: `R${i + 1}`, kind: "answer", position: "P1" })), claims: [] });
    } else if (sys.startsWith("You are Keplar's verifier")) content = JSON.stringify({ checks: [], disputed: [] });
    else if (sys.startsWith("You are Keplar's judge-tier synthesizer writing a DRAFT")) content = "Draft: 1889.";
    else if (sys.startsWith("You are Keplar's judge-tier synthesizer")) content = SYNTH;
    else content = "The Eiffel Tower was completed in 1889 and designed by Gustave Eiffel's firm.";
    return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.0001 } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { restore: () => { globalThis.fetch = realFetch; }, calls: () => modelCalls };
}
function recorder(sources = true): Retriever & { seen: string[][] } {
  const seen: string[][] = [];
  return {
    name: "openrouter-web:exa", live: true, seen,
    async check({ claims }) {
      seen.push(claims.map((c) => c.text));
      return { checks: claims.map((c) => check({ finding: c.text, sources: sources ? [{ title: "Britannica", url: "https://www.britannica.com/topic/Eiffel-Tower-Paris-France" }] : [] })), costUsd: 0.01 };
    },
  };
}
const Q = "When was the Eiffel Tower completed and who designed it?";
async function ask(deps: NonNullable<ReturnType<typeof engineDeps>>, req: KeplarRequest) {
  let a: KeplarAnswer | null = null;
  for await (const e of orchestrate(req, deps)) if (e.type === "answer") a = e.answer;
  return a!;
}

test("pipeline: the question is factual for the real classifier", async () => {
  const c = await new HeuristicClassifier().classify({ prompt: Q });
  assert.equal(isFactualQuestion(c, {}), true);
});

test("pipeline, paid plan: the claims of the written answer are searched, the card gets signed per-claim states and links, the cost is metered", async () => {
  const s = stub();
  try {
    const r = recorder();
    const a = await withEnv(FAKE, async () => ask({ ...engineDeps()!, retriever: r }, { prompt: Q, plan: "plus", computeRemaining: 1e6, limits: { maxRequestUsd: 5, maxDeepResearchUsd: 5 } }));
    assert.equal(r.seen.length, 1, "one source check ran");
    assert.ok(r.seen[0].length >= 1 && r.seen[0].length <= 3);
    assert.ok(r.seen[0].every((t) => a.markdown.includes(t.slice(0, 25))), "claims are taken from the answer the person reads");
    assert.equal(a.sourcing?.state, "checked");
    assert.equal(a.sourcing?.claims[0].support, "supported");
    assert.match(a.sourcing!.claims[0].sources[0].url, /^https:\/\/www\.britannica\.com\//);
    assert.equal(verifySourcing(a.id, a.sourcing), true, "signed for this answer");
    assert.ok(!a.sources.some((x) => x.title === "Web search"), "the 'web retrieval isn't live' note is gone once a search ran");
  } finally { s.restore(); }
});

test("pipeline, paid plan, no page found: says so and shows no support state it did not earn", async () => {
  const s = stub();
  try {
    const a = await withEnv(FAKE, async () => ask({ ...engineDeps()!, retriever: recorder(false) }, { prompt: Q, plan: "pro", computeRemaining: 1e6 }));
    assert.equal(a.sourcing?.state, "no_sources");
    assert.equal(a.sourcing?.note, NONE_NOTE);
    assert.ok(a.sourcing!.claims.every((c) => c.support === "no_source" && c.sources.length === 0));
  } finally { s.restore(); }
});

test("pipeline, FREE: no search, no extra request, the shared pool only counts the model calls, the card says source checks are on paid plans", async () => {
  const s = stub();
  try {
    const r = recorder();
    const day = dayOf(new Date());
    const before = await usedToday(POOL_KEY, day);
    // the real Free dependencies carry no retriever at all, even with the flag on
    const freeDeps = await withEnv({ ...FAKE, KEPLAR_RETRIEVAL_ENABLED: "true" }, async () => engineDeps({ keyTier: "free" }));
    assert.equal(freeDeps?.retriever ?? null, null, "Free never gets a retriever");
    assert.equal(liveEnv("free").retrievalEnabled, false);
    // and even if one were injected, the plan gate refuses it
    const a = await withEnv(FAKE, async () => ask({ ...engineDeps({ keyTier: "free" })!, retriever: r }, { prompt: Q, plan: "free" }));
    assert.equal(r.seen.length, 0, "the retriever was never called for a Free question");
    assert.equal(a.sourcing?.state, "free_plan");
    assert.equal(a.sourcing?.note, FREE_NOTE);
    assert.equal(a.sourcing?.sig, undefined);
    assert.equal((await usedToday(POOL_KEY, day)) - before, s.calls(), "every pool request is a model call; sourcing added none");
  } finally { s.restore(); }
});

test("pipeline, allowance too small: the check is skipped and labelled, the answer is still delivered", async () => {
  const s = stub();
  try {
    const r = recorder();
    // what the answer alone is planned at: ask with nothing left and read the "limit" event
    let base = 0;
    await withEnv(FAKE, async () => { for await (const e of orchestrate({ prompt: Q, plan: "plus", computeRemaining: 0 }, { ...engineDeps()!, retriever: null })) if (e.type === "limit") base = e.required; });
    assert.ok(base > 0);
    const a = await withEnv(FAKE, async () => ask({ ...engineDeps()!, retriever: r }, { prompt: Q, plan: "plus", computeRemaining: base }));
    assert.ok(a.markdown.length > 20, "answered");
    assert.equal(r.seen.length, 0, "no search was paid for");
    assert.equal(a.sourcing?.state, "budget");
    assert.equal(a.sourcing?.sig, undefined);
    // with room for the searches it runs
    const b = await withEnv(FAKE, async () => ask({ ...engineDeps()!, retriever: r }, { prompt: Q, plan: "plus", computeRemaining: base + 1e6 }));
    assert.equal(b.sourcing?.state, "checked");
  } finally { s.restore(); }
});

test("flag off (no retriever): paid plan factual answers say the check is BETA and not switched on", async () => {
  const s = stub();
  try {
    const a = await withEnv(FAKE, async () => ask({ ...engineDeps()!, retriever: null }, { prompt: Q, plan: "plus", computeRemaining: 1e6 }));
    assert.equal(a.sourcing?.state, "not_enabled");
    assert.match(a.sourcing!.note, /BETA/);
    assert.equal(createRetriever(liveEnv("paid")), null, "off unless KEPLAR_RETRIEVAL_ENABLED=true");
  } finally { s.restore(); }
});

test("shared pages: a signed source check for this answer is kept; forged, edited or other-answer checks are dropped", async () => {
  const { signIn, jsonReq } = await import("./helpers/session");
  const { POST } = await import("../src/app/api/share/route");
  const { openShare } = await import("../src/lib/growth/share");
  const u = await signIn("src-share@example.com", "plus");
  const real = signSourcing("ans_real", sourcingFromChecks([check({})], [{ id: "a", text: "The Eiffel Tower was completed in 1889." }], { engine: "exa", at: "2026-10-04T12:00:00.000Z" }));
  const body = (id: string, sourcing: unknown) => ({ consent: true, includeQuestion: false, answer: { id, markdown: "The Eiffel Tower was completed in 1889 in Paris.", consensus: { level: "single", agree: 1, disagree: 0, responded: 1, consulted: 1 }, models: [], disagreements: [], sourcing } });
  const make = async (b: unknown) => {
    const res = await POST(jsonReq(u.cookie, "/api/share", "POST", b));
    assert.equal(res.status, 201);
    return (await openShare(((await res.json()) as { token: string }).token))!;
  };
  assert.equal((await make(body("ans_real", real))).sourcing?.claims[0].sources[0].title, "Britannica");
  assert.equal((await make(body("ans_other", real))).sourcing, undefined, "bound to its answer id");
  assert.equal((await make(body("ans_real", { ...real, claims: [{ ...real.claims[0], sources: [{ title: "Spam", url: "https://spam.example/" }] }] }))).sourcing, undefined, "edited");
  assert.equal((await make(body("ans_real", { state: "checked", note: "1 of 1 supported", claims: [{ text: "x", support: "supported", finding: "", sources: [{ title: "t", url: "https://x.example/" }] }] }))).sourcing, undefined, "made up in the browser");
  assert.equal((await make(body("ans_real", { ...real, state: "free_plan" }))).sourcing, undefined, "a not-run state is never shown on shared pages");
});
