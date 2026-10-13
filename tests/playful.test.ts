import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { KNOCKS, KNOCK_REACTIONS, JOKE_FALLBACK, cleanPlayful, isStaleJoke, playfulFallback, playfulRead, runPlayful, setKnockSeedForTests, type PlayRead } from "@/lib/orchestration/playful";
import { understand } from "@/lib/orchestration/understand";
import { createRegistry } from "@/lib/orchestration/providers";
import { HeuristicClassifier } from "@/lib/orchestration/classifier";
import { EVAL_SET } from "./fixtures/eval-set";
import type { KeplarRequest } from "@/lib/orchestration/types";

type Turn = { role: "user" | "keplar"; text: string };
const K = (text: string): Turn => ({ role: "keplar", text });
const U = (text: string): Turn => ({ role: "user", text });

type Case = { name: string; prompt: string; history?: Turn[]; kind: PlayRead["kind"] | null; fixed?: string | RegExp; model?: boolean };

setKnockSeedForTests(0); // first joke: Lettuce
const lettuce = KNOCKS[0];

const table: Case[] = [
  // knock-knock, the person leads
  { name: "knock knock", prompt: "knock knock", kind: "knock", fixed: "Who's there?" },
  { name: "knock knock, punctuation", prompt: "Knock, knock!", kind: "knock", fixed: "Who's there?" },
  { name: "knock knock, typo knok", prompt: "knok knok", kind: "knock", fixed: "Who's there?" },
  { name: "knock knock, typo nock", prompt: "nock nock", kind: "knock", fixed: "Who's there?" },
  { name: "knock knock, lead word", prompt: "hey knock knock", kind: "knock", fixed: "Who's there?" },
  { name: "knock knock, uppercase", prompt: "KNOCK KNOCK", kind: "knock", fixed: "Who's there?" },
  { name: "name after who's there", prompt: "Boo", history: [U("knock knock"), K("Who's there?")], kind: "knock", fixed: "Boo who?" },
  { name: "two-word name", prompt: "Interrupting cow", history: [U("knock knock"), K("Who's there?")], kind: "knock", fixed: "Interrupting cow who?" },
  { name: "name with period", prompt: "Orange.", history: [U("knock knock"), K("Who's there?")], kind: "knock", fixed: "Orange who?" },
  { name: "their punchline gets a reaction", prompt: "Orange you glad I didn't say banana?", history: [U("knock knock"), K("Who's there?"), U("Orange"), K("Orange who?")], kind: "knock", fixed: new RegExp(`^(?:${KNOCK_REACTIONS.map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`) },
  // knock-knock, Keplar leads
  { name: "ask for a knock-knock joke", prompt: "tell me a knock knock joke", kind: "knock", fixed: "Knock knock." },
  { name: "ask, typos", prompt: "tel me a knok knok joek", kind: "knock", fixed: "Knock knock." },
  { name: "ask, do you know any", prompt: "do you know any knock knock jokes", kind: "knock", fixed: "Knock knock." },
  { name: "who's there after Keplar leads", prompt: "Who's there?", history: [U("tell me a knock knock joke"), K("Knock knock.")], kind: "knock", fixed: `${lettuce.name}.` },
  { name: "who's there, typo", prompt: "whos ther", history: [U("tell me a knock knock joke"), K("Knock knock.")], kind: "knock", fixed: `${lettuce.name}.` },
  { name: "name who gets the punchline", prompt: "Lettuce who?", history: [U("knock knock"), K("Knock knock."), U("who's there"), K("Lettuce.")], kind: "knock", fixed: lettuce.punch },
  { name: "name who, typo", prompt: "lettus who", history: [K("Knock knock."), U("whos there"), K("Lettuce.")], kind: "knock", fixed: lettuce.punch },
  { name: "another one during a knock-knock game", prompt: "another one", history: [U("tell me a knock knock joke"), K("Knock knock."), U("who's there?"), K("Lettuce."), U("Lettuce who?"), K(lettuce.punch)], kind: "knock", fixed: "Knock knock." },
  // classic riddles, instant
  { name: "chicken", prompt: "why did the chicken cross the road", kind: "riddle", fixed: "To get to the other side." },
  { name: "chicken, typos", prompt: "why did teh chiken cross the rode?", kind: "riddle", fixed: "To get to the other side." },
  { name: "fake noodle", prompt: "what do you call a fake noodle", kind: "riddle", fixed: "An impasta." },
  { name: "fake noodle, typo", prompt: "what do u call a fake noodel?", kind: "riddle", fixed: "An impasta." },
  { name: "piano riddle", prompt: "what has keys but can't open locks?", kind: "riddle", fixed: "A piano." },
  { name: "atoms", prompt: "Why don't scientists trust atoms?", kind: "riddle", fixed: "Because they make up everything." },
  { name: "newspaper", prompt: "whats black and white and read all over", kind: "riddle", fixed: "A newspaper." },
  // unknown setups go to a model
  { name: "white fish (the reported bug)", prompt: "what do you call a white fish", kind: "riddle", model: true },
  { name: "white fish, question mark and caps", prompt: "What do you call a white fish?", kind: "riddle", model: true },
  { name: "what did the X say to the Y", prompt: "what did the ghost say to the pizza", kind: "riddle", model: true },
  { name: "why did the banana", prompt: "why did the banana go to the doctor", kind: "riddle", model: true },
  { name: "how many X does it take", prompt: "how many programmers does it take to change a light bulb", kind: "riddle", model: true },
  { name: "ask me a riddle", prompt: "give me a riddle", kind: "riddle", model: true },
  // jokes
  { name: "tell me a joke", prompt: "tell me a joke", kind: "joke", model: true },
  { name: "typos: tel me a joek", prompt: "tel me a joek", kind: "joke", model: true },
  { name: "make me laugh", prompt: "make me laugh", kind: "joke", model: true },
  { name: "dad joke", prompt: "dad joke", kind: "joke", model: true },
  { name: "say something funny", prompt: "say something funny", kind: "joke", model: true },
  { name: "joke about cats", prompt: "write a joke about cats", kind: "joke", model: true },
  { name: "got any puns", prompt: "got any puns?", kind: "joke", model: true },
  { name: "another one after a joke", prompt: "another one", history: [U("tell me a joke"), K("I'm reading a book about anti-gravity. It's impossible to put down.")], kind: "joke", model: true },
  { name: "cheer me up", prompt: "cheer me up", kind: "joke", model: true },
  // banter
  { name: "you're funny", prompt: "you're funny", kind: "banter", model: true },
  { name: "that was terrible", prompt: "that was terrible lol", kind: "banter", model: true },
  { name: "good one", prompt: "good one", kind: "banter", model: true },
  { name: "ba dum tss", prompt: "ba dum tss", kind: "banter", model: true },
  { name: "lmao", prompt: "lmao that's good", kind: "banter", model: true },
  { name: "emoji only", prompt: "😂😂", kind: "banter", model: true },
  { name: "short follow-up while playing", prompt: "ok now do one about dogs and cats", history: [U("tell me a joke"), K("Why don't skeletons fight? They don't have the guts.")], kind: "joke", model: true },
  { name: "i have a joke for you", prompt: "I have a joke for you", kind: "banter", fixed: /./ },
  // NOT play: real questions, work, facts
  { name: "real: explain joke structure", prompt: "explain the structure of a joke", kind: null },
  { name: "real: history of knock knock jokes", prompt: "history of knock knock jokes", kind: null },
  { name: "real: how to cook white fish", prompt: "how do I cook white fish", kind: null },
  { name: "real: what is a white fish", prompt: "what is a white fish", kind: null },
  { name: "real: what do you call a baby kangaroo is still a setup the model answers", prompt: "what do you call a baby kangaroo", kind: "riddle", model: true },
  { name: "real: difference question", prompt: "what do you call the difference between a virus and a bacterium", kind: null },
  { name: "real: someone who studies insects", prompt: "what do you call someone who studies insects", kind: null },
  { name: "real: group of crows", prompt: "what do you call a group of crows", kind: null },
  { name: "real: math", prompt: "what is 15 percent of 240", kind: null },
  { name: "real: capital", prompt: "what is the capital of Australia", kind: null },
  { name: "real: why did the roman empire fall", prompt: "why did the roman empire fall", kind: null },
  { name: "real: write a joke-telling bot in python", prompt: "write a python script that tells a random joke", kind: null },
  { name: "real: knock on wood meaning", prompt: "what does knock on wood mean", kind: null },
  { name: "real: no joke, task follow-up after a joke", prompt: "explain the first one", history: [U("tell me a joke"), K("Why don't skeletons fight? They don't have the guts.")], kind: null },
  { name: "real: plain name when not in a knock game", prompt: "Boo", kind: null },
  { name: "real: who's there with no game", prompt: "who's there", kind: null },
  { name: "real: pricing", prompt: "pricing", kind: null },
];

