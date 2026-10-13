import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { signIn } from "./helpers/session";
import { POST as keplarPOST } from "@/app/api/keplar/route";
import { GET as turnGET, POST as turnPOST } from "@/app/api/keplar/turn/route";
import { claimTurn, finishTurn, readTurn, TURN_STALE_MS, TURN_TTL_MS, turnOwner } from "@/lib/orchestration/turn-recovery";
import { newDeviceId, readDeviceId } from "@/lib/usage/daily";
import { newTurnKey, pollTurn } from "@/components/app-ui/state/recovery";
import { collection } from "@/lib/create/platform/store";
import type { KeplarEvent } from "@/lib/orchestration/types";

const ANSWER = "Start with the weakest topic for an hour, then sleep; a rested brain recalls more.";
let providerCalls = 0;
let delayMs = 0;

async function withStub<T>(fn: () => Promise<T>): Promise<T> {
  const realFetch = globalThis.fetch;
  const env = { KEPLAR_LIVE_MODELS: "1", OPENROUTER_API_KEY: "sk-or-test", OPENROUTER_FREE_API_KEY: "sk-or-free-test" };
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) { prev[k] = process.env[k]; process.env[k] = v; }
  globalThis.fetch = (async (_u: string | URL, init?: RequestInit) => {
    providerCalls++;
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    const model = (JSON.parse(String(init?.body ?? "{}")) as { model: string }).model;
    return new Response(JSON.stringify({ model, choices: [{ message: { content: ANSWER }, finish_reason: "stop" }], usage: { prompt_tokens: 40, completion_tokens: 30, cost: 0 } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
    for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}
let ipN = 0;
const ask = (body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  keplarPOST(new Request("https://keplar.one/api/keplar", { method: "POST", headers: { "content-type": "application/json", origin: "https://keplar.one", "x-forwarded-for": `10.88.${++ipN}.1`, ...headers }, body: JSON.stringify({ history: [], ...body }) }));
const events = async (res: Response) => (await res.text()).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as KeplarEvent);
const PROMPT = "Should a small bakery switch to a four-day week? Weigh the trade-offs.";

/* ── the checkpoint rules ── */

test("claims: first claim runs; a second while running is refused; a finished turn replays; a failed one runs again", async () => {
  const owner = "ws:w1:u:u1";
  const key = newTurnKey();
  assert.equal((await claimTurn(owner, key)).kind, "fresh");
  assert.equal((await claimTurn(owner, key)).kind, "running", "no duplicate run while the first is going");
  await finishTurn(owner, key, { status: "done", answer: { markdown: "x" } });
  const again = await claimTurn(owner, key);
  assert.equal(again.kind, "replay");
  const k2 = newTurnKey();
  await claimTurn(owner, k2);
  await finishTurn(owner, k2, { status: "failed", error: { code: "internal", message: "boom" } });
  assert.equal((await claimTurn(owner, k2)).kind, "fresh", "a failed turn can be retried");
});

test("claims: a run that died (stale) or an expired turn runs again; owners never see each other's turns", async () => {
  const key = newTurnKey();
  const t0 = Date.parse("2026-10-12T10:00:00Z");
  assert.equal((await claimTurn("ws:a:u:1", key, t0)).kind, "fresh");
  assert.equal((await claimTurn("ws:a:u:1", key, t0 + TURN_STALE_MS + 1)).kind, "fresh", "a running row past the run limit belongs to a dead run");
  await finishTurn("ws:a:u:1", key, { status: "done", answer: { markdown: "y" } }, t0 + TURN_STALE_MS + 2);
  assert.equal(await readTurn("ws:a:u:1", key, t0 + TURN_STALE_MS + TURN_TTL_MS + 5), null, "expired turns are unreadable");
  assert.equal(await readTurn("ws:a:u:2", key, t0 + TURN_STALE_MS + 3), null, "another person in the same workspace can't read it");
  assert.equal(await readTurn("dev:someoneelse", key, t0 + TURN_STALE_MS + 3), null);
});

test("owners: signed-in = workspace + person; signed out = the signed device cookie, or no recovery at all", () => {
  assert.equal(turnOwner({ id: "w1", anonymous: false, userId: "u1" }, null), "ws:w1:u:u1");
  assert.notEqual(turnOwner({ id: "team1", anonymous: false, userId: "a" }, null), turnOwner({ id: "team1", anonymous: false, userId: "b" }, null), "team members are separate");
  assert.equal(turnOwner({ id: "anonymous", anonymous: true }, "dev123"), "dev:dev123");
  assert.equal(turnOwner({ id: "anonymous", anonymous: true }, null), null, "all guests share one workspace: no device cookie, no recovery");
});

test("too-large answers are not kept (the turn says so instead)", async () => {
  const owner = "ws:big:u:1";
  const key = newTurnKey();
  await claimTurn(owner, key);
  await finishTurn(owner, key, { status: "done", answer: { markdown: "x".repeat(700_000) } });
  const row = await readTurn(owner, key);
  assert.equal(row?.status, "failed");
  assert.equal(row?.error?.code, "too_large");
  assert.equal(row?.answer, undefined);
});

/* ── through the real route ── */

test("route: a retry of a finished turn is replayed: no second run, no second charge", async () => {
  const { cookie } = await signIn(`recover-${Math.random().toString(36).slice(2, 8)}@example.com`, "pro");
  const key = newTurnKey();
  await withStub(async () => {
    providerCalls = 0;
    const first = await events(await ask({ prompt: PROMPT, turnKey: key }, { cookie }));
    assert.ok(first.some((e) => e.type === "answer"), "first send answered");
    const ran = providerCalls;
    assert.ok(ran >= 1);
    const res = await ask({ prompt: PROMPT, turnKey: key }, { cookie });
    assert.equal(res.headers.get("x-keplar-turn"), "replayed");
    const second = await events(res);
    assert.deepEqual(second.map((e) => e.type), ["recovery", "answer"]);
    assert.equal((second[0] as Extract<KeplarEvent, { type: "recovery" }>).state, "replayed");
    const a1 = first.find((e) => e.type === "answer") as Extract<KeplarEvent, { type: "answer" }>;
    const a2 = second[1] as Extract<KeplarEvent, { type: "answer" }>;
    assert.equal(a2.answer.id, a1.answer.id, "the same answer, not a new one");
    assert.equal(providerCalls, ran, "no provider was called again");
    // A different person with the same key gets their own run, never the first person's answer.
    const other = await signIn(`recover-other-${Math.random().toString(36).slice(2, 8)}@example.com`, "pro");
    const theirs = await ask({ prompt: PROMPT, turnKey: key }, { cookie: other.cookie });
    assert.notEqual(theirs.headers.get("x-keplar-turn"), "replayed");
    await theirs.text();
    assert.ok(providerCalls > ran);
  });
});

test("route: signed out with the device cookie recovers; without it, or in a private chat, nothing is checkpointed", async () => {
  const dev = newDeviceId();
  const cookie = `keplar_dev=${dev.setCookie(true).split(";")[0].slice("keplar_dev=".length)}`;
  await withStub(async () => {
    const key = newTurnKey();
    await events(await ask({ prompt: PROMPT, turnKey: key }, { cookie }));
    // The stream closes before the run saves how it ended (a reconnect in between gets 409 and polls); wait for the save.
    const owner = turnOwner({ id: "anon", anonymous: true }, readDeviceId(cookie))!;
    for (let i = 0; i < 100 && (await readTurn(owner, key))?.status !== "done"; i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal((await ask({ prompt: PROMPT, turnKey: key }, { cookie })).headers.get("x-keplar-turn"), "replayed");
    const noDevice = newTurnKey();
    await events(await ask({ prompt: PROMPT, turnKey: noDevice }));
    assert.notEqual((await ask({ prompt: PROMPT, turnKey: noDevice })).headers.get("x-keplar-turn"), "replayed");
  });
  const { cookie: signedIn } = await signIn(`recover-private-${Math.random().toString(36).slice(2, 8)}@example.com`, "pro");
  const key = newTurnKey();
  const before = (await collection("answer_turns").listSystem()).length;
  await withStub(async () => { await events(await ask({ prompt: PROMPT, turnKey: key, private: true }, { cookie: signedIn })); });
  assert.equal((await collection("answer_turns").listSystem()).length, before, "private chats are never checkpointed");
});

test("route: the browser drops mid-answer -> the run finishes anyway and saves its answer; GET turn returns it", async () => {
  const { cookie } = await signIn(`recover-drop-${Math.random().toString(36).slice(2, 8)}@example.com`, "pro");
  const key = newTurnKey();
  delayMs = 250;
  try {
    await withStub(async () => {
      const res = await ask({ prompt: PROMPT, turnKey: key }, { cookie });
      const reader = res.body!.getReader();
      await reader.read(); // the first events arrive...
      await reader.cancel(); // ...and the connection drops
      let state: { status: string; answer?: { markdown: string }; headless?: boolean } = { status: "running" };
      for (let i = 0; i < 80 && state.status === "running"; i++) {
        await new Promise((r) => setTimeout(r, 100));
        state = (await (await turnGET(new Request(`https://keplar.one/api/keplar/turn?key=${key}`, { headers: { cookie, origin: "https://keplar.one", "x-forwarded-for": "10.88.200.1" } }))).json()) as typeof state;
      }
      assert.equal(state.status, "done", JSON.stringify(state).slice(0, 200));
      assert.ok(state.answer?.markdown, "the saved answer comes back");
      assert.equal(state.headless, true, "it finished after the browser left");
    });
  } finally {
    delayMs = 0;
  }
});

test("route: Stop is honoured even after the connection drops (cancel first, then the drop) -> cancelled, no answer kept", async () => {
  const { cookie } = await signIn(`recover-stop-${Math.random().toString(36).slice(2, 8)}@example.com`, "pro");
  const key = newTurnKey();
  delayMs = 600;
  try {
    await withStub(async () => {
      const res = await ask({ prompt: PROMPT, turnKey: key }, { cookie });
      const reader = res.body!.getReader();
      await reader.read();
      const stop = await turnPOST(new Request("https://keplar.one/api/keplar/turn", { method: "POST", headers: { "content-type": "application/json", cookie, origin: "https://keplar.one", "x-forwarded-for": "10.88.201.1" }, body: JSON.stringify({ key, action: "cancel" }) }));
      assert.equal(stop.status, 200);
      await reader.cancel();
      let status = "running";
      for (let i = 0; i < 80 && status === "running"; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const res2 = await turnGET(new Request(`https://keplar.one/api/keplar/turn?key=${key}`, { headers: { cookie, origin: "https://keplar.one", "x-forwarded-for": "10.88.202.1" } }));
        status = ((await res2.json()) as { status: string }).status;
      }
      assert.equal(status, "cancelled");
    });
  } finally {
    delayMs = 0;
  }
});

test("route: Stop works even when the server never hears about the disconnect (Vercel) -> the run stops itself", async () => {
  const { cookie } = await signIn(`recover-stop-vercel-${Math.random().toString(36).slice(2, 8)}@example.com`, "pro");
  const key = newTurnKey();
  delayMs = 700;
  try {
    await withStub(async () => {
      const t0 = Date.now();
      const res = await ask({ prompt: PROMPT, turnKey: key }, { cookie });
      const reader = res.body!.getReader();
      await reader.read();
      const stop = await turnPOST(new Request("https://keplar.one/api/keplar/turn", { method: "POST", headers: { "content-type": "application/json", cookie, origin: "https://keplar.one", "x-forwarded-for": "10.88.203.1" }, body: JSON.stringify({ key, action: "cancel" }) }));
      assert.equal(stop.status, 200);
      // The stream is never cancelled here (like production, where the function isn't told the browser left): keep reading to the end.
      while (!(await reader.read()).done) { /* drain */ }
      const res2 = await turnGET(new Request(`https://keplar.one/api/keplar/turn?key=${key}`, { headers: { cookie, origin: "https://keplar.one", "x-forwarded-for": "10.88.204.1" } }));
      const turn = (await res2.json()) as { status: string; answer?: unknown };
      assert.equal(turn.status, "cancelled", "the run checked for the Stop and ended");
      assert.equal(turn.answer, undefined);
      assert.ok(Date.now() - t0 < 15_000);
    });
  } finally {
    delayMs = 0;
  }
});

test("route: a second send of a turn still being answered gets 409 turn_running (no duplicate run)", async () => {
  const { cookie } = await signIn(`recover-race-${Math.random().toString(36).slice(2, 8)}@example.com`, "pro");
  const key = newTurnKey();
  delayMs = 400;
  try {
    await withStub(async () => {
      const first = ask({ prompt: PROMPT, turnKey: key }, { cookie });
      const r1 = await first;
      const reader = r1.body!.getReader();
      await reader.read(); // the first run is under way
      const dup = await ask({ prompt: PROMPT, turnKey: key }, { cookie });
      assert.equal(dup.status, 409);
      assert.equal(((await dup.json()) as { code: string }).code, "turn_running");
      while (!(await reader.read()).done) { /* let the first finish */ }
    });
  } finally {
    delayMs = 0;
  }
});

test("turn API: another person's key reads as missing; malformed keys are refused", async () => {
  const a = await signIn(`turn-a-${Math.random().toString(36).slice(2, 8)}@example.com`, "pro");
  const b = await signIn(`turn-b-${Math.random().toString(36).slice(2, 8)}@example.com`, "pro");
  const key = newTurnKey();
  await withStub(async () => { await events(await ask({ prompt: PROMPT, turnKey: key }, { cookie: a.cookie })); });
  const get = (cookie: string, k: string) => turnGET(new Request(`https://keplar.one/api/keplar/turn?key=${k}`, { headers: { cookie, origin: "https://keplar.one", "x-forwarded-for": "10.88.210.1" } }));
  // The stream closes before the run saves how it ended (until then the turn reads as running); wait for the save.
  let status = "";
  for (let i = 0; i < 50 && (status = ((await (await get(a.cookie, key)).json()) as { status: string }).status) === "running"; i++) await new Promise((r) => setTimeout(r, 40));
  assert.equal(status, "done");
  const theirs = (await (await get(b.cookie, key)).json()) as { status: string; answer?: unknown };
  assert.equal(theirs.status, "missing");
  assert.equal(theirs.answer, undefined);
  assert.equal((await get(a.cookie, "bad key!")).status, 400);
});

/* ── the browser's reconnect loop ── */

test("client: polls until done (network blips retried), returns missing on 404, stops when aborted", async () => {
  const seq: (Response | Error)[] = [Response.json({ status: "running" }), new Error("offline"), Response.json({ status: "running" }), Response.json({ status: "done", answer: { id: "a1" }, headless: true })];
  const fetchImpl = (async () => { const next = seq.shift()!; if (next instanceof Error) throw next; return next; }) as unknown as typeof fetch;
  const got = await pollTurn("k".repeat(32), new AbortController().signal, { fetchImpl, delays: [1] });
  assert.equal(got.status, "done");
  assert.equal(got.headless, true);
  const missing = await pollTurn("k".repeat(32), new AbortController().signal, { fetchImpl: (async () => new Response("", { status: 404 })) as unknown as typeof fetch, delays: [1] });
  assert.equal(missing.status, "missing");
  let t = 0;
  const slow = await pollTurn("k".repeat(32), new AbortController().signal, { fetchImpl: (async () => Response.json({ status: "running" })) as unknown as typeof fetch, delays: [1], now: () => (t += 1000), deadlineMs: 5000 });
  assert.equal(slow.status, "running", "gives up at the deadline with the last real state");
  const ctl = new AbortController();
  const p = pollTurn("k".repeat(32), ctl.signal, { fetchImpl: (async () => Response.json({ status: "running" })) as unknown as typeof fetch, delays: [50] });
  ctl.abort();
  await assert.rejects(p);
});
