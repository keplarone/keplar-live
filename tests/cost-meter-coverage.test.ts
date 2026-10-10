/**
 * Lint: no model-provider call may bypass the cost meter. The meter wraps global fetch (src/lib/cost/meter.ts, installed from
 * src/instrumentation.ts) and matches METERED_HOSTS, so the rules are:
 *   1. every AI-provider host referenced in src/ is in METERED_HOSTS;
 *   2. no file that talks to a provider uses a non-fetch HTTP client (node:http(s), undici, axios, got) or a provider SDK;
 *   3. nothing but the meter touches the saved unmetered fetch;
 *   4. instrumentation installs the meter on the Node runtime.
 */
import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { METERED_HOSTS } from "@/lib/cost/usage";

const ROOT = path.join(process.cwd(), "src");
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}
const files = walk(ROOT).map((p) => ({ p: path.relative(process.cwd(), p), s: readFileSync(p, "utf8") }));

// API hosts of model providers (inference endpoints, not docs/marketing pages). Add new providers here AND to METERED_HOSTS.
const PROVIDER_API = /\b((?:api|integrate\.api|generativelanguage|[a-z0-9-]+\.openai\.azure)\.[a-z0-9.-]*?(?:openrouter\.ai|openai\.com|anthropic\.com|googleapis\.com|x\.ai|nvidia\.com|higgsfield\.ai|together\.xyz|groq\.com|mistral\.ai|deepseek\.com|fireworks\.ai|replicate\.com|elevenlabs\.io|deepgram\.com|assemblyai\.com|cohere\.(?:ai|com)|perplexity\.ai|moonshot\.(?:ai|cn)|z\.ai|cerebras\.ai)|openrouter\.ai\/api|fal\.run|api\.openai\.azure\.com)/g;
const NON_MODEL_GOOGLE = /^(?:www|oauth2|openidconnect|gmail|webrisk|fonts|accounts|storage|people|drive|sheets|docs|calendar)\.googleapis\.com$/;

test("every model-provider API host in src/ is metered", () => {
  const unmetered: string[] = [];
  for (const { p, s } of files) {
    if (p.endsWith(path.join("cost", "usage.ts"))) continue;
    for (const m of s.matchAll(PROVIDER_API)) {
      const host = m[1].replace(/\/api$/, "");
      if (NON_MODEL_GOOGLE.test(host)) continue;
      const ok = host in METERED_HOSTS; // providerOf() matches the exact hostname
      if (!ok) unmetered.push(`${p}: ${host}`);
    }
  }
  assert.deepEqual(unmetered, [], "add these hosts to METERED_HOSTS in src/lib/cost/usage.ts (and their prices)");
});

test("no provider call goes through a non-fetch HTTP client or a provider SDK", () => {
  const metered = Object.keys(METERED_HOSTS);
  const CLIENT = /from\s+["'](?:node:)?(?:https?|http2)["']|from\s+["'](?:undici|axios|got|node-fetch|ky)["']|require\(["'](?:node:)?(?:https?|undici|axios|got|node-fetch)["']\)/;
  const SDK = /from\s+["'](?:openai|@anthropic-ai\/sdk|@google\/genai|@google\/generative-ai|groq-sdk|replicate|@ai-sdk\/[a-z-]+|@openrouter\/[a-z-]+|@mistralai\/[a-z-]+|together-ai|cohere-ai)["']/;
  const bad: string[] = [];
  for (const { p, s } of files) {
    if (SDK.test(s)) bad.push(`${p}: provider SDK import (route it through fetch so the meter sees it)`);
    if (CLIENT.test(s) && metered.some((h) => s.includes(h))) bad.push(`${p}: non-fetch HTTP client in a file that references a provider host`);
  }
  assert.deepEqual(bad, []);
});

test("only the meter uses the saved unmetered fetch", () => {
  const users = files.filter(({ p, s }) => s.includes("__keplarOriginalFetch") && !p.endsWith(path.join("cost", "meter.ts"))).map((f) => f.p);
  assert.deepEqual(users, []);
});

test("instrumentation installs the cost meter on the Node runtime before anything else", () => {
  const s = readFileSync(path.join(ROOT, "instrumentation.ts"), "utf8");
  const reg = s.slice(s.indexOf("export async function register"));
  assert.match(reg, /NEXT_RUNTIME\s*!==\s*"nodejs"/);
  assert.match(reg, /installCostMeter\(\)/);
  assert.ok(reg.indexOf("installCostMeter") < reg.indexOf("KEPLAR_LOCAL_SCHEDULER"), "the meter goes in before the scheduler starts");
});

test("installCostMeter wraps global fetch once and the wrapper meters provider calls", async () => {
  const { installCostMeter, costMeterInstalled } = await import("@/lib/cost/meter");
  const before = globalThis.fetch;
  let seen = 0;
  globalThis.fetch = (async () => (seen++, Response.json({ usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0 } }))) as unknown as typeof fetch;
  try {
    installCostMeter();
    installCostMeter();
    assert.equal(costMeterInstalled(), true);
    const res = await globalThis.fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "qwen/qwen3.8-27b:free" }) });
    assert.equal(res.status, 200);
    assert.equal(seen, 1, "wrapped exactly once");
  } finally {
    globalThis.fetch = before;
    delete (globalThis as { __keplarOriginalFetch?: unknown }).__keplarOriginalFetch;
  }
});
