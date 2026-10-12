import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { guardDisagreement, stripDisagreementSection } from "@/lib/orchestration/disagreement-guard";
import { exactCheck, exactNote } from "@/lib/orchestration/exact";
import { HeuristicClassifier } from "@/lib/orchestration/classifier";
import { CostAwareRouter } from "@/lib/orchestration/router";
import { freeRoster } from "@/lib/orchestration/live-catalog";
import { modelStatusSentence, summarizeModels } from "@/lib/orchestration/model-status";
import { ModelSynthesizer } from "@/lib/orchestration/live-synthesizer";
import { EvidenceWeightedComparator } from "@/lib/orchestration/comparator";
import { engineDeps, hedgeTuning, orchestrate } from "@/lib/orchestration/orchestrator";
import { FREE_UPGRADE_HINT } from "@/lib/upgrade-copy";
import { FREE_NO_RESPONSE_MESSAGE } from "@/lib/orchestration/no-response";
import { FREE_BUSY_MESSAGE } from "@/lib/orchestration/providers";
import type { ConsultedModel, KeplarAnswer, KeplarEvent, ProviderResult } from "@/lib/orchestration/types";

// ---------- (1) never invent disagreement ----------

const BODY = "Use PostgreSQL. It is the safer default for a small team.";
const SECTIONS = [
  `${BODY}\n\n**Where the models disagree**\nOne model argued for managed NoSQL.\n\nIt is still a good default.`.replace("\n\nIt is still", "\n\n**Bottom line**\nIt is still"),
  `${BODY}\n\n## Where the models disagree\n- One argued for NoSQL.\n- Another did not.`,
  `${BODY}\n\n**Where the models disagree:** one position favors managed NoSQL.\n\n**Bottom line**\nPostgreSQL.`,
  `${BODY}\n\n__Where models disagree__\nSomething.`,
];

test("no split found: the 'Where the models disagree' section is removed in every shape, the rest is kept", () => {
  for (const md of SECTIONS) {
    const out = guardDisagreement(md, { positions: 1 });
    assert.ok(!/disagree/i.test(out), out);
    assert.ok(out.startsWith(BODY));
  }
  assert.equal(guardDisagreement(SECTIONS[0], { positions: 0 }).includes("**Bottom line**"), true, "text after the section survives");
  assert.ok(!guardDisagreement(SECTIONS[2], { positions: 1 }).includes("NoSQL"));
});

test("a real split keeps the section untouched; other sections and unrelated headings are never removed", () => {
  for (const md of SECTIONS) assert.equal(guardDisagreement(md, { positions: 2 }), md);
  const counter = `${BODY}\n\n**Strongest counterargument**\nManaged NoSQL scales out more easily.`;
  assert.equal(stripDisagreementSection(counter), counter);
  const experts = "Overview.\n\n## Where economists disagree\nOn inflation targets.";
  assert.equal(stripDisagreementSection(experts), experts, "only the models' disagreement, not a topic the user asked about");
  assert.equal(stripDisagreementSection("Models disagree with each other rarely."), "Models disagree with each other rarely.");
  assert.equal(stripDisagreementSection(stripDisagreementSection(SECTIONS[1])), stripDisagreementSection(SECTIONS[1]));
});

