import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { understand } from "@/lib/orchestration/understand";
const history: { role: "user" | "keplar"; text: string }[] = [
  { role: "user", text: "Explain photosynthesis to a 10-year-old in two paragraphs." },
  { role: "keplar", text: "Plants use sunlight to turn water and carbon dioxide into sugars. Chlorophyll captures light in the leaves." },
];
for (const prompt of ["shorter", "make it simpler", "Less formal, please!", "more natural", "a table", "put it in bullet points", "continue", "go deeper", "examples", "why?", "try again", "that's wrong"]) {
  test("answer follow-up stays with the prior answer: " + prompt, () => {
    const r = understand({ prompt, history });
    assert.equal(r.intent, "followup");
    assert.equal(r.usedContext, true);
    assert.equal(r.assumption, null);
    assert.equal(r.clarify, null);
    assert.ok(r.rewritten?.startsWith(prompt));
    assert.doesNotMatch(r.rewritten!, /short, useful overview/);
  });
}
test("new topics and complete requests keep their meaning", () => {
  for (const prompt of ["table tennis", "Why is the sky blue?", "Write an email to Alex", "shorter working weeks", "Explain simpler neural networks"]) {
    assert.doesNotMatch(understand({ prompt, history }).contextRead ?? "", /previous answer|work already in progress/);
  }
});
test("no previous answer means nothing is silently invented to revise", () => {
  for (const h of [[], history.slice(0, 1), [{ role: "keplar" as const, text: "Hi" }]]) {
    assert.doesNotMatch(understand({ prompt: "shorter", history: h }).rewritten ?? "", /Revise the most recent relevant answer/);
  }
});
test("revisions return the result; corrections recheck rather than agree blindly", () => {
  assert.match(understand({ prompt: "shorter", history }).rewritten!, /Return the revised text itself.*earlier constraints/);
  assert.match(understand({ prompt: "that's wrong", history }).rewritten!, /do not automatically accept a false correction/);
});
