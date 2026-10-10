import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TRAINING_STATEMENT } from "../src/lib/privacy/training-statement";
import { OPENROUTER_PROVIDER_DEFAULTS, freeOpenRouterProviderOptions } from "../src/lib/orchestration/config";

const all = TRAINING_STATEMENT.join(" ");

test("the Settings statement matches what the code does for paid and Free requests", () => {
  // Paid OpenRouter requests refuse endpoints that may train on prompts.
  assert.equal(OPENROUTER_PROVIDER_DEFAULTS.data_collection, "deny");
  assert.match(all, /Plus and Pro, requests through OpenRouter are limited to endpoints that say they do not collect or train/);
  // Free requests are not restricted that way by default, and the statement says so instead of claiming otherwise.
  assert.equal((freeOpenRouterProviderOptions() as { data_collection: string }).data_collection, "allow");
  assert.match(all, /On Free, .* may log prompts and may use them to improve their models/);
});

test("the statement says Keplar itself never trains, and Help improve Keplar is opt-in without retraining", () => {
  assert.match(all, /does not use your chats, files or memory to train AI models/);
  assert.match(all, /Help improve Keplar is off unless you turn it on/);
  assert.match(all, /models are not retrained/);
  // No code path in the app trains or fine-tunes a model.
  const learn = readFileSync("src/components/account/LearningConsent.tsx", "utf8");
  assert.match(learn, /off by default/);
});

test("the Settings statement and the Privacy Policy do not contradict each other", () => {
  const privacy = readFileSync("src/components/legal/content/privacy.ts", "utf8");
  assert.match(privacy, /does not use your prompts, files, memory or chats to train AI models/);
  assert.match(privacy, /Free model hosts may log prompts/);
  assert.match(privacy, /do not collect or train on prompts/);
  assert.match(readFileSync("src/components/account/DataControls.tsx", "utf8"), /TRAINING_STATEMENT/);
});
