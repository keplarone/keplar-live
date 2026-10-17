import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("ChatTools: never shows an empty-state 'connect apps' nudge when none are connected", () => {
  const src = readFileSync("src/components/app-ui/ChatTools.tsx", "utf8");
  assert.match(src, /if \(!st\.available \|\| !st\.apps\.length\) return null/);
  assert.match(src, /no empty-state nudge/);
  assert.doesNotMatch(src, /Connect (an |your )?app|No connected apps|connect apps to use Tools/i);
});

test("composer focus ring is ink/white, never described as a blue accent", () => {
  const css = readFileSync("src/components/app-ui/Composer.module.css", "utf8");
  assert.doesNotMatch(css, /quiet blue focus/i);
  assert.match(css, /solid ink focus ring/);
});
