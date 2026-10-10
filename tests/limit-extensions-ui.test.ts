import { test } from "node:test";
import assert from "node:assert/strict";
import { extensionNote, usageMeter } from "../src/lib/usage/meter";
import { initialState, reducer } from "../src/components/app-ui/state/store";
import { streamKeplar } from "../src/components/app-ui/state/stream";
import type { Ledger, KeplarMessage } from "../src/components/app-ui/state/types";

const base: Omit<Ledger, "synced"> = { used: 5_990, total: 6_000, plan: "plus", resetsAt: null, paused: false, signedIn: true, windows: null, daily: null };

test("extension line: shown for paid accounts with credits, never for Free, admin, none or expired-to-zero", () => {
  const ext = { balance: 1500, expiresAt: "2026-12-31T12:00:00.000Z" };
  assert.match(extensionNote({ plan: "plus", extension: ext })!, /^\+1,500 extra credits · until (Dec 31|Dec 30)$/);
  assert.equal(extensionNote({ plan: "plus", extension: { balance: 0, expiresAt: null } }), null);
  assert.equal(extensionNote({ plan: "plus", extension: null }), null);
  assert.equal(extensionNote({ plan: "free", extension: ext }), null, "Free uses free models: nothing to show");
  assert.equal(extensionNote({ plan: "pro", admin: true, extension: ext }), null);
  assert.equal(extensionNote({ plan: "lite", extension: { balance: 40, expiresAt: null } }), "+40 extra credits");
});

test("the plan's percentage is not inflated by extension credits", () => {
  const m = usageMeter({ ...base, synced: true, extension: { balance: 4000, expiresAt: null } });
  assert.deepEqual(m, { kind: "credits", left: 10, total: 6_000, pct: 1 });
});

test("reducer: the ledger keeps the extension; a Free daily limit sets today's count to 0 left and shows the limit card data", () => {
  let st = reducer(initialState(), { type: "ledger", ledger: { ...base, extension: { balance: 300, expiresAt: null } } });
  assert.equal(st.ledger.extension!.balance, 300);
  const free: Omit<Ledger, "synced"> = { ...base, plan: "free", total: null, used: 0, daily: { used: 49, limit: 50, left: 1, resetsAt: "2026-10-05T00:00:00.000Z" } };
  st = reducer(initialState(), { type: "ledger", ledger: free });
  const keplar = { id: "k", role: "keplar", status: "running", stages: [], capabilities: [], models: [], draft: "", startedAt: 1 } as unknown as KeplarMessage;
  st = reducer(st, { type: "send", threadId: st.activeThreadId ?? "t", user: { id: "u", role: "user", text: "hi", createdAt: 1 } as never, keplar });
  const tid = st.threads[0].id;
  st = reducer(st, { type: "event", threadId: tid, keplarId: "k", event: { type: "limit", required: 0, remaining: 0, daily: { limit: 50, resetsAt: "2026-10-05T00:00:00.000Z" } } });
  const m = st.threads[0].messages.find((x) => x.id === "k") as KeplarMessage;
  assert.equal(m.status, "limit");
  assert.deepEqual(m.limit!.daily, { limit: 50, resetsAt: "2026-10-05T00:00:00.000Z" });
  assert.equal(st.ledger.daily!.left, 0);
  assert.equal(usageMeter(st.ledger).kind === "daily" && (usageMeter(st.ledger) as { pct: number }).pct, 0);
});

test("stream: the server's Free daily 429 becomes a limit event (not a generic error)", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: "x", code: "daily_limit", daily: { limit: 50, resetsAt: "2026-10-05T00:00:00.000Z" } }), { status: 429, headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    const events = [];
    for await (const e of streamKeplar({ prompt: "hi" } as never, new AbortController().signal)) events.push(e);
    assert.deepEqual(events, [{ type: "limit", required: 0, remaining: 0, daily: { limit: 50, resetsAt: "2026-10-05T00:00:00.000Z" } }]);
  } finally {
    globalThis.fetch = realFetch;
  }
});
