import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestComposerMode } from "../src/lib/composer/suggest";

test("suggestComposerMode offers Create, Study and Slides without forcing them", () => {
  assert.equal(suggestComposerMode("build me a landing page")?.key, "create");
  assert.equal(suggestComposerMode("teach me special relativity")?.key, "study");
  assert.equal(suggestComposerMode("make a slideshow about tides")?.key, "slides");
  assert.equal(suggestComposerMode("debate whether cities should ban cars")?.key, "debate");
  assert.equal(suggestComposerMode("do research on the 1918 flu")?.key, "deepResearch");
});

test("suggestComposerMode stays quiet on questions, slash commands and short text", () => {
  assert.equal(suggestComposerMode("how do I build a landing page"), null);
  assert.equal(suggestComposerMode("/create a site"), null);
  assert.equal(suggestComposerMode("hello"), null);
  assert.equal(suggestComposerMode("what is a landing page"), null);
});