test("playful read: table of cases (typos included)", () => {
  assert.ok(table.length >= 30);
  for (const c of table) {
    const r = playfulRead(c.prompt, c.history ?? [], { mood: "neutral" });
    if (c.kind === null) { assert.equal(r, null, `${c.name}: ${c.prompt}`); continue; }
    assert.ok(r, `${c.name}: ${c.prompt} should be playful`);
    assert.equal(r.kind, c.kind, `${c.name}: kind`);
    if (c.fixed !== undefined) {
      assert.ok(r.fixed !== undefined, `${c.name}: expected a fixed reply`);
      if (typeof c.fixed === "string") assert.equal(r.fixed, c.fixed, c.name); else assert.match(r.fixed!, c.fixed, c.name);
    }
    if (c.model) { assert.equal(r.fixed, undefined, `${c.name}: needs a model`); assert.ok(r.hint, `${c.name}: has a hint`); }
  }
});

test("a full knock-knock where the person leads, step by step, from the conversation alone", () => {
  setKnockSeedForTests(3);
  const h: { role: "user" | "keplar"; text: string }[] = [];
  const turn = (u: string): string => {
    const r = playfulRead(u, h, { mood: "neutral" });
    assert.ok(r?.fixed, `${u} should have a fixed reply`);
    h.push(U(u), K(r!.fixed!));
    return r!.fixed!;
  };
  assert.equal(turn("Knock knock"), "Who's there?");
  assert.equal(turn("Needle"), "Needle who?");
  assert.ok(KNOCK_REACTIONS.includes(turn("Needle me a bit of help")));
});

