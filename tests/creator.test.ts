import "./setup";
import { REFLECTIONS } from "@/lib/persona";
import { test } from "node:test";
import assert from "node:assert/strict";
import { CREATOR_ANSWERS, isCreatorQuestion, pickCreatorAnswer, runCreator } from "@/lib/orchestration/creator";
import { orchestrate } from "@/lib/orchestration/orchestrator";
import type { KeplarEvent, KeplarRequest } from "@/lib/orchestration/types";

const creator = (prompt: string, extra: Partial<KeplarRequest> = {}) => isCreatorQuestion({ prompt, ...extra });

test("creator: questions about who made Keplar match, in any spelling", () => {
  for (const p of [
    "who created Keplar?", "Who created Kepler", "who made you", "Who made you?", "who built you", "who built keplar", "who founded Keplar One?",
    "who owns Keplar", "who developed keplar?", "who are your creators", "who are your creators?", "who is behind this", "who's behind keplar?",
    "Who is behind Keplar One", "who is the founder of keplar", "who are the founders of Keplar?", "who is keplar's founder", "who were you made by",
    "which company made you", "what team is behind keplar", "hey, who made you?", "Hi! who created you", "who created this app?", "who made this website",
    "who is the creator of Keplar One", "can you tell me who built you", "who created keplar.one", "who created KEPLAR!!", "who created keplr", "who actually made you?",
    "what's keplar's founder", "who developed this platform please", "👋 who made you",
  ]) assert.ok(creator(p), p);
});

test("creator: unrelated or ambiguous questions go through the normal pipeline", () => {
  for (const p of [
    "who created the telescope", "Johannes Kepler biography", "who created Python?", "who created Kepler's laws", "who invented the Kepler space telescope",
    "who made the Kepler telescope", "who built the pyramids", "who founded Apple", "who owns Tesla", "who created you in Minecraft mod",
    "who made this", "who built this?", "who is behind the 2008 crash", "who created Keplar and write a poem about them", "who made you? also explain quantum computing in detail please",
    "who are the creators of Python", "who is the founder of Microsoft", "what company made the iPhone", "tell me about Keplar", "what is Keplar",
    "how was Keplar made", "who created Kepler-452b", "who made `you`", "https://keplar.one who made you", "", "   ", "who", "who made", "who created " + "keplar ".repeat(40),
    "who made you laugh", "who created Keplar's competitors", "who owns the keplar.one domain registrar",
  ]) assert.ok(!creator(p), p);
});

test("creator: attachments or media mean real work", () => {
  assert.ok(!creator("who made you", { attachments: [{ name: "a.png", size: 1, type: "image/png" }] }));
  assert.ok(!creator("who made you", { media: { images: [{ name: "a", mime: "image/png", dataUrl: "data:image/png;base64,AAAA" }] } as unknown as KeplarRequest["media"] }));
});

test("creator: every phrasing names both co-founders as two people, never states their age or birth date, claims nothing else", () => {
  assert.ok(CREATOR_ANSWERS.length >= 100, "a large pool, not a few fixed sentences");
  for (const t of CREATOR_ANSWERS) {
    assert.match(t, /Hassen/);
    assert.match(t, /Hussain/);
    assert.match(t, /Keder/);
    assert.match(t, /co-found/i, "says they are co-founders");
    assert.match(t, /\btwo\b|other|separate/i, "says they are two people");
    assert.doesNotMatch(t, /Keplar team/i, "the credit is the two co-founders only");
    assert.doesNotMatch(t, /\b(?:he|she|his|her|him)\b|\bthe founder\b|\bsole\b|\bowner\b|Hassen\/Hussain/i, t);
    assert.match(t, /founded|started|company was founded/i);
    assert.match(t, /2026/);
    assert.match(t, /multiple AI models|several AI models/);
    assert.match(t, /disagree/);
    const sentences = t.split(/(?<=[.!?])\s+/).filter(Boolean);
    assert.ok(sentences.length >= 4 && sentences.length <= 8, t);
    assert.ok(t.length < 460, t);
    assert.doesNotMatch(t, /\$|headquarter|funded|located|born|birth|december|2011|%|most accurate|best|fastest|guarantee/i);
    assert.deepEqual((t.match(/\d+/g) ?? []).filter((n) => n !== "2026"), [], t);
    assert.doesNotMatch(t, /years old|\bage\b|\baged\b|are both|teen/i, t);
  }
});

test("creator: streams a templated reply with no cost, as a plain reply", async () => {
  for (let v = 0; v < CREATOR_ANSWERS.length; v += 41) {
    const events: KeplarEvent[] = [];
    for await (const e of runCreator(v)) events.push(e);
    assert.equal(events[0].type, "smalltalk");
    // the facts come first; a short reflective line (persona.ts) may follow
    const streamed = events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text).join("");
    assert.ok(streamed.startsWith(CREATOR_ANSWERS[v]), streamed);
    assert.ok(["", ...REFLECTIONS.filter(Boolean)].some((r) => streamed === [CREATOR_ANSWERS[v], r].filter(Boolean).join(" ")), streamed);
    const a = events.at(-1);
    assert.equal(a?.type, "answer");
    if (a?.type === "answer") {
      assert.equal(a.answer.markdown, streamed);
      assert.equal(a.answer.smalltalk, true);
      assert.equal(a.answer.compute.units, 0);
      assert.equal(a.answer.models.length, 0);
    }
  }
  assert.ok(CREATOR_ANSWERS.includes(pickCreatorAnswer()));
  assert.equal(pickCreatorAnswer(-1), CREATOR_ANSWERS[CREATOR_ANSWERS.length - 1]);
});

test("creator: orchestrate answers without touching any model", async () => {
  const boom = () => { throw new Error("model must not be called"); };
  const deps = new Proxy({}, { get: boom }) as unknown as Parameters<typeof orchestrate>[1];
  const events: KeplarEvent[] = [];
  for await (const e of orchestrate({ prompt: "Who created Kepler?", plan: "pro" }, deps)) events.push(e);
  assert.deepEqual(events.map((e) => e.type), ["smalltalk", "delta", "answer"]);
});

test("creator: the closing reflections are natural English sentences (no 'meeting this question')", () => {
  for (const r of REFLECTIONS.filter(Boolean)) {
    assert.match(r, /^[A-Z].*[.!?]$/, r);
    assert.doesNotMatch(r, /meeting this question/i, r);
    assert.ok(r.length <= 80, r);
  }
});
