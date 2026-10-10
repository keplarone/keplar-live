/**
 * Keplar Core before/after eval on the free roster (OpenRouter :free models, $0). Same benchmark items and automated scorers
 * as the scheduled pipeline (src/lib/core/bench.ts).
 *   before   = the Ask pipeline as it was (panel → compare → verify → synthesize), no Core
 *   after    = Core at Thorough (plan → solve with checks → review/revise), on the same free models
 * Needs OPENROUTER_API_KEY. Caps requests with the shared free-pool governor (FREE_POOL_DAILY_LIMIT below).
 * Usage: npx tsx scripts/core-eval.mts [--items r3,m2,...] [--arms baseline,thorough,auto] [--cap 340] [--out docs/core-eval-results.json]
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : (process.argv[i + 1] ?? d); };
if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not set");
process.env.KEPLAR_LIVE_MODELS = "1";
process.env.KEPLAR_DATA_DIR ??= mkdtempSync(path.join(tmpdir(), "core-eval-"));
process.env.FREE_POOL_DAILY_LIMIT = arg("cap", "340");
process.env.FREE_POOL_RPM ??= "20";
for (const k of ["DATABASE_URL", "OPENAI_API_KEY", "NVIDIA_API_KEY"]) delete process.env[k];

const { BENCH, summarize } = await import("../src/lib/core/bench");
const { baselineArm, coreArm, runArm } = await import("../src/lib/core/selfdev/evals");
const { engineDeps } = await import("../src/lib/orchestration/orchestrator");

const ids = arg("items", "r3,r5,m2,m5,c2,c4,f2,f5,l1,l2,s2,s5").split(",");
const items = BENCH.filter((b) => ids.includes(b.id));
const arms = arg("arms", "baseline,thorough").split(",");
const deps = () => { const d = engineDeps({ keyTier: "free" }); if (!d) throw new Error("live deps unavailable"); return d; };

const out: Record<string, unknown> = { at: new Date().toISOString(), items: items.map((i) => i.id), arms: {} };
for (const a of arms) {
  const inner = a === "baseline" ? baselineArm(deps) : coreArm(deps, a as "thorough" | "auto" | "exhaustive");
  // Free models allow ~20 requests a minute: pause between items so the pool refills, and retry once if the pool refused outright.
  const gap = Number(arg("gap", a === "baseline" ? "15000" : "50000"));
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const arm: typeof inner = async (item) => {
    await sleep(gap);
    let r = await inner(item);
    if (!r.answer.trim() || r.ms < 800) { console.log(`  ${item.id}: pool refused (${r.ms} ms), retrying after a pause`); await sleep(60_000); r = await inner(item); }
    return r;
  };
  console.log(`\n== ${a} (${items.length} items)`);
  const t = Date.now();
  const rs = await runArm(items, arm, { concurrency: 1, onItem: (r) => console.log(`${r.id.padEnd(4)} ${r.category.padEnd(13)} ${r.score.toFixed(2)}  ${(r.ms / 1000).toFixed(1)}s  ~${r.calls} calls  ${r.note}${r.ran ? `  [${r.ran}]` : ""}`) });
  const s = summarize(rs);
  const ms = rs.map((r) => r.ms).sort((x, y) => x - y);
  (out.arms as Record<string, unknown>)[a] = { ...s, results: rs, p50Ms: ms[Math.floor(ms.length / 2)], meanCalls: rs.reduce((x, r) => x + (r.calls ?? 0), 0) / rs.length, wallMs: Date.now() - t };
  console.log(`overall ${s.overall.toFixed(3)} · ${JSON.stringify(s.byCategory)}`);
}
const file = arg("out", "docs/core-eval-results.json");
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`\nwrote ${file}`);
