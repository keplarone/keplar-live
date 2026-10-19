import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { GUIDE_HINT, isGuideRequest, shapeHint } from "@/lib/orchestration/answer-shape";

test("comparisons, how-tos, explanations and writing get a shape; quick facts, code and short messages do not", () => {
  assert.match(shapeHint("Compare PostgreSQL and MySQL for a small startup and when to choose each."), /verdict or recommendation/);
  assert.match(shapeHint("Should I lease or buy my next car given a 3 year horizon?"), /verdict or recommendation/);
  assert.match(shapeHint("Give me 5 low-cost ways to get more customers on weekdays for my bakery."), /numbered list/);
  assert.match(shapeHint("Explain how photosynthesis works for my biology test tomorrow."), /plain sentence/);
  assert.match(shapeHint("What's a good way to remove a red wine stain from a carpet?"), /step-by-step guide/, "a how-to gets the full guide");
  assert.match(shapeHint("I have a job offer with higher pay but a longer commute. How should I decide?"), /verdict or recommendation/);
  assert.match(shapeHint("Write a polite email to my landlord about the broken heater."), /finished text first/);
  for (const q of ["What is the capital of Australia?", "hi", "why is the sky blue", "Compare a vs b"]) assert.equal(shapeHint(q), "", q);
  assert.equal(shapeHint("Compare PostgreSQL and MySQL for a small startup", { kind: "factual" }), "");
  assert.equal(shapeHint("Which is bigger, Texas or California by area?", { kind: "factual" }), "");
  assert.match(shapeHint("What's a good way to remove a red wine stain from a carpet?", { kind: "factual" }), /step-by-step guide/);
  assert.equal(shapeHint("Compare PostgreSQL and MySQL for a small startup", { kind: "code" }), "");
  assert.equal(shapeHint("Compare these two numbers for me please now", { kind: "general", errorProne: "exact" }), "");
});

test("how-to questions get the deep step-by-step guide; explanations, facts, decisions, chat and idea lists do not", async () => {
  const { isGuideRequest, GUIDE_HINT } = await import("@/lib/orchestration/answer-shape");
  for (const q of ["how do I fix a leaking kitchen tap", "how to tie a tie", "How can I set up a Next.js app with Tailwind?", "what is the best way to clean a cast iron pan", "walk me through filing my taxes", "steps to start a small business in Texas", "how should i go about replacing my car battery", "teach me how to solve a rubiks cube", "how do you change a tire", "show me how to use git rebase", "how do i properly season a steak"]) {
    assert.ok(isGuideRequest(q), q);
    assert.equal(shapeHint(q), GUIDE_HINT, q);
  }
  assert.equal(shapeHint("How do I reverse a list in Python?", { kind: "code" }), GUIDE_HINT, "code how-tos too; the hint scales a one-liner down");
  for (const q of ["how does photosynthesis work", "how many people live in Japan", "how much does a tesla cost", "how do you feel today", "how do you say hello in french", "how old is the earth", "how are you", "how come the sky is blue", "ideas for a birthday party", "I have a job offer with higher pay but a longer commute. How should I decide?", "Give me 5 low-cost ways to get more customers on weekdays for my bakery."]) assert.ok(!isGuideRequest(q), q);
  assert.notEqual(shapeHint("how do I count to 7 out loud", { kind: "general", errorProne: "exact" }), GUIDE_HINT, "exact checks never get the guide");
  // What makes it better than a plain list: prerequisites, a check per step, troubleshooting, expert tips, and no invented details.
  for (const part of ["Before you start", "*Check:*", "If something goes wrong", "Pro tips", "never invent"]) assert.ok(GUIDE_HINT.includes(part), part);
  assert.match(GUIDE_HINT, /No jokes or witty asides anywhere in the guide/);
});

test("the final write-up of a how-to keeps the full guide: its own rules, every model's full answer, and room to write it", async () => {
  const { GUIDE_SYNTH_RULES } = await import("@/lib/orchestration/live-synthesizer");
  assert.match(GUIDE_SYNTH_RULES, /override the length and list rules/);
  const { readFileSync } = await import("node:fs");
  const synth = readFileSync("src/lib/orchestration/live-synthesizer.ts", "utf8");
  // The same synthesis call also has room for one keplar-ui block. Still one call.
  assert.match(synth, /guide \? 4800 : 1800, 1, signal/, "synthesis output room");
  assert.match(synth, /Full responses \(use their exact steps/);
  assert.match(readFileSync("src/lib/orchestration/free-merged.ts", "utf8"), /GUIDE_SYNTH_RULES/, "the Free plan's combined review writes the guide too");
  const { livePanelParams } = await import("@/lib/orchestration/orchestrator");
  const c = { kind: "general", complexity: "moderate", capabilities: [], estimatedInputTokens: 100, estimatedOutputTokens: 100, needsWeb: false, rationale: "" } as never;
  assert.ok((livePanelParams(c, false, true).maxOutputTokens ?? 0) >= 3600);
  assert.equal(livePanelParams(c, false, false).maxOutputTokens, 1400, "everything else keeps its budget");
  const { LatencyBudget } = await import("@/lib/orchestration/latency");
  assert.equal(new LatencyBudget(60_000).atLeast(120_000).totalMs, 120_000);
  assert.equal(new LatencyBudget(180_000).atLeast(120_000).totalMs, 180_000, "never lowered");
});

test("an appended OK verdict from the editing pass is removed; a bare OK stays for the caller to read", async () => {
  const { stripVerdict } = await import("@/lib/orchestration/live-synthesizer");
  assert.equal(stripVerdict("Take the job.\n\nOK"), "Take the job.");
  assert.equal(stripVerdict("Take the job.  \n\nOK."), "Take the job.");
  assert.equal(stripVerdict("OK"), "OK");
  assert.equal(stripVerdict("It is OK to wait.\nIt really is OK to wait"), "It is OK to wait.\nIt really is OK to wait");
});

test("care and habit questions get the short tips list, not the deep project guide", () => {
  for (const q of ["What's the best way to keep basil alive on a windowsill?", "How do I keep my sourdough starter alive?", "How can I stay focused while working from home?", "Best way to avoid jet lag on a long flight?", "How do I stop procrastinating on homework?"]) {
    assert.equal(isGuideRequest(q), false, q);
    assert.notEqual(shapeHint(q, { kind: "general" }), GUIDE_HINT, q);
  }
  for (const q of ["How do I fix a leaking kitchen tap?", "How do I set up ESLint in a Next.js app?", "What's the best way to replace a bike chain?", "How do I keep a website online during a migration, step by step?"]) {
    assert.equal(isGuideRequest(q), true, q);
  }
});
