import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// QA 2026-10-05: at 320 (and 360) the phone rule forced the three cookie buttons onto one nowrap row that was wider than the card,
// so the grid track grew and "Cookies", the sentence and "Customize" ran off the right edge of the screen.
test("cookie banner: on phones the buttons wrap instead of widening the card past the screen", () => {
  const css = readFileSync("src/components/consent/CookieBanner.module.css", "utf8");
  const phone = css.slice(css.lastIndexOf("@media (max-width: 640px)"));
  const actions = phone.match(/\.banner \.actions\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(actions, /flex-wrap:\s*wrap/);
  assert.doesNotMatch(actions, /nowrap/);
  assert.match(phone, /\.banner > \*\s*\{\s*min-width:\s*0/);
});
