import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { quietIds, reasoningMeta } from "@/lib/answer-quiet";
import { HeuristicClassifier, isMultiStep } from "@/lib/orchestration/classifier";
import type { KeplarAnswer, KeplarRequest } from "@/lib/orchestration/types";

const base = (o: Partial<KeplarAnswer> = {}): KeplarAnswer => ({
  markdown: "x", consensus: { level: "single", consulted: 1, agreed: 1, label: "" }, sources: [], disagreements: [], verification: { mode: "not-needed" },
  reasoning: "", compute: { units: 0 }, ...o,
} as unknown as KeplarAnswer);

test("answer card: rows with nothing to say are quiet (collapsed into one Details row); real content stays visible", () => {
  const quiet = quietIds(base());
  for (const id of ["consensus", "models", "sources", "disagreements", "verification"]) assert.ok(quiet.has(id), id);
  const rich = quietIds(base({
    consensus: { level: "strong", consulted: 3, agreed: 3, label: "" } as never,
    sources: [{ kind: "model", title: "m", url: "" }] as never,
    disagreements: [{ topic: "t", positions: [] }] as never,
    verification: { mode: "cross-check" } as never,
  }));
  assert.equal(rich.size, 0);
});

test("reasoning summary meta is the first sentence, trimmed, never the old stock label", () => {
  assert.equal(reasoningMeta(""), "");
  assert.equal(reasoningMeta("I read this as a question about pricing. Two models were asked."), "I read this as a question about pricing.");
  assert.ok(reasoningMeta("word ".repeat(60)).length <= 90);
});

test("KeplarTurn wires the calm card: Details disclosure, clarify chips, Using memory", () => {
  const src = readFileSync("src/components/app-ui/KeplarTurn.tsx", "utf8");
  assert.match(src, /id: "details"/);
  assert.match(src, /<ClarifyChips/);
  assert.match(src, /<UsingMemory/);
  assert.doesNotMatch(src, /How the answer was formed/);
  const memory = readFileSync("src/components/account/MemorySettings.tsx", "utf8");
  assert.match(memory, /Edit/);
});

const req = (prompt: string): KeplarRequest => ({ prompt } as KeplarRequest);
test("classifier: multi-step and hard prompts are complex (DEEP); simple ones are not", async () => {
  const c = new HeuristicClassifier();
  const hard = "First compare the trade-offs of Postgres vs DynamoDB for a write-heavy workload, then design a migration plan with rollback steps, and finally estimate the cost per month.";
  assert.equal(isMultiStep(hard), true);
  assert.notEqual((await c.classify(req(hard))).complexity, "simple");
  assert.equal(isMultiStep("what is the capital of France"), false);
  assert.equal((await c.classify(req("hi"))).complexity, "simple");
  const resolved = await c.classify({ prompt: "chatgpt", understanding: { crossCheck: true } } as unknown as KeplarRequest);
  assert.equal(resolved.errorProne, "fact");
});