test("the synthesizer applies the guard: one position strips the section, two positions keep it", async () => {
  const [m1, m2] = freeRoster;
  const written = `Use PostgreSQL.\n\n**Where the models disagree**\nOne model argued for NoSQL.\n\nRESOLUTION: weighed.`;
  const registry = { generate: async () => ({ ok: true, text: written, model: m1, modelId: m1.id, latencyMs: 1, usage: { inputTokens: 1, outputTokens: 1 }, stance: "x", claims: [] }) } as never;
  const mk = (stances: [string, string]) => {
    const results: ProviderResult[] = [m1, m2].map((m, i) => ({ ok: true, modelId: m.id, stance: stances[i], claims: [], text: `t${i}`, latencyMs: 1, usage: { inputTokens: 1, outputTokens: 1 } }));
    const comparison = new EvidenceWeightedComparator().compare(results);
    return { results, comparison };
  };
  const run = async (stances: [string, string]) => {
    const { results, comparison } = mk(stances);
    const s = new ModelSynthesizer(registry, m1);
    const plan = { mode: "consensus", panel: [m1, m2].map((model) => ({ model, slot: "panel", covers: "Reasoning", reason: "" })), verifier: null, judge: null, estimate: { breakdown: [] }, rationale: "" } as never;
    const verification = { mode: "cross-model", checks: [], disputed: [], checked: 0, supported: 0, removed: [], notes: [] } as never;
    const classification = { kind: "general", complexity: "moderate", capabilities: [], estimatedInputTokens: 1, estimatedOutputTokens: 1, needsWeb: false, rationale: "" } as never;
    const out = await s.synthesize({ req: { prompt: "pg or nosql?", plan: "free" }, classification, plan, results, comparison, verification, onDelta: () => {}, signal: undefined } as never);
    return out as unknown as KeplarAnswer;
  };
  const same = await run(["postgres", "postgres"]);
  assert.ok(!/disagree/i.test(same.markdown), same.markdown);
  assert.equal(same.disagreements.length, 0);
  const split = await run(["postgres", "nosql"]);
  assert.match(split.markdown, /Where the models disagree/);
  assert.equal(split.disagreements.length, 1);
});

// ---------- (3) counting / arithmetic / exact facts ----------

