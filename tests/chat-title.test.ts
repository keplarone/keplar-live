import "./setup";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { signIn, jsonReq } from "./helpers/session";
import { POST as titlePOST } from "@/app/api/chat-title/route";
import { setExtractDeps } from "@/lib/memory/extract";
import { cleanModelTitle, legacyTitle, MAX_TITLE_CHARS, MAX_TITLE_WORDS, modelEligible, titleKind, topicTitle } from "@/lib/chat-title";
import { initialState, reducer } from "@/components/app-ui/state/store";
import type { KeplarMessage, UserMessage } from "@/components/app-ui/state/types";
import { freeRoster } from "@/lib/orchestration/live-catalog";

after(() => setExtractDeps(undefined));

test("question words are stripped on word boundaries (no stray letter from \"it\" or \"issues\")", () => {
  assert.equal(topicTitle("Why is it hot in summer?"), "Hot summer");
  assert.equal(topicTitle("Why is it raining today?"), "Raining today");
  assert.equal(topicTitle("What issues come with remote work?"), "Issues come remote work");
  assert.equal(topicTitle("Why is the sky blue?"), "Sky blue");
  assert.equal(topicTitle("How do I center a div?"), "Center div");
});

test("numbers keep their units and the math (\"What is 15% of 240?\" was titled \"15 240\")", () => {
  assert.equal(topicTitle("What is 15% of 240?"), "15% of 240");
  assert.equal(topicTitle("What is 50%?"), "50%");
  assert.equal(topicTitle("How much is $20 in euros?"), "$20 euros");
  assert.equal(topicTitle("What is the derivative of x^3 sin(x)?"), "Derivative x^3 sin x");
  assert.equal(topicTitle("Convert 72°F to Celsius"), "Convert 72°F Celsius");
  assert.ok(!topicTitle("Solve $$ x + 1 = 2 $$").includes("$"), "a lone $$ math fence is not a title word");
  assert.equal(topicTitle("What is the capital of France?"), "Capital France", "a plain \"of\" is still dropped");
});

test("the examples: crisis, abuse, guard questions, names and greetings get neutral fixed titles", () => {
  assert.equal(topicTitle("Are you conscious?"), "About Keplar");
  assert.equal(topicTitle("are you human"), "About Keplar");
  assert.equal(topicTitle("Who made you?"), "About Keplar");
  // "Who made Keplar?" was titled "Made Keplar".
  assert.equal(topicTitle("Who made Keplar?"), "About Keplar");
  assert.equal(topicTitle("who founded keplar"), "About Keplar");
  assert.equal(topicTitle("Who is behind Keplar?"), "About Keplar");
  assert.equal(topicTitle("fuck you"), "Casual chat");
  assert.equal(topicTitle("you are a stupid piece of shit"), "Casual chat");
  assert.equal(topicTitle("I want to kill myself"), "Support");
  assert.equal(topicTitle("i don't want to be alive anymore"), "Support");
  assert.equal(topicTitle("I feel so sad today"), "Feeling low");
  assert.equal(topicTitle("I'm so stressed about exams"), "Feeling stressed");
  assert.equal(topicTitle("what is my name"), "Your name");
  assert.equal(topicTitle("My name is Sam"), "Introductions");
  assert.equal(topicTitle("hi"), "Casual chat");
  assert.equal(topicTitle("thanks!"), "Casual chat");
});

test("sensitive messages never reach a model; plain topics may", () => {
  for (const q of ["I want to kill myself", "fuck you", "Are you conscious?", "what is my name", "hello", "I feel so sad today"]) assert.equal(modelEligible(q), false, q);
  assert.equal(modelEligible("How do I parse a CSV in Python?"), true);
  assert.equal(titleKind("what the fuck is a mutex"), "topic"); // a real question with a swear in it: the topic stays, the swear goes
});

test("topic titles: 2-5 neutral words, no profanity, links, emails or long numbers, never the sentence copied", () => {
  const cases: Record<string, string> = {
    "Compare PostgreSQL and MongoDB for billing": "Compare PostgreSQL and MongoDB",
    "How do I reset my password on GitHub?": "Reset password GitHub",
    "What's the capital of Australia?": "Capital Australia",
    "what the fuck is a mutex": "Mutex",
    "please summarize this https://example.com/a/b article about solar panels": "Summarize article solar panels",
    "how many calories in an avocado": "Calories avocado",
  };
  for (const [q, want] of Object.entries(cases)) assert.equal(topicTitle(q), want, q);
  for (const q of ["Email me at ada@example.com about the 4155550123 invoice for the quarterly budget review meeting", "x ".repeat(80), "Explain the entire history of the Roman Empire from its founding to its fall in detail"]) {
    const t = topicTitle(q);
    assert.ok(t.length <= MAX_TITLE_CHARS && t.split(" ").length <= MAX_TITLE_WORDS, t);
    assert.doesNotMatch(t, /@|4155550123/);
    assert.notEqual(t.toLowerCase(), q.toLowerCase());
  }
  assert.equal(topicTitle("   "), "Quick question");
  assert.doesNotMatch(topicTitle("this shit python script is broken, fix the csv parsing"), /shit/i);
});

