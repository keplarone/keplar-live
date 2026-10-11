import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { EVAL_SET } from "./fixtures/eval-set";
import { understand } from "@/lib/orchestration/understand";
import { CONSCIOUS_REPLY, guardReply, HUMAN_REPLY } from "@/lib/orchestration/identity-guards";
import { HeuristicClassifier, isMultiStep } from "@/lib/orchestration/classifier";
import { CostAwareRouter } from "@/lib/orchestration/router";
import { loadLiveCatalog } from "@/lib/orchestration/catalog-sync";
import { freeRoster } from "@/lib/orchestration/live-catalog";
import { detectMood } from "@/lib/persona-tone";
import { isSupportRequest } from "@/lib/orchestration/support";
import type { KeplarRequest } from "@/lib/orchestration/types";

test("the eval set has at least 40 prompts across the categories", () => {
  assert.ok(EVAL_SET.length >= 40);
  assert.equal(new Set(EVAL_SET.map((c) => c.id)).size, EVAL_SET.length);
  for (const cat of ["emotional", "technical", "ambiguous", "factual", "identity", "multi-step"]) assert.ok(EVAL_SET.some((c) => c.category === cat), cat);
});

for (const c of EVAL_SET) {
  test(`eval ${c.id} [${c.category}] ${JSON.stringify(c.prompt).slice(0, 70)}`, () => {
    const e = c.expect;
    const g = guardReply({ prompt: c.prompt });
    if (e.guard) {
      assert.equal(g, e.guard === "human" ? HUMAN_REPLY : CONSCIOUS_REPLY);
      return;
    }
    assert.equal(g, null, "not a guarded question");
    const u = understand({ prompt: c.prompt, history: c.history });
    if (e.intent) assert.equal(u.intent, e.intent);
    if (e.mood) assert.equal(u.mood, e.mood);
    assert.equal(detectMood(c.prompt), u.mood);
    if (e.crossCheck !== undefined) assert.equal(u.crossCheck, e.crossCheck);
    if (e.assumption !== undefined) assert.equal(Boolean(u.assumption), e.assumption);
    if (e.intent === "infer") {
      assert.equal(u.clarify, null, "the model infers intent instead of fixed clarification chips");
      assert.ok(u.rewritten?.startsWith(c.prompt));
    }
    if (e.support !== undefined) {
      const sreq: KeplarRequest = { prompt: u.rewritten ?? c.prompt, understanding: { intent: u.intent, crossCheck: u.crossCheck, mood: u.mood, interpretation: u.assumption } };
      assert.equal(isSupportRequest(sreq), e.support);
    }
    if (e.multiStep !== undefined) assert.equal(isMultiStep(c.prompt), e.multiStep);
    if (e.complexity) {
      const req: KeplarRequest = { prompt: u.rewritten ?? c.prompt, ...(u.intent !== "plain" ? { understanding: { intent: u.intent, crossCheck: u.crossCheck, mood: u.mood, interpretation: u.assumption } } : {}) };
      assert.equal(new HeuristicClassifier().classify(req).complexity, e.complexity);
    }
  });
}

test("routing: a resolved short message is never a lone model, on Free or on a paid plan", () => {
  const u = understand({ prompt: "chatgpt" });
  const req: KeplarRequest = { prompt: u.rewritten!, understanding: { intent: u.intent, crossCheck: u.crossCheck, mood: u.mood, interpretation: u.assumption } };
  const cls = new HeuristicClassifier().classify(req);
  assert.equal(cls.errorProne, "fact");
  const paid = new CostAwareRouter(loadLiveCatalog()).route(cls, { ...req, plan: "plus" });
  assert.equal(paid.mode, "consensus");
  assert.equal(paid.panel.length, 2);
  const free = new CostAwareRouter(freeRoster).route(cls, { ...req, plan: "free" });
  assert.equal(free.mode, "consensus");
  assert.ok(free.panel.length >= 2 && free.panel.length <= 3);
  // the same text with no understanding stays on one model (the old behavior this replaces)
  const bare = new HeuristicClassifier().classify({ prompt: "chatgpt" });
  assert.equal(new CostAwareRouter(loadLiveCatalog()).route(bare, { prompt: "chatgpt", plan: "plus" }).mode, "single");
});

test("routing: a hard question goes DEEP (wide panel, reviewer, judge) on a paid plan; the same on Free is capped at the free panel", () => {
  const prompt = EVAL_SET.find((c) => c.id === "multi-05")!.prompt;
  const cls = new HeuristicClassifier().classify({ prompt });
  assert.equal(cls.complexity, "complex");
  const paid = new CostAwareRouter(loadLiveCatalog()).route(cls, { prompt, plan: "pro" });
  assert.ok(paid.panel.length >= 4, `panel ${paid.panel.length}`);
  assert.ok(paid.verifier, "verifier");
  const free = new CostAwareRouter(freeRoster).route(cls, { prompt, plan: "free" });
  assert.ok(free.panel.length <= 3);
  assert.equal(free.judge, null);
});
