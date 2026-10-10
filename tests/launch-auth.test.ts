import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("sign-in provider buttons never show server wording to visitors", () => {
  const src = readFileSync("src/components/auth/ProviderButtons.tsx", "utf8");
  assert.doesNotMatch(src, /Not configured/);
  assert.doesNotMatch(src, /on this server/);
  assert.match(src, /Coming soon/);
});