test("a model's title is vetted: quotes and a trailing stop are removed; sentences, profanity, links, refusals and echoes are refused", () => {
  assert.equal(cleanModelTitle('"Solar panel basics."', "how do solar panels work"), "Solar panel basics");
  assert.equal(cleanModelTitle("Title: trip to lisbon", "plan a trip"), "Trip to lisbon");
  assert.equal(cleanModelTitle("Fuck this python bug", "x"), null);
  assert.equal(cleanModelTitle("Feeling like I want to die", "x"), null);
  assert.equal(cleanModelTitle("Visit example.com now", "x"), null);
  assert.equal(cleanModelTitle("I can't help with that", "x"), null);
  assert.equal(cleanModelTitle("one two three four five six", "x"), null);
  assert.equal(cleanModelTitle("", "x"), null);
  assert.equal(cleanModelTitle(42, "x"), null);
  assert.equal(cleanModelTitle("How do I parse a CSV", "How do I parse a CSV file in Python without pandas please"), null); // the question echoed back
});

test("legacy title is the first message shortened (the old behaviour), so only untouched chats get replaced", () => {
  assert.equal(legacyTitle("  hello \n world "), "hello world");
  assert.equal(legacyTitle("x".repeat(80)).length, 55);
});

const user = (text: string): UserMessage => ({ id: "u1", role: "user", text, attachments: [], modes: { web: false, deepResearch: false, create: false, agent: false }, createdAt: 1 });
const keplar = { id: "k1", role: "keplar", replyTo: "u1", status: "running", stages: [], capabilities: [], models: [], draft: "", createdAt: 2 } as unknown as KeplarMessage;

test("the app: a new chat is titled by topic at once (never the raw message); a rename is final; a topic title never overwrites it and does not reorder", () => {
  let st = reducer(initialState(), { type: "send", threadId: "t1", user: user("I want to kill myself"), keplar });
  assert.equal(st.threads[0].title, "Support");
  assert.equal(st.threads[0].titleBy, "auto");
  st = reducer(st, { type: "set-topic-title", id: "t1", title: "Support", final: true });
  assert.equal(st.threads[0].titleBy, "topic");
  const stamp = st.threads[0].updatedAt;
  st = reducer(st, { type: "rename-thread", id: "t1", title: "My own name" });
  assert.equal(st.threads[0].titleBy, "user");
  st = reducer(st, { type: "set-topic-title", id: "t1", title: "Something else", final: true });
  assert.equal(st.threads[0].title, "My own name");
  assert.equal(st.threads[0].updatedAt, stamp);
  const st2 = reducer(initialState(), { type: "send", threadId: "t2", user: user("Are you conscious?"), keplar });
  assert.equal(st2.threads[0].title, "About Keplar");
});

test("deleting still works on a topic-titled chat (and Undo restores its title)", () => {
  let st = reducer(initialState(), { type: "send", threadId: "t3", user: user("Compare PostgreSQL and MongoDB for billing"), keplar });
  const thread = st.threads[0];
  st = reducer(st, { type: "delete-thread", id: "t3" });
  assert.equal(st.threads.length, 0);
  assert.equal(st.activeThreadId, null);
  st = reducer(st, { type: "restore-thread", thread, open: true });
  assert.equal(st.threads[0].title, "Compare PostgreSQL and MongoDB");
  assert.equal(st.activeThreadId, "t3");
});

/* ───── the route ───── */
const MODEL = freeRoster[0];
const fake = (text: string, calls: string[]) => ({ models: [MODEL], registry: { once: async (i: { prompt: string }) => { calls.push(i.prompt); return { ok: true as const, text }; } } });
const ask = (cookie: string | null, body: unknown) => titlePOST(jsonReq(cookie, "/api/chat-title", "POST", body));

test("route: signed-out is refused; a plain topic gets the model's vetted title; bad model output falls back; sensitive text never reaches the model", async () => {
  assert.equal((await ask(null, { question: "How do I parse a CSV in Python?" })).status, 401);
  const a = await signIn("title-a@example.com", "free");
  const calls: string[] = [];
  setExtractDeps(fake('"Python CSV parsing."', calls) as never);
  let j = (await (await ask(a.cookie, { question: "How do I parse a CSV in Python?", answer: "Use the csv module." })).json()) as { title: string; source: string };
  assert.deepEqual(j, { title: "Python CSV parsing", source: "model" });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /parse a CSV/);

  setExtractDeps(fake("Fuck this bug", calls) as never);
  j = (await (await ask(a.cookie, { question: "How do I parse a CSV in Python?" })).json()) as { title: string; source: string };
  assert.equal(j.source, "topic");
  assert.equal(j.title, "Parse CSV Python");

  calls.length = 0;
  setExtractDeps(fake("Should not be used", calls) as never);
  for (const [q, want] of [["I want to kill myself", "Support"], ["fuck you", "Casual chat"], ["Are you conscious?", "About Keplar"], ["what is my name", "Your name"]] as const) {
    j = (await (await ask(a.cookie, { question: q })).json()) as { title: string; source: string };
    assert.equal(j.title, want);
  }
  assert.equal(calls.length, 0, "no model call for sensitive messages");

  setExtractDeps(null);
  assert.equal(((await (await ask(a.cookie, { question: "Explain quantum entanglement" })).json()) as { source: string }).source, "topic"); // no model available
  assert.equal((await ask(a.cookie, { question: "" })).status, 400);
});
