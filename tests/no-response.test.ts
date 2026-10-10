import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { engineDeps, orchestrate } from "@/lib/orchestration/orchestrator";
import { FREE_NO_RESPONSE_MESSAGE, isEmptyAnswer, noResponseEvent, PAID_NO_RESPONSE_MESSAGE } from "@/lib/orchestration/no-response";
import { createSettler, runWasEmpty, type RunState } from "@/lib/orchestration/settle";
import { chargeUnits, usedThisPeriod } from "@/lib/create/platform/compute";
import { ENTITLEMENTS } from "@/lib/create/platform/plans";
import type { Workspace } from "@/lib/create/platform/workspace";
import type { KeplarEvent, KeplarRequest } from "@/lib/orchestration/types";
import { POST as keplarPOST } from "@/app/api/keplar/route";
import { applyEvent } from "@/components/app-ui/state/store";
import type { KeplarMessage } from "@/components/app-ui/state/types";

const KEYS = { OPENROUTER_API_KEY: "sk-or-test", OPENAI_API_KEY: "sk-test", NVIDIA_API_KEY: "nvapi-test", KEPLAR_LIVE_MODELS: "1" };

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const restore = () => { for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } };
  try {
    const r = fn();
    if (r instanceof Promise) return r.finally(restore) as T;
    restore();
    return r;
  } catch (e) {
    restore();
    throw e;
  }
}

const QUESTION = "Should a small bakery switch to a four-day week? Weigh the trade-offs.";
const failingFetch = (status: number) => (async () => new Response(JSON.stringify({ error: { code: status } }), { status })) as unknown as typeof fetch;

async function events(req: KeplarRequest, keyTier: "free" | "paid", patch?: (d: NonNullable<ReturnType<typeof engineDeps>>) => void) {
  const out: KeplarEvent[] = [];
  const deps = engineDeps({ keyTier })!;
  patch?.(deps);
  const run: RunState = { started: false, settled: false, plannedUnits: 0 };
  deps.run = run;
  for await (const e of orchestrate(req, deps)) out.push(e);
  return { out, run };
}

const ws = (over: Partial<Workspace> = {}): Workspace => ({
  id: `ws_${Math.random().toString(36).slice(2)}`, name: "T", plan: "plus", verified: true, entitlements: ENTITLEMENTS.plus, anonymous: false, admin: false,
  userId: "u", email: "u@example.com", period: { start: new Date(Date.now() - 864e5).toISOString(), end: new Date(Date.now() + 864e5 * 20).toISOString() }, ...over,
});

test("wording: Free/signed-out get the upgrade message, paid plans the plain one", () => {
  for (const plan of ["free", undefined, null]) {
    const e = noResponseEvent(plan);
    assert.equal(e.code, "no_response");
    assert.equal(e.message, FREE_NO_RESPONSE_MESSAGE);
    assert.equal(e.upgrade, true);
    assert.equal(e.charged, false);
  }
  for (const plan of ["plus", "pro", "business"]) {
    const e = noResponseEvent(plan);
    assert.equal(e.message, PAID_NO_RESPONSE_MESSAGE);
    assert.equal(e.upgrade, false);
    assert.equal(e.retryable, true);
  }
  assert.match(FREE_NO_RESPONSE_MESSAGE, /^Free models are busy right now and none responded\./);
  assert.match(PAID_NO_RESPONSE_MESSAGE, /not charged/);
});

test("stream error path: every model fails (rate limited / 500) → no_response event, run flagged, plan-specific text", async () => {
  const real = globalThis.fetch;
  try {
    for (const status of [429, 500]) {
      globalThis.fetch = failingFetch(status);
      const free = await withEnv(KEYS, () => events({ prompt: QUESTION, plan: "free", computeRemaining: 1e6 }, "free"));
      const fe = free.out.at(-1) as Extract<KeplarEvent, { type: "error" }>;
      assert.equal(fe.type, "error");
      assert.equal(fe.code, "no_response");
      assert.equal(fe.message, FREE_NO_RESPONSE_MESSAGE);
      assert.equal(fe.upgrade, true);
      assert.ok(!free.out.some((e) => e.type === "answer"));
      assert.equal(free.run.noResponse, true);
      assert.equal(free.run.responded, 0);

      const paid = await withEnv(KEYS, () => events({ prompt: QUESTION, plan: "plus", computeRemaining: 1e6 }, "paid"));
      const pe = paid.out.at(-1) as Extract<KeplarEvent, { type: "error" }>;
      assert.equal(pe.code, "no_response");
      assert.equal(pe.message, PAID_NO_RESPONSE_MESSAGE);
      assert.equal(pe.upgrade, false);
      assert.equal(paid.run.noResponse, true);
      assert.equal(runWasEmpty(paid.run), true);
    }
  } finally {
    globalThis.fetch = real;
  }
});

test("final-empty path: models answered but the synthesis is empty → no_response, not an empty answer", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (async (_u: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { model: string };
    return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content: "Four-day weeks can help retention but hurt coverage." }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 } }), { status: 200 });
  }) as typeof fetch;
  try {
    const { out, run } = await withEnv(KEYS, () =>
      events({ prompt: QUESTION, plan: "plus", computeRemaining: 1e6 }, "paid", (d) => {
        const orig = d.synthesizer.synthesize.bind(d.synthesizer);
        d.synthesizer.synthesize = async (i) => ({ ...(await orig(i)), markdown: "   " });
      }),
    );
    assert.ok(!out.some((e) => e.type === "answer"));
    const last = out.at(-1) as Extract<KeplarEvent, { type: "error" }>;
    assert.equal(last.code, "no_response");
    assert.equal(last.message, PAID_NO_RESPONSE_MESSAGE);
    assert.equal(run.noResponse, true);
    assert.equal(run.settled, false);
  } finally {
    globalThis.fetch = real;
  }
});

