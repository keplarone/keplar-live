import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("welcome back: the question box is the app's real Composer, not a bare textarea", () => {
  const src = readFileSync("src/components/app-ui/WelcomeBack.tsx", "utf8");
  assert.doesNotMatch(src, /<textarea/, "no second, weaker question box");
  assert.match(src, /<div className=\{s\.ask\}>\{composer\}<\/div>/, "the composer slot renders in the question area");
  assert.match(src, /onClick=\{\(\) => onStarter\(c\.seed, c\.modes \?\? \{\}\)\}/, "starters fill the composer in place");
  assert.match(src, /label: "Research a topic", seed: "Research ", modes: \{ deepResearch: true \}/, "Research switches Deep Research on");

  const app = readFileSync("src/components/app-ui/KeplarApp.tsx", "utf8");
  const start = app.indexOf("<WelcomeBack");
  const wb = app.slice(start, app.indexOf("onClose=", start));
  assert.match(wb, /composer=\{\s*<Composer/, "the app passes its Composer");
  assert.match(wb, /send\(text, attachments, modes, media\)/, "attachments, modes and media go through the app's send");
  assert.match(wb, /welcomeComposerRef\.current\?\.setModes\(modes\)/, "a starter switches its mode on in that composer");
});
