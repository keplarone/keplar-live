import "./setup";
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { AsyncLocalStorage } from "node:async_hooks";

// REL-4: work started during a request is handed to Next's after(), so Vercel keeps the function alive until it settles.
// A request scope is simulated with Next's own async storages (the ones after() reads); outside one, the work runs at once.
// Next's server runtime provides this global; it must exist before next/server loads (hence the dynamic import below).
(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;
type AfterMod = typeof import("@/lib/create/platform/after");
let keepAlive: AfterMod["keepAlive"];
let afterResponse: AfterMod["afterResponse"];
type Als = { run: <T>(store: unknown, fn: () => T) => T };
let workAsyncStorage: Als;
let workUnitAsyncStorage: Als;
before(async () => {
  ({ keepAlive, afterResponse } = await import("@/lib/create/platform/after"));
  const req = createRequire(__filename);
  ({ workAsyncStorage } = req("next/dist/server/app-render/work-async-storage.external.js"));
  ({ workUnitAsyncStorage } = req("next/dist/server/app-render/work-unit-async-storage.external.js"));
});

function inRequest<T>(fn: () => T) {
  const handed: unknown[] = [];
  const workStore = { afterContext: { after: (t: unknown) => void handed.push(t) } };
  const out = workAsyncStorage.run(workStore, () => workUnitAsyncStorage.run({ type: "request" }, fn));
  return { out, handed };
}

test("in a request: keepAlive hands started work (a promise) and deferred work (a function) to after()", async () => {
  let ran = 0;
  const { handed } = inRequest(() => {
    keepAlive(Promise.resolve().then(() => { ran++; }), "p");
    keepAlive(async () => { ran += 10; }, "fn");
  });
  assert.equal(handed.length, 2);
  assert.ok(handed[0] instanceof Promise, "a running promise is kept alive");
  assert.equal(typeof handed[1], "function", "a deferred task runs after the response");
  assert.equal(ran, 0);
  await handed[0];
  await (handed[1] as () => Promise<void>)();
  assert.equal(ran, 11);
});

test("in a request: afterResponse returns before the work is done; outside one it waits", async () => {
  let done = false;
  const slow = () => new Promise<void>((r) => setTimeout(() => { done = true; r(); }, 30));
  const { out, handed } = inRequest(() => afterResponse(slow(), "slow"));
  await out;
  assert.equal(done, false, "the response is not held back");
  assert.equal(handed.length, 1);
  await handed[0];
  assert.equal(done, true);
  done = false;
  await afterResponse(slow(), "slow");
  assert.equal(done, true, "outside a request the caller sees the result");
});

test("errors in background work are logged, never thrown into the request", async () => {
  const errors: unknown[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => void errors.push(a.join(" "));
  try {
    keepAlive(Promise.reject(new Error("boom")), "label-a");
    keepAlive(async () => { throw new Error("bang"); }, "label-b");
    await afterResponse(Promise.reject(new Error("pow")), "label-c");
    await new Promise((r) => setTimeout(r, 5));
  } finally {
    console.error = orig;
  }
  assert.equal(errors.length, 3);
  assert.ok(errors.some((e) => String(e).includes("label-a failed: boom")));
  assert.ok(errors.some((e) => String(e).includes("label-b failed: bang")));
});

test("in a request: a queued job is stored first and started through after(), not a bare timer", async () => {
  const { defineJob, enqueue, queueJobs } = await import("@/lib/create/platform/queue");
  let ran = 0;
  defineJob("t.after", async () => { ran++; });
  const { out, handed } = inRequest(() => enqueue("t.after", { workspaceId: "w_after" }));
  const jobId = await out;
  assert.equal(handed.length, 1, "the run is handed to after()");
  assert.ok(await queueJobs().get("w_after", jobId!), "stored before the response");
  assert.equal(ran, 0);
  await (handed[0] as () => Promise<void>)();
  assert.equal(ran, 1);
  assert.equal(await queueJobs().get("w_after", jobId!), null, "removed once done");
});