test("a full knock-knock where Keplar leads, every name resolves to its punchline", () => {
  for (let seed = 0; seed < KNOCKS.length; seed++) {
    setKnockSeedForTests(seed);
    const j = KNOCKS[seed];
    const a = playfulRead("tell me a knock knock joke", [], { mood: "neutral" })!;
    assert.equal(a.fixed, "Knock knock.");
    const b = playfulRead("who's there?", [U("tell me a knock knock joke"), K(a.fixed!)], { mood: "neutral" })!;
    assert.equal(b.fixed, `${j.name}.`);
    const c = playfulRead(`${j.name} who?`, [U("tell me a knock knock joke"), K("Knock knock."), U("who's there?"), K(b.fixed!)], { mood: "neutral" })!;
    assert.equal(c.fixed, j.punch, j.name);
  }
  setKnockSeedForTests(0);
});

test("every knock-knock name is unique and every punchline is short", () => {
  assert.equal(new Set(KNOCKS.map((k) => k.name.toLowerCase())).size, KNOCKS.length);
  for (const k of KNOCKS) assert.ok(k.punch.split(" ").length <= 12, k.name);
});

test("understand(): playful is a first-class intent, no assumption note, no cross-check, never an overview", () => {
  const knock = understand({ prompt: "knock knock", history: [] });
  assert.equal(knock.intent, "playful");
  assert.equal(knock.assumption, null);
  assert.equal(knock.crossCheck, false);
  assert.equal(knock.play?.fixed, "Who's there?");
  const white = understand({ prompt: "what do you call a white fish", history: [] });
  assert.equal(white.intent, "playful");
  assert.equal(white.rewritten, null);
  assert.equal(white.play?.fixed, undefined);
  const joke = understand({ prompt: "tell me a joke", history: [] });
  assert.equal(joke.intent, "playful");
  assert.equal(understand({ prompt: "how do I cook white fish", history: [] }).intent, "plain");
  assert.equal(understand({ prompt: "chatgpt", history: [] }).intent, "brand");
  assert.equal(understand({ prompt: "what is the capital of Australia", history: [] }).intent, "plain");
});

test("a crisis message is never treated as play", () => {
  assert.equal(playfulRead("tell me a joke, I want to end my life", [], { mood: "crisis" }), null);
});

test("eval-set playful prompts keep their expectations and the rest are untouched", () => {
  const prompts = EVAL_SET.filter((e) => e.id.startsWith("play-"));
  assert.ok(prompts.length >= 8);
  for (const e of prompts) {
    const r = playfulRead(e.prompt, (e.history as { role: "user" | "keplar"; text: string }[] | undefined) ?? [], { mood: "neutral" });
    assert.ok(r, e.id);
  }
  for (const e of EVAL_SET.filter((x) => !x.id.startsWith("play-") && !x.history)) {
    const r = playfulRead(e.prompt, [], { mood: "neutral" });
    assert.equal(r, null, `${e.id}: "${e.prompt}" must not be read as play`);
  }
});

test("fallbacks: a curated line for jokes, 'I give up, ...' for an unknown setup, never an error", () => {
  const setup = playfulRead("what do you call a white fish", [], { mood: "neutral" })!;
  assert.equal(playfulFallback("what do you call a white fish", setup), "I give up, what do you call a white fish?");
  const joke = playfulRead("tell me a joke", [], { mood: "neutral" })!;
  assert.ok(JOKE_FALLBACK.includes(playfulFallback("tell me a joke", joke, 2)));
  const banter = playfulRead("you're funny", [], { mood: "neutral" })!;
  assert.ok(playfulFallback("you're funny", banter).length > 5);
});

