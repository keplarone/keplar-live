import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENT_DRAFT, CHAPTERS, CHECKS, CREATE_BLOCKS, CREATE_CHECKLIST, FINAL, LANES, SPLIT } from "../src/components/simulation/script";

test("simulation script: one scenario with a real disagreement, a check and a final answer", () => {
  assert.equal(LANES.length, SPLIT.total);
  const leaning = LANES.filter((l) => l.leans === "refrigerate").length;
  assert.equal(leaning, SPLIT.agree);
  for (const l of LANES) assert.ok(l.text.includes(l.mark), `${l.name} highlight text must occur in its answer`);
  assert.ok(CHECKS.length >= 3 && FINAL.body.length > 40);
  assert.ok(CREATE_BLOCKS.length >= 3 && CREATE_CHECKLIST.length >= 3);
  assert.deepEqual(CHAPTERS.map((c) => c.id).slice(0, 2), ["intro", "ask"]);
  assert.equal(new Set(CHAPTERS.map((c) => c.id)).size, CHAPTERS.length);
});

test("simulation script shows no fabricated measurements, accuracy claims or real model names", () => {
  const text = JSON.stringify({ LANES, SPLIT, CHECKS, FINAL, CREATE_BLOCKS, CREATE_CHECKLIST, AGENT_DRAFT });
  assert.ok(!/%/.test(text), "no percentages");
  assert.ok(!/\b\d+\s?(ms|seconds?|s)\b/i.test(text), "no timings");
  assert.ok(!/accura|faster|\b\d+x\b|score/i.test(text), "no accuracy or speed claims");
  assert.ok(!/\b(gpt|claude|gemini|grok|llama|mistral|deepseek|qwen|openai|anthropic)\b/i.test(text), "no real model names");
});
