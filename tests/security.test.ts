import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isSameOrigin, isOriginExempt } from "@/lib/security/origin";
import { APP_HEADERS, BASE_HEADERS, CSP } from "@/lib/security/headers";
import { proxy } from "@/proxy";
import { NextRequest } from "next/server";
import { safeCallbackPath } from "@/lib/accounts/magic-token";
import { rateLimit, RateLimitError } from "@/lib/create/platform/ratelimit";
import { POST as keplarPOST } from "@/app/api/keplar/route";
import { POST as whopPOST } from "@/app/api/webhooks/whop/route";
import { planCookieHeader } from "@/lib/billing/plan-cookie";
import { stripe } from "@/lib/billing/stripe";

const req = (method: string, headers: Record<string, string> = {}, url = "https://keplar.one/api/x") => new Request(url, { method, headers });

test("origin check: same-origin passes, cross-site and null origins fail, safe methods always pass", () => {
  assert.equal(isSameOrigin(req("GET", { origin: "https://evil.test" })), true);
  assert.equal(isSameOrigin(req("POST", { origin: "https://keplar.one" })), true);
  assert.equal(isSameOrigin(req("POST", { origin: "https://evil.test" })), false);
  assert.equal(isSameOrigin(req("POST", { origin: "https://keplar.one.evil.test" })), false);
  assert.equal(isSameOrigin(req("POST", { origin: "null" })), false);
  assert.equal(isSameOrigin(req("POST", { origin: "not a url" })), false);
  assert.equal(isSameOrigin(req("POST", { "sec-fetch-site": "cross-site" })), false);
  assert.equal(isSameOrigin(req("POST", { "sec-fetch-site": "same-origin" })), true);
  assert.equal(isSameOrigin(req("DELETE", { origin: "https://evil.test" })), false);
  assert.equal(isSameOrigin(req("POST")), true, "no Origin and no Fetch-Metadata: not a browser, still needs auth");
  assert.equal(isOriginExempt("/api/webhooks/whop"), true);
  assert.equal(isOriginExempt("/api/keplar"), false);
});

test("origin check: X-Forwarded-Host cannot forge a matching Origin (CSRF)", () => {
  // A browser can set X-Forwarded-Host from script; it must not make evil Origin pass.
  assert.equal(
    isSameOrigin(req("POST", { origin: "https://evil.test", "x-forwarded-host": "evil.test", host: "keplar.one" })),
    false,
    "spoofed X-Forwarded-Host must not unlock a cross-site Origin",
  );
  assert.equal(
    isSameOrigin(req("POST", { origin: "https://evil.test", "x-forwarded-host": "evil.test" })),
    false,
    "X-Forwarded-Host alone (no Host) must not unlock a cross-site Origin",
  );
  // Host is a forbidden request header in browsers, so Origin+Host matching is safe for our own hosts
  // (preview deployments where siteUrl is the apex but the request is on *.vercel.app).
  assert.equal(
    isSameOrigin(req("POST", { origin: "https://preview.vercel.app", host: "preview.vercel.app" })),
    true,
    "Origin matching Host on a Keplar preview host is allowed",
  );
  assert.equal(
    isSameOrigin(req("POST", { origin: "https://customer.example.com", host: "customer.example.com" })),
    false,
    "a customer custom domain must not pass the Host fallback",
  );
});

test("proxy: cross-site POST to /api is blocked, same-origin passes, webhooks are exempt", async () => {
  const mk = (path: string, headers: Record<string, string>) => new NextRequest(`https://keplar.one${path}`, { method: "POST", headers });
  const blocked = await proxy(mk("/api/keplar", { origin: "https://evil.test" }));
  assert.equal(blocked.status, 403);
  assert.equal((await blocked.json()).code, "bad_origin");
  const ok = await proxy(mk("/api/keplar", { origin: "https://keplar.one" }));
  assert.notEqual(ok.status, 403);
  const hook = await proxy(mk("/api/webhooks/whop", { origin: "https://evil.test" }));
  assert.notEqual(hook.status, 403, "signed webhooks carry no browser origin");
});

test("security headers: CSP, HSTS, framing, nosniff, referrer, permissions", () => {
  const all = Object.fromEntries([...BASE_HEADERS, ...APP_HEADERS].map((h) => [h.key.toLowerCase(), h.value]));
  assert.match(all["strict-transport-security"], /max-age=\d{8,}; includeSubDomains/);
  assert.equal(all["x-content-type-options"], "nosniff");
  assert.equal(all["x-frame-options"], "DENY");
  assert.equal(all["cross-origin-resource-policy"], "same-origin");
  assert.match(all["referrer-policy"], /strict-origin/);
  assert.match(all["permissions-policy"], /camera=\(\)/);
  assert.match(all["permissions-policy"], /microphone=\(self\)/);
  for (const d of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) assert.ok(CSP.includes(d), d);
  assert.match(CSP, /script-src 'self' 'unsafe-inline'/, "inline theme script");
  assert.match(CSP, /worker-src 'self' blob:/, "three.js");
  const dir = (n: string) => new RegExp(`(?:^|; )${n} ([^;]*)`).exec(CSP)?.[1] ?? "";
  assert.deepEqual(dir("script-src").match(/https?:\/\/\S+/g), ["https://cdn.whop.com", "https://t.whop.tw"], "the only remote script hosts are Whop's CDN and the Whop Pixel");
  assert.match(dir("frame-src"), /https:\/\/cdn\.whop\.com/);
  assert.match(dir("connect-src"), /https:\/\/api\.whop\.com/);
  assert.match(dir("connect-src"), /https:\/\/t\.whop\.tw/, "Whop Pixel beacons");
  assert.match(dir("img-src"), /https:\/\/cdn\.whop\.com/);
  assert.doesNotMatch(dir("img-src") + dir("frame-src"), /t\.whop\.tw/, "the pixel needs no images or frames");
  assert.doesNotMatch(CSP.replace(/https:\/\/(cdn|api)\.whop\.com/g, "").replace(/https:\/\/t\.whop\.tw/g, ""), /https?:/, "no other remote origins anywhere");
  assert.doesNotMatch(dir("style-src") + dir("font-src") + dir("media-src") + dir("default-src"), /whop/, "Whop is not allowed for styles, fonts, media or default");
  assert.doesNotMatch(CSP, /\*/, "no wildcards");
});

