import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(new URL("../src/components/app-ui/Composer.module.css", import.meta.url), "utf8");

// Measured on keplar.one: the labelled row (Attach, Voice, Talk + Web, Deep Research, Create, Create image, Agent) needed a ~1150px
// composer, but the composer is ~1000px at 1920x1080 and ~800px at 1366x768. With only a 700px step, "Create image" and "Agent"
// sat behind the row's hidden scrollbar on ordinary desktops. The Study and Slides chips add ~190px, so both steps moved up again.
test("the composer tools collapse to icons in two steps before the labelled row would clip", () => {
  const steps = [...css.matchAll(/@container composer \(max-width: (\d+)px\)/g)].map((m) => Number(m[1]));
  assert.ok(steps.some((w) => w >= 1340), `a first step at >= 1340px (got ${steps.join(", ")})`);
  assert.ok(steps.some((w) => w >= 1130 && w < 1340), `an all-icons step around 1200px (got ${steps.join(", ")})`);
  assert.ok(!steps.includes(700), "the old 700px-only step is gone");
  // the first step keeps an active voice control labelled ("Listening…")
  assert.match(css, /\.tool:not\(\[data-mode\]\):not\(\[aria-pressed="true"\]\) \.toolLabel/);
});

test("chips that still don't fit move into a More menu instead of a sideways-scrolling strip", () => {
  assert.match(css, /\.tool\[data-overflow\]\s*\{\s*display:\s*none/);
  assert.match(css, /\.more:not\(\[data-show\]\)\s*\{\s*display:\s*none/);
  assert.doesNotMatch(css, /\.tools\s*\{[^}]*overflow-x:\s*auto/);
  // an active mode keeps its label in the icon row
  assert.match(css, /\.tool\[data-mode\]\[aria-pressed="true"\] \.toolLabel/);
});
