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

test("space.keplar.one is an app host and sends the old Studio paths to the keplar.one home page", async () => {
  assert.equal(isAppHost(SPACE_HOST), true);
  for (const p of ["/", "/app?linked=1", "/space-studio", "/space-studio/app"]) {
    const r = await space(p);
    assert.equal(r.status, 308, p);
    assert.equal(r.headers.get("location"), `https://keplar.one/${p.includes("?") ? p.slice(p.indexOf("?")) : ""}`, p);
  }
});

test("space.keplar.one passes API and assets through, and sends other pages to the same path on keplar.one", async () => {
  for (const p of ["/api/health", "/_next/static/x.js", "/robots.txt"]) assert.equal(rewriteOf(await space(p)), null, p);
  const r = await space("/pricing?x=1");
  assert.equal(r.status, 308);
  assert.equal(r.headers.get("location"), "https://keplar.one/pricing?x=1");
});

test("/api on space.keplar.one and docs.keplar.one gets the same edge guard as keplar.one (cross-site writes refused)", async () => {
  const { DOCS_HOST } = await import("@/lib/site");
  for (const host of [SPACE_HOST, DOCS_HOST]) {
    const evil = new NextRequest(`https://${host}/api/feedback`, { method: "POST", headers: { host, origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
    const r = await proxy(evil);
    assert.equal(r.status, 403, host);
    // Same-origin reads still pass through.
    const ok = await proxy(nreq(host, "/api/health"));
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
