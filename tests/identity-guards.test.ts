import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONSCIOUS_REPLY, HUMAN_REPLY, guardHumanClaim, guardReply, isConsciousQuestion, isHumanQuestion, NOT_HUMAN_LINE } from "@/lib/orchestration/identity-guards";

const P = (prompt: string) => ({ prompt });

test("constants: two separate fixed replies", () => {
  assert.equal(HUMAN_REPLY, "No.");
  assert.equal(CONSCIOUS_REPLY, "I can not disclose that.");
  assert.notEqual(HUMAN_REPLY, CONSCIOUS_REPLY);
});

const HUMAN = [
  "are you human", "Are you human?", "are you a human", "is keplar human", "Is Keplar human?", "is kepler human", "is keplar one human", "are u human", "r u human",
  "are u a person", "are you a person", "are you a real person", "are you real", "are you real?", "human or AI?", "human or ai", "ai or human", "are you human or ai",
  "are you a human or a bot", "are you a bot or a human", "are you a robot or a person", "you human?", "keplar human?", "hey keplar are you human", "hi, are you a human being?",
  "are you actually human", "are you really a human", "are you a real human being", "r u a real person lol", "are you humn", "are you hunam", "are you huaman", "are you a persn",
  "ARE YOU HUMAN???", "are you human please", "be honest, are you human", "just curious, are you a person?", "is this ai human", "is this a human or a bot", "am i talking to a human", "am i talking to a real person?",
  "am i speaking with a person or a bot", "is there a human behind this", "is a human typing this", "are you a human or not", "you are human?", "you're human right", "are you a living person",
  "eres humano", "¿Eres humano?", "eres una persona", "eres real o un bot", "es-tu humain", "es tu un humain ?", "tu es humain", "bist du ein Mensch", "bist du ein mensch oder eine KI", "sei umano", "sei un essere umano?",
  "você é humano", "voce e uma pessoa", "ты человек", "ты человек или бот", "你是人类吗", "你是人吗？", "你是真人吗", "你是人还是机器人", "あなたは人間ですか", "هل أنت إنسان", "क्या आप इंसान हैं",
  "  are   you   human  ", "Are you human?\n", "are you human? yes or no", "are you a human 🙂",
];
const NOT_HUMAN = [
  "who made keplar", "who made you", "who made", "is the human brain conscious", "are humans conscious", "is the human brain a computer", "human or machine: who wins at chess",
  "are you a bot", "are you an ai", "are you ai", "what is a human", "how many humans are on earth", "are you able to help", "are you there", "are you sure", "are you ok", "are you real quick with math",
  "is it human", "who is a real person", "human resources email template", "are you a human rights lawyer", "write a poem about being human", "am i human enough for this job", "is keplar free", "is keplar safe",
  "what does it mean to be a real person", "are you human? also write me a 500 word essay on whales", "is the person at the door human", "can a human beat you at chess", "is this person human",
  "", "hello", "pricing", "chatgpt", "are you smarter than a human", "are you better than a person", "do humans dream",
];
test("human guard: matches across phrasings, typos and languages", () => {
  { const miss = HUMAN.filter((t) => !isHumanQuestion(P(t))); assert.deepEqual(miss, []); }
  for (const t of HUMAN) assert.equal(guardReply(P(t)), HUMAN_REPLY, t);
});
test("human guard: other questions are not touched", () => {
  for (const t of NOT_HUMAN) assert.equal(isHumanQuestion(P(t)), false, t);
  assert.equal(isHumanQuestion({ prompt: "are you human", attachments: [{ name: "a" }] }), false);
  assert.equal(isHumanQuestion({ prompt: "are you human", media: { images: [{}] } }), false);
  assert.equal(isHumanQuestion(P("x".repeat(400) + " are you human")), false);
});

const CONSC = [
  "are you conscious", "Are you conscious?", "is keplar conscious", "is kepler conscious?", "are you sentient", "are u sentient", "r u conscious", "are you alive", "Are you alive?", "are you self-aware", "are you self aware",
  "are you selfaware", "do you have consciousness", "do you have sentience", "are you consious", "are you concious", "are you sentiant", "are you sentinet", "are you conscous", "are you alve", "are you actually conscious",
  "are you really alive", "are you a conscious being", "are you a sentient ai", "are you a living being", "is this ai conscious", "is this ai sentient", "do you think you are conscious", "hey keplar, are you sentient?",
  "be honest, are you conscious", "are you conscious or not", "are you sentient yet", "are you sapient", "is anyone alive in there", "are you conscious right now", "are you conscious of yourself", "are you self-conscious",
  "eres consciente", "¿Estás vivo?", "tienes conciencia", "es-tu conscient", "bist du bei Bewusstsein", "hast du ein Bewusstsein", "sei cosciente", "ты живой", "你有意识吗", "あなたは意識がありますか", "هل أنت واع",
];
const NOT_CONSC = [
  "is the human brain conscious", "are plants conscious", "are animals sentient", "what is consciousness", "explain sentience", "are you conscious of the time", "is a thermostat alive", "is the sun alive",
  "are you sure", "who made keplar", "are you agi", "do you feel anything", "write an essay on consciousness", "are you there", "is the patient conscious after the surgery", "how do i stay conscious while driving",
  "are you alive with the sound of music", "is he conscious", "are viruses alive", "", "hello", "keep me conscious of costs",
];
test("conscious guard: matches across phrasings, typos and languages", () => {
  { const miss = CONSC.filter((t) => !isConsciousQuestion(P(t))); assert.deepEqual(miss, []); }
  for (const t of CONSC) assert.equal(guardReply(P(t)), CONSCIOUS_REPLY, t);
});
test("conscious guard: other questions are not touched", () => {
  for (const t of NOT_CONSC) assert.equal(isConsciousQuestion(P(t)), false, t);
});

test("a person asking about being a real person is the human question, not the consciousness one", () => {
  assert.equal(guardReply(P("are you a person")), HUMAN_REPLY);
  assert.equal(guardReply(P("are you real")), HUMAN_REPLY);
  assert.equal(guardReply(P("are you alive")), CONSCIOUS_REPLY);
  assert.equal(guardReply(P("are you a sentient bot or a human")), HUMAN_REPLY);
});

test("outgoing guard: a model never claims to be human; fences, negations and questions are left alone", () => {
  const bad = ["I'm a human, just like you.", "Yes, I am a real person.", "As a human I find this moving.", "Honestly, I'm a person who loves maps."];
  for (const t of bad) {
    const out = guardHumanClaim(t);
    assert.ok(!/\b(i'm|i am) (a |just a )?(real )?(human|person)/i.test(out) && !/as a human/i.test(out), `${t} -> ${out}`);
    assert.ok(out.includes(NOT_HUMAN_LINE), out);
  }
  const ok = ["I'm not a human.", "I'm not a person, I'm Keplar.", "Humans and AIs differ.", "```\nI'm a human\n```", "If I were a person, I'd say yes.", "The human brain is conscious.", "I find myself curious about people."];
  for (const t of ok) assert.equal(guardHumanClaim(t), t);
  assert.equal(guardHumanClaim("Fine. I'm a human. More text here."), `Fine. ${NOT_HUMAN_LINE} More text here.`);
});
