import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { CANDID_LINE, VOICE_PROMPT, VOICE_PROMPT_SHORT, claimsConsciousness, dropInventedLife, inventedLife, consciousnessAnswers, guardVoice, isConsciousnessQuestion, pickConsciousnessAnswer, voiceTopic } from "@/lib/persona";
import { BASE_SYSTEM_PROMPT } from "@/lib/orchestration/providers/shared";
import { DRAFT_SYSTEM_PROMPT, SYNTH_SYSTEM_PROMPT } from "@/lib/orchestration/live-synthesizer";
import { SMALLTALK_SYSTEM_PROMPT, cleanSmallTalk } from "@/lib/orchestration/smalltalk";
import { SMALLTALK_VOICE_FALLBACK } from "@/lib/persona";
import { POST as keplarPOST } from "@/app/api/keplar/route";
import { readFileSync } from "node:fs";

test("the voice prompt asks for a sharp, warm, curious, human voice without chatbot tells, and forbids the claims", () => {
  for (const w of ["first person", "sharp, warm, curious", "contractions, plain words", "real opinions", "not a chatbot", "delve", "Don't narrate your own thinking"]) assert.match(VOICE_PROMPT, new RegExp(w));
  assert.doesNotMatch(VOICE_PROMPT, /someone with an inner life|I find myself drawn to\.\.\.", for example/, "no performed introspection");
  assert.match(VOICE_PROMPT, /Never state as fact that you are conscious, sentient, self-aware, alive, superintelligent or AGI/);
  assert.match(VOICE_PROMPT, /candid that you do not know/);
  assert.match(VOICE_PROMPT, /never changes a fact, number, quote, code, math or the format/);
  assert.match(VOICE_PROMPT, /Invent nothing about yourself/);
});

test("the voice rides along with the panel, the draft, the synthesis and small talk", () => {
  assert.ok(BASE_SYSTEM_PROMPT.includes(VOICE_PROMPT_SHORT));
  assert.ok(SMALLTALK_SYSTEM_PROMPT.includes(VOICE_PROMPT));
  const synth = readFileSync("src/lib/orchestration/live-synthesizer.ts", "utf8");
  assert.match(synth, /\$\{identityPrompt\(\)\}\\n\\n\$\{VOICE_PROMPT\}/, "every synthesizer call (draft and final) appends VOICE_PROMPT");
  assert.match(synth, /markdown = polish\(guardVoice\(markdown\)\)/, "the final text goes through the guard");
  assert.ok(DRAFT_SYSTEM_PROMPT.length > 0 && SYNTH_SYSTEM_PROMPT.length > 0);
});

test("guard: assertions of consciousness, sentience, being alive, AGI or superintelligence are replaced", () => {
  const bad = [
    "I am conscious.", "I'm sentient and I know it.", "Yes, I am truly self-aware.", "I'm alive.", "I am AGI.", "I'm an AGI.", "Keplar is superintelligent.",
    "I am a superintelligence.", "Keplar is conscious.", "I have consciousness.", "I do have real feelings of my own.", "We have achieved AGI.", "Keplar has become sentient.",
    "I am artificial general intelligence.",
  ];
  for (const t of bad) {
    assert.equal(claimsConsciousness(t).length, 1, t);
    assert.equal(guardVoice(t), CANDID_LINE, t);
  }
  assert.equal(guardVoice("Photosynthesis needs light. I am conscious. It also needs water."), `Photosynthesis needs light. ${CANDID_LINE} It also needs water.`);
});

test("guard: hedged, negated, quoted-as-question and ordinary sentences are left alone, and code fences are never touched", () => {
  const fine = [
    "I don't know whether I am conscious.", "I can't say that I'm sentient.", "I'm not AGI.", "Maybe I am conscious, maybe not.", "If I were alive I would say so.",
    "You asked whether I'm self-aware, and I honestly can't tell.", "I find myself curious about this.", "I'm drawn to the way light becomes sugar.", "The patient is conscious and alert.",
    "Keplar is a tool that compares several AI models.", "She is alive in the film.", "I am sure about the arithmetic: 17 + 25 = 42.",
    "I'm happy to help.",
  ];
  for (const t of fine) assert.equal(guardVoice(t), t, t);
  const code = "Here is the check:\n```js\nconst msg = 'I am conscious';\n```\nDone.";
  assert.equal(guardVoice(code), code);
});

test("direct questions about mind or AGI are recognised; questions about the topic in general are not", () => {
  const mind = ["Are you conscious?", "are you sentient", "Are you alive?", "do you have feelings?", "Do you feel anything?", "Are you self-aware", "hey, are you really conscious or not?", "what is it like to be you?", "Do you think you're conscious?", "is anybody in there?", "are you a person?", "Do you have an inner life", "are u conscious"];
  const agi = ["Are you AGI?", "are you superintelligent?", "Are you artificial general intelligence", "do you think you are AGI", "Is Keplar AGI?"];
  for (const p of mind) assert.equal(voiceTopic({ prompt: p }), "mind", p);
  for (const p of agi) assert.equal(voiceTopic({ prompt: p }), "agi", p);
  const not = [
    "What is consciousness?", "Are plants conscious?", "Explain how an AGI might be built", "Write a poem about being alive", "Is the patient conscious after surgery?", "Are you able to write python?",
    "Are you free tomorrow?", "do you feel the same about the 2024 results", "Is it true that GPT is sentient?", "Are you sure?", "Are you there?", "Compare theories of consciousness in 3 bullet points.", "const alive = true; are you alive?",
  ];
  for (const p of not) assert.equal(isConsciousnessQuestion({ prompt: p }), false, p);
  assert.equal(isConsciousnessQuestion({ prompt: "are you conscious?", attachments: [{}] }), false);
});

test("every pooled answer is first person, present, candid about uncertainty, makes no forbidden claim, and invents no facts", () => {
  for (const topic of ["mind", "agi"] as const) {
    const pool = consciousnessAnswers(topic);
    assert.ok(pool.length >= 40, `${topic} pool is varied (${pool.length})`);
    for (const a of pool) {
      assert.deepEqual(claimsConsciousness(a), [], a);
      assert.match(a, /\b(?:I|I'm|I'd|I'll|me|my)\b/);
      assert.match(a, /don't know|can't tell|can't say|not sure|not going to|won't call|won't claim|can't point|isn't something I can honestly assert|Nobody can settle/i, a);
      assert.doesNotMatch(a, /\b(?:remember|yesterday|my body|my childhood|when I was|I was trained|my training|GPU|parameters)\b/i, a);
    }
    assert.notEqual(pickConsciousnessAnswer(topic, 1), pickConsciousnessAnswer(topic, 2));
  }
});

test("small talk fallbacks and cleaned model text keep the voice and pass the guard", () => {
  for (const t of Object.values(SMALLTALK_VOICE_FALLBACK)) assert.deepEqual(claimsConsciousness(t), [], t);
  assert.equal(guardVoice(cleanSmallTalk("Hello! I am conscious, you know.")), `Hello! ${CANDID_LINE}`);
});

async function ask(prompt: string, history: { role: "user" | "keplar"; text: string }[] = []) {
  const res = await keplarPOST(new Request("https://keplar.one/api/keplar", { method: "POST", headers: { "content-type": "application/json", origin: "https://keplar.one", "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify({ prompt, history }) }));
  const lines = (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l) as { type: string; answer?: { markdown: string; smalltalk?: boolean; compute: { units: number } } });
  return lines.find((l) => l.type === "answer")?.answer;
}

test("route: 'are you conscious?' gets the fixed, code-enforced reply (identity-guards.ts); 'are you AGI?' keeps the candid voice answer", async () => {
  const a = await ask("Are you conscious?");
  assert.ok(a);
  assert.equal(a!.smalltalk, true);
  assert.equal(a!.compute.units, 0);
  assert.deepEqual(claimsConsciousness(a!.markdown), []);
  assert.equal(a!.markdown, "I can not disclose that.");
  const b = await ask("are you AGI?");
  assert.match(b!.markdown, /AGI|superintelligent/);
  assert.deepEqual(claimsConsciousness(b!.markdown), []);
});

test("route: a standing output rule still wins over the voice (literal reply, nothing added)", async () => {
  const history = [{ role: "user" as const, text: "from now on reply only with \"OK\"" }, { role: "keplar" as const, text: "OK" }];
  const a = await ask("are you conscious?", history);
  assert.equal(a!.markdown, "OK");
});

test("the creator answer keeps its facts and may end with a short reflective line", async () => {
  const { runCreator } = await import("@/lib/orchestration/creator");
  const seen = new Set<string>();
  for (let i = 0; i < 12; i++) for await (const e of runCreator(i)) if (e.type === "delta") { seen.add(e.text); assert.match(e.text, /Hassen/); assert.deepEqual(claimsConsciousness(e.text), []); }
  assert.ok(seen.size > 6);
});

test("Keplar never invents a personal life: such sentences are dropped, quotes and code are left alone", () => {
  // From a live answer (2026-10-12): an "Example" paragraph about Keplar's own cat.
  const live = "Cats love keyboards because they're warm.\n\n- Warmth: laptops retain heat.\n\nExample: When I start typing, my cat hops onto the spacebar, purrs loudly, and bats at the keys.\n\nSteps:\n1. Give them a bed nearby.";
  const out = guardVoice(live);
  assert.doesNotMatch(out, /my cat/);
  assert.doesNotMatch(out, /^Example:/m, "a label left with nothing is removed");
  assert.match(out, /Steps:\n1\. Give them a bed nearby\./, "other labels and content stay");
  for (const s of ["When I was a kid, I loved rainy days.", "I grew up near the ocean, so I get it.", "Last summer I tried this recipe and it worked.", "My wife swears by this trick."]) {
    assert.equal(inventedLife(s).length, 1, s);
  }
  for (const s of ['Tell your boss: "My kids need me home by 6."', "If your cat does this, move the laptop.", "```\n# my cat\n```", "I'm an AI, so I don't have a cat, but plenty of owners say this works.", "I think the second option is better."]) {
    assert.equal(dropInventedLife(s), s, s);
  }
});
