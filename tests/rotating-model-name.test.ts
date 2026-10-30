import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MODEL_NAMES, SWITCH_MS } from "@/components/app-ui/RotatingModelName";

const css = readFileSync("src/styles/orbit/app.css", "utf8");
const mod = readFileSync("src/components/app-ui/RotatingModelName.module.css", "utf8");
const src = readFileSync("src/components/app-ui/RotatingModelName.tsx", "utf8");
const app = readFileSync("src/components/app-ui/KeplarApp.tsx", "utf8");

test("greeting name slot: the five models in order, in the same solid colour as the heading", () => {
  assert.deepEqual(MODEL_NAMES.map((m) => m.name), ["Claude", "ChatGPT", "DeepSeek", "Mistral", "Gemini"]);
  assert.doesNotMatch(css, /\[data-model=/);
  assert.doesNotMatch(mod, /shimmer|background-size|blur\(/);
  assert.match(mod, /will-change:\s*transform,\s*opacity;/);
  assert.doesNotMatch(mod, /will-change:[^;]*filter/);
  assert.ok(SWITCH_MS >= 1500, "each name stays long enough to read");
});

test("greeting name slot: motion is transform/opacity/width only, off under reduced motion; screen readers get every name once", () => {
  assert.match(mod, /transition:\s*width /);
  assert.match(mod, /@keyframes roll-in \{[\s\S]*opacity:[\s\S]*transform:/);
  assert.match(mod, /@keyframes lift-out \{[\s\S]*opacity:[\s\S]*transform:/);
  assert.doesNotMatch(mod, /filter:/);
  assert.match(mod, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*animation: none;/);
  assert.doesNotMatch(mod, /\b(top|left|margin|height)\s*:[^;]*;[^}]*transition/, "no layout properties animated");
  assert.match(src, /if \(reduced\) return <>Keplar<\/>;/);
  assert.match(src, /aria-hidden="true"/);
  assert.match(src, /className="visually-hidden"/);
  assert.match(src, /document\.hidden/, "no switching in a background tab");
});

test("signed-out greeting is one solid ink color in both themes (Orbit --o-ink), with no text clip", () => {
  assert.match(css, /\[data-theme\] \[data-welcome\] \{[^}]*color:\s*var\(--o-ink\) !important/);
  assert.match(css, /\[data-welcome\] \[data-model-slot\][\s\S]*?color:\s*inherit !important/);
  assert.doesNotMatch(css, /background-clip:\s*text/);
  assert.doesNotMatch(css, /-webkit-text-fill-color:\s*transparent/);
  assert.doesNotMatch(css, /linear-gradient\(90deg,\s*#5b8cff/);
  assert.doesNotMatch(css, /#1a5fe0|#1570d6/);
});

test("no ancestor of [data-model-slot] gets background-clip: text", () => {
  const h1 = app.slice(app.indexOf('data-welcome=""'), app.indexOf("</h1>"));
  // The signed-out line is a fragment of three direct children of the heading, not one wrapping span.
  assert.match(h1, /<><span>How can <\/span>\s*<RotatingModelName \/>\s*<span> help you today\?<\/span><\/>/);
  // The slot element is the component's own root, so its parent is the heading.
  assert.match(src, /return \(\s*<>\s*<span className=\{s\.slot\} data-model-slot=""/);
  assert.doesNotMatch(css, /background-clip:\s*text/);
});
