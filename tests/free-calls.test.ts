import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeCosts, type RequestCostRow } from "@/lib/ops/request-cost";
import { askFree, QUESTION } from "./helpers/free-stub";
import { engineDeps } from "@/lib/orchestration/orchestrator";

test("instrumentation: every request sent to the provider is counted per question, by stage, with no text", async () => {
  const { stats, scope, answer } = await askFree({ panel: "split" });
  assert.ok(answer);
  assert.ok(stats.total >= 2);
  assert.equal(scope.sent, stats.total, "the cost scope counts exactly what left for the provider");
  assert.equal(Object.values(scope.sentBySlot ?? {}).reduce((a, b) => a + b, 0), stats.total);
  assert.ok((scope.sentBySlot?.panel ?? 0) >= 2);
  assert.ok(JSON.stringify(scope).indexOf("bakery") === -1, "the counters hold no message text");
});

test("instrumentation: provider 429s are counted and a cancelled request still counts as sent", async () => {
  const { stats, scope, answer } = await askFree({ busy: () => true });
  assert.equal(answer, null);
  assert.equal(scope.sent, stats.total);
  assert.ok((scope.rateLimited ?? 0) >= 1, "429s are visible in the record");
});

test("cost summary: average provider requests per question by plan (old rows fall back to model calls)", () => {
  const row = (o: Partial<RequestCostRow>): RequestCostRow => ({ id: "rc" + Math.random(), workspaceId: "system", at: "2026-10-04T10:00:00.000Z", reqId: "r", plan: "free", accountId: null, kind: "answer", modelCalls: 4, failedCalls: 0, distinctModels: 3, usd: 0, units: 0, durationMs: 1000, answered: true, degraded: null, maxModels: null, ...o });
  const s = summarizeCosts([row({ providerCalls: 8 }), row({ providerCalls: 4 }), row({})]);
  assert.equal(s.byPlan[0].providerCalls, 16);
  assert.equal(Math.round(s.byPlan[0].avgCalls * 100) / 100, 5.33);
});

test("Free consensus: 3 provider requests per question (2 panel models + 1 combined review/write), agreeing or split", async () => {
  for (const panel of ["agree", "split"] as const) {
    const { stats, scope, answer } = await askFree({ panel });
    assert.ok(answer, panel);
    assert.equal(stats.total, 3, `${panel}: ${JSON.stringify(stats.byStage)}`);
    assert.equal(stats.byStage.panel, 2);
    assert.equal(stats.byStage.merged, 1);
    assert.equal(scope.sent, 3);
    assert.equal(answer!.consensus.consulted, 2);
    assert.ok(answer!.markdown.length > 20);
  }
});

test("Free consensus: a split panel still shows the disagreement, from what the two models said", async () => {
  const { answer } = await askFree({ panel: "split" });
  assert.equal(answer!.consensus.disagree > 0 || answer!.disagreements.length > 0, true);
  assert.equal(answer!.disagreements[0]?.positions.length, 2);
  assert.match(answer!.verification.summary, /reviewed/i);
});

test("Free consensus: an unreadable combined reply sends nothing more; the leading model's own reply is shown and the card says so", async () => {
  const { stats, answer } = await askFree({ panel: "agree", merged: "garbage" });
  assert.ok(answer);
  assert.equal(stats.total, 3, JSON.stringify(stats.byStage));
  assert.match(answer!.markdown, /four-day week/i);
  const notes = answer!.verification.notes.join(" ");
  assert.match(notes, /agreement isn't scored|wasn't cross-checked/i);
  assert.equal(answer!.disagreements.length, 0);
});

test("Free consensus: JSON without a written answer keeps the review and shows a panel model's reply, without a 4th request", async () => {
  const { stats, answer } = await askFree({ panel: "split", merged: "no-answer" });
  assert.ok(answer);
  assert.equal(stats.total, 3);
  assert.match(answer!.verification.notes.join(" "), /not available|final write-up/i);
});

test("Free consensus: only one panel model answering is shown as such, with no extra request", async () => {
  const allowed = new Set<string>();
  const { stats, answer } = await askFree({ busy: (m) => { if (allowed.size === 0) allowed.add(m); return !allowed.has(m); } });
  assert.ok(answer);
  assert.equal(stats.byStage.merged ?? 0, 0, "nothing to compare, so no combined request");
  assert.equal(answer!.consensus.responded, 1);
  assert.match(answer!.verification.notes.join(" "), /Only one model answered/);
});

test("KEPLAR_FREE_MERGED=0 restores the separate extractor, reviewer and write-up (rollback switch)", async () => {
  process.env.KEPLAR_FREE_MERGED = "0";
  try {
    const { stats } = await askFree({ panel: "split" });
    assert.equal(stats.byStage.merged ?? 0, 0);
    assert.ok(stats.total >= 5, JSON.stringify(stats.byStage));
  } finally {
    delete process.env.KEPLAR_FREE_MERGED;
  }
});

test("paid plans are unchanged: no combined request, own panel sizes", async () => {
  const prev = { k: process.env.OPENROUTER_API_KEY, l: process.env.KEPLAR_LIVE_MODELS };
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  process.env.KEPLAR_LIVE_MODELS = "1";
  try {
    const deps = engineDeps({ keyTier: "paid" })!;
    assert.equal(deps.mergedReview ?? null, null);
    assert.ok(deps.responseClassifier);
    const req = { prompt: QUESTION, plan: "plus" as const };
    const plan = deps.router.route(await deps.classifier.classify(req), req);
    assert.equal(plan.panel.length, 3, "Plus keeps its 3-model panel");
    const free = engineDeps({ keyTier: "free" })!;
    const fr = { prompt: QUESTION, plan: "free" as const };
    assert.equal(free.router.route(await free.classifier.classify(fr), fr).panel.length, 2);
  } finally {
    if (prev.k === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = prev.k;
    if (prev.l === undefined) delete process.env.KEPLAR_LIVE_MODELS; else process.env.KEPLAR_LIVE_MODELS = prev.l;
  }
});
