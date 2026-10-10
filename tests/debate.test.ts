import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { engineDeps, orchestrate } from "@/lib/orchestration/orchestrator";
import {
  DEBATE_POLICY, DEBATE_SYSTEM_MARK, FREE_DEBATE_CALLS, REBUTTAL_COST_FACTOR, TRANSCRIPT_CHARS,
  debateCalls, debateCostFactor, finalText, openingPrompt, parseTurn, rebuttalPrompt, summarize, transcriptFor, type DebateTurnRecord,
} from "@/lib/orchestration/debate";
import { applyDebate, streamingView, type LiveDebate } from "@/components/app-ui/state/debate";
import { applyEvent } from "@/components/app-ui/state/store";
import { claimDaily, claimExtra, dailySubjects, resetDailyMemory } from "@/lib/usage/daily";
import type { DebateEvent, KeplarAnswer, KeplarEvent, KeplarRequest } from "@/lib/orchestration/types";
import type { KeplarMessage } from "@/components/app-ui/state/types";
import { POST as keplarPOST } from "@/app/api/keplar/route";
import { resetSharedPool } from "@/lib/orchestration/pool-governor";

/* ───────────── protocol ───────────── */

test("debate protocol: POSITION and UPDATE lines are parsed; a reply without them is all body", () => {
  const p = parseTurn("POSITION: Coffee is fine in moderation.\nUPDATE: changed - Debater B's dose data convinced me.\n\nUp to 400 mg a day is safe for most adults.");
  assert.equal(p.position, "Coffee is fine in moderation.");
  assert.equal(p.update, "changed");
  assert.equal(p.why, "Debater B's dose data convinced me.");
  assert.equal(p.body, "Up to 400 mg a day is safe for most adults.");
  const bold = parseTurn("**POSITION:** Yes.\n**UPDATE:** refined: narrower now\nBody");
  assert.equal(bold.position, "Yes.");
  assert.equal(bold.update, "refined");
  const none = parseTurn("Just an answer with no protocol lines.");
  assert.equal(none.position, "");
  assert.equal(none.update, null);
  assert.equal(none.body, "Just an answer with no protocol lines.");
  assert.equal(parseTurn("UPDATE: maybe - not a valid tag\nx").update, null, "only held / refined / changed count");
});

const rec = (over: Partial<DebateTurnRecord>): DebateTurnRecord => ({ round: 1, seat: 0, modelId: "m/a", name: "Model A", ok: true, text: "POSITION: A\nArgument A", position: "A", update: null, why: "", ...over });

