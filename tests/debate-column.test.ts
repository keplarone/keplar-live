import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("src/components/app-ui/DebateView.module.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The answer-column rule, not a later selector that merely mentions .turn. */
function turnCard(): string {
  const m = css.match(/\.turn\s*\{([^}]*)\}/);
  assert.ok(m, "debate answer column (.turn) rule");
  return m[1];
}

test("debate answer columns are fixed-radius cards, never a pill or percentage that becomes an ellipse", () => {
  const body = turnCard();
  assert.match(body, /border-radius:\s*18px/, "modest fixed radius");
  assert.match(body, /padding:\s*16px 18px/);
  assert.doesNotMatch(body, /%|9999px|999px|var\(--shape-control\)|var\(--shape-pill\)|var\(--r-pill\)/, "no percentage or pill radius on the column");
  assert.doesNotMatch(body, /border-left:\s*3px/, "the seat edge must not be a stroke that follows a huge radius");
  assert.doesNotMatch(css, /\.turn::(before|after)/, "no decorative ring on the column");
  assert.doesNotMatch(css, /ellipse|<svg|border-radius:\s*\d+%/);
});
