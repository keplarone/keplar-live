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
  for (const p of ["/space-studio", "/space-studio/app", "/api/space-studio/me", "/_next/static/x.js", "/favicon.ico"]) assert.equal(rewriteOf(await space(p)), null, p);
  const r = await space("/pricing?x=1");
  assert.equal(r.status, 308);
  assert.equal(r.headers.get("location"), "https://keplar.one/pricing?x=1");
});
