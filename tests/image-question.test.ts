import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { engineDeps, orchestrate } from "@/lib/orchestration/orchestrator";
import { parseMedia, textOnlyMediaNote, visionPreamble, type MediaInput } from "@/lib/orchestration/media";
import { answeredAsQuestion, IMAGE_ONLY_PROMPT, imageQuestionMode, isImageOnlyPrompt, QUESTION_IMAGE_NOTE, QUESTION_IMAGE_PROTOCOL } from "@/lib/orchestration/image-question";
import type { KeplarAnswer, KeplarRequest } from "@/lib/orchestration/types";

/** A real screenshot of a multiple-choice quiz question, with app chrome around it (timer, progress bar, site name, Next button). */
const FIXTURE = `data:image/png;base64,${readFileSync(join(import.meta.dirname, "fixtures/images/mcq-capital.png")).toString("base64")}`;
/** The same question with the WRONG option (A, Sydney) selected and labeled "Your answer": a selection is not evidence of the right answer. */
const WRONG_SELECTED = `data:image/png;base64,${readFileSync(join(import.meta.dirname, "fixtures/images/mcq-capital-wrong-selected.png")).toString("base64")}`;
const shot = (extra: Record<string, unknown> = {}, dataUrl = FIXTURE) => parseMedia({ images: [{ dataUrl, width: 900, height: 560, name: "quiz.png" }], ...extra }) as MediaInput;

test("image question: the protocol applies to an image sent alone or with 'solve this', not to a different request", () => {
  const media = shot();
  for (const p of ["Describe this image.", "Describe these images.", "solve this", "Is my answer right?", "did I get this right", "check my answer", "What's the answer?", "which one is correct", "help", "help me with this", "?", "pls", "Answer this question from my quiz"]) {
    assert.equal(imageQuestionMode({ prompt: p, media }), "auto", p);
  }
  for (const p of ["What app is this screenshot from?", "Translate this to Spanish", "What is in this image?", "Describe the layout of this page", "Is this a scam?", "What font is this?"]) {
    assert.equal(imageQuestionMode({ prompt: p, media }), "off", p);
  }
  assert.equal(imageQuestionMode({ prompt: "Describe this image.", media: undefined }), "off", "no image, no protocol");
  const video: MediaInput = { images: [{ dataUrl: FIXTURE, width: 900, height: 560, name: "clip.mp4", frame: { index: 0, of: 1, atSec: 0, video: "clip.mp4" } }], videos: [{ name: "clip.mp4", durationSec: 3, frames: 1 }] };
  assert.equal(imageQuestionMode({ prompt: "Describe what happens in this video.", media: video }), "off", "videos are not question sheets");
  assert.equal(isImageOnlyPrompt("Describe this image."), true);
  assert.equal(isImageOnlyPrompt("Describe this image of my cat in detail."), false);
});

test("image question: the vision models are told to decide, answer first with a short why, skip the chrome; the flag can't come from a request", () => {
  assert.equal(shot({ question: true }).question, undefined, "parseMedia never copies the server-only flag");
  const on = { ...shot(), question: true };
  const pre = visionPreamble(on);
  assert.ok(pre.includes(QUESTION_IMAGE_PROTOCOL));
  assert.match(pre, /First decide whether the attachment is mainly a question/);
  assert.match(pre, /\*\*Answer:\*\*/);
  assert.match(pre, /letter or number AND the option text/);
  assert.match(pre, /why each other option is wrong/);
  assert.match(pre, /Do not describe the app, browser, window, buttons, timer/);
  assert.match(pre, /If it is NOT a question/);
  assert.doesNotMatch(visionPreamble(shot()), /First decide/, "off: the preamble is unchanged");
  assert.match(textOnlyMediaNote(on), /start with "\*\*Answer:\*\* \.\.\."/);
  assert.doesNotMatch(textOnlyMediaNote(shot()), /\*\*Answer:\*\*/);
  assert.equal(answeredAsQuestion("**Answer:** B) Canberra\n\n**Why:** ..."), true);
  assert.equal(answeredAsQuestion("Answer: 42"), true);
  assert.equal(answeredAsQuestion("The screenshot shows a quiz page with a timer."), false);
});

