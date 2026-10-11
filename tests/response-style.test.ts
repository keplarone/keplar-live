import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkStyle, readability, syllables, proseOf } from "../src/lib/style/readability";
import { STYLE_EVAL, STYLE_COUNTEREXAMPLES, scoreAnswers } from "../src/lib/style/eval-set";
import { ASSUMPTION_STYLE, CLARITY_STYLE, CLARITY_STYLE_SHORT, GROUNDING_STYLE } from "../src/lib/style/clarity";
import { INSIGHT, PLANNER, REVISER, STEP } from "../src/lib/core/prompts";
import { BASE_SYSTEM_PROMPT } from "../src/lib/orchestration/providers/shared";
import { SYNTH_SYSTEM_PROMPT, CRITIQUE_SYSTEM_PROMPT } from "../src/lib/orchestration/live-synthesizer";

test("readability: syllables and Flesch–Kincaid behave on known text", () => {
  assert.equal(syllables("cat"), 1);
  assert.equal(syllables("water"), 2);
  assert.equal(syllables("banana"), 3);
  assert.equal(syllables("communication"), 5);
  const easy = readability("The cat sat on the mat. It was warm. The dog came in.");
  const hard = readability("Comprehensive institutional considerations necessitate multidimensional evaluation of organizational interdependencies.");
  assert.ok(easy.grade < 3, `easy ${easy.grade}`);
  assert.ok(hard.grade > 16, `hard ${hard.grade}`);
  assert.ok(easy.ease > hard.ease);
});

test("readability: code, links, math and markdown syntax don't count as prose", () => {
  const p = proseOf("Run `npm test`.\n\n```ts\nconst reallyLongIdentifierName = computeEverything();\n```\n\nSee [the docs](https://example.com/a/b).");
  assert.doesNotMatch(p, /reallyLongIdentifierName|https:/);
  assert.match(p, /the docs/);
});

test("eval set: 10–20 prompts, several with attachments, all with a target answer", () => {
  assert.ok(STYLE_EVAL.length >= 10 && STYLE_EVAL.length <= 20, `${STYLE_EVAL.length} cases`);
  assert.ok(STYLE_EVAL.filter((c) => c.attachments?.length).length >= 5);
  assert.equal(new Set(STYLE_EVAL.map((c) => c.id)).size, STYLE_EVAL.length);
});

test("eval set: every reference answer meets the style (answer first, short paragraphs, no filler, grade in range)", () => {
  for (const c of STYLE_EVAL) {
    const v = checkStyle(c.reference, { general: c.general });
    assert.ok(v.ok, `${c.id}: ${v.problems.join("; ")} (grade ${v.r.grade})`);
    assert.ok(v.r.firstSentenceWords <= 25, `${c.id}: first sentence ${v.r.firstSentenceWords} words`);
    assert.ok(v.r.maxParagraphSentences <= 4, `${c.id}: paragraph of ${v.r.maxParagraphSentences} sentences`);
    for (const m of c.mustMention) assert.ok(c.reference.toLowerCase().includes(m.toLowerCase()), `${c.id} mentions ${m}`);
  }
});

test("eval set: general answers average US grade 8–10; technical ones stay readable too", () => {
  const general = STYLE_EVAL.filter((c) => c.general).map((c) => readability(c.reference).grade);
  const mean = general.reduce((a, b) => a + b, 0) / general.length;
  assert.ok(mean >= 7.5 && mean <= 10, `general mean grade ${mean.toFixed(1)}`);
  for (const c of STYLE_EVAL.filter((x) => !x.general)) assert.ok(readability(c.reference).grade <= 12, `${c.id} ${readability(c.reference).grade}`);
  const s = scoreAnswers(Object.fromEntries(STYLE_EVAL.map((c) => [c.id, c.reference])));
  assert.equal(s.pass, STYLE_EVAL.length);
});

test("eval set: the meter catches jargon-heavy filler and choppy walls of text", () => {
  const bad = STYLE_COUNTEREXAMPLES.find((x) => x.id === "preamble-jargon")!;
  const v = checkStyle(bad.answer, { general: true });
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => /grade|filler|long/.test(p)));
  // Missing facts are reported even when the prose is fine.
  const s = scoreAnswers({ "pdf-lease": "Yes, you can leave early. Ask your landlord about the cost." });
  assert.deepEqual(s.scores[0].missing.sort(), ["$3,600", "60 days", "section 14"].sort());
});

