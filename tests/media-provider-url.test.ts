import { test } from "node:test";
import assert from "node:assert/strict";
import { providerUrl, authFor } from "@/lib/create/media";

test("provider URLs: https only, no embedded credentials", () => {
  assert.equal(providerUrl("https://openrouter.ai/api/v1/videos/x")?.hostname, "openrouter.ai");
  assert.equal(providerUrl("https://cdn.example/v.mp4")?.hostname, "cdn.example");
  assert.equal(providerUrl("http://openrouter.ai/x"), null);
  assert.equal(providerUrl("https://user:pass@evil.test/x"), null);
  assert.equal(providerUrl("javascript:alert(1)"), null);
  assert.equal(providerUrl(""), null);
});

test("OpenRouter bearer key only goes to openrouter.ai", () => {
  const h = { authorization: "Bearer secret", "content-type": "application/json" };
  assert.equal(authFor(new URL("https://openrouter.ai/poll"), h).authorization, "Bearer secret");
  assert.deepEqual(authFor(new URL("https://cdn.example/v.mp4"), h), {});
});
