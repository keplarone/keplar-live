/** Harness self-tests. Run: node --import tsx --test bench/tests/*.test.ts (offline; fetch is stubbed to fail). */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { ARMS, SEED, TIERS } from "../lib/config";
import { estimate } from "../lib/estimate";
import { parseHleVerdict, parseSimpleQaVerdict } from "../lib/grade";
import { loadDataset } from "../lib/loaders";
import { extractLetter, isDecline, parseAnswer } from "../lib/parse";
import { agreementOf, blockedUrl, keplarConfidence } from "../lib/pipeline";
import { BENCH_DIR } from "../lib/prompts";
import { OpenRouterBenchProvider } from "../lib/providers";
import { makeSplit, syntheticFill } from "../lib/sampling";
import { CapExceededError, SpendGuard } from "../lib/spend";
import * as S from "../lib/stats";
import type { Item } from "../lib/types";
import { main } from "../run";

const FIX = join(BENCH_DIR, "fixtures");
const opts = { seed: SEED, freshCutoff: "2026-09-01", allowUnverified: false };
let realFetch: typeof fetch;
let fetchCalls = 0;

before(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetchCalls++;
    throw new Error("network disabled in tests");
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
});

test("loaders read every fixture in its dataset schema", () => {
  const hle = loadDataset("hle-diamond", [FIX], opts);
  assert.equal(hle.items.length, 12);
  assert.equal(hle.items.filter((i) => i.hasImage).length, 1);
  assert.deepEqual([...new Set(hle.items.map((i) => i.stratum))].sort(), ["knowledge", "reasoning"]);
  assert.ok(hle.items.every((i) => i.noReveal && i.synthetic));
  assert.equal(loadDataset("simpleqa-verified", [FIX], opts).items.length, 12);
  const frames = loadDataset("frames", [FIX], opts);
  assert.equal(frames.items[0].stratum, "Numerical reasoning");
  const gpqa = loadDataset("gpqa-diamond", [FIX], opts);
  assert.ok(gpqa.items.every((i) => /^[ABCD]$/.test(i.answer) && i.question.includes("D) ")));
  const fresh = loadDataset("fresh", [FIX], opts);
  assert.equal(fresh.items.length, 4, "two fixtures fail the cutoff / double-verification checks");
  assert.equal(fresh.notes.length, 2);
});

test("pilot tiers sample 50/40/10 and 70/60/20 with a fixed seed and stratification", () => {
  for (const [tier, want] of [["pilot-100", [50, 40, 10]], ["pilot-150", [70, 60, 20]]] as const) {
    const counts = TIERS[tier].counts;
    assert.deepEqual([counts["hle-diamond"], counts["simpleqa-verified"], counts.frames], want);
  }
  const base = loadDataset("hle-diamond", [FIX], opts).items.filter((i) => !i.hasImage);
  const pool: Item[] = [...base, ...syntheticFill("hle-diamond", base, 300)];
  const a = makeSplit(pool, 70, 0.1, 5, SEED, "hle-diamond");
  const b = makeSplit(pool, 70, 0.1, 5, SEED, "hle-diamond");
  const c = makeSplit(pool, 70, 0.1, 5, SEED + 1, "hle-diamond");
  assert.equal(a.test.length, 70);
  assert.deepEqual(a.test.map((i) => i.id), b.test.map((i) => i.id), "same seed, same sample");
  assert.notDeepEqual(a.test.map((i) => i.id), c.test.map((i) => i.id));
  assert.ok(!a.dev.some((d) => a.test.some((t) => t.id === d.id)), "dev split is held out");
  const share = (xs: Item[]) => xs.filter((i) => i.stratum === "reasoning").length / xs.length;
  assert.ok(Math.abs(share(a.test) - share(pool)) < 0.02, "strata proportional");
});

test("lean tier is 1,000 questions (400/400/200) with three runs for key setups", () => {
  const t = TIERS.lean;
  assert.equal(Object.values(t.counts).reduce((x: number, y) => x + (y as number), 0), 1000);
  assert.equal(t.runsKey, 3);
  assert.deepEqual(ARMS.filter((x) => x.key).map((x) => x.id).sort(), ["claude-opus-5-5", "gpt-6-astra", "keplar-economy", "keplar-economy-exa", "keplar-premium", "keplar-premium-exa"]);
});

