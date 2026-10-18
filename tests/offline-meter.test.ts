import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { giveBackOne, takeOne } from "../src/lib/usage/meter";
import { StreamNetworkError, streamKeplar } from "../src/components/app-ui/state/stream";
import type { KeplarRequest } from "../src/lib/orchestration/types";

// QA 2026-10-05: sending a question while offline showed "Connection lost. Couldn't reach Keplar." next to "49 of 50 left":
// the count taken on send was only ever put right by the meter sync, and that sync fails offline too.
const req = { prompt: "hi", history: [], attachments: [], modes: { web: false, deepResearch: false, create: false, agent: false } } as unknown as KeplarRequest;

test("Free count: takeOne / giveBackOne round-trip and stay inside 0..limit", () => {
  const d = { used: 0, left: 50, limit: 50, resetsAt: "x" };
  assert.deepEqual(takeOne(d), { used: 1, left: 49, limit: 50, resetsAt: "x" });
  assert.deepEqual(giveBackOne(takeOne(d)), d);
  assert.deepEqual(takeOne({ used: 50, left: 0, limit: 50 }), { used: 50, left: 0, limit: 50 });
  assert.deepEqual(giveBackOne(d), d);
});

test("a request that never got a response is marked unreached; a stream that drops mid-answer is reached", async () => {
  const real = globalThis.fetch;
  try {
    globalThis.fetch = (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch;
    await assert.rejects(async () => { for await (const _ of streamKeplar(req, new AbortController().signal)) void _; }, (e: unknown) => e instanceof StreamNetworkError && e.reached === false);
    globalThis.fetch = (async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"type":"stage","stage":"route","status":"active"}\n')); c.close(); } }), { status: 200 })) as typeof fetch;
    await assert.rejects(async () => { for await (const _ of streamKeplar(req, new AbortController().signal)) void _; }, (e: unknown) => e instanceof StreamNetworkError && e.reached === true);
  } finally {
    globalThis.fetch = real;
  }
});

test("the app gives the count back only when the question never reached Keplar and the meter sync failed", () => {
  const src = readFileSync("src/components/app-ui/KeplarApp.tsx", "utf8");
  assert.match(src, /unreached = !e\.reached/);
  assert.match(src, /syncMeter\(true\)\.then\(\(ok\) => \{[\s\S]{0,200}!ok && took && unreached[\s\S]{0,120}giveBackOne/);
});
