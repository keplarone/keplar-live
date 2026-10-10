import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// QA 2026-10-05: the centred /simulation "SIMULATION · Pre-written sample…" note was absolutely positioned at left: 50% with no
// width, so it shrink-wrapped to half the screen: at 390 it was 195px wide and five lines tall, at 320 eleven lines over the eyebrow.
test("simulation banner: sizes to its text up to 92vw instead of half the screen", () => {
  const css = readFileSync("src/components/simulation/journey.module.css", "utf8");
  const banner = css.match(/\n\.banner\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(banner, /left:\s*50%/);
  assert.match(banner, /width:\s*max-content/);
  assert.match(banner, /max-width:\s*min\(92vw/);
});