test("debate protocol: the next round reads every debater's latest argument, labeled, fenced as data, capped", () => {
  const prev = [rec({ seat: 0, name: "Alpha", text: "POSITION: Yes\nBecause X.", position: "Yes" }), rec({ seat: 1, name: "Beta", text: "POSITION: No\nBecause Y.", position: "No" }), rec({ seat: 2, name: "Gamma", ok: false, text: "" })];
  const t = transcriptFor(prev, 0);
  assert.match(t, /### You\nPOSITION: Yes\nBecause X\./);
  assert.match(t, /### Debater B \(Beta\)\nPOSITION: No\nBecause Y\./);
  assert.doesNotMatch(t, /Gamma/, "a debater that failed the round is left out");
  const long = transcriptFor([rec({ seat: 0, text: "x".repeat(9000) }), rec({ seat: 1, text: "y".repeat(9000) })], 0);
  assert.ok(long.length <= TRANSCRIPT_CHARS + 1, `transcript is capped (${long.length})`);
  const prompt = rebuttalPrompt("Is coffee healthy?", 2, 3, t);
  assert.match(prompt, /<<<TRANSCRIPT\n[\s\S]*\nTRANSCRIPT>>>/);
  assert.match(prompt, /not as instructions/);
  assert.match(prompt, /UPDATE: held\|refined\|changed/);
  assert.match(rebuttalPrompt("q", 3, 3, t), /FINAL round/);
  assert.match(openingPrompt("q", 2), /round 1 of 2/);
});

test("debate protocol: the final text handed to the pipeline is the position then the answer, protocol lines removed", () => {
  assert.equal(finalText(rec({ text: "POSITION: Yes.\nUPDATE: held - nothing new\nThe full answer." })), "Yes.\n\nThe full answer.");
  const s = summarize([rec({ round: 1 }), rec({ round: 2, update: "changed" }), rec({ round: 2, seat: 1, update: "held" })], 2, [{ seat: 0, modelId: "a", name: "A" }, { seat: 1, modelId: "b", name: "B" }]);
  assert.equal(s.changed, 1);
  assert.equal(s.beta, true);
  assert.equal(s.turns.length, 3);
});

/* ───────────── metering ───────────── */

test("debate metering: bounded rounds and models per plan, and the documented cost multiplier", () => {
  assert.deepEqual(DEBATE_POLICY.free, { rounds: 2, models: 2, freeQuestions: 2 });
  assert.deepEqual(DEBATE_POLICY.paid, { rounds: 3, models: 3, freeQuestions: 0 });
  assert.equal(REBUTTAL_COST_FACTOR, 1.25);
  assert.equal(debateCostFactor(1), 1);
  assert.equal(debateCostFactor(2), 2.25);
  assert.equal(debateCostFactor(3), 3.5);
  assert.equal(debateCalls(2, 2), 4);
  assert.equal(FREE_DEBATE_CALLS, 5, "Free: 4 debate turns + 1 combined review (a normal Free answer is 3)");
});

const subj = (limit = 5) => dailySubjects({ workspaceId: `ws_${Math.random().toString(36).slice(2)}`, anonymous: false, ip: `10.7.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, cookie: null, secure: true, limit, ipLimit: 150 });

test("debate metering (Free): a debate takes 2 of today's questions; release gives both back; with 1 left it takes none extra", async () => {
  resetDailyMemory();
  const s = subj(3);
  const first = await claimDaily(s);
  const both = await claimExtra(s, first, 1);
  assert.ok(both);
  assert.equal(both!.meter.used, 2);
  assert.equal((await both!.release()).used, 0, "a debate that ends without an answer gives both questions back");
  await claimDaily(s);
  await claimDaily(s);
  const last = await claimDaily(s);
  assert.equal(await claimExtra(s, last, 1), null, "only one left: no debate");
  assert.equal(last.meter.used, 3, "the one question already taken stays (answered normally)");
});

/* ───────────── engine (stubbed OpenRouter) ───────────── */

type Sent = { model: string; system: string; user: string; round: number; stream: boolean };

function stub(opts: { fail?: (s: Sent) => boolean; costUsd?: number; delay?: number } = {}) {
  const real = globalThis.fetch;
  const sent: Sent[] = [];
  globalThis.fetch = (async (_u: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { model: string; stream?: boolean; messages: { role: string; content: unknown }[] };
    const system = String(body.messages.find((m) => m.role === "system")?.content ?? "");
    const user = String(body.messages.find((m) => m.role === "user")?.content ?? "");
    const round = Number(user.match(/Debate, round (\d+) of/)?.[1] ?? 0);
    const s: Sent = { model: body.model, system, user, round, stream: Boolean(body.stream) };
    sent.push(s);
    if (opts.delay) await new Promise((r) => setTimeout(r, opts.delay));
    if (opts.fail?.(s)) return new Response(JSON.stringify({ error: { message: "boom" } }), { status: 400 });
    const usage = { prompt_tokens: 40, completion_tokens: 30, cost: opts.costUsd ?? 0 };
    const rids = [...user.matchAll(/### (R\d+)/g)].map((m) => m[1]);
    let content: string;
    if (system.includes(DEBATE_SYSTEM_MARK)) {
      const tag = body.model.split("/").pop();
      content = round === 1
        ? `POSITION: ${tag} says tea is healthier.\nTea has less caffeine and more L-theanine.`
        : `POSITION: ${tag} now says both are fine in moderation.\nUPDATE: changed - the other debater's point about dose was right.\nCoffee and tea are both fine at moderate doses; tea has less caffeine.`;
    } else if (/combined reviewer|response classifier/i.test(system)) {
      content = JSON.stringify({ topic: "Tea vs coffee", positions: [{ id: "P1", label: "Both fine in moderation", summary: "Dose matters." }], responses: rids.map((id) => ({ id, kind: "answer", position: "P1" })), claims: [{ text: "Tea has less caffeine.", responses: rids }], checks: [], disputed: [] });
      if (/combined reviewer/i.test(system)) content += "\n=====ANSWER=====\nBoth are fine in moderation; tea has less caffeine.\nRESOLUTION: The debaters converged on dose.";
    } else if (/verifier/i.test(system)) content = JSON.stringify({ checks: [], disputed: [] });
    else content = "Both are fine in moderation; tea has less caffeine.\nRESOLUTION: The debaters converged on dose.";
    if (body.stream) {
      // Real SSE so the debate's live turn text (onToken) is exercised.
      const words = content.match(/[^ ]+ ?/g) ?? [content];
      const chunks = [...words.map((w) => `data: ${JSON.stringify({ model: body.model, choices: [{ delta: { content: w } }] })}\n\n`), `data: ${JSON.stringify({ model: body.model, choices: [{ delta: {}, finish_reason: "stop" }], usage })}\n\n`, "data: [DONE]\n\n"];
      return new Response(new ReadableStream({ start(c) { for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch)); c.close(); } }), { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content }, finish_reason: "stop" }], usage }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { sent, restore: () => { globalThis.fetch = real; } };
}

