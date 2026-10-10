import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { followupPrompt, resolveFollowup, sameReferent, tidy } from "@/lib/orchestration/followup";
import { understand, understandingBlock } from "@/lib/orchestration/understand";
import { commonSenseNote } from "@/lib/orchestration/common-sense";

type Turn = { role: "user" | "keplar"; text: string };
const U = (text: string): Turn => ({ role: "user", text });
const K = (text: string): Turn => ({ role: "keplar", text });

/* The three conversations from the bug report, word for word. */
const AI_RISK: Turn[] = [U("is AI going to kill everyone in the next decade"), K("Most researchers think human extinction from AI within ten years is unlikely, though some put real odds on serious risks. Here is how the main views break down.")];
const DEEP_X: Turn[] = [U("do deep research on x"), K("Here's an overview of the letter X, the variable x in math, and X the social network.")];
const ELON_1: Turn[] = [U("how much money does elon musk have liquid"), K("Most of Elon Musk's wealth is in Tesla and SpaceX stock; his liquid cash is a small fraction of it.")];
const ELON_2: Turn[] = [...ELON_1, U("what is is net worth"), K("Net worth is the value of what someone owns minus what they owe.")];

const OVERVIEW = /quick overview|I'm reading/i;

test("paste 1: 'according to anthropic' asks the previous question from Anthropic's point of view", () => {
  const f = resolveFollowup("according to anthropic", AI_RISK);
  assert.equal(f?.kind, "source");
  assert.equal(f?.question, "According to Anthropic, is AI going to kill everyone in the next decade?");
  const u = understand({ prompt: "according to anthropic", history: AI_RISK });
  assert.equal(u.intent, "followup");
  assert.equal(u.assumption, null, "no 'I'm reading ... as a quick overview' line");
  assert.match(u.rewritten!, /^According to Anthropic, is AI going to kill everyone in the next decade\?/);
  assert.match(u.rewritten!, /actually said publicly/);
  assert.doesNotMatch(u.rewritten!, /overview of Anthropic|AI company/);
  assert.match(understandingBlock(u, "according to anthropic"), /resolved from the conversation as: "According to Anthropic/);
  // other phrasings of the same follow-up
  for (const p of ["according to Anthropic?", "what does anthropic say", "what does anthropic think about it", "per anthropic", "and according to openai"]) {
    const g = resolveFollowup(p, AI_RISK);
    assert.equal(g?.kind, "source", p);
    assert.match(g!.question, /^According to (Anthropic|OpenAI), is AI going to kill everyone in the next decade\?$/, p);
  }
});

test("paste 2: 'twitter' after 'do deep research on x' continues the deep research on Twitter/X", () => {
  const f = resolveFollowup("twitter", DEEP_X);
  assert.equal(f?.question, "Do deep research on Twitter/X.");
  assert.equal(f?.deep, true);
  assert.equal(f?.subject, "Twitter/X");
  const u = understand({ prompt: "twitter", history: DEEP_X });
  assert.equal(u.intent, "followup");
  assert.equal(u.assumption, null);
  assert.match(u.rewritten!, /^Do deep research on Twitter\/X\./);
  assert.match(u.rewritten!, /continues a Deep Research request/);
  assert.doesNotMatch(u.rewritten!, /short, useful overview of "twitter"/);
  // the same with other clarifications of the placeholder
  assert.equal(resolveFollowup("tesla", [U("can you do a deep dive into it"), K("Sure, into what?")])?.question, "Do deep research on Tesla.");
  assert.equal(resolveFollowup("i meant twitter", DEEP_X)?.question, "Do deep research on Twitter/X.");
});

test("paste 3: 'what is is net worth' infers Elon Musk, then 'elon' keeps asking for his net worth", () => {
  assert.equal(tidy("what is is net worth"), "what is his net worth");
  const f = resolveFollowup("what is is net worth", ELON_1);
  assert.equal(f?.question, "What is Elon Musk's net worth?");
  const u2 = understand({ prompt: "what is is net worth", history: ELON_1 });
  assert.equal(u2.intent, "followup");
  assert.match(u2.rewritten!, /^What is Elon Musk's net worth\?/);
  const g = resolveFollowup("elon", ELON_2);
  assert.equal(g?.question, "What is Elon Musk's net worth?");
  assert.equal(g?.subject, "Elon Musk");
  const u3 = understand({ prompt: "elon", history: ELON_2 });
  assert.equal(u3.intent, "followup");
  assert.equal(u3.assumption, null);
  assert.doesNotMatch(u3.rewritten!, /Give a short, useful overview/i);
  assert.match(u3.rewritten!, /^What is Elon Musk's net worth\?/);
  assert.match(u3.contextRead!, /Going by the conversation, I took "elon" to mean: What is Elon Musk's net worth\?/);
  // without the typo, and with other pronoun shapes
  assert.equal(resolveFollowup("what is his net worth", ELON_1)?.question, "What is Elon Musk's net worth?");
  assert.equal(resolveFollowup("net worth?", ELON_1)?.question, "What is Elon Musk's net worth?");
  assert.equal(resolveFollowup("how old is he", ELON_1)?.question, "How old is Elon Musk?");
  assert.equal(resolveFollowup("what about bill gates", ELON_2)?.question, "What is Bill Gates' net worth?");
  assert.equal(resolveFollowup("musk", ELON_1)?.question, "How much money does Elon Musk have in liquid assets?");
});

test("no pasted case falls back to the 'quick overview' card", () => {
  for (const [p, h] of [["according to anthropic", AI_RISK], ["twitter", DEEP_X], ["what is is net worth", ELON_1], ["elon", ELON_2]] as const) {
    const u = understand({ prompt: p, history: [...h] });
    assert.notEqual(u.intent, "overview", p);
    assert.notEqual(u.intent, "brand", p);
    assert.doesNotMatch(u.assumption ?? "", OVERVIEW, p);
    assert.doesNotMatch(u.rewritten ?? "", /Give a short, useful overview of/, p);
  }
});

test("a bare name after a real question is read against it, without the overview note", () => {
  const u = understand({ prompt: "anthropic", history: AI_RISK });
  assert.equal(u.intent, "followup");
  assert.equal(u.assumption, null);
  assert.match(u.rewritten!, /right after they asked: "Is AI going to kill everyone in the next decade\?"/);
  const v = understand({ prompt: "python", history: ELON_1 });
  assert.equal(v.intent, "followup");
  assert.match(v.rewritten!, /Only if it clearly starts a new topic, give a short, useful overview/);
});

test("standalone messages and overview chats keep their old handling", () => {
  // no history: unchanged
  assert.equal(resolveFollowup("elon", []), null);
  assert.equal(understand({ prompt: "python" }).intent, "overview");
  assert.equal(understand({ prompt: "chatgpt" }).intent, "brand");
  // a full question with its own subject is not rewritten
  assert.equal(resolveFollowup("is elon musk projected to die in the next 400 years", ELON_2), null);
  assert.equal(resolveFollowup("what is the capital of france", ELON_2), null);
  assert.equal(resolveFollowup("write a poem about the sea", ELON_2), null);
  // "tell me about claude" then "gemini": a new overview is the right reading
  const claude: Turn[] = [U("tell me about claude"), K("Claude is an AI assistant from Anthropic.")];
  assert.equal(resolveFollowup("gemini", claude), null);
  assert.equal(understand({ prompt: "gemini", history: claude }).intent, "brand");
  // Keplar asked a clarifying question: the answer is left to the models with the history
  assert.equal(understand({ prompt: "python", history: [U("i want to learn a language"), K("Nice! Which language do you have in mind?")] }).intent, "plain");
  // a closing offer ("want me to...?") is not a clarifying question: no subject swap
  assert.equal(resolveFollowup("python", [U("what is elon musk's net worth"), K("About $400 billion. Want me to break it down?")]), null);
  // "what is the answer" is not a source
  assert.equal(resolveFollowup("what is the answer", AI_RISK), null);
});

test("the rewritten prompt carries the typed message and asks for the question, not a definition", () => {
  const f = resolveFollowup("elon", ELON_2)!;
  const p = followupPrompt(f, "elon");
  assert.match(p, /latest message was "elon"/);
  assert.match(p, /Do not give a general overview of "elon"/);
});

test("same referent: name fragments and the Twitter/X rename", () => {
  assert.ok(sameReferent("elon", "elon musk"));
  assert.ok(sameReferent("musk", "elon musk"));
  assert.ok(sameReferent("twitter", "x"));
  assert.ok(!sameReferent("bill gates", "elon musk"));
  assert.ok(!sameReferent("x", "y"));
});

test("common sense: a person dying within centuries is not 'not projected'", () => {
  const n = commonSenseNote("is elon musk projected to die in the next 400 years");
  assert.match(n, /all but certain to die within 400 years/);
  assert.match(n, /do not read "projected"/);
  assert.match(commonSenseNote("Will Taylor Swift be alive in 300 years?"), /300 years/);
  assert.match(commonSenseNote("will I live to 2300"), /certain to die/);
  assert.equal(commonSenseNote("is elon musk projected to die in the next 40 years"), "");
  assert.equal(commonSenseNote("will the sun die in 400 years"), "");
  assert.equal(commonSenseNote("how long do trees live, some 500 years?"), "");
});
