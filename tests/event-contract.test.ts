import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { EVENT_PROTOCOL, PROTOCOL_HEADER, sequencer, stamper, validEvent } from "@/lib/orchestration/event-contract";
import { streamKeplar, StreamNetworkError } from "@/components/app-ui/state/stream";
import { POST as keplarPOST } from "@/app/api/keplar/route";
import type { KeplarEvent } from "@/lib/orchestration/types";

const answer = { id: "a1", markdown: "Hello.", compute: { units: 0 } };

test("validation: known, well-formed events pass; unknown types, missing fields and newer protocols are rejected", () => {
  assert.ok(validEvent({ type: "delta", text: "hi" }));
  assert.ok(validEvent({ type: "answer", answer }));
  assert.ok(validEvent({ type: "stage", stage: "compare", status: "done", v: 1, seq: 4 }));
  assert.equal(validEvent({ type: "delta" }), null, "missing text");
  assert.equal(validEvent({ type: "answer", answer: { id: "a1" } }), null, "an answer without text or compute");
  assert.equal(validEvent({ type: "teleport", to: "mars" }), null, "unknown type");
  assert.equal(validEvent({ type: "delta", text: "x", v: EVENT_PROTOCOL + 1 }), null, "from a newer protocol");
  assert.equal(validEvent("delta"), null);
  assert.equal(validEvent(null), null);
});

test("ordering: duplicates and stale events dropped; events without seq (older server) accepted in arrival order", () => {
  const ok = sequencer();
  assert.equal(ok({ type: "delta", text: "a", seq: 1 } as KeplarEvent & { seq: number }), true);
  assert.equal(ok({ type: "delta", text: "b", seq: 2 } as KeplarEvent & { seq: number }), true);
  assert.equal(ok({ type: "delta", text: "b", seq: 2 } as KeplarEvent & { seq: number }), false, "duplicate");
  assert.equal(ok({ type: "delta", text: "a", seq: 1 } as KeplarEvent & { seq: number }), false, "stale");
  assert.equal(ok({ type: "delta", text: "c" }), true, "no seq: accepted");
  const s = stamper();
  assert.deepEqual([s({ type: "smalltalk" }).seq, s({ type: "smalltalk" }).seq], [1, 2]);
});

test("browser reader: a malformed line no longer kills the answer; unknown and duplicate events are skipped", async () => {
  const lines = [
    { type: "stage", stage: "understand", status: "active", v: 1, seq: 1 },
    "{this is not json",
    { type: "teleport", v: 1, seq: 2 },
    { type: "delta", text: "Hel", v: 1, seq: 3 },
    { type: "delta", text: "Hel", v: 1, seq: 3 },
    { type: "answer", answer, v: 1, seq: 4 },
    { type: "memory", enabled: true, saved: 0, v: 1, seq: 5 },
  ].map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n") + "\n";
  const realFetch = globalThis.fetch;
  const realWarn = console.warn;
  const warned: string[] = [];
  console.warn = (m: string) => { warned.push(String(m)); };
  globalThis.fetch = (async () => new Response(lines, { status: 200, headers: { "content-type": "application/x-ndjson" } })) as typeof fetch;
  try {
    const got: string[] = [];
    for await (const e of streamKeplar({ prompt: "hi", history: [] } as never, new AbortController().signal)) got.push(e.type);
    assert.deepEqual(got, ["stage", "delta", "answer", "memory"]);
    assert.ok(warned.some((w) => w.includes("skipped 2")), warned.join("|"));
  } finally {
    globalThis.fetch = realFetch;
    console.warn = realWarn;
  }
});

test("browser reader: a stream with no answer still reports the drop (validation doesn't hide real failures)", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ type: "delta", text: "partial", v: 1, seq: 1 }) + "\n", { status: 200 })) as typeof fetch;
  try {
    await assert.rejects(async () => { for await (const _ of streamKeplar({ prompt: "hi", history: [] } as never, new AbortController().signal)) void _; }, (e: unknown) => e instanceof StreamNetworkError);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("route: every event is stamped v1 with a strictly increasing seq, and the response declares the protocol", async () => {
  const res = await keplarPOST(new Request("https://keplar.one/api/keplar", { method: "POST", headers: { "content-type": "application/json", origin: "https://keplar.one", "x-forwarded-for": "10.44.1.1" }, body: JSON.stringify({ prompt: "who made you?", history: [] }) }));
  assert.equal(res.headers.get(PROTOCOL_HEADER), String(EVENT_PROTOCOL));
  const events = (await res.text()).trim().split("\n").map((l) => JSON.parse(l) as KeplarEvent & { v: number; seq: number });
  assert.ok(events.length >= 2);
  events.forEach((e, i) => {
    assert.equal(e.v, 1);
    assert.equal(e.seq, i + 1);
    assert.ok(validEvent(e), `${e.type} matches the contract`);
  });
});