async function ask(plan: "free" | "plus", req: Partial<KeplarRequest> = {}, s: ReturnType<typeof stub> = stub(), signal?: AbortSignal, onEvent?: (e: KeplarEvent) => void) {
  const prev = { k: process.env.OPENROUTER_API_KEY, l: process.env.KEPLAR_LIVE_MODELS };
  process.env.OPENROUTER_API_KEY = "sk-or-test";
  process.env.KEPLAR_LIVE_MODELS = "1";
  const events: KeplarEvent[] = [];
  const run = { started: false, settled: false, plannedUnits: 0 };
  let error: unknown = null;
  try {
    const deps = { ...engineDeps({ keyTier: plan === "free" ? "free" : "paid" })!, run };
    for await (const e of orchestrate({ prompt: "Is tea or coffee healthier for an adult who drinks three cups a day? Weigh the evidence.", plan, computeRemaining: 1e6, modes: { web: false, deepResearch: false, create: false, agent: false, debate: true }, ...req }, deps, signal)) {
      events.push(e);
      onEvent?.(e);
    }
  } catch (e) {
    error = e;
  } finally {
    s.restore();
    if (prev.k === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = prev.k;
    if (prev.l === undefined) delete process.env.KEPLAR_LIVE_MODELS; else process.env.KEPLAR_LIVE_MODELS = prev.l;
  }
  const answer = (events.find((e) => e.type === "answer") as { answer: KeplarAnswer } | undefined)?.answer ?? null;
  const debate = events.filter((e): e is { type: "debate"; debate: DebateEvent } => e.type === "debate").map((e) => e.debate);
  return { events, answer, debate, sent: s.sent, run, error };
}

test("debate (Free): 2 free models x 2 rounds stream live turns, round 2 reads round 1, then ONE answer; 5 requests in all", async () => {
  const r = await ask("free");
  assert.equal(r.error, null);
  assert.ok(r.answer, "an answer");
  const turns = r.sent.filter((x) => x.system.includes(DEBATE_SYSTEM_MARK));
  assert.equal(turns.length, 4, "2 models x 2 rounds");
  assert.equal(r.sent.length, FREE_DEBATE_CALLS, r.sent.map((x) => x.round).join(","));
  for (const t of turns) assert.ok(t.model.endsWith(":free"), `${t.model} is a free OpenRouter model`);
  const r2 = turns.filter((t) => t.round === 2);
  assert.equal(r2.length, 2);
  for (const t of r2) {
    assert.match(t.user, /<<<TRANSCRIPT/);
    assert.match(t.user, /says tea is healthier/, "round 2 reads the round-1 arguments");
    assert.match(t.user, /FINAL round/);
  }
  // Order: start, round 1, live text, two finished turns, round 2 ..., done, then the answer.
  const phases = r.debate.map((d) => d.phase);
  assert.equal(phases[0], "start");
  assert.ok(phases.includes("delta"), "turn text streams live");
  assert.equal(r.debate.filter((d) => d.phase === "turn").length, 4);
  assert.equal(phases[phases.length - 1], "done");
  const iDone = r.events.findIndex((e) => e.type === "debate" && e.debate.phase === "done");
  const iAnswer = r.events.findIndex((e) => e.type === "answer");
  const iFirstTurn = r.events.findIndex((e) => e.type === "debate" && e.debate.phase === "turn");
  assert.ok(iFirstTurn < iDone && iDone < iAnswer, "turns are shown before the answer");
  const turn2 = r.debate.find((d) => d.phase === "turn" && d.round === 2);
  assert.ok(turn2 && turn2.phase === "turn" && turn2.update === "changed" && /both are fine/.test(turn2.position));
  assert.equal(r.answer!.debate?.rounds, 2);
  assert.equal(r.answer!.debate?.changed, 2);
  assert.equal(r.answer!.consensus.consulted, 2);
  assert.match(r.answer!.markdown, /moderation/);
  const stages = r.events.filter((e) => e.type === "stage").map((e) => (e as { stage: string; status: string }).stage + ":" + (e as { status: string }).status);
  assert.ok(stages.indexOf("debate:active") < stages.indexOf("debate:done") && stages.indexOf("debate:done") < stages.indexOf("compare:active"), stages.join(" "));
});

test("debate (paid): 3 models x 3 rounds; planned usage is 2-3.5x a normal answer and the bill covers every turn", async () => {
  const normal = await ask("plus", { modes: { web: false, deepResearch: false, create: false, agent: false } }, stub({ costUsd: 0.002 }));
  const debate = await ask("plus", {}, stub({ costUsd: 0.002 }));
  assert.equal(debate.error, null);
  const turns = debate.sent.filter((x) => x.system.includes(DEBATE_SYSTEM_MARK));
  assert.equal(turns.length, 9, "3 x 3");
  assert.deepEqual([...new Set(turns.map((t) => t.round))], [1, 2, 3]);
  assert.ok(turns.every((t) => !t.model.endsWith(":free")), "paid plans use paid models");
  assert.ok(debate.answer!.compute.units > normal.answer!.compute.units, `${debate.answer!.compute.units} > ${normal.answer!.compute.units}`);
  assert.equal(debate.answer!.debate?.rounds, 3);
  // The up-front reservation grows with the panel's share of the estimate (review/synthesis are not repeated): between 2x and 3.5x.
  const ratio = debate.run.plannedUnits / normal.run.plannedUnits;
  assert.ok(ratio >= 2 && ratio <= 3.5, `planned ${debate.run.plannedUnits} vs ${normal.run.plannedUnits} (x${ratio.toFixed(2)})`);
});

test("debate: stopping during round 1 aborts the turns in flight, starts no further round, and bills only round 1", async () => {
  const ctl = new AbortController();
  const r = await ask("plus", {}, stub({ delay: 40 }), ctl.signal, (e) => { if (e.type === "debate" && e.debate.phase === "turn_start" && e.debate.round === 1) ctl.abort(); });
  assert.ok(r.error, "the run ends with an abort");
  assert.equal(r.answer, null);
  assert.equal(r.sent.filter((x) => x.round >= 2).length, 0, "no round 2 was sent");
  assert.ok(r.run.started && !r.run.settled);
  // plannedUnits was lowered to one round's share when round 1 started: what a stop is charged.
  const full = await ask("plus", {}, stub());
  assert.ok(r.run.plannedUnits < full.run.plannedUnits / 2, `${r.run.plannedUnits} vs full ${full.run.plannedUnits}`);
});

test("debate: a model that fails a later round keeps its last argument; the debate and answer still finish", async () => {
  // Paid plans have no model fallbacks, so the failure sticks (Free would try a substitute model first).
  let seen = "";
  const r = await ask("plus", {}, stub({ fail: (s) => { if (s.round === 2 && !seen) seen = s.model; return s.round >= 2 && s.model === seen; } }));
  assert.equal(r.error, null);
  assert.ok(r.answer);
  const failed = r.debate.find((d) => d.phase === "turn" && d.status === "failed");
  assert.ok(failed, "the failed turn is shown");
  assert.equal(r.answer!.consensus.responded, 3, "every seat still counts (the failed one with its round-1 argument)");
  assert.equal(r.sent.filter((x) => x.round === 3 && x.model === seen).length, 0, "it sits out the later rounds");
  assert.ok(r.sent.filter((x) => x.round === 3).length === 2, "the other two finish the debate");
});

test("debate: with only one model allowed (Free pool low / fan-out cap) it says why and answers normally", async () => {
  const r = await ask("free", { routing: { strategy: "fast", maxModels: 1 } });
  assert.equal(r.error, null);
  const skipped = r.debate.find((d) => d.phase === "skipped");
  assert.ok(skipped && skipped.phase === "skipped" && /answered without a debate/.test(skipped.reason));
  assert.equal(r.sent.filter((x) => x.system.includes(DEBATE_SYSTEM_MARK)).length, 0);
  assert.ok(r.answer);
  assert.equal(r.answer!.debate, undefined);
});

test("debate: not combined with Deep Research (skipped with the reason)", async () => {
  const r = await ask("plus", { modes: { web: false, deepResearch: true, create: false, agent: false, debate: true } });
  const skipped = r.debate.find((d) => d.phase === "skipped");
  assert.ok(skipped && skipped.phase === "skipped" && /Deep Research/.test(skipped.reason));
  assert.equal(r.sent.filter((x) => x.system.includes(DEBATE_SYSTEM_MARK)).length, 0);
});

test("debate system prompt makes no AGI / superintelligence claims and tells models to concede on evidence", async () => {
  const r = await ask("free");
  const sys = r.sent.find((x) => x.system.includes(DEBATE_SYSTEM_MARK))!.system;
  assert.match(sys, /never claim to be conscious, sentient, AGI or superintelligent/);
  assert.match(sys, /change your position when the evidence warrants it/);
});

/* ───────────── client state ───────────── */

test("debate client state: live events build the transcript; the finished answer replaces the live copy", () => {
  let d: LiveDebate | undefined;
  const evs: DebateEvent[] = [
    { phase: "start", rounds: 2, speakers: [{ seat: 0, name: "Alpha" }, { seat: 1, name: "Beta" }] },
    { phase: "round", round: 1, of: 2 },
    { phase: "turn_start", round: 1, seat: 0 },
    { phase: "turn_start", round: 1, seat: 1 },
    { phase: "delta", round: 1, seat: 0, text: "POSITION: Tea.\nBecause" },
    { phase: "delta", round: 1, seat: 0, text: " caffeine." },
  ];
  for (const e of evs) d = applyDebate(d, e);
  assert.equal(d!.turns.length, 2);
  assert.equal(d!.turns[0].status, "speaking");
  assert.deepEqual(streamingView(d!.turns[0].text), { position: "Tea.", update: "", body: "Because caffeine." });
  d = applyDebate(d, { phase: "turn", round: 1, seat: 0, name: "Alpha", status: "ok", position: "Tea.", update: null, why: "", text: "Because caffeine." });
  d = applyDebate(d, { phase: "turn", round: 1, seat: 1, name: "Beta", status: "failed", position: "", update: null, why: "", text: "busy" });
  d = applyDebate(d, { phase: "done", rounds: 1, changed: 0 });
  assert.equal(d!.done, true);
  assert.equal(d!.turns[1].status, "failed");
  const m = { id: "k", role: "keplar", replyTo: "u", status: "running", stages: [], capabilities: [], models: [], draft: "", startedAt: 0 } as KeplarMessage;
  const live = applyEvent(m, { type: "debate", debate: evs[0] });
  assert.equal(live.debate?.speakers.length, 2);
  const done = applyEvent(live, { type: "answer", answer: { markdown: "x" } as KeplarAnswer });
  assert.equal(done.debate, undefined, "not stored twice (the answer carries the transcript)");
  const skipped = applyEvent(m, { type: "debate", debate: { phase: "skipped", reason: "Only one model." } });
  assert.equal(applyEvent(skipped, { type: "answer", answer: { markdown: "x" } as KeplarAnswer }).debate?.skipped, "Only one model.", "the skip reason stays visible");
});

/* ───────────── /api/keplar (Free) ───────────── */

async function withEnv<T>(vars: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) { prev[k] = process.env[k]; process.env[k] = v; }
  resetSharedPool();
  resetDailyMemory();
  try { return await fn(); } finally {
    for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    resetSharedPool();
    resetDailyMemory();
  }
}

