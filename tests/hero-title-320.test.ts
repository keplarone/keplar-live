import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// QA 2026-10-05: at 320 the shared page-hero title (42px floor) broke "What is superintelligenc / e?" on /superintelligence and
// /ai-vs-agi-vs-superintelligence. UI v2 (docs/ui-v2.md "Page hero"): the title is --t-headline, regular weight, tracking -0.04em,
// and below ~400px the size follows the screen (11vw) so long words still fit 320.
test("page hero title: --t-headline, regular, -0.04em, capped at 11vw so long words fit 320", () => {
  const css = readFileSync("src/components/page/RoutePlaceholder.module.css", "utf8");
  const title = css.match(/\n\.title\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(title, /font-size:\s*min\(var\(--t-headline\),\s*11vw\)/);
  assert.match(title, /font-weight:\s*var\(--w-regular\)/);
  assert.match(title, /letter-spacing:\s*-0\.04em/);
  // "superintelligence?" is 18 characters at ~0.42em each: 11vw at 320 (35.2px) is ~266px, inside the 280px column.
  assert.ok(18 * 0.42 * 0.11 * 320 < 280);
  // The kicker is plain text: no pill, no glowing dot (docs/ui-v2.md principle 4).
  const label = css.match(/\n\.label\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(label, /color:\s*var\(--c-ink-3\)/);
  assert.doesNotMatch(label, /border-radius|box-shadow|background:\s*(?!none)/);
  assert.doesNotMatch(css, /\.label::before|\.hero::after/);
});
