import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { shapeHint } from "@/lib/orchestration/answer-shape";

test("comparisons, how-tos, explanations and writing get a shape; quick facts, code and short messages do not", () => {
  assert.match(shapeHint("Compare PostgreSQL and MySQL for a small startup and when to choose each."), /verdict or recommendation/);
  assert.match(shapeHint("Should I lease or buy my next car given a 3 year horizon?"), /verdict or recommendation/);
  assert.match(shapeHint("Give me 5 low-cost ways to get more customers on weekdays for my bakery."), /numbered list/);
  assert.match(shapeHint("Explain how photosynthesis works for my biology test tomorrow."), /plain sentence/);
  assert.match(shapeHint("What's a good way to remove a red wine stain from a carpet?"), /numbered list/);
  assert.match(shapeHint("I have a job offer with higher pay but a longer commute. How should I decide?"), /verdict or recommendation/);
  assert.match(shapeHint("Write a polite email to my landlord about the broken heater."), /finished text first/);
  for (const q of ["What is the capital of Australia?", "hi", "why is the sky blue", "Compare a vs b"]) assert.equal(shapeHint(q), "", q);
  assert.equal(shapeHint("Compare PostgreSQL and MySQL for a small startup", { kind: "factual" }), "");
  assert.equal(shapeHint("Which is bigger, Texas or California by area?", { kind: "factual" }), "");
  assert.match(shapeHint("What's a good way to remove a red wine stain from a carpet?", { kind: "factual" }), /numbered list/);
  assert.equal(shapeHint("Compare PostgreSQL and MySQL for a small startup", { kind: "code" }), "");
  assert.equal(shapeHint("Compare these two numbers for me please now", { kind: "general", errorProne: "exact" }), "");
});

test("an appended OK verdict from the editing pass is removed; a bare OK stays for the caller to read", async () => {
  const { stripVerdict } = await import("@/lib/orchestration/live-synthesizer");
  assert.equal(stripVerdict("Take the job.\n\nOK"), "Take the job.");
  assert.equal(stripVerdict("Take the job.  \n\nOK."), "Take the job.");
  assert.equal(stripVerdict("OK"), "OK");
  assert.equal(stripVerdict("It is OK to wait.\nIt really is OK to wait"), "It is OK to wait.\nIt really is OK to wait");
});
