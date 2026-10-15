import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { isAppHost } from "@/lib/domains/routing";
import { SPACE_HOST } from "@/lib/site";

const nreq = (host: string, path: string) => new NextRequest(`https://${host}${path}`, { headers: { host } });
const space = (path: string) => proxy(nreq(SPACE_HOST, path));
const rewriteOf = (r: Response) => r.headers.get("x-middleware-rewrite");

test("space.keplar.one is an app host and serves Space Studio at the root", async () => {
  assert.equal(isAppHost(SPACE_HOST), true);
  assert.equal(rewriteOf(await space("/")), `https://${SPACE_HOST}/space-studio`);
  assert.equal(rewriteOf(await space("/app?linked=roblox")), `https://${SPACE_HOST}/space-studio/app?linked=roblox`);
});

test("space.keplar.one passes Space Studio pages, API and assets through, and sends anything else to keplar.one", async () => {
  for (const p of ["/space-studio", "/space-studio/app", "/api/space-studio/me", "/_next/static/x.js", "/robots.txt"]) assert.equal(rewriteOf(await space(p)), null, p);
  const r = await space("/pricing?x=1");
  assert.equal(r.status, 308);
  assert.equal(r.headers.get("location"), "https://keplar.one/pricing?x=1");
});

test("space.keplar.one serves the Space Studio favicon", async () => {
  assert.equal(rewriteOf(await space("/favicon.ico")), `https://${SPACE_HOST}/icons/space-studio-favicon.ico`);
});

test("/api on space.keplar.one and docs.keplar.one gets the same edge guard as keplar.one (cross-site writes refused)", async () => {
  const { DOCS_HOST } = await import("@/lib/site");
  for (const host of [SPACE_HOST, DOCS_HOST]) {
    const evil = new NextRequest(`https://${host}/api/space-studio/profile`, { method: "POST", headers: { host, origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
    const r = await proxy(evil);
    assert.equal(r.status, 403, host);
    // Same-origin reads still pass through.
    const ok = await proxy(nreq(host, "/api/space-studio/me"));
    assert.notEqual(ok.status, 403, host);
  }
});

test("every Keplar app host gets Keplar's own security headers (CSP, frame and HSTS rules in next.config.ts)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("next.config.ts", "utf8");
  const own = new RegExp(`^${JSON.parse(`"${src.match(/const OWN_HOSTS = "([^"]+)"/)![1]}"`)}$`);
  const { DOCS_HOST, BUSINESS_HOST, PRODUCTION_HOST } = await import("@/lib/site");
  for (const h of [PRODUCTION_HOST, `www.${PRODUCTION_HOST}`, DOCS_HOST, SPACE_HOST, BUSINESS_HOST]) {
    assert.equal(isAppHost(h), true, h);
    assert.ok(own.test(h), `${h} is an app host but not in OWN_HOSTS`);
  }
});
