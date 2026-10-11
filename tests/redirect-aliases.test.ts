import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import nextConfig from "../next.config";

test("common account URLs redirect to the real pages (/login answered 404 on the live site)", async () => {
  const rules = (await nextConfig.redirects!()) as { source: string; destination: string; permanent?: boolean; has?: unknown }[];
  const to = (source: string) => rules.find((r) => r.source === source && !r.has)?.destination;
  for (const s of ["/login", "/log-in", "/sign-in"]) assert.equal(to(s), "/signin", s);
  for (const s of ["/register", "/sign-up", "/join"]) assert.equal(to(s), "/signup", s);
  // The aliases must not shadow a real page, and the targets must exist.
  for (const s of ["login", "log-in", "sign-in", "register", "sign-up", "join"]) {
    assert.ok(!existsSync(`src/app/${s}`) && !existsSync(`src/app/(marketing)/${s}`), `${s} is a real route`);
  }
  assert.ok(existsSync("src/app/(marketing)/signin") && existsSync("src/app/(marketing)/signup"));
});
