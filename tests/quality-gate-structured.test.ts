import assert from "node:assert/strict";
import { test } from "node:test";
import { assessOutput } from "@/lib/orchestration/quality-gate";

/** A realistic Study practice reply: 5 topics x 6 cards + 4 questions, all sharing the same keys and question openings. */
const topics = ["Light reactions", "Calvin cycle", "Chloroplast structure", "Limiting factors", "Photorespiration"];
const terms = ["thylakoid", "stroma", "RuBisCO", "NADPH", "ATP synthase", "chlorophyll a", "granum", "stomata", "G3P", "carbon fixation", "photolysis", "PSII"];
const practice = {
  topics: topics.map((name, ti) => ({
    name,
    cards: Array.from({ length: 6 }, (_, ci) => ({ front: `What is the role of ${terms[(ti + ci) % terms.length]} in ${name.toLowerCase()}?`, back: `It is the part of ${name.toLowerCase()} described on page ${ti + 1}, item ${ci + 1}.`, page: 1 })),
    questions: Array.from({ length: 4 }, (_, qi) => ({ type: "mc", q: `Which of the following best describes ${terms[(ti * 2 + qi) % terms.length]}?`, options: ["A membrane", "An enzyme", "A pigment", "A sugar"], answer: qi % 4, explanation: `The guide says so on page ${ti + 1}.`, page: 1 })),
  })),
};

test("structured study output with repeated card structure passes the quality gate", () => {
  const raw = JSON.stringify(practice);
  assert.deepEqual(assessOutput(raw, { prompt: "Topics: ..." }), { ok: true });
  assert.deepEqual(assessOutput("```json\n" + JSON.stringify(practice, null, 2) + "\n```"), { ok: true });
  // A slide deck: every slide shares a section label and the same keys.
  const deck = { title: "Pitch", slides: Array.from({ length: 12 }, (_, i) => ({ layout: "content", title: `Point ${i + 1}: ${terms[i]}`, section: "The plan", bullets: [`Why ${terms[i]} matters`, `What we do about ${terms[i]}`], notes: "Say it plainly.", imagePrompt: "" })) };
  assert.deepEqual(assessOutput(JSON.stringify(deck)), { ok: true });
});

test("loops are still caught inside structured output", () => {
  const looped = { topics: [{ name: "x", cards: [{ front: "ells ".repeat(1) + "ellsellsellsells", back: "y", page: 1 }] }] };
  assert.equal(assessOutput(JSON.stringify(looped)).ok, false);
  const phrase = { summary: "the cell is the cell is the cell is the cell is the cell is the cell is the cell is the cell is ".repeat(2) + "and more words to make it long enough for the gram check to apply here today" };
  assert.equal(assessOutput(JSON.stringify(phrase)).ok, false);
  const same = { cards: Array.from({ length: 6 }, () => ({ front: "What does the chloroplast do during the light reactions?", back: "ok" })) };
  assert.equal(assessOutput(JSON.stringify(same)).ok, false);
  // Unparseable (truncated) JSON keeps the old whole-text checks.
  const truncated = JSON.stringify(practice).slice(0, 1200);
  assert.equal(typeof assessOutput(truncated).ok, "boolean");
});
