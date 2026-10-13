import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectMood, HUMAN_TONE_PROMPT, HUMAN_TONE_SHORT, HUMOR_PROMPT, humorCall, humorNote, moodNote, polish } from "@/lib/persona-tone";
import { PLAYFUL_SYSTEM } from "@/lib/orchestration/playful";
import { BASE_SYSTEM_PROMPT } from "@/lib/orchestration/providers/shared";
import { SMALLTALK_SYSTEM_PROMPT } from "@/lib/orchestration/smalltalk";
import { guardVoice, VOICE_PROMPT } from "@/lib/persona";
import { guardHumanClaim, NOT_HUMAN_LINE } from "@/lib/orchestration/identity-guards";

test("mood detection: frustration, excitement, sadness, stress, crisis and neutral", () => {
  const cases: [string, string][] = [
    ["ugh this still doesn't work", "frustrated"], ["this is the third time I'm asking", "frustrated"], ["WHY IS THIS NOT WORKING AT ALL", "frustrated"], ["wtf, it keeps crashing", "frustrated"],
    ["I'm so excited, I got the job!", "excited"], ["we shipped it!! so happy", "excited"], ["yay, it finally works", "excited"], ["amazing news: I passed", "excited"],
    ["I'm really sad today", "sad"], ["my grandma passed away", "sad"], ["I feel so alone lately", "sad"], ["we broke up and I miss him so much", "sad"],
    ["I'm so stressed about my deadline", "stressed"], ["I feel overwhelmed", "stressed"], ["my interview is tomorrow and I'm nervous", "stressed"], ["I haven't studied and the exam is tonight", "stressed"],
    ["I want to kill myself", "crisis"], ["I don't want to live anymore", "crisis"], ["thinking about self-harm", "crisis"],
    ["what is the capital of France", "neutral"], ["What is the capital of Australia, and why isn't it Sydney?", "neutral"], ["why is it hot in summer", "neutral"], ["why doesn't it rain in the desert", "neutral"], ["how many times does 7 go into 56", "neutral"], ["which team won the cup for the third time", "neutral"], ["why won't it load", "frustrated"], ["why can't you understand me", "frustrated"], ["how many times do I have to ask", "frustrated"], ["write a function that sorts a list", "neutral"], ["how do I stress test a server", "neutral"], ["summarize this article", "neutral"], ["", "neutral"],
  ];
  for (const [t, m] of cases) assert.equal(detectMood(t), m, t);
});

test("mood notes guide tone for the writer; neutral adds nothing; crisis points to real help", () => {
  assert.equal(moodNote("neutral"), "");
  for (const m of ["frustrated", "excited", "sad", "stressed", "crisis"] as const) assert.match(moodNote(m), /^Tone guidance for this reply/);
  assert.match(moodNote("crisis"), /988/);
  assert.match(moodNote("crisis"), /trust|crisis line/);
  assert.match(moodNote("sad"), /gently/i);
  assert.match(moodNote("frustrated"), /acknowledgement/);
});

test("the tone prompt asks for warmth, matched empathy, first-person feelings as voice, fitting humor, no boilerplate, concise exact formats; and never human or sentient", () => {
  for (const w of ["natural conversational phrasing", "frustrated", "excited", "sad or stressed", "curiosity, delight, concern, enthusiasm, humility", "humor", "No corporate boilerplate", "Be concise", "never say or imply that you are a human"]) assert.match(HUMAN_TONE_PROMPT, new RegExp(w, "i"), w);
  assert.match(HUMAN_TONE_PROMPT, /voice, not a claim/);
  assert.match(HUMAN_TONE_PROMPT, /Invent no facts about the person/);
  // no overlap with the voice rule: the tone prompt does not restate the consciousness rules
  assert.doesNotMatch(HUMAN_TONE_PROMPT, /conscious|sentient/i);
  assert.ok(BASE_SYSTEM_PROMPT.includes(HUMAN_TONE_SHORT));
  assert.ok(SMALLTALK_SYSTEM_PROMPT.includes(HUMAN_TONE_SHORT));
  assert.ok(SMALLTALK_SYSTEM_PROMPT.includes(VOICE_PROMPT), "the voice layer is still there");
});

test("a real sense of humor, with judgment: everywhere Keplar writes, never when the person is upset or the subject is sensitive", () => {
  assert.ok(HUMAN_TONE_PROMPT.includes(HUMOR_PROMPT), "writers get the full humor guidance");
  for (const w of ["dry, quick and observational", "at most one", "never instead of it", "callback", "self-deprecation about being an AI", "frustrated, sad, stressed", "health, legal, safety", "code, math, data", "at their expense", "blur a fact"]) assert.match(HUMOR_PROMPT, new RegExp(w, "i"), w);
  assert.match(HUMAN_TONE_SHORT, /sense of humor/);
  assert.match(HUMAN_TONE_SHORT, /never when they are upset/);
  assert.match(SMALLTALK_SYSTEM_PROMPT, /quick-witted/);
  assert.match(PLAYFUL_SYSTEM, /fresh joke/);
  for (const m of ["frustrated", "sad", "stressed"] as const) assert.match(moodNote(m), /jokes/, m);
  assert.doesNotMatch(moodNote("crisis"), /playful/);
});

