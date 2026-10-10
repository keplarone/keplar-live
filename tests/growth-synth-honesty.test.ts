import assert from "node:assert/strict";
import { test } from "node:test";
import { SYNTH_SYSTEM_PROMPT } from "../src/lib/orchestration/live-synthesizer";

// Live runs on 2026-10-03 showed a "Where the models disagree" section even when all models took one position
// (docs/growth/campaign/DEMO-RUNS.md R3, R4). The prompt must only ask for that section when there is more than one stance.
test("synthesis prompt only asks for a disagreement section when positions differ", () => {
  assert.match(SYNTH_SYSTEM_PROMPT, /Only if the positions above show more than one stance/);
  assert.match(SYNTH_SYSTEM_PROMPT, /every model took the same position, do NOT write that section/);
  assert.match(SYNTH_SYSTEM_PROMPT, /not as a model disagreement/);
});

test("synthesis prompt keeps the resolution line and the no-invention rule", () => {
  assert.match(SYNTH_SYSTEM_PROMPT, /RESOLUTION:/);
  assert.match(SYNTH_SYSTEM_PROMPT, /Don't invent facts, numbers or sources/);
});