test("exact checker: letter counts, totals, vowels and arithmetic are computed by code (never by a model)", () => {
  assert.match(exactCheck("How many r's are in strawberry?")!.statement, /"r" appears 3 times in "strawberry"/);
  assert.match(exactCheck("How many times does the letter e appear in 'excellence'?")!.statement, /4 times/);
  assert.match(exactCheck("count the letter s in Mississippi")!.statement, /4 times/);
  assert.match(exactCheck("How many letters are in 'Keplar'?")!.statement, /6 letters/);
  assert.match(exactCheck("how many vowels are in the word education")!.statement, /5 vowels/);
  assert.match(exactCheck("What is 17*23?")!.statement, /= 391/);
  assert.match(exactCheck("What's 1,234 + 5,678?")!.statement, /= 6,912/);
  assert.match(exactCheck("12 / 4 + 3^2")!.statement, /= 12 /);
  assert.match(exactCheck("(3+4)*5")!.statement, /= 35/);
  assert.match(exactCheck("15% of 80")!.statement, /= 12/);
  // the 9-vs-7 style question: a long sentence, counted exactly
  const sentence = "the quick brown fox jumps over the lazy dog while the others sleep";
  const n = [...sentence].filter((c) => c === "e").length;
  assert.match(exactCheck(`How many times does the letter e appear in "${sentence}"?`)!.statement, new RegExp(`${n} times`));
  for (const q of ["how many people live in Japan?", "What is 2+", "1/0", "write a poem about 2+2", "tell me about strawberries"]) assert.equal(exactCheck(q), null, q);
  // primality is now checked by code too (tests/exact-numbers.test.ts)
  assert.match(exactCheck("Is 7 prime?")!.statement, /7 is a prime number/);
  assert.match(exactNote(exactCheck("17*23")!), /Verified by Keplar's exact checker/);
});

test("simple but error-prone questions are not left to one model: counting, arithmetic and exact facts get a small panel", () => {
  const c = new HeuristicClassifier();
  for (const prompt of ["How many r's are in strawberry?", "What is 17*23?", "Count the letter s in Mississippi", "What year did World War II end?", "How many people live in Japan?"]) {
    const k = c.classify({ prompt, plan: "free" });
    assert.ok(k.errorProne, prompt);
    assert.equal(k.complexity, "moderate", prompt);
  }
  assert.equal(c.classify({ prompt: "What is the capital of France?", plan: "free" }).errorProne, undefined);
  assert.equal(c.classify({ prompt: "hello", plan: "free" }).complexity, "simple");
  const router = new CostAwareRouter(freeRoster);
  for (const prompt of ["How many r's are in strawberry?", "What year did World War II end?"]) {
    const req = { prompt, plan: "free" as const };
    const plan = router.route(c.classify(req), req);
    assert.equal(plan.mode, "consensus", prompt);
    assert.equal(plan.panel.length, 2, `${prompt}: two models, within the Free panel cap`);
  }
  const plain = { prompt: "What is the capital of France?", plan: "free" as const };
  assert.equal(router.route(c.classify(plain), plain).mode, "single", "an ordinary simple question stays on one fast model");
});

// ---------- (2) which models answered ----------

const model = (over: Partial<ConsultedModel>): ConsultedModel => ({ id: "m", name: "M", provider: "p", slot: "panel", status: "responded", ...over });

test("model status: says plainly who answered, who did not and why, and who stood in", () => {
  const s = summarizeModels([
    model({ id: "a", name: "Qwen" }),
    model({ id: "b", name: "Dots", note: "Stood in for Gemma, which was slow to answer." }),
    model({ id: "c", name: "Gemma", status: "failed", note: "Didn't answer within the shared latency budget. Excluded from consensus, not counted as dissent." }),
    model({ id: "v", name: "Nemotron", slot: "verifier" }),
  ]);
  assert.deepEqual(s.answered, ["Qwen", "Dots"]);
  assert.deepEqual(s.missing, [{ name: "Gemma", why: "ran out of time" }]);
  const t = modelStatusSentence(s);
  assert.match(t, /2 of 3 models answered \(Qwen and Dots\)\./);
  assert.match(t, /Gemma ran out of time/);
  assert.match(t, /Dots answered in place of Gemma/);
  assert.match(t, /not counted as a vote/);
  assert.equal(modelStatusSentence(summarizeModels([model({ id: "a" }), model({ id: "b" })])), "", "nothing to say when everyone answered");
  assert.equal(summarizeModels([model({ status: "failed", note: "Rate limited after retries." })]).missing[0].why, "was busy (free models have rate limits)");
  assert.equal(summarizeModels([model({ status: "refused" })]).missing[0].why, "declined to answer");
});

// ---------- end to end on the Free engine (stubbed network) ----------

const KEYS = { OPENROUTER_API_KEY: "sk-or-test", KEPLAR_LIVE_MODELS: "1" };
async function withFreeEngine<T>(handler: (body: { model: string; messages: { role: string; content: unknown }[] }, init: RequestInit | undefined) => Promise<Response> | Response, fn: () => Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(KEYS)) { prev[k] = process.env[k]; process.env[k] = v; }
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => handler(JSON.parse(String(init?.body ?? "{}")), init)) as typeof fetch;
  try { return await fn(); } finally {
    globalThis.fetch = realFetch;
    for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}