test("polish: stock openers and closers go; code, math and exact facts are untouched", () => {
  assert.equal(polish("Certainly! Canberra is the capital of Australia."), "Canberra is the capital of Australia.");
  assert.equal(polish("Great question! The answer is 391."), "The answer is 391.");
  assert.equal(polish("As an AI language model, I can say the capital is Canberra."), "I can say the capital is Canberra.");
  assert.equal(polish("Use a map.\n\nI hope this helps!"), "Use a map.");
  assert.equal(polish("Use a map. Let me know if you have any other questions."), "Use a map.");
  const code = "Here's one:\n\n```ts\n// Certainly! I hope this helps!\nconst x = 1;\n```\n\nThat's it.";
  assert.equal(polish(code), code);
  assert.equal(polish("17 × 23 = 391"), "17 × 23 = 391");
  assert.equal(polish("Sure!"), "Sure!", "never reduces an answer to nothing");
  assert.equal(polish("I'm glad you asked. Certainly the weather is nice."), "I'm glad you asked. Certainly the weather is nice.");
  assert.equal(polish(polish("Absolutely! Yes, you can.")), "Yes, you can.");
});

test("polish also removes any claim to be human, and leaves negations alone", () => {
  assert.equal(polish("Yes, I'm a human. Anyway, here is the answer."), `${NOT_HUMAN_LINE} Anyway, here is the answer.`);
  assert.equal(polish("I'm not a human, but I'm happy to help."), "I'm not a human, but I'm happy to help.");
  assert.equal(guardHumanClaim("As a human, I get nervous too."), NOT_HUMAN_LINE);
  // composes with the consciousness guard
  assert.doesNotMatch(polish(guardVoice("I am conscious. I'm a person. Here you go.")), /conscious|person/);
});

test("polish: chatbot tells are rewritten in prose, never in code", () => {
  assert.equal(polish("It's important to note that the cache expires daily."), "The cache expires daily.");
  assert.equal(polish("Use a lock. It is worth noting that reads stay fast."), "Use a lock. Reads stay fast.");
  assert.equal(polish("Pick B, but it's worth noting that A is cheaper."), "Pick B, but A is cheaper.");
  assert.equal(polish("Go with Postgres.\n\nIn conclusion, it scales fine."), "Go with Postgres.\n\nIt scales fine.");
  assert.equal(polish("Let's delve into the logs. Delving deeper helps."), "Let's dig into the logs. Digging deeper helps.");
  const code = "```js\n// it's important to note that delve stays\n```";
  assert.equal(polish(code), code);
  assert.equal(polish("Run `delve debug` to start."), "Run `delve debug` to start.");
  const once = polish("It's worth noting that X holds. In summary, fine.");
  assert.equal(polish(once), once, "safe to call twice");
});

test("humor is decided in code too: off for serious subjects even in a calm tone, matched when the person is playful", () => {
  // Serious subjects in a calm, neutral tone: the writer is told plainly, no jokes in this reply.
  for (const q of [
    "How do I contest an eviction notice?",
    "What are the side effects of chemotherapy?",
    "My grandmother's funeral is on Friday, what should I write in the eulogy?",
    "How does bankruptcy affect my credit score?",
    "Is it legal for my landlord to keep my deposit if I'm being sued?",
    "My coworker keeps harassing me, what can I do?",
    "Explain the causes of the Rwandan genocide",
  ]) {
    assert.equal(humorCall(q, "neutral"), "off", q);
    assert.match(humorNote(q, "neutral"), /subject is serious\. No jokes, wit, wordplay or wry asides/, q);
  }
  // Everyday words that only look serious leave the default alone.
  for (const q of ["Best shoes for a basketball court?", "How do I paint a smooth brush stroke?", "Why are my phone charges so high this month?", "What's a good name for a cat?", "How long should I boil an egg?"]) {
    assert.equal(humorCall(q, "neutral"), "default", q);
    assert.equal(humorNote(q, "neutral"), "", q);
  }
  // The person is being playful: match it with one fresh line, then the full answer.
  for (const q of ["lol ok so how do I fold a fitted sheet", "my cat knocked my coffee over again 😂 how do I get it out of the rug", "haha fine, what's the capital of Australia", "jk, how do magnets work", "is pineapple on pizza a crime :)"]) {
    assert.equal(humorCall(q, "neutral"), "match", q);
    assert.match(humorNote(q, "neutral"), /being playful\. Match it with one quick, fresh line of wit[\s\S]*then give the real answer in full/, q);
  }
  // Serious wins over playful; an upset mood switches it off and leaves the wording to moodNote; excited still allows it.
  assert.equal(humorCall("lol my lawyer says the court date moved", "neutral"), "off");
  for (const m of ["frustrated", "sad", "stressed", "crisis"] as const) {
    assert.equal(humorCall("haha whatever", m), "off", m);
    assert.equal(humorNote("haha whatever", m), "", `${m}: the mood note already says no jokes`);
  }
  assert.equal(humorCall("I got the job!!! haha", "excited"), "match");
  assert.equal(humorCall("are you kidding me, it crashed again", "neutral"), "default", "not laughter");
});

test("the answer route places the humor note with the mood note, ahead of the question", () => {
  const route = readFileSync("src/app/api/keplar/route.ts", "utf8");
  assert.match(route, /moodNote\(mood\), humorNote\(askedPrompt, mood\)/);
});