test("estimate reproduces tools/bench_budget.py (pilot-100 ≈ $116 without the dev split)", () => {
  const arms = ARMS.filter((a) => !a.optional && a.kind !== "best-single");
  const e = estimate([{ dataset: "hle-diamond", items: 50, devItems: 0 }, { dataset: "simpleqa-verified", items: 40, devItems: 0 }, { dataset: "frames", items: 10, devItems: 0 }], arms, () => 1, "2026-09-28");
  assert.ok(Math.abs(e.total - 116) < 1, `got ${e.total}`);
  const lean = estimate([{ dataset: "hle-diamond", items: 400, devItems: 0 }, { dataset: "simpleqa-verified", items: 400, devItems: 0 }, { dataset: "frames", items: 200, devItems: 0 }], arms, (a) => (a.key ? 3 : 1), "2026-09-28");
  assert.ok(Math.abs(lean.total - 2872) < 5, `got ${lean.total}`);
});

test("answer parsing: final answer, verbalized confidence, declines, letters", () => {
  const item = { answerType: "exact" } as Item;
  assert.deepEqual(parseAnswer("Explanation: x\nExact Answer: Iron\nConfidence: 85%", item), { answer: "Iron", confidence: 0.85, declined: false });
  assert.equal(parseAnswer("Answer: I don't know\nConfidence: 10%", item).declined, true);
  assert.equal(isDecline("Unknown."), true);
  assert.equal(isDecline("Uganda"), false);
  assert.equal(extractLetter("C. 59"), "C");
  assert.equal(extractLetter("(B)"), "B");
  assert.equal(parseAnswer("Answer: **D**\nConfidence: 0.6", { answerType: "mc" } as Item).answer, "D");
});

test("grader output parsing (official templates)", () => {
  assert.equal(parseHleVerdict("extracted_final_answer: 4\nreasoning: ...\ncorrect: yes\nconfidence: 100"), "correct");
  assert.equal(parseHleVerdict("correct: no"), "incorrect");
  assert.equal(parseSimpleQaVerdict("A"), "correct");
  assert.equal(parseSimpleQaVerdict("B"), "incorrect");
  assert.equal(parseSimpleQaVerdict("C"), "not_attempted");
  assert.equal(parseSimpleQaVerdict("NOT_ATTEMPTED"), "not_attempted");
});

test("statistics: McNemar, Holm, Wilson, ECE, bootstrap", () => {
  assert.ok(Math.abs(S.mcnemarExact(0, 5) - 0.0625) < 1e-9);
  assert.equal(S.mcnemarExact(3, 3), 1);
  assert.deepEqual(S.holm([0.01, 0.04, 0.03]).map((x) => +x.toFixed(4)), [0.03, 0.06, 0.06]);
  const w = S.wilson(35, 70);
  assert.ok(w.hi - w.estimate > 0.1 && w.hi - w.estimate < 0.125, "±11 points at n=70 (plan addendum)");
  assert.equal(S.ece([0.9, 0.9, 0.9, 0.9], [1, 1, 1, 0]).toFixed(3), "0.150");
  const ci = S.bootstrapMeanCI(Array.from({ length: 400 }, (_, i) => (i % 2 ? 1 : 0)), 1);
  assert.ok(ci.hi - ci.lo > 0.09 && ci.hi - ci.lo < 0.106, "≈ ±4.9 points at n=400 (plan §4.6)");
});

test("agreement levels and Keplar confidence rule", () => {
  const ag = agreementOf([{ answer: "x", models: ["a", "b", "c", "d"] }], 4);
  assert.equal(ag.level, "consensus");
  assert.equal(agreementOf([{ answer: "x", models: ["a", "b"] }, { answer: "y", models: ["c", "d"] }], 4).level, "none");
  assert.ok(keplarConfidence({ share: 1, judgeConf: null, verifierSupport: 1, retrieval: null }) > 0.95);
  assert.ok(keplarConfidence({ share: 0.5, judgeConf: 0.4, verifierSupport: 0.5, retrieval: "contradicted" }) < 0.3);
});

