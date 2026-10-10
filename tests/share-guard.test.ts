import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { isShareViewPath, shareViewLimited } from "@/lib/growth/share-guard";

test("share view guard: only single shared answers are limited, not the index or other pages", () => {
  for (const p of ["/r/abc", "/r/abc/", "/answers/some-question-abc123", "/answers/some-question-abc123/og", "/r/abc/og"]) assert.equal(isShareViewPath(p), true, p);
  for (const p of ["/answers", "/answers/", "/", "/app", "/api/share", "/r", "/r/", "/answers/a/b/c", "/pricing"]) assert.equal(isShareViewPath(p), false, p);
});

test("share view guard: the Nth+1 view from one address in a minute is a 429 with Retry-After and noindex; another address is untouched", async () => {
  const req = (ip: string) => new Request("http://localhost/r/x", { headers: { "x-forwarded-for": ip } });
  for (let i = 0; i < 5; i++) assert.equal(await shareViewLimited(req("203.0.113.9"), "/r/x", 5), null);
  const res = await shareViewLimited(req("203.0.113.9"), "/r/x", 5);
  assert.ok(res);
  assert.equal(res!.status, 429);
  assert.ok(Number(res!.headers.get("retry-after")) >= 1);
  assert.match(res!.headers.get("x-robots-tag") ?? "", /noindex/);
  assert.equal(await shareViewLimited(req("203.0.113.10"), "/r/x", 5), null);
  assert.equal(await shareViewLimited(req("203.0.113.9"), "/pricing", 5), null, "other paths are never limited by this guard");
});
