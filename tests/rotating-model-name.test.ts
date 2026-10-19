import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MODEL_NAMES, SWITCH_MS } from "@/components/app-ui/RotatingModelName";

const css = readFileSync("src/styles/gemini.css", "utf8");
const mod = readFileSync("src/components/app-ui/RotatingModelName.module.css", "utf8");
const src = readFileSync("src/components/app-ui/RotatingModelName.tsx", "utf8");

test("greeting name slot: the five models in order, each with a dark and a light brand gradient", () => {
  assert.deepEqual(MODEL_NAMES.map((m) => m.name), ["Claude", "ChatGPT", "DeepSeek", "Mistral", "Gemini"]);
  for (const m of MODEL_NAMES) {
    assert.match(css, new RegExp(`\\[data-theme\\] \\[data-welcome\\] \\[data-model="${m.id}"\\] \\{ background-image: linear-gradient`), `${m.id} dark`);
    assert.match(css, new RegExp(`\\[data-theme="light"\\] \\[data-welcome\\] \\[data-model="${m.id}"\\] \\{ background-image: linear-gradient`), `${m.id} light`);
  }
  assert.ok(SWITCH_MS >= 2000, "each name stays long enough to read");
});

test("greeting name slot: motion is transform/opacity/filter/width only, off under reduced motion; screen readers get every name once", () => {
  assert.match(mod, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*animation: none;/);
  assert.doesNotMatch(mod, /\b(top|left|margin|height)\s*:[^;]*;[^}]*transition/, "no layout properties animated");
  assert.match(src, /if \(reduced\) return <>Keplar<\/>;/);
  assert.match(src, /aria-hidden="true"/);
  assert.match(src, /className="visually-hidden"/);
  assert.match(src, /document\.hidden/, "no switching in a background tab");
});
