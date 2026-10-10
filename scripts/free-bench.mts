/**
 * Free-model benchmark: sends a few small prompts to every free model in the registry (same request shape as production:
 * system prompt, reasoning excluded, free provider options) and runs the quality gate on each answer.
 * Needs OPENROUTER_API_KEY. $0 models only. Usage: npx tsx scripts/free-bench.mts [--temp 0.3] [--runs 2]
 */
import { freeRoster } from "../src/lib/orchestration/live-catalog";
import { SYSTEM_PROMPT } from "../src/lib/orchestration/providers/shared";
import { assessOutput } from "../src/lib/orchestration/quality-gate";

const key = process.env.OPENROUTER_API_KEY;
if (!key) throw new Error("OPENROUTER_API_KEY is not set");
const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : (process.argv[i + 1] ?? d); };
const temp = process.argv.includes("--temp") ? Number(arg("temp", "0.3")) : undefined;
const runs = Number(arg("runs", "1"));
const PROMPTS = [
  ["greeting", "hello there"],
  ["math", "What is 17 times 23? Show the steps briefly."],
  ["summary", "Summarize in three sentences: The Industrial Revolution began in Britain in the late 18th century. Machines replaced hand production, factories grew, and cities expanded quickly. It raised living standards over time but also brought crowded housing and harsh working conditions."],
  ["factual", "Who wrote Pride and Prejudice and in what year was it published?"],
] as const;

async function call(slug: string, prompt: string) {
  const t0 = Date.now();
  const body: Record<string, unknown> = { model: slug, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: prompt }], max_tokens: 700, reasoning: { effort: "none", exclude: true }, provider: { data_collection: "allow", allow_fallbacks: true } };
  if (temp !== undefined) body.temperature = temp;
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(45_000) });
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[]; provider?: string; error?: { message?: string } };
    return { ms: Date.now() - t0, status: r.status, text: j.choices?.[0]?.message?.content ?? "", host: j.provider ?? "", err: j.error?.message };
  } catch (e) {
    return { ms: Date.now() - t0, status: 0, text: "", host: "", err: e instanceof Error ? e.name : "error" };
  }
}

const out: Record<string, { ok: number; junk: number; fail: number; ms: number[]; samples: string[] }> = {};
for (const m of freeRoster) {
  const slug = m.routes?.openrouter;
  if (!slug) continue;
  const row = (out[m.id] = { ok: 0, junk: 0, fail: 0, ms: [], samples: [] });
  for (let i = 0; i < runs; i++) {
    for (const [name, prompt] of PROMPTS) {
      const r = await call(slug, prompt);
      if (!r.text.trim()) { row.fail++; row.samples.push(`${name}: FAIL ${r.status} ${r.err ?? ""}`.slice(0, 120)); continue; }
      const v = assessOutput(r.text, { prompt });
      row.ms.push(r.ms);
      if (v.ok) row.ok++;
      else { row.junk++; row.samples.push(`${name}: JUNK(${v.reason}) via ${r.host}: ${r.text.slice(0, 160).replace(/\s+/g, " ")}`); }
    }
  }
  const avg = row.ms.length ? Math.round(row.ms.reduce((a, b) => a + b, 0) / row.ms.length) : 0;
  console.log(`${m.id.padEnd(30)} ok ${row.ok} junk ${row.junk} fail ${row.fail} avg ${avg}ms`);
  for (const s of row.samples) console.log("   ", s);
}
