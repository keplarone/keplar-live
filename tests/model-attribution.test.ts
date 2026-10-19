import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { servedModelDiffers, substitutionNote } from "@/lib/orchestration/served-model";
import { modelStatusSentence, processSummary, summarizeModels } from "@/lib/orchestration/model-status";
import { fromChat } from "@/lib/orchestration/providers/shared";
import type { Classification, ConsultedModel, ModelSpec } from "@/lib/orchestration/types";

test("served model: dated snapshots and routing suffixes are the same model; a different model or the free variant is not", () => {
  assert.equal(servedModelDiffers("openai/gpt-4o", "openai/gpt-4o"), false);
  assert.equal(servedModelDiffers("openai/gpt-4o", "openai/gpt-4o-2024-08-06"), false);
  assert.equal(servedModelDiffers("anthropic/claude-sonnet-4", "anthropic/claude-sonnet-4-20250514"), false);
  assert.equal(servedModelDiffers("openai/gpt-4o:nitro", "openai/gpt-4o"), false);
  assert.equal(servedModelDiffers("openai/gpt-4o", "gpt-4o"), false, "a host that drops the vendor prefix");
  assert.equal(servedModelDiffers("anthropic/claude-sonnet-4", "meta-llama/llama-3.3-70b-instruct:free"), true, "cost-guard rewrite to a free model");
  assert.equal(servedModelDiffers("meta-llama/llama-3.3-70b-instruct", "meta-llama/llama-3.3-70b-instruct:free"), true, "the free variant is a different deployment");
  assert.equal(servedModelDiffers("openai/gpt-4o", "openai/gpt-4o-mini"), true);
  assert.equal(servedModelDiffers(undefined, "x"), false, "no requested slug: nothing claimed");
  assert.equal(servedModelDiffers("x", undefined), false);
});

const model = { id: "claude-sonnet", name: "Claude Sonnet", provider: "anthropic" } as unknown as ModelSpec;
const cls = { estimatedInputTokens: 10 } as unknown as Classification;

test("fromChat flags a substitution only when the gateway served a different model than requested", () => {
  const swapped = fromChat(model, { model: "meta-llama/llama-3.3-70b-instruct:free", choices: [{ message: { content: "Hi" } }] }, Date.now(), "openrouter", cls, "anthropic/claude-sonnet-4");
  assert.equal(swapped.ok && swapped.servedBy?.substituted, true);
  const same = fromChat(model, { model: "anthropic/claude-sonnet-4-20250514", choices: [{ message: { content: "Hi" } }] }, Date.now(), "openrouter", cls, "anthropic/claude-sonnet-4");
  assert.equal(same.ok && same.servedBy?.substituted, undefined);
});

test("a substituted model is disclosed in the answer's model sentence", () => {
  const models: ConsultedModel[] = [
    { id: "a", name: "Claude Sonnet", provider: "anthropic", slot: "panel", status: "responded", note: substitutionNote("Claude Sonnet", "meta-llama/llama-3.3-70b-instruct:free") },
    { id: "b", name: "GPT", provider: "openai", slot: "panel", status: "responded" },
  ];
  const s = summarizeModels(models);
  assert.equal(s.notable, true);
  assert.match(modelStatusSentence(s), /Answered by meta-llama\/llama-3\.3-70b-instruct:free in place of Claude Sonnet/);
});

test("process summary counts models that answered, never the planned panel", () => {
  assert.equal(processSummary({ mode: "consensus", count: 3, consensus: { consulted: 3, responded: 1 } }), "Answered by one model (1 of 3 responded)");
  assert.equal(processSummary({ mode: "consensus", count: 3, consensus: { consulted: 3, responded: 2 } }), "Reasoned with 2 of 3 intelligences");
  assert.equal(processSummary({ mode: "consensus", count: 3, consensus: { consulted: 3, responded: 3 } }), "Reasoned with 3 intelligences");
  assert.equal(processSummary({ mode: "single", count: 1, consensus: { consulted: 1, responded: 1 } }), "Answered with one model");
  assert.equal(processSummary({ mode: "consensus", count: 3, consensus: null }), "Asked 3 intelligences");
});
