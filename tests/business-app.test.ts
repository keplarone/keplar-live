import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { businessHost, businessMoved, proxy } from "@/proxy";
import { isBusinessHost, safeBusinessNext } from "@/lib/business-site";
import { cookieValue, newNonce, nonceHash, signTicket, TICKET_TTL_SECONDS, verifyTicket } from "@/lib/business/handoff";

const SECRET = "test-secret-for-handoff-0123456789abcdef";
const who = { userId: "u_1", email: "pat@example.com", name: "Pat" };

test("handoff: a ticket signs in only the browser holding the matching nonce, within the minute", () => {
  const nonce = newNonce();
  const t = signTicket(SECRET, who, nonceHash(nonce));
  assert.deepEqual(verifyTicket(SECRET, t, nonce), { ok: true, user: who });
  assert.deepEqual(verifyTicket(SECRET, t, newNonce()), { ok: false, reason: "wrong_browser" }, "a leaked ticket is useless elsewhere");
  assert.deepEqual(verifyTicket(SECRET, t, null), { ok: false, reason: "wrong_browser" });
  assert.deepEqual(verifyTicket(SECRET, t, nonce, Date.now() + (TICKET_TTL_SECONDS + 5) * 1000), { ok: false, reason: "expired" });
  assert.deepEqual(verifyTicket("other-secret", t, nonce), { ok: false, reason: "invalid" });
  const [payload, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), e: "boss@example.com" })).toString("base64url");
  assert.deepEqual(verifyTicket(SECRET, `${forged}.${sig}`, nonce), { ok: false, reason: "invalid" }, "the email can't be swapped");
  for (const bad of [undefined, "", "x", "a.b.c", `${payload}.`, 42]) assert.equal(verifyTicket(SECRET, bad, nonce).ok, false);
});

test("handoff: cookie parsing and safe next paths (no open redirect, no internal /biz or /api)", () => {
  assert.equal(cookieValue(new Headers({ cookie: "a=1; kb_handoff=abc%3D; b=2" }), "kb_handoff"), "abc=");
  assert.equal(cookieValue(new Headers({ cookie: "a=1" }), "kb_handoff"), null);
  assert.equal(safeBusinessNext("/work?tab=projects"), "/work?tab=projects");
  assert.equal(safeBusinessNext("/account"), "/account");
  for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test", "work", "/biz/work", "/api/auth/x", null, "/x\u0000y"]) assert.equal(safeBusinessNext(bad), "/work", String(bad));
});

test("hosts: business.keplar.one and business.localhost are the Business app; keplar.one is not", () => {
  assert.ok(isBusinessHost("business.keplar.one"));
  assert.ok(isBusinessHost("business.localhost"));
  assert.ok(!isBusinessHost("keplar.one"));
  assert.ok(!isBusinessHost("business.keplar.one.evil.test"));
});

const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(url, init);

test("business host: public paths map onto /biz, the internal prefix is never a second URL, /api is left to the API guard", () => {
  const rewritten = (p: string) => businessHost(req(`https://business.keplar.one${p}`))?.headers.get("x-middleware-rewrite");
  assert.equal(new URL(rewritten("/")!).pathname, "/biz");
  assert.equal(new URL(rewritten("/work")!).pathname, "/biz/work");
  assert.equal(new URL(rewritten("/account?tier=growth")!).search, "?tier=growth");
  assert.equal(new URL(rewritten("/signin")!).pathname, "/biz/signin");
  const redirect = (p: string) => businessHost(req(`https://business.keplar.one${p}`))?.headers.get("location");
  assert.equal(redirect("/biz/work"), "https://business.keplar.one/work");
  assert.equal(redirect("/business-landing"), "https://business.keplar.one/");
  assert.equal(businessHost(req("https://business.keplar.one/api/business/account")), null);
});

test("keplar.one: the old Business URLs move to the Business app; Keplar One paths are untouched", () => {
  const loc = (p: string) => businessMoved(req(`https://keplar.one${p}`))?.headers.get("location") ?? null;
  assert.match(loc("/app/work")!, /\/work$/);
  assert.match(loc("/business-account?tier=scale&cycle=annual")!, /\/account\?tier=scale&cycle=annual$/);
  assert.match(loc("/biz/work")!, /\/work$/, "internal routes are not served on keplar.one");
  for (const p of ["/app", "/app/ask", "/account", "/signin", "/pricing", "/workshop"]) assert.equal(loc(p), null, p);
});

test("business host /api gets the same guard as keplar.one: a cross-site POST is refused", async () => {
  const r = await proxy(req("https://business.keplar.one/api/business/account", { method: "POST", headers: { host: "business.keplar.one", origin: "https://evil.test" } }));
  assert.equal(r.status, 403);
  const ok = await proxy(req("https://business.keplar.one/api/business/account", { method: "POST", headers: { host: "business.keplar.one", origin: "https://business.keplar.one" } }));
  assert.notEqual(ok.status, 403);
  assert.ok(ok.headers.get("x-request-id"), "it went through the API pipeline");
});
