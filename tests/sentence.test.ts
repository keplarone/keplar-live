import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { asSentence } from "../src/lib/sentence";
import { consensusSummary } from "../src/lib/orchestration/synthesizer";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("summaries end with exactly one full stop", () => {
  assert.equal(asSentence("2 agree, 0 disagree"), "2 agree, 0 disagree.");
  assert.equal(asSentence("One model answered. There was nothing to compare."), "One model answered. There was nothing to compare.");
  assert.equal(asSentence("Really?"), "Really?");
  assert.equal(asSentence("  "), "");
  assert.equal(asSentence(null), "");
  for (const [level, a, d, m] of [["single", 1, 0, 0], ["single", 1, 0, 1], ["none", 1, 1, 0], ["consensus", 2, 0, 0], ["partial", 2, 1, 1], ["unscored", 0, 0, 0]] as const) {
    const out = asSentence(consensusSummary(level, a, d, m));
    assert.doesNotMatch(out, /\.\.$/, `${level}: ${out}`);
    assert.match(out, /[.]$/, `${level}: ${out}`);
  }
});

test("the answer card and agreement scene never print summary + a second period", () => {
  for (const f of ["src/components/app-ui/KeplarTurn.tsx", "src/components/spatial/AgreementScene.tsx"]) {
    const src = read(f);
    assert.doesNotMatch(src, /\{c\.summary\}\./, f);
    assert.doesNotMatch(src, /\$\{c\.summary\}\./, f);
    assert.doesNotMatch(src, /\{summary\}\./, f);
    assert.doesNotMatch(src, /\$\{summary\}\./, f);
  }
});
