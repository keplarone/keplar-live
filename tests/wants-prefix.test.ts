import { test } from "node:test";
import assert from "node:assert/strict";
import { PREFIX, P, enforcePrefix, appendTranscript, clampCaret } from "@/lib/wants/prefix";

test("the prefix is exactly seven characters and edits cannot remove it", () => {
  assert.equal(PREFIX.length, 7);
  assert.equal(P, 7);
  assert.equal(enforcePrefix("I wan pizza", "I want pizza"), "I want pizza");
  assert.equal(enforcePrefix("pizza", "I want pizza"), "I want pizza");
  assert.equal(enforcePrefix("x", "I want pizza"), "I want x");
  assert.ok(enforcePrefix("XI want pizza", "I want pizza").startsWith(PREFIX));
  assert.equal(enforcePrefix("", "I want "), "I want ");
  assert.equal(enforcePrefix("I want pizza now", "I want pizza"), "I want pizza now");
});

test("dictation appends after the prefix and the caret cannot enter it", () => {
  assert.equal(appendTranscript("I want ", "pizza"), "I want pizza");
  assert.equal(appendTranscript("I want tacos ", "  and soda "), "I want tacos and soda");
  assert.equal(appendTranscript("I want pizza", ""), "I want pizza");
  assert.equal(appendTranscript("nope", "soup"), "I want soup");
  assert.equal(clampCaret(2), 7);
  assert.equal(clampCaret(9), 9);
});