test("a healthy run still answers and is not flagged", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (async (_u: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { model: string };
    return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content: "{}" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 } }), { status: 200 });
  }) as typeof fetch;
  try {
    const { out, run } = await withEnv(KEYS, () => events({ prompt: QUESTION, plan: "plus", computeRemaining: 1e6 }, "paid"));
    assert.equal(out.at(-1)!.type, "answer");
    assert.notEqual(run.noResponse, true);
    assert.ok((run.responded ?? 0) > 0);
  } finally {
    globalThis.fetch = real;
  }
});

test("isEmptyAnswer: blank body or zero responders is empty; small talk never is", () => {
  const c = { responded: 3 };
  assert.equal(isEmptyAnswer({ markdown: "Yes.", consensus: c }), false);
  assert.equal(isEmptyAnswer({ markdown: " \n", consensus: c }), true);
  assert.equal(isEmptyAnswer({ markdown: "Yes.", consensus: { responded: 0 } }), true);
  assert.equal(isEmptyAnswer({ smalltalk: true, markdown: "", consensus: { responded: 0 } }), false);
});

test("metering: a run with no model response is never billed (even if the planned cost was reserved); a real run is", async () => {
  const w = ws();
  const before = await usedThisPeriod(w);
  const empty: RunState = { started: true, settled: false, plannedUnits: 120, noResponse: true, responded: 0 };
  assert.equal(await createSettler(w, empty)(120), false);
  assert.equal(await createSettler(w, { ...empty, noResponse: undefined })(120), false, "responded: 0 alone also skips the charge");
  assert.equal(await usedThisPeriod(w), before, "nothing charged");

  const ok: RunState = { started: true, settled: true, plannedUnits: 120, responded: 3 };
  const settle = createSettler(w, ok);
  assert.equal(await settle(40), true);
  assert.equal(await settle(40), false, "billed once");
  assert.equal(await usedThisPeriod(w), before + 40);

  // Admin and Free: Free is never metered.
  assert.equal(await createSettler(ws({ plan: "free" }), ok)(40), false);
  // Existing behaviour kept: stopped after paid calls went out (no flag) is billed at the planned cost.
  const stopped: RunState = { started: true, settled: false, plannedUnits: 55 };
  assert.equal(await createSettler(w, stopped)(55), true);
  void chargeUnits;
});

test("/api/keplar (signed-out = Free): all models fail → NDJSON no_response event with upgrade; nothing is an answer", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = failingFetch(429);
  try {
    const res = await withEnv({ ...KEYS, KEPLAR_AUTH_REQUIRED: undefined }, () =>
      keplarPOST(new Request("https://keplar.one/api/keplar", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify({ prompt: QUESTION }) })),
    );
    assert.equal(res.status, 200);
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l) as KeplarEvent);
    const last = lines.filter((e) => e.type === "error").at(-1) as Extract<KeplarEvent, { type: "error" }>;
    assert.equal(last.type, "error");
    assert.equal(last.code, "no_response");
    assert.equal(last.message, FREE_NO_RESPONSE_MESSAGE);
    assert.equal(last.upgrade, true);
    assert.equal(last.charged, false);
    assert.ok(!lines.some((e) => e.type === "answer"));
    // Free: the question was counted when accepted and given back because no answer was shown (the true meter is re-sent).
    const meters = lines.filter((e): e is Extract<KeplarEvent, { type: "daily" }> => e.type === "daily");
    assert.equal(meters[0]?.daily.used, 1);
    assert.equal(meters.at(-1)?.daily.used, 0);
  } finally {
    globalThis.fetch = real;
  }
});

test("App state: a no_response event becomes a retryable no_response error; upgrade only for Free", () => {
  const base: KeplarMessage = { id: "k", role: "keplar", replyTo: "u", status: "running", stages: [], capabilities: [], models: [], draft: "partial", startedAt: 1 };
  const free = applyEvent(base, noResponseEvent("free"));
  assert.equal(free.status, "error");
  assert.deepEqual(free.error, { kind: "no_response", message: FREE_NO_RESPONSE_MESSAGE, retryable: true, upgrade: true });
  assert.equal(free.draft, "");
  const paid = applyEvent(base, noResponseEvent("pro"));
  assert.deepEqual(paid.error, { kind: "no_response", message: PAID_NO_RESPONSE_MESSAGE, retryable: true, upgrade: false });
  // Other errors keep the old shape.
  const other = applyEvent(base, { type: "error", code: "internal", message: "x", retryable: true });
  assert.equal(other.error?.kind, "server");
});

// QA 2026-10-05: the Free "couldn't produce a reliable answer" card read "…and nothing was charged. Please retry. You were not charged."
test("the Free no-response card adds 'You were not charged.' only when the message does not already say it", async () => {
  const { needsChargeNote, FREE_NO_RESPONSE_MESSAGE, PAID_NO_RESPONSE_MESSAGE } = await import("@/lib/orchestration/no-response");
  const { UNRELIABLE_MESSAGE } = await import("@/lib/orchestration/quality-gate");
  assert.equal(needsChargeNote(UNRELIABLE_MESSAGE), false);
  assert.equal(needsChargeNote(PAID_NO_RESPONSE_MESSAGE), false);
  assert.equal(needsChargeNote(FREE_NO_RESPONSE_MESSAGE), true);
});
