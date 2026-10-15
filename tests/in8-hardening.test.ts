import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { body, HttpError, publicErrorText, readBytes, readFormData, readText } from "@/lib/create/platform/http";

// IN-8 (docs/rebirth/AUDIT.md): bodies were read whole before their size was checked (a chunked body has no Content-Length to
// check first), /api/health/qa-browser launched Chromium for anyone, the code runner's CSP had no sandbox, and some upstream
// error text reached clients. (The inbound-email replay key and the wants file: rule are tested with their features.)

/** A chunked body with no Content-Length that would go on forever: counts how much of it was pulled. */
function endless(chunk = 64 * 1024) {
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(c) { pulled += chunk; c.enqueue(new Uint8Array(chunk).fill(97)); } });
  const req = new Request("https://keplar.one/api/x", { method: "POST", body: stream, duplex: "half" } as RequestInit);
  return { req, pulled: () => pulled };
}

test("capped reads stop at the cap, even without a Content-Length", async () => {
  const e = endless();
  assert.equal(await readText(e.req, 100_000), null);
  assert.ok(e.pulled() < 400_000, `stopped early (${e.pulled()} bytes pulled)`);
  const declared = new Request("https://keplar.one/api/x", { method: "POST", headers: { "content-length": "999999999" }, body: "small" });
  assert.equal(await readBytes(declared, 1000), null, "a declared size over the cap is refused before reading");
  assert.equal(await readText(new Request("https://keplar.one/api/x", { method: "POST", body: "héllo" }), 100), "héllo");
  assert.equal(await readText(new Request("https://keplar.one/api/x", { method: "POST", body: "x".repeat(101) }), 100), null);

  await assert.rejects(body(endless().req, 50_000), (err: unknown) => err instanceof HttpError && err.status === 413);
  assert.deepEqual(await body(new Request("https://keplar.one/api/x", { method: "POST", body: '{"a":1}' })), { a: 1 });

  const form = new Request("https://keplar.one/api/x", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "name=Ann&email=a%40b.co" });
  assert.equal((await readFormData(form, 1000))?.get("email"), "a@b.co");
  const big = new Request("https://keplar.one/api/x", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `m=${"x".repeat(2000)}` });
  assert.equal(await readFormData(big, 1000), null);
});

test("public routes refuse an oversized chunked body (inquiry form, contact form)", async () => {
  const { POST: inquire } = await import("@/app/api/inquire/route");
  const stream = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new TextEncoder().encode('{"x":"' + "a".repeat(60_000))); } });
  const res = await inquire(new Request("https://keplar.one/api/inquire", { method: "POST", headers: { "content-type": "application/json", origin: "https://keplar.one", "x-forwarded-for": "203.0.113.200" }, body: stream, duplex: "half" } as RequestInit));
  assert.equal(res.status, 413);
});

test("/api/health/qa-browser: 404 for anyone but admins and monitoring (no Chromium launch)", async () => {
  const { GET } = await import("@/app/api/health/qa-browser/route");
  const prev = process.env.OPS_CHECK_SECRET;
  process.env.OPS_CHECK_SECRET = "ops-secret-0123456789abcdef";
  try {
    assert.equal((await GET(new Request("https://keplar.one/api/health/qa-browser"))).status, 404);
    assert.equal((await GET(new Request("https://keplar.one/api/health/qa-browser", { headers: { authorization: "Bearer wrong-secret-0123456789" } }))).status, 404);
  } finally {
    if (prev === undefined) delete process.env.OPS_CHECK_SECRET;
    else process.env.OPS_CHECK_SECRET = prev;
  }
});

test("the code runner page is sandboxed by its own CSP", async () => {
  const { GET } = await import("@/app/apps/code-runner/route");
  const csp = GET().headers.get("content-security-policy") ?? "";
  assert.match(csp, /(^|; )sandbox allow-scripts(;|$)/);
});

test("errors caught mid-stream: our own messages pass, upstream text doesn't", () => {
  assert.equal(publicErrorText(new HttpError(402, "Out of credits."), "Failed."), "Out of credits.");
  assert.equal(publicErrorText(new Error('upstream 500: {"error":"org-AbC123 quota exceeded at api.provider.internal"}'), "Failed."), "Failed.");
  assert.equal(publicErrorText("weird", "Failed."), "Failed.");
});