test("search results from benchmark-hosting domains are blocked", () => {
  assert.ok(blockedUrl("https://huggingface.co/datasets/google/simpleqa-verified"));
  assert.ok(blockedUrl("https://www.kaggle.com/x"));
  assert.ok(blockedUrl("https://github.com/openai/simple-evals/blob/main/x.py"));
  assert.ok(!blockedUrl("https://github.com/other/repo"));
  assert.ok(!blockedUrl("https://en.wikipedia.org/wiki/Iron"));
});

test("spend guard aborts before the cap is exceeded", () => {
  const g = new SpendGuard(1, "2026-09-28");
  const rel = g.reserve(0.6, "a");
  g.commit(0.5);
  rel();
  assert.throws(() => g.reserve(0.6, "b"), CapExceededError);
  assert.throws(() => g.reserve(0.01, "c"), CapExceededError, "stays tripped");
  assert.ok(g.spent <= 1);
});

test("live provider never sends a request that could break the cap", async () => {
  const g = new SpendGuard(0.01, "2026-09-28");
  const p = new OpenRouterBenchProvider("sk-test", g, "2026-09-28");
  const item = loadDataset("hle-diamond", [FIX], opts).items[0];
  const before = fetchCalls;
  await assert.rejects(p.call({ modelId: "gpt-6-astra", role: "answer", system: "s", prompt: "p", maxTokens: 16000, run: 1, mock: { item, run: 1 } }), CapExceededError);
  assert.equal(fetchCalls, before, "fetch was not called");
});

test("CLI: live mode requires the flag, OPENROUTER_API_KEY and --max-usd", async () => {
  const saved = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  assert.equal(await main(["--live", "--max-usd", "10", "--estimate-only"]), 2);
  process.env.OPENROUTER_API_KEY = "sk-test";
  assert.equal(await main(["--live", "--estimate-only"]), 2);
  assert.equal(await main(["--live", "--max-usd", "10", "--data-dir", FIX, "--estimate-only"]), 2, "fixtures refused for live");
  if (saved === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = saved;
});

test("CLI: mock pilot-100 run writes results JSON + INTERNAL report without touching the network", async () => {
  const out = mkdtempSync(join(tmpdir(), "bench-"));
  const before = fetchCalls;
  assert.equal(await main(["--tier", "pilot-100", "--out", out]), 0);
  assert.equal(fetchCalls, before);
  const md = readFileSync(join(out, "report.md"), "utf8");
  assert.match(md, /INTERNAL — NOT FOR PUBLICATION/);
  assert.match(md, /MOCK \/ DRY RUN/);
  assert.match(md, /NOT statistically clear/);
  assert.match(md, /Reliability table/);
  const j = JSON.parse(readFileSync(join(out, "results.json"), "utf8"));
  assert.equal(j.classification, "INTERNAL — NOT FOR PUBLICATION");
  assert.deepEqual(Object.fromEntries(Object.entries(j.manifest.datasets).map(([k, v]) => [k, (v as { test: string[] }).test.length])), { "hle-diamond": 50, "simpleqa-verified": 40, frames: 10 });
  assert.equal(new Set(j.summaries.map((s: { arm: string }) => s.arm)).size, 14);
  const hleRow = j.results.find((r: { dataset: string }) => r.dataset === "hle-diamond");
  assert.match(hleRow.text, /^\[redacted/);
  assert.ok(j.results.some((r: { grade?: { verdict: string } }) => r.grade?.verdict === "not_attempted"));
  assert.ok(existsSync(join(out, "manifest.json")));
});

test("CLI: simulated cap aborts a mock run early (exit 3) and still writes a report", async () => {
  const out = mkdtempSync(join(tmpdir(), "bench-"));
  assert.equal(await main(["--tier", "pilot-100", "--max-usd", "5", "--out", out]), 3);
  const j = JSON.parse(readFileSync(join(out, "results.json"), "utf8"));
  assert.ok(j.aborted && j.spend.counted <= 5);
  assert.match(readFileSync(join(out, "report.md"), "utf8"), /RUN ABORTED/);
});