const ok = (m: string, text: string) => new Response(JSON.stringify({ model: m, choices: [{ message: { content: text }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 } }), { status: 200 });
const textOf = (b: { messages: { content: unknown }[] }) => b.messages.map((x) => (typeof x.content === "string" ? x.content : JSON.stringify(x.content))).join("\n");

async function ask(prompt: string) {
  const events: KeplarEvent[] = [];
  for await (const e of orchestrate({ prompt, plan: "free", computeRemaining: 1e6 }, engineDeps({ keyTier: "free" })!)) events.push(e);
  const a = events.find((e): e is Extract<KeplarEvent, { type: "answer" }> => e.type === "answer")?.answer ?? null;
  return { events, a };
}

test("a slow free model: a different free model stands in while it is still running, and the answer says so", async () => {
  const prev = { ...hedgeTuning };
  Object.assign(hedgeTuning, { minMs: 60, factor: 0.2, windowMs: 3000 });
  const asked: string[] = [];
  let stalled: string | null = null;
  const question = "Should a small bakery switch to a four-day week? Weigh the trade-offs carefully.";
  try {
    await withFreeEngine(
      (body, init) => {
        const t = textOf(body);
        if (t.includes("four-day week") && !t.includes("Positions") && !t.includes("Responses")) {
          asked.push(body.model);
          if (stalled === null) {
            stalled = body.model;
            return new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))));
          }
        }
        return ok(body.model, `Answer from ${body.model}: a four-day week can work if hours are protected.`);
      },
      async () => {
        const t0 = Date.now();
        const { a } = await ask(question);
        assert.ok(a, "an answer was produced");
        assert.ok(Date.now() - t0 < 20_000);
        const panel = a!.models.filter((m) => m.slot === "panel");
        assert.ok(panel.length >= 2);
        assert.ok(panel.every((m) => m.status === "responded"), JSON.stringify(panel));
        assert.ok(!panel.some((m) => m.id === stalled), "the slow model is replaced by the stand-in in the list");
        assert.ok(panel.some((m) => m.note?.startsWith("Stood in for ")), "the stand-in is named honestly");
        assert.match(modelStatusSentence(summarizeModels(a!.models)), /answered in place of/);
      },
    );
  } finally {
    Object.assign(hedgeTuning, prev);
  }
});

test("a bare counting or arithmetic question is answered instantly by the exact checker: correct, no model asked, no charge", async () => {
  const seen: string[] = [];
  await withFreeEngine(
    (body) => {
      seen.push(body.model);
      return ok(body.model, "The letter r appears 3 times in strawberry.");
    },
    async () => {
      const { a } = await ask("How many r's are in strawberry?");
      assert.ok(a);
      assert.match(a!.markdown, /appears 3 times in "strawberry"/);
      assert.match(a!.markdown, /Worked out by code, not by an AI model/);
      const m = await ask("What is 12 times 9?");
      assert.match(m.a!.markdown, /12 times 9 = 108/);
      assert.deepEqual(seen, [], "no model call for either question");
      assert.equal(a!.consensus.consulted, 1);
      assert.deepEqual(a!.models, []);
    },
  );
});

test("the exact checker answers alone only for bare questions; files, images or a mode still go to the models with the verified result", async () => {
  const { instantExact } = await import("@/lib/orchestration/orchestrator");
  assert.match(instantExact({ prompt: "What is 12 times 9?" }) ?? "", /= 108/);
  assert.equal(instantExact({ prompt: "What is 12 times 9?", modes: { reason: true } }), null);
  assert.equal(instantExact({ prompt: "What is 12 times 9?", attachments: [{ name: "a.txt", type: "text/plain", text: "x" }] as never }), null);
  assert.equal(instantExact({ prompt: "What is 12 times 9?", media: { kind: "image" } as never }), null);
  assert.equal(instantExact({ prompt: "Explain why 12 times 9 is 108 and how to check it" }), null, "anything beyond the calculation goes to the models");
  assert.equal(instantExact({ prompt: "hi" }), null);
});

// ---------- (4) the next plan above Free is Lite ----------

test("every Free-facing limit message names Lite first, then Plus", async () => {
  assert.match(FREE_UPGRADE_HINT, /Lite.*Plus/);
  assert.match(FREE_NO_RESPONSE_MESSAGE, /Lite, Plus and Pro/);
  assert.match(FREE_BUSY_MESSAGE, /upgrade to Lite/);
  assert.ok(!/Plus/.test(FREE_BUSY_MESSAGE));
  const { claimDaily, dailySubjects, DailyLimitError } = await import("@/lib/usage/daily");
  const s = dailySubjects({ workspaceId: "ws_next_plan", anonymous: false, ip: "10.8.8.8", cookie: null, secure: true, limit: 1, ipLimit: 100 });
  await claimDaily(s);
  await assert.rejects(() => claimDaily(s), (e: unknown) => e instanceof DailyLimitError && /Upgrade to Lite for more, or Plus for the most\./.test(e.message ?? "") && !/Upgrade for more\./.test(e.message));
});
