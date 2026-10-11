import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { ENTITIES, matchEntity, pricingReply, productFacts, understand, understandingBlock, type Intent } from "@/lib/orchestration/understand";
import { tiers } from "@/lib/tiers";

type Turn = { role: "user" | "keplar"; text: string };
const WHO_MADE: Turn[] = [{ role: "user", text: "who made" }, { role: "keplar", text: "Keplar was created by two co-founders, Hassen and Hussain Keder." }];
const CLAUDE: Turn[] = [{ role: "user", text: "tell me about claude" }, { role: "keplar", text: "Claude is an AI assistant." }];
const ASKED: Turn[] = [{ role: "user", text: "i want to learn a language" }, { role: "keplar", text: "Nice! Which language do you have in mind?" }];

type Row = { prompt: string; history?: Turn[]; intent: Intent; subject?: string; cross?: boolean; note?: RegExp | null };
const TABLE: Row[] = [
  // the user's own examples
  { prompt: "who made", intent: "creator", subject: "keplar", note: /reading "who made" as who made Keplar One/ },
  { prompt: "Who made?", intent: "creator", subject: "keplar", note: /who made Keplar One/ },
  { prompt: "who made it", intent: "creator", subject: "keplar" },
  { prompt: "chatgpt", intent: "brand", subject: "chatgpt", cross: true, note: /quick overview of ChatGPT/ },
  { prompt: "keplar one", history: WHO_MADE, intent: "creator", subject: "keplar", note: /Going by what we were just talking about.*who made Keplar One/ },
  { prompt: "keplar one", intent: "brand", subject: "keplar", cross: true },
  { prompt: "claude vs you", intent: "compare", subject: "claude+keplar", cross: true, note: /comparison of Claude and Keplar One/ },
  { prompt: "pricing", intent: "pricing", subject: "keplar", note: /Keplar One's pricing/ },
  // context decides
  { prompt: "chatgpt", history: [{ role: "user", text: "who made" }], intent: "maker", subject: "chatgpt", cross: true, note: /who made ChatGPT/ },
  { prompt: "claude", history: WHO_MADE.slice(0, 1), intent: "maker", subject: "claude", cross: true },
  { prompt: "pricing", history: CLAUDE, intent: "brand", subject: "claude", cross: true, note: /Claude's pricing/ },
  { prompt: "keplar one", history: [{ role: "user", text: "pricing" }], intent: "pricing", subject: "keplar" },
  { prompt: "who made", history: CLAUDE, intent: "maker", subject: "claude", cross: true },
  { prompt: "why", history: CLAUDE, intent: "followup" },
  { prompt: "tell me more", history: CLAUDE, intent: "followup" },
  { prompt: "help", history: CLAUDE, intent: "followup" },
  { prompt: "who", history: CLAUDE, intent: "followup" },
  { prompt: "what", history: CLAUDE, intent: "followup" },
  { prompt: "the second one", history: CLAUDE, intent: "followup" },
  { prompt: "python", history: ASKED, intent: "plain" },
  // typos
  { prompt: "chatgtp", intent: "brand", subject: "chatgpt", cross: true },
  { prompt: "chat gpt", intent: "brand", subject: "chatgpt", cross: true },
  { prompt: "wat is chatgtp", intent: "brand", subject: "chatgpt", cross: true, note: null },
  { prompt: "what is claud", intent: "brand", subject: "claude", cross: true, note: null },
  { prompt: "gemni", intent: "brand", subject: "gemini", cross: true },
  { prompt: "deep seek", intent: "brand", subject: "deepseek", cross: true },
  { prompt: "clude vs u", intent: "compare", subject: "claude+keplar", cross: true },
  { prompt: "chatgtp or keplar one", intent: "compare", subject: "chatgpt+keplar", cross: true },
  { prompt: "claude or gemini", intent: "compare", subject: "claude+gemini", cross: true },
  { prompt: "is claude better than you", intent: "compare", subject: "claude+keplar", cross: true },
  { prompt: "vs gemini", intent: "compare", subject: "keplar+gemini", cross: true },
  { prompt: "prcing", intent: "pricing", subject: "keplar" },
  { prompt: "pricng", intent: "pricing", subject: "keplar" },
  { prompt: "how much", intent: "pricing", subject: "keplar" },
  { prompt: "plans", intent: "pricing", subject: "keplar" },
  { prompt: "is it free", intent: "pricing", subject: "keplar" },
  { prompt: "who maed", intent: "creator", subject: "keplar" },
  { prompt: "whos behind", intent: "creator", subject: "keplar" },
  { prompt: "kepler one", history: WHO_MADE, intent: "creator", subject: "keplar" },
  // contextless fragments reach the models for a useful assumption
  { prompt: "it", intent: "infer" },
  { prompt: "the second one", intent: "infer" },
  { prompt: "tell me more", intent: "infer" },
  { prompt: "help", intent: "infer" },
  { prompt: "who", intent: "infer" },
  // short topics get an overview with a note
  { prompt: "python", intent: "overview", cross: true, note: /quick overview of python/ },
  { prompt: "mars", intent: "overview", cross: true },
  // left alone
  { prompt: "hi", intent: "plain" },
  { prompt: "what is the capital of france", intent: "plain" },
  { prompt: "write a poem about the sea", intent: "plain" },
  { prompt: "who made the telescope", intent: "plain" },
  { prompt: "is salt and pepper a good combo", intent: "plain" },
  { prompt: "const x = 1", intent: "plain" },
  { prompt: "I'm so stressed about my exam tomorrow", intent: "plain" },
];

for (const r of TABLE) {
  test(`understand: ${JSON.stringify(r.prompt)}${r.history ? " (with history)" : ""} -> ${r.intent}`, () => {
    const u = understand({ prompt: r.prompt, history: r.history });
    assert.equal(u.intent, r.intent);
    if (r.subject) assert.equal(u.subject, r.subject);
    assert.equal(u.crossCheck, Boolean(r.cross), "crossCheck");
    if (r.note) assert.match(u.assumption ?? "", r.note);
    if (r.note === null) assert.equal(u.assumption, null);
    assert.equal(u.clarify, null);
    // every assumption is a plain, correctable sentence
    if (u.assumption) assert.match(u.assumption, /Tell me if you meant something else\.$/);
  });
}

test("a best-guess reading is preferred over a bare clarifying question for fragments with a sensible default", () => {
  for (const p of ["who made", "chatgpt", "pricing", "claude vs you", "python", "keplar one"]) assert.equal(understand({ prompt: p }).clarify, null, p);
});

test("opening fragments preserve the actual words and defer the assumption without inventing history", () => {
  for (const prompt of ["it", "the second one", "help", "who", "tell me more"]) {
    const u = understand({ prompt });
    assert.equal(u.intent, "infer");
    assert.ok(u.rewritten?.startsWith(`${prompt}\n\n`));
    assert.equal(u.usedContext, false);
    assert.equal(u.assumption, null, "the model chooses the reading, not the heuristic");
    assert.match(u.rewritten!, /Do not invent an earlier conversation/);
    const guidance = understandingBlock(u, prompt);
    assert.match(guidance, /state it briefly and continue/);
    assert.doesNotMatch(guidance, /app already shows/);
  }
});

test("contextual fragments keep the request in the conversation, without the opening-message fallback", () => {
  const history: Turn[] = [
    { role: "user", text: "Suggest two names for my bakery" },
    { role: "keplar", text: "1. Hearth & Honey\n2. Morning Crumb" },
  ];
  for (const prompt of ["the second one", "help", "which", "what"]) {
    const u = understand({ prompt, history });
    assert.equal(u.intent, "followup");
    assert.equal(u.usedContext, true);
    assert.equal(u.assumption, null);
    assert.match(u.rewritten!, /conversation/);
    assert.doesNotMatch(u.rewritten!, /short opening message|get started with Keplar/);
  }
});

test("rewrites carry the product context and tell models not to claim which models Keplar uses", () => {
  const u = understand({ prompt: "claude vs you" });
  assert.match(u.rewritten!, /Claude/);
  assert.match(u.rewritten!, /Keplar One/);
  assert.match(u.rewritten!, /do not claim which specific models Keplar uses/i);
  const brand = understand({ prompt: "chatgpt" });
  assert.match(brand.rewritten!, /OpenAI/);
  assert.match(brand.rewritten!, /how Keplar relates/);
  assert.match(brand.rewritten!, /do not invent/i);
  const block = understandingBlock(brand, "chatgpt");
  assert.match(block, /Keplar One/);
  assert.match(block, /not ChatGPT, Claude or any single model/);
  assert.match(block, /do not add your own/i);
  assert.equal(understandingBlock(understand({ prompt: "hello there friend" }), "hello there friend"), "");
});

test("product facts and the pricing reply come from the plan data, with nothing invented", () => {
  const facts = productFacts();
  for (const t of tiers) assert.ok(facts.includes(t.name), t.name);
  assert.match(facts, /two co-founders, Hassen and Hussain Keder \(two different people/);
  assert.doesNotMatch(facts, /Keplar Team/);
  assert.match(facts, /One question\. Multiple intelligences\. One answer\./);
  const reply = pricingReply();
  for (const t of tiers) {
    assert.ok(reply.includes(`**${t.name}**`), t.name);
    if (t.price) assert.ok(reply.includes(`$${t.price}/month`), `${t.name} ${t.price}`);
  }
  assert.doesNotMatch(reply, /birth|years old/i);
});

test("saved notes: a first name is used only when a note says it; nothing is invented", () => {
  assert.equal(understand({ prompt: "it", facts: ["The user is called Sam."] }).name, "Sam");
  assert.equal(understand({ prompt: "it", facts: ["The user likes short answers."] }).name, undefined);
  assert.equal(understand({ prompt: "it" }).name, undefined);
});

test("entity matching: aliases, typos, and no false positives", () => {
  assert.equal(matchEntity("ChatGPT")?.key, "chatgpt");
  assert.equal(matchEntity("chatgbt")?.key, "chatgpt");
  assert.equal(matchEntity("Claude AI")?.key, "claude");
  assert.equal(matchEntity("kepler one")?.key, "keplar");
  assert.equal(matchEntity("kepler"), null, "the astronomer");
  assert.equal(matchEntity("gemstone"), null);
  assert.equal(matchEntity("grill"), null);
  assert.equal(matchEntity("llamas"), null);
  assert.ok(ENTITIES.every((e) => e.maker && e.display));
});
