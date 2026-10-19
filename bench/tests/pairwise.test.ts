/** Pairwise harness self-tests (offline). Run: node --import tsx --test bench/tests/*.test.ts */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { anonymise, checkAnswer, contextFor, judgePair, loadTasks, parseVerdict, splitTasks, summarize, type PairRow, type PairTask } from "../lib/pairwise";
import { judgeAllowed } from "../pairwise";

const tasks = loadTasks(readFileSync("bench/pairwise/tasks.v1.jsonl", "utf8"));
const T = (over: Partial<PairTask> = {}): PairTask => ({ id: "t1", category: "math", prompt: "Q", ...over });

test("tasks: versioned file loads, ids unique, every category present, split fixed by id and roughly 30/70", () => {
  assert.ok(tasks.length >= 30);
  const cats = new Set(tasks.map((t) => t.category));
  for (const c of ["general", "reasoning", "math", "coding", "research", "factual", "writing", "education", "ambiguous", "adversarial", "long-context"]) assert.ok(cats.has(c), c);
  const split = splitTasks(tasks);
  const dev = tasks.filter((t) => split.get(t.id) === "dev").length;
  assert.ok(dev >= 8 && dev <= tasks.length * 0.4, `dev ${dev} of ${tasks.length}`);
  for (const c of cats) assert.ok(tasks.some((t) => t.category === c && split.get(t.id) === "test"), `${c} is in the test split`);
  assert.deepEqual([...splitTasks([...tasks].reverse())].sort(), [...split].sort(), "independent of file order");
  assert.throws(() => loadTasks('{"id":"a","category":"x","prompt":"p"}\n{"id":"a","category":"x","prompt":"q"}'), /Duplicate/);
});

test("checks: words, regex and numbers; null when a task has none; every keyed task's own answer key passes", () => {
  assert.equal(checkAnswer(T({ checks: { number: 400 } }), "There are 400 such numbers."), true);
  assert.equal(checkAnswer(T({ checks: { number: 400 } }), "There are 466."), false);
  assert.equal(checkAnswer(T({ checks: { number: 1200 } }), "about 1,200 people"), true);
  assert.equal(checkAnswer(T({ checks: { all: ["Achebe", "1958"] } }), "Chinua Achebe, in 1958."), true);
  assert.equal(checkAnswer(T({ checks: { regex: "x\\s*=\\s*4\\b", flags: "" } }), "So x = 4."), true);
  assert.equal(checkAnswer(T(), "anything"), null);
  const l1 = tasks.find((t) => t.id === "l1")!;
  const doc = contextFor(l1.context);
  assert.ok(doc.length > 20_000, "long-context document is long");
  assert.match(doc, /SKU-48213 \| Warehouse Delta \| 37 units/);
  assert.equal(contextFor(l1.context), doc, "deterministic");
  assert.match(contextFor("shipping-v1"), /Busan: departed 2026-03-02[\s\S]*|Rotterdam: departed 2026-03-14/);
});

test("anonymise: product and model names never reach the judge", () => {
  assert.equal(anonymise("Keplar One checked this with Claude and GPT-6 and Gemini."), "the assistant checked this with the assistant and the assistant and the assistant.");
});

test("verdicts: JSON winner parsed; anything else is unreadable (excluded, never guessed)", () => {
  assert.equal(parseVerdict('```json\n{"winner":"2","reason":"x"}\n```'), "2");
  assert.equal(parseVerdict('{"winner":"Tie"}'), "tie");
  assert.equal(parseVerdict("Response 1 is better"), null);
});

test("both orders: a judge that always prefers whichever comes first yields a tie, never a win", async () => {
  const firstAlways = async () => '{"winner":"1","reason":"first"}';
  for (const id of ["a", "b", "c", "d"]) {
    const r = await judgePair(T({ id }), "alpha text", "beta text", firstAlways, 1);
    assert.deepEqual([r!.outcome, r!.consistent], ["tie", false], id);
  }
  const prefersK = async (_s: string, p: string) => JSON.stringify({ winner: /<response_1>\nalpha/.test(p) ? "1" : "2" });
  assert.equal((await judgePair(T(), "alpha text", "beta text", prefersK, 1))!.outcome, "keplar");
  assert.equal(await judgePair(T(), "k", "b", async () => "no json", 1), null);
});

test("the first presentation order is seeded per task, and both orders occur across tasks", async () => {
  const firsts: string[] = [];
  const spy = async (_s: string, p: string) => { firsts.push(p.match(/<response_1>\n(\w+)/)![1]); return '{"winner":"tie"}'; };
  for (const t of tasks.slice(0, 20)) await judgePair(t, "alpha", "beta", spy, 7);
  const leadK = firsts.filter((x, i) => i % 2 === 0 && x === "alpha").length;
  assert.ok(leadK > 2 && leadK < 18, `Keplar led ${leadK} of 20`);
});

test("summary: win rate excludes ties (Wilson), ties as half (bootstrap), exclusions counted, sign test", () => {
  const row = (outcome: PairRow["outcome"], i: number): PairRow => ({ id: `t${i}`, category: i % 2 ? "math" : "writing", split: "test", outcome, consistent: true, keplarCheck: null, baselineCheck: null, keplarLatencyMs: 1000 + i, baselineLatencyMs: 500, keplarUsd: 0.1, baselineUsd: 0.01, judgeUsd: 0.002 });
  const rows = [...Array.from({ length: 12 }, (_, i) => row("keplar", i)), ...Array.from({ length: 6 }, (_, i) => row("baseline", 20 + i)), ...Array.from({ length: 2 }, (_, i) => row("tie", 40 + i)), { ...row(null, 50), excluded: "unreadable verdict" }];
  const s = summarize(rows, 3);
  assert.deepEqual([s.n, s.judged, s.excluded, s.wins, s.losses, s.ties], [21, 20, 1, 12, 6, 2]);
  assert.equal(s.winRate!.estimate, 12 / 18);
  assert.ok(s.winRate!.lo < 0.5, "18 decisive pairs can't show a clear win: the interval says so");
  assert.ok(Math.abs(s.winRateTiesHalf!.estimate - 13 / 20) < 1e-9);
  assert.ok(s.pValue! > 0.05);
  assert.ok(s.usd.keplar > 2);
});

test("judge independence: a judge from the baseline's family is refused", () => {
  assert.match(judgeAllowed("claude-opus-5-5", "claude-sonnet-5") ?? "", /same family/);
  assert.equal(judgeAllowed("glm-5.3", "claude-sonnet-5"), null);
});