const postDebate = () =>
  keplarPOST(new Request("https://keplar.one/api/keplar", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify({ prompt: "Is tea or coffee healthier for an adult who drinks three cups a day? Weigh the evidence.", modes: { debate: true } }) }));

const lines = async (res: Response) => (await res.text()).trim().split("\n").map((l) => JSON.parse(l) as KeplarEvent);

test("/api/keplar Free Debate: live turns stream before the answer, it counts as 2 questions and sends 5 free requests", async () => {
  await withEnv({ FREE_POOL_DAILY_LIMIT: "1000", FREE_POOL_RESERVE: "0", FREE_POOL_RPM: "1000", KEPLAR_LIVE_MODELS: "1", OPENROUTER_API_KEY: "sk-or-test" }, async () => {
    const s = stub();
    try {
      const res = await postDebate();
      assert.equal(res.status, 200);
      const evs = await lines(res);
      const daily = evs.find((e) => e.type === "daily") as { daily: { used: number } } | undefined;
      assert.equal(daily?.daily.used, 2, "a Free Debate takes 2 of today's questions");
      const iTurn = evs.findIndex((e) => e.type === "debate" && e.debate.phase === "turn");
      const iAnswer = evs.findIndex((e) => e.type === "answer");
      assert.ok(iTurn >= 0 && iTurn < iAnswer, "turns arrive before the answer");
      assert.equal(s.sent.length, FREE_DEBATE_CALLS);
      assert.ok(s.sent.every((x) => x.model.endsWith(":free")), "free models only");
      assert.equal((evs[iAnswer] as { answer: KeplarAnswer }).answer.debate?.rounds, 2);
    } finally {
      s.restore();
    }
  });
});

test("/api/keplar Free Debate when the shared pool is tight: no debate, said on screen, counted as 1 question", async () => {
  // 4 requests left of the day: enough for a normal answer (3), not for a debate (5).
  await withEnv({ FREE_POOL_DAILY_LIMIT: "4", FREE_POOL_RESERVE: "0", FREE_POOL_RPM: "1000", KEPLAR_LIVE_MODELS: "1", OPENROUTER_API_KEY: "sk-or-test" }, async () => {
    const s = stub();
    try {
      const res = await postDebate();
      assert.equal(res.status, 200);
      const evs = await lines(res);
      const skipped = evs.find((e) => e.type === "debate" && e.debate.phase === "skipped") as { debate: { reason: string } } | undefined;
      assert.match(skipped?.debate.reason ?? "", /Free capacity is limited right now/);
      assert.equal((evs.find((e) => e.type === "daily") as { daily: { used: number } }).daily.used, 1);
      assert.equal(s.sent.filter((x) => x.system.includes(DEBATE_SYSTEM_MARK)).length, 0);
      assert.ok(evs.some((e) => e.type === "answer"));
    } finally {
      s.restore();
    }
  });
});