test("security.txt is published with contact and expiry", () => {
  const t = readFileSync(path.join(process.cwd(), "public/.well-known/security.txt"), "utf8");
  assert.match(t, /^Contact: mailto:team@keplar\.one$/m);
  const exp = /^Expires: (.+)$/m.exec(t)?.[1];
  assert.ok(exp && Date.parse(exp) > Date.now(), "not expired");
  assert.match(t, /^Canonical: https:\/\/keplar\.one\/\.well-known\/security\.txt$/m);
});

test("open redirect: callback URLs must be same-origin relative paths", () => {
  for (const bad of ["//evil.test", "https://evil.test", "/\\evil.test", "\\evil", "/\t/evil.test", "/%0d%0aSet-Cookie:x", "javascript:alert(1)", "data:text/html,x", "/a\u0000b"]) {
    const out = safeCallbackPath(bad);
    assert.ok(out.startsWith("/") && !out.startsWith("//") && !out.includes("\\"), `${JSON.stringify(bad)} → ${out}`);
    assert.doesNotMatch(out, /evil/);
  }
  assert.equal(safeCallbackPath("/app?x=1"), "/app?x=1");
});

test("rate limiter: allows up to max, then throws with a retry hint", async () => {
  const key = `test:${Math.random()}`;
  for (let i = 0; i < 3; i++) await rateLimit(key, 3, 60);
  await assert.rejects(() => rateLimit(key, 3, 60), (e: unknown) => e instanceof RateLimitError);
  await rateLimit(`${key}:other`, 3, 60);
});

const post = (body: string, headers: Record<string, string> = {}) =>
  keplarPOST(new Request("https://keplar.one/api/keplar", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}`, ...headers }, body }));

test("/api/keplar validates input and never leaks internals", async () => {
  assert.equal((await post("not json")).status, 400);
  assert.equal((await post("[]")).status, 400);
  assert.equal((await post(JSON.stringify({}))).status, 400);
  assert.equal((await post(JSON.stringify({ prompt: "   " }))).status, 400);
  assert.equal((await post(JSON.stringify({ prompt: "x".repeat(16_001) }))).status, 400);
  const big = await post("x", { "content-length": String(50 * 1024 * 1024) });
  assert.equal(big.status, 413);
  const badMedia = await post(JSON.stringify({ prompt: "what is this", media: { images: [{ name: "a.exe", mime: "application/x-msdownload", dataUrl: "data:application/x-msdownload;base64,AAAA" }] } }));
  assert.equal(badMedia.status, 400);
  // Valid request, no models configured: honest 503, no stack trace or env names.
  const nope = await post(JSON.stringify({ prompt: "hello there, please explain tides" }));
  assert.equal(nope.status, 503);
  const j = (await nope.json()) as { error: string; code: string };
  assert.equal(j.code, "not_configured");
  assert.doesNotMatch(j.error, /KEPLAR_|OPENROUTER|key|Error:|at /);
});

test("webhook with no secret configured refuses (never trusts unsigned events)", async () => {
  const r = await whopPOST(new Request("https://keplar.one/api/webhooks/whop", { method: "POST", body: JSON.stringify({ type: "payment.succeeded", data: {} }) }));
  assert.equal(r.status, 503);
});

test("cookies: plan cookie is HttpOnly, SameSite=Lax and Secure on https", () => {
  const c = planCookieHeader("v", 100, true);
  assert.match(c, /HttpOnly/);
  assert.match(c, /SameSite=Lax/);
  assert.match(c, /Secure/);
});

test("Stripe Connect client is off without keys (no fake client)", () => {
  assert.equal(stripe(), null);
});

test("no secrets in client code: NEXT_PUBLIC_ vars are limited to the site URL", () => {
  const src = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
  assert.doesNotMatch(src, /NEXT_PUBLIC_[A-Z_]*(KEY|SECRET|TOKEN)/);
});

test("health reports auth-secret and rate-limit backend without leaking secrets", async () => {
  const { authSecretConfigured, healthSummary } = await import("@/lib/ops/health");
  assert.equal(authSecretConfigured(), false, "tests unset BETTER_AUTH_SECRET");
  const h = await healthSummary();
  assert.equal(h.body.ok, true);
  assert.equal(h.body.security?.authSecret, false);
  assert.ok(["memory", "postgres", "upstash"].includes(h.body.security?.rateLimit ?? ""));
  assert.doesNotMatch(JSON.stringify(h.body), /keplar-dev-only|BETTER_AUTH_SECRET=\w/);
});
