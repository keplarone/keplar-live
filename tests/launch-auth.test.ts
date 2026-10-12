import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("sign-in provider buttons never show server wording to visitors, and only working providers are shown", () => {
  const src = readFileSync("src/components/auth/ProviderButtons.tsx", "utf8");
  assert.doesNotMatch(src, /Not configured/);
  assert.doesNotMatch(src, /on this server/);
  // A provider without keys is left out (no disabled "Coming soon" button above the email sign-in that works).
  assert.match(src, /\.filter\(\(p\) => providers\[p\.id\]\)/);
  assert.match(src, /if \(!rows\.length\) return null;/);
  assert.doesNotMatch(src, /\{t\.soon\}/);
  const form = readFileSync("src/components/auth/AuthForm.tsx", "utf8");
  assert.match(form, /\{signup && anyProvider \?/, "the provider consent line only shows with a provider to consent to");
  assert.match(form, /\{anyProvider \|\| passkey \? <div className=\{s\.divider\}>/, "no 'or use your email' divider above nothing");
});