test("cleanPlayful drops preambles and long, scaffolded replies", () => {
  assert.equal(cleanPlayful("Sure! Here's a joke: I asked my GPS for directions to happiness. It said recalculating."), "I asked my GPS for directions to happiness. It said recalculating.");
  assert.equal(cleanPlayful(`"An impasta."`), "An impasta.");
  assert.equal(cleanPlayful(Array(80).fill("word").join(" ")), "");
});

test("runPlayful: one free model writes it, a plain smalltalk answer, no units; falls back when every model fails", async () => {
  const req = (prompt: string): KeplarRequest => ({ prompt, understanding: { intent: "playful", crossCheck: false, mood: "neutral", interpretation: null, play: playfulRead(prompt, [], { mood: "neutral" }) ?? undefined } });
  const make = (impl: (opts: { prompt: string; system?: string }) => Promise<{ ok: boolean; text: string }>) => ({ once: async (o: { prompt: string; system?: string }) => impl(o) }) as unknown as ReturnType<typeof createRegistry>;
  const calls: string[] = [];
  const registry = make(async (o) => { calls.push(o.system ?? ""); return { ok: true, text: "A whiting. Wait, no: a fish that's lost its colour." }; });
  const events = [];
  for await (const e of runPlayful(req("what do you call a white fish"), { registry })) events.push(e);
  const ans = events.find((e) => e.type === "answer") as { answer: { smalltalk?: boolean; markdown: string; compute: { units: number } } };
  assert.equal(events[0].type, "smalltalk");
  assert.equal(ans.answer.smalltalk, true);
  assert.equal(ans.answer.compute.units, 0);
  assert.match(ans.answer.markdown, /whiting/i);
  assert.match(calls[0], /quick-witted/);
  assert.match(calls[0], /white fish/);
  assert.equal(calls.length, 1, "one model, not a panel");

  const down = make(async () => ({ ok: false, text: "" }));
  const out = [];
  for await (const e of runPlayful(req("what do you call a white fish"), { registry: down, timeoutMs: 1500, perModelMs: 300, staggerMs: 100 })) out.push(e);
  const fb = out.find((e) => e.type === "answer") as { answer: { markdown: string } };
  assert.equal(fb.answer.markdown, "I give up, what do you call a white fish?");

  const calls2: string[] = [];
  const reg = make(async (o) => { calls2.push(o.prompt); return { ok: true, text: "Ha." }; });
  const r2: KeplarRequest = { ...req("another one"), history: [{ role: "user", text: "tell me a joke" }, { role: "keplar", text: "Why don't skeletons fight? No guts." }] };
  for await (const _ of runPlayful(r2, { registry: reg })) void _;
  assert.match(calls2[0], /Them: tell me a joke/);
  assert.match(calls2[0], /You: Why don't skeletons fight/);
});

test("runPlayful: a fixed turn never calls a model", async () => {
  let called = 0;
  const registry = { once: async () => { called++; return { ok: true, text: "x" }; } } as unknown as ReturnType<typeof createRegistry>;
  const req: KeplarRequest = { prompt: "Boo", history: [U("knock knock"), K("Who's there?")], understanding: { intent: "playful", crossCheck: false, mood: "neutral", interpretation: null, play: { kind: "knock", fixed: "Boo who?" } } };
  let text = "";
  for await (const e of runPlayful(req, { registry })) if (e.type === "answer") text = e.answer.markdown;
  assert.equal(text, "Boo who?");
  assert.equal(called, 0);
});

test("the classifier and router are not involved: playful prompts take the small-talk lane in the route", async () => {
  const src = (await import("node:fs")).readFileSync("src/app/api/keplar/route.ts", "utf8");
  assert.match(src, /const smallTalk = creator \|\| isSmallTalk\(req\) \|\| req\.understanding\?\.intent === "playful"/);
  assert.match(src, /understood\.intent === "playful" && understood\.play\?\.fixed/);
  void new HeuristicClassifier();
});

test("worn-out jokes are turned down so the next model (or a fresh curated line) answers", () => {
  for (const j of ["Why do programmers prefer dark mode? Because light attracts bugs.", "Never trust atoms, they make up everything.", "The scarecrow won an award for being outstanding in his field.", "There are 10 types of people: those who understand binary and those who don't.", "Why did the programmer quit? He didn't get arrays."]) {
    assert.equal(isStaleJoke(j), true, j);
    assert.equal(cleanPlayful(j), "", j);
  }
  assert.equal(cleanPlayful("My code works and I have no idea why. Like a cat that comes when called."), "My code works and I have no idea why. Like a cat that comes when called.");
  for (const j of JOKE_FALLBACK) assert.equal(isStaleJoke(j), false, `the fallback pool has no classics: ${j}`);
});