/* ─────────── end to end: the fixture through the real engine with a stubbed OpenRouter ─────────── */

type Seen = { model: string; system: string; text: string; images: number };

function stub(seen: Seen[], panel: (text: string) => string) {
  const real = globalThis.fetch;
  globalThis.fetch = (async (_u: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { model: string; messages: { role: string; content: unknown }[] };
    const system = String(body.messages.find((m) => m.role === "system")?.content ?? "");
    const user = body.messages.find((m) => m.role === "user")?.content;
    const parts = Array.isArray(user) ? (user as { type: string; text?: string }[]) : [{ type: "text", text: String(user ?? "") }];
    const text = parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("\n");
    const images = parts.filter((p) => p.type === "image_url").length;
    seen.push({ model: body.model, system, text, images });
    const rids = [...text.matchAll(/### (R\d+)/g)].map((m) => m[1]);
    let content: string;
    if (/combined reviewer|response classifier/i.test(system)) {
      content = JSON.stringify({ topic: "Capital of Australia", positions: [{ id: "P1", label: "B) Canberra", summary: "Canberra is the capital." }], responses: rids.map((id) => ({ id, kind: "answer", position: "P1" })), claims: [{ text: "Canberra is the capital of Australia.", responses: rids }], checks: [], disputed: [] });
      if (/combined reviewer/i.test(system)) content += "\n=====ANSWER=====\n**Answer:** B) Canberra\n\n**Why:** Canberra has been Australia's capital since 1913; it was built as a compromise between Sydney and Melbourne.\n\n- A) Sydney is the largest city, not the capital.\n- C) Melbourne was the temporary seat of government until 1927.\n- D) Perth is the capital of Western Australia.\nRESOLUTION: No disagreement.";
    } else if (/verifier/i.test(system)) content = JSON.stringify({ checks: [], disputed: [] });
    else content = images ? panel(text) : "Draft.";
    return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 900, completion_tokens: 60, cost: 0 } }), { status: 200 });
  }) as typeof fetch;
  return () => { globalThis.fetch = real; };
}