test("prompts: the panel, the synthesizer and the critique all carry the clarity and grounding rules", () => {
  assert.ok(BASE_SYSTEM_PROMPT.includes(CLARITY_STYLE_SHORT));
  assert.ok(BASE_SYSTEM_PROMPT.includes(GROUNDING_STYLE));
  assert.ok(SYNTH_SYSTEM_PROMPT.includes(CLARITY_STYLE));
  assert.ok(SYNTH_SYSTEM_PROMPT.includes(GROUNDING_STYLE));
  assert.match(CRITIQUE_SYSTEM_PROMPT, /clear|plain|jargon/i);
  assert.match(CLARITY_STYLE, /grade 8–10/);
});

test("assumption-first rules reach ordinary answers, synthesis and Core without permitting invented facts", () => {
  for (const prompt of [BASE_SYSTEM_PROMPT, SYNTH_SYSTEM_PROMPT, PLANNER(), STEP(), REVISER, INSIGHT()]) {
    assert.ok(prompt.includes(ASSUMPTION_STYLE));
  }
  assert.match(ASSUMPTION_STYLE, /Respect explicit instructions and corrections/);
  assert.match(ASSUMPTION_STYLE, /never invent evidence/);
  assert.match(ASSUMPTION_STYLE, /essential input cannot safely be inferred/);
  assert.match(INSIGHT(), /Optional preferences are not blockers/);
  assert.doesNotMatch(INSIGHT(), /missing detail would materially change/);
});

import { PRESENCE_EVAL, scorePresence } from "../src/lib/style/eval-set";
import { checkPresence } from "../src/lib/style/readability";
import { PRESENCE_STYLE, CREATE_EXPLAIN_STYLE } from "../src/lib/style/clarity";

test("presence eval: every behavior is covered with before/after pairs", () => {
  const kinds = new Set(PRESENCE_EVAL.map((c) => c.behavior));
  for (const k of ["acknowledge", "reasoning", "no-reasoning", "uncertainty", "context", "create-narration"]) assert.ok(kinds.has(k as never), k);
});

test("presence eval: every 'after' answer passes; every 'before' answer is caught", () => {
  for (const c of PRESENCE_EVAL) {
    const a = scorePresence(c, c.after);
    assert.ok(a.ok, `${c.id} after: ${a.problems.join("; ")}`);
    const b = scorePresence(c, c.before);
    assert.equal(b.ok, false, `${c.id}: the pattern-matched answer should fail`);
  }
});

test("presence checks: filler closers, saccharine sympathy and feelings claims are flagged; plain acknowledgment is not", () => {
  assert.deepEqual(checkPresence("Here's the fix. Hope this helps!").problems, ["generic closer"]);
  assert.ok(checkPresence("I completely understand how frustrating this must be. Take a deep breath.").problems.includes("saccharine or therapist-like"));
  assert.ok(checkPresence("I'm so excited to help you with this.").problems.includes("claims feelings"));
  assert.equal(checkPresence("Two hours on one import error is rough, so here's the direct fix.").ok, true);
});

test("presence rules reach every writer and forbid feelings claims", () => {
  assert.ok(CLARITY_STYLE.includes(PRESENCE_STYLE));
  assert.ok(SYNTH_SYSTEM_PROMPT.includes(PRESENCE_STYLE));
  assert.match(CLARITY_STYLE_SHORT, /never claim feelings/);
  assert.match(PRESENCE_STYLE, /Never claim to have feelings/);
  assert.match(PRESENCE_STYLE, /models disagreed/);
  assert.match(CREATE_EXPLAIN_STYLE, /trades away/);
  assert.match(CREATE_EXPLAIN_STYLE, /assumption/);
});

import { narrateBuild, promptForDisplay } from "../src/lib/style/create-narration";

test("create narration: decisions with why and trade-off, assumptions to check, reference briefs hidden from the log", () => {
  const n = narrateBuild("Built Stillpoint: 4 screens.", {
    decisions: [{ choice: "Schedule on the home page", why: "most visitors arrive to book a class", tradeoff: "less room for the studio's story" }],
    assumptions: ["60-minute classes", "opening hours 7am–8pm"],
  });
  assert.match(n, /Why it's built this way/);
  assert.match(n, /\*\*Schedule on the home page\*\*: most visitors arrive to book a class\. Trade-off: less room/);
  assert.match(n, /Assumptions to check: 60-minute classes; opening hours 7am–8pm\./);
  assert.equal(narrateBuild("Built X.", {}), "Built X.");
  assert.equal(promptForDisplay("A yoga site\n\nReferences (inspiration only). Use the reference…\n- Reference site: x"), "A yoga site");
  assert.equal(checkPresence(n).ok, true);
});
