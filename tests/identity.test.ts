import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { CREATOR_CREDIT, identityPrompt, scrubCreatorAges } from "@/lib/identity";
import { creatorAnswers, pickCreatorAnswer, runCreator } from "@/lib/orchestration/creator";
import { systemPrompt } from "@/lib/orchestration/providers/shared";
import { SMALLTALK_SYSTEM_PROMPT } from "@/lib/orchestration/smalltalk";
import { assessOutput } from "@/lib/orchestration/quality-gate";
import type { KeplarEvent } from "@/lib/orchestration/types";

const d = (s: string) => new Date(`${s}T12:00:00Z`);

test("identity: the creators' age and birth date are never published (they are minors)", () => {
  for (const day of ["2026-10-03", "2026-12-24", "2027-06-01"]) {
    for (const t of creatorAnswers(d(day))) {
      assert.doesNotMatch(t, /2011|december|born|birth|24th|years old|\bage\b|teen/i, t);
      for (const n of t.match(/\d+/g) ?? []) assert.equal(Number(n), 2026, t);
    }
  }
  const p = identityPrompt(d("2026-10-03"));
  assert.doesNotMatch(p, /\b1[0-9]\b|years old right now|include their age/);
  assert.match(p, /Never state, confirm, hint at or guess Hassen's or Hussain's age/);
});

test("identity: scrubCreatorAges removes age and birth-date sentences about the creators, and nothing else", () => {
  const leaked = "Keplar was created by two co-founders, Hassen and Hussain Keder. Both are 14. They founded it in 2026.";
  assert.equal(scrubCreatorAges(leaked), "Keplar was created by two co-founders, Hassen and Hussain Keder. They founded it in 2026.");
  assert.doesNotMatch(scrubCreatorAges("Hassen Keder and Hussain Keder co-founded Keplar. The Keders were born in 2011."), /born|2011/);
  assert.equal(scrubCreatorAges("Hassen and Hussain are both 14 years old. Keplar asks several AI models."), "Keplar asks several AI models.");
  assert.equal(scrubCreatorAges("Hassen and Hussain founded Keplar in 2026.\n\n- Hassen is 14\n- It uses 3 models."), "Hassen and Hussain founded Keplar in 2026.\n\n- It uses 3 models.");
  assert.doesNotMatch(scrubCreatorAges("Keplar's founders, Hassen and Hussain, were born in 2011. Keplar launched in 2026."), /born|2011/);
  assert.doesNotMatch(scrubCreatorAges("Hassen and Hussain are teenagers who built Keplar. It compares models."), /teen/);
  // untouched: not about the creators, or no age claim
  const other = "Elon Musk is 55 years old and was born in 1971.";
  assert.equal(scrubCreatorAges(other), other);
  const plain = "Hassen and Hussain Keder, two co-founders, made Keplar. It sends your question to 3 models.";
  assert.equal(scrubCreatorAges(plain), plain);
});

test("identity: repeated asks give different wordings, always with the names, never with an age", () => {
  const seen = new Set<string>();
  const N = 300;
  for (let i = 0; i < N; i++) {
    const t = pickCreatorAnswer();
    seen.add(t);
    assert.match(t, /Hassen/);
    assert.match(t, /Hussain/);
    assert.match(t, /Keder/);
    assert.match(t, /co-found/i);
    assert.doesNotMatch(t, /Keplar team/i);
    assert.match(t, /2026/, "founded in 2026");
    assert.match(t, /disagree/);
    assert.doesNotMatch(t, /\b14\b|years old/);
  }
  assert.ok(seen.size >= 40, `only ${seen.size} distinct answers in ${N} asks`);
  // both the exact long credit and shorter variants are in the pool
  const pool = creatorAnswers();
  assert.equal(CREATOR_CREDIT, "Hassen and Hussain Keder");
  assert.ok(pool.some((t) => t.includes(CREATOR_CREDIT)), "exact 'Hassen and Hussain Keder' form");
  assert.ok(pool.some((t) => t.includes("Hassen Keder and Hussain Keder")), "both full names spelled out");
  assert.ok(pool.some((t) => t.includes("two different people")) && pool.some((t) => t.includes("two separate people")), "says they are two people");
  assert.ok(pool.some((t) => t.length < 250) && pool.some((t) => t.length > 330), "short and long variants");
});

test("identity: the streamed reply is a different string across runs, and passes the quality gate", async () => {
  const outs = new Set<string>();
  for (let i = 0; i < 25; i++) {
    let text = "";
    const events: KeplarEvent[] = [];
    for await (const e of runCreator()) events.push(e);
    for (const e of events) if (e.type === "delta") text += e.text;
    outs.add(text);
    assert.match(text, /Hassen/);
    assert.match(text, /Hussain/);
    assert.equal(assessOutput(text, { prompt: "who made you?" }).ok, true, text);
  }
  assert.ok(outs.size >= 8, `${outs.size} distinct`);
});

test("identity: model prompts carry the facts and the rules, never the age or birth date", () => {
  const p = identityPrompt(d("2026-10-03"));
  assert.ok(p.includes(CREATOR_CREDIT));
  assert.doesNotMatch(p, /years old/);
  assert.match(p, /founded Keplar in 2026/);
  assert.match(p, /two co-founders/);
  assert.match(p, /two different people/);
  assert.match(p, /never alternate spellings of one name/);
  assert.match(p, /never has a single founder or owner/);
  assert.doesNotMatch(p, /Keplar Team/);
  assert.match(p, /One question\. Multiple intelligences\. One answer\./);
  assert.match(p, /multiple AI models, detects where they disagree, verifies, and synthesizes one answer/);
  assert.match(p, /no claims about accuracy/i);
  assert.match(p, /keep the answer short/i);
  assert.match(p, /vary the wording/i);
  assert.match(p, /in the user's language/i);
  assert.match(p, /decline/i);
  assert.match(p, /do not share, confirm or guess|do not state anything else/i);
  assert.doesNotMatch(p, /2011|December|12-24|24th/i, "the birth date must never reach a prompt");
  // every default model call and the plain-chat path get it
  assert.ok(systemPrompt().includes(CREATOR_CREDIT));
  assert.doesNotMatch(systemPrompt(), /2011|December/);
  assert.ok(!SMALLTALK_SYSTEM_PROMPT.includes("2011"));
});