async function ask(prompt: string, panel: (text: string) => string, plan: "free" | "plus" = "free", dataUrl = FIXTURE) {
  const prev = { k: process.env.OPENROUTER_API_KEY, l: process.env.KEPLAR_LIVE_MODELS };
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  process.env.KEPLAR_LIVE_MODELS = "1";
  const seen: Seen[] = [];
  const restore = stub(seen, panel);
  let answer: KeplarAnswer | null = null;
  let error: string | null = null;
  try {
    const req: KeplarRequest = { prompt, media: shot({}, dataUrl), plan, computeRemaining: 1e6 };
    for await (const e of orchestrate(req, engineDeps({ keyTier: plan === "free" ? "free" : "paid" })!)) {
      if (e.type === "answer") answer = e.answer;
      if (e.type === "error") error = e.message;
    }
  } finally {
    restore();
    if (prev.k === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = prev.k;
    if (prev.l === undefined) delete process.env.KEPLAR_LIVE_MODELS; else process.env.KEPLAR_LIVE_MODELS = prev.l;
  }
  return { seen, answer, error };
}

const ANSWERING = () => "**Answer:** B) Canberra\n\n**Why:** Canberra is the purpose-built capital of Australia.\n\n- A) Sydney is the largest city but not the capital.";

test("Free + multiple-choice screenshot sent alone: free vision models get the protocol and a neutral prompt; the answer leads with the option and says why, with a Beta note", async () => {
  const { seen, answer, error } = await ask("Describe this image.", ANSWERING);
  assert.equal(error, null);
  assert.ok(answer);
  const vision = seen.filter((s) => s.images > 0);
  assert.ok(vision.length >= 1, "the image went to the panel");
  for (const s of vision) {
    assert.match(s.model, /:free$/, "Free: free models only");
    assert.ok(s.text.includes(QUESTION_IMAGE_PROTOCOL), "the panel got the question protocol");
    assert.ok(s.text.includes(IMAGE_ONLY_PROMPT), "the composer's stand-in text was replaced");
    assert.doesNotMatch(s.text.replace(QUESTION_IMAGE_PROTOCOL, ""), /Describe this image/, "no 'describe' instruction fighting the protocol");
  }
  const review = seen.find((s) => /combined reviewer/i.test(s.system));
  assert.ok(review && /start with "\*\*Answer:\*\*/.test(review.text), "the text-only writer keeps the answer-first shape");
  assert.equal(review!.images, 0, "the writer never gets the image");
  assert.match(answer!.markdown, /^\*\*Answer:\*\* B\) Canberra/);
  assert.match(answer!.markdown, /\*\*Why:\*\*/);
  assert.match(answer!.markdown, /Sydney is the largest city/, "why a wrong option is wrong");
  assert.doesNotMatch(answer!.markdown, /timer|Time left|Next button|progress bar/i, "no UI chrome");
  assert.ok(answer!.sources.some((x) => x.kind === "note" && x.title === QUESTION_IMAGE_NOTE.title), "card says it was read from the image (Beta)");
});

test("screenshot sent with a different question ('what app is this?'): no question protocol, no Beta note", async () => {
  const { seen, answer, error } = await ask("What app is this screenshot from?", () => "It looks like a quiz page from an online course, open in a web browser.");
  assert.ok(answer, String(error) + " / " + seen.map((s) => s.system.slice(0, 40)).join(" | "));
  for (const s of seen.filter((x) => x.images > 0)) assert.ok(!s.text.includes(QUESTION_IMAGE_PROTOCOL));
  assert.equal(answer!.sources.some((x) => x.title === QUESTION_IMAGE_NOTE.title), false);
});

test("paid plan + 'solve this' with the screenshot: paid vision models get the same protocol", async () => {
  const { seen, answer, error } = await ask("solve this", ANSWERING, "plus");
  assert.equal(error, null);
  assert.ok(answer);
  const vision = seen.filter((s) => s.images > 0);
  assert.ok(vision.length >= 2, "a vision panel");
  for (const s of vision) {
    assert.doesNotMatch(s.model, /:free$/, "paid plans use paid vision models");
    assert.ok(s.text.includes(QUESTION_IMAGE_PROTOCOL));
    assert.match(s.text, /solve this/, "the person's own words are kept");
  }
});

test("regression: a WRONG option already selected in the screenshot is not echoed — models are told to solve independently and say the selection is wrong", async () => {
  // Before the fix the models copied the highlighted "Your answer" (A, Sydney). The protocol now says a marking is not evidence.
  const rule = /already selected, highlighted, checked, ticked, circled, underlined, filled in or marked[\s\S]*is NOT evidence that it is correct[\s\S]*never copy the selection as the answer/;
  assert.match(QUESTION_IMAGE_PROTOCOL, rule);
  assert.match(QUESTION_IMAGE_PROTOCOL, /The selected option, X, is not correct/);
  assert.match(QUESTION_IMAGE_PROTOCOL, /answer key or "correct" label shown in the image the same way: check it, don't trust it/);
  for (const prompt of ["Describe this image.", "Is my answer right?"]) {
    const { seen, answer, error } = await ask(prompt, () => "**Answer:** B) Canberra\n\nThe selected option, A) Sydney, is not correct: Sydney is the largest city, not the capital.\n\n**Why:** Canberra was chosen as the capital in 1908.", "free", WRONG_SELECTED);
    assert.equal(error, null, prompt);
    const vision = seen.filter((s) => s.images > 0);
    assert.ok(vision.length >= 1);
    for (const s of vision) assert.match(s.text, rule, `${prompt}: every vision model gets the rule`);
    const writer = seen.find((s) => /combined reviewer/i.test(s.system))!;
    assert.match(writer.text, /A selected or highlighted option in the image is not evidence of the right answer/, `${prompt}: the text-only writer too`);
    assert.match(writer.text, /if the marked option is wrong, say so/);
    assert.ok(answer);
  }
});
