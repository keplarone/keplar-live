import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { hedged } from "@/lib/orchestration/extractor";
import type { ProviderResult } from "@/lib/orchestration/types";

const ok = (t: string) => ({ ok: true, text: t, modelId: "m", latencyMs: 1, usage: { inputTokens: 1, outputTokens: 1 } }) as unknown as ProviderResult;
const bad = (t: string) => ({ ok: false, reason: "error", message: t, modelId: "m", latencyMs: 1 }) as unknown as ProviderResult;
const later = <T>(ms: number, v: T) => new Promise<T>((r) => setTimeout(() => r(v), ms));

test("hedged: a prompt first answer never starts the second call", async () => {
  let second = 0;
  const r = await hedged(() => later(10, ok("first")), () => { second++; return later(1, ok("second")); }, 60);
  assert.equal((r as { text: string }).text, "first");
  await later(100, 0);
  assert.equal(second, 0);
});

test("hedged: a silent first answer is overtaken by the second, which is then the result", async () => {
  const t0 = Date.now();
  const r = await hedged(() => later(400, ok("slow first")), () => later(10, ok("second")), 40);
  assert.equal((r as { text: string }).text, "second");
  assert.ok(Date.now() - t0 < 300);
});

test("hedged: failed replies fall back to the first failure; aborts reject", async () => {
  const r = await hedged(() => later(10, bad("one")), () => later(10, bad("two")), 5);
  assert.equal(r.ok, false);
  await assert.rejects(hedged(() => Promise.reject(new DOMException("t", "TimeoutError")), () => Promise.reject(new DOMException("t", "TimeoutError")), 5));
});

test("chatBody: reasoningOff disables thinking and wins over an effort", async () => {
  const { chatBody } = await import("@/lib/orchestration/providers/shared");
  const off = chatBody("m", "hi", { reasoningOff: true, reasoningEffort: "high" } as never) as { reasoning?: unknown };
  assert.deepEqual(off.reasoning, { enabled: false });
  const eff = chatBody("m", "hi", { reasoningEffort: "low" } as never) as { reasoning?: unknown };
  assert.deepEqual(eff.reasoning, { effort: "low" });
});
