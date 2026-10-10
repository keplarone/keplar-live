import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fingerprint, forwardToSentry, listErrors, normRoute, parseDsn, recordError, resetErrorBudget, routeFromStack, scrub, sentryConfigured, setErrorStatus } from "@/lib/ops/errors";
import { errorResponse } from "@/lib/create/platform/http";
import { onRequestError } from "@/instrumentation";
import { POST as clientErrorPOST } from "@/app/api/client-error/route";

test("scrub removes emails, keys, tokens, long ids and query strings", () => {
  const s = scrub("fail for jane.doe@example.com using sk-or-v1-abcdef1234567890 Bearer abc123def456ghi789 at /x?token=secret&a=1 id 0123456789abcdef0123456789abcdef");
  assert.doesNotMatch(s, /jane|example\.com|sk-or|abc123def|secret|0123456789abcdef/);
  assert.match(s, /\[email\]/);
});

test("routes lose ids; fingerprints ignore numbers so the same bug groups together", () => {
  assert.equal(normRoute("/api/chats/0123456789abcdef/messages?x=1"), "/api/chats/:id/messages");
  assert.equal(fingerprint("server", "TypeError", "cannot read 12", "/a"), fingerprint("server", "TypeError", "cannot read 99", "/a"));
  assert.notEqual(fingerprint("server", "TypeError", "cannot read 12", "/a"), fingerprint("server", "TypeError", "cannot read 12", "/b"));
  assert.equal(routeFromStack("at x (/var/task/.next/server/app/api/chats/[id]/route.js:1:2)"), "/api/chats/[id]");
});

test("the same error groups into one row with a count; new errors get their own; resolved can be reopened by a repeat", async () => {
  resetErrorBudget();
  const msg = `boom ${Math.random().toString(36).slice(2)} for a@b.co`;
  await recordError({ source: "server", name: "RangeError", message: msg, route: "/api/zzz", sample: "req_abc12345" });
  await recordError({ source: "server", name: "RangeError", message: msg, route: "/api/zzz", sample: "req_def67890" });
  const mine = (await listErrors(1)).filter((e) => e.route === "/api/zzz" && e.name === "RangeError");
  assert.equal(mine.length, 1);
  assert.equal(mine[0].count, 2);
  assert.equal(mine[0].sample, "req_def67890");
  assert.doesNotMatch(mine[0].message, /a@b\.co/);
  assert.equal(await setErrorStatus(mine[0].id, "resolved"), true);
  await recordError({ source: "server", name: "RangeError", message: msg, route: "/api/zzz" });
  assert.equal((await listErrors(1)).find((e) => e.id === mine[0].id)?.status, "open");
});

test("an unhandled exception in errorResponse is tracked; known HttpErrors are not", async () => {
  resetErrorBudget();
  const res = errorResponse(new TypeError(`unique-unhandled-${Date.now()}`));
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "Something went wrong.", code: "internal" }, "the person never sees the message");
  await new Promise((r) => setTimeout(r, 100));
  assert.ok((await listErrors(1)).some((e) => /unique-unhandled-/.test(e.message)));
  const { HttpError } = await import("@/lib/create/platform/http");
  const before = (await listErrors(1)).length;
  errorResponse(new HttpError(400, "bad input"));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal((await listErrors(1)).length, before);
});

test("onRequestError (Next hook) records server render/route errors", async () => {
  resetErrorBudget();
  process.env.NEXT_RUNTIME = "nodejs";
  await onRequestError(Object.assign(new Error("render failed 7f3"), { digest: "dg123456" }), { path: "/pricing" }, { routePath: "/pricing" });
  assert.ok((await listErrors(1)).some((e) => e.route === "/pricing" && e.sample === "dg123456"));
});

test("browser error boundary report: same-origin only, scrubbed, rate limited", async () => {
  resetErrorBudget();
  const origin = "http://localhost:3000";
  const mk = (ip: string, o = origin) => new Request(`${origin}/api/client-error`, { method: "POST", headers: { "content-type": "application/json", origin: o, host: "localhost:3000", "x-forwarded-for": ip }, body: JSON.stringify({ name: "ChunkLoadError", message: "Loading chunk 5 failed for u@x.io", digest: "d9", path: "/app" }) });
  assert.equal((await clientErrorPOST(mk("10.5.0.1"))).status, 200);
  assert.equal((await clientErrorPOST(mk("10.5.0.2", "https://evil.example"))).status, 403);
  assert.ok((await listErrors(1)).some((e) => e.source === "client" && e.name === "ChunkLoadError" && !/u@x\.io/.test(e.message)));
  let last = 200;
  for (let i = 0; i < 14; i++) last = (await clientErrorPOST(mk("10.5.0.3"))).status;
  assert.equal(last, 429);
});

test("Sentry: DSN parsing, off without a DSN, and a correctly shaped request to a mock", async () => {
  assert.equal(parseDsn(undefined), null);
  assert.equal(parseDsn("not a dsn"), null);
  assert.deepEqual(parseDsn("https://pubkey123@o1.ingest.sentry.io/4507"), { url: "https://o1.ingest.sentry.io/api/4507/store/", key: "pubkey123" });
  assert.equal(sentryConfigured({}), false);
  assert.equal(await forwardToSentry({ source: "server", name: "E" }, {}), false);
  const realFetch = globalThis.fetch;
  let seen: { url: string; auth: string; body: { exception: { values: { type: string }[] } } } | null = null;
  globalThis.fetch = (async (u: string | URL, init?: RequestInit) => {
    seen = { url: String(u), auth: String((init?.headers as Record<string, string>)["x-sentry-auth"]), body: JSON.parse(String(init?.body)) };
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    assert.equal(await forwardToSentry({ source: "server", name: "TypeError", message: "x", route: "/api/a" }, { SENTRY_DSN: "https://pubkey123@o1.ingest.sentry.io/4507" }), true);
    assert.equal(seen!.url, "https://o1.ingest.sentry.io/api/4507/store/");
    assert.match(seen!.auth, /sentry_key=pubkey123/);
    assert.equal(seen!.body.exception.values[0].type, "TypeError");
  } finally {
    globalThis.fetch = realFetch;
  }
});
