import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { ASSUMPTION_STYLE, CLARITY_STYLE, CLARITY_STYLE_SHORT, REASONING_STYLE } from "@/lib/style/clarity";
import { SYNTH_SYSTEM_PROMPT } from "@/lib/orchestration/live-synthesizer";
import { BASE_SYSTEM_PROMPT } from "@/lib/orchestration/providers/shared";
import { livePanelParams } from "@/lib/orchestration/orchestrator";
import type { Classification } from "@/lib/orchestration/types";

test("every writer gets the expert reasoning rules and the assume-don't-ask rules", () => {
  assert.match(REASONING_STYLE, /best specialist in the field/);
  assert.match(REASONING_STYLE, /more than one approach/);
  assert.match(REASONING_STYLE, /order-of-magnitude sanity check/);
  assert.match(REASONING_STYLE, /root cause/);
  assert.ok(CLARITY_STYLE.includes(REASONING_STYLE) && CLARITY_STYLE.includes(ASSUMPTION_STYLE));
  assert.ok(CLARITY_STYLE_SHORT.includes(ASSUMPTION_STYLE) && /best specialist/.test(CLARITY_STYLE_SHORT));
  assert.ok(BASE_SYSTEM_PROMPT.includes(CLARITY_STYLE_SHORT), "panel models");
  assert.ok(SYNTH_SYSTEM_PROMPT.includes(CLARITY_STYLE), "final writer");
  assert.match(SYNTH_SYSTEM_PROMPT, /work the question out yourself/);
  assert.match(ASSUMPTION_STYLE, /I don't know what you mean/);
});

test("live panel thinks harder on complex questions only; Reason mode keeps its own budget", () => {
  const c = (complexity: Classification["complexity"]) => ({ complexity }) as Classification;
  assert.equal(livePanelParams(c("simple")).reasoningEffort, "low");
  assert.equal(livePanelParams(c("moderate")).reasoningEffort, "low");
  assert.equal(livePanelParams(c("complex")).reasoningEffort, "medium");
  assert.ok((livePanelParams(c("complex")).maxOutputTokens ?? 0) > (livePanelParams(c("simple")).maxOutputTokens ?? 0));
  assert.equal(livePanelParams(c("simple"), true).maxOutputTokens, 2200);
});
