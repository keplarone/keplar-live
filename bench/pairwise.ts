/**
 * Blind pairwise evaluation runner: Keplar (the real product pipeline, runCore) against one baseline model, judged in both orders by a
 * model from a third family. Protocol and statistics: bench/lib/pairwise.ts; how to run and read it: bench/pairwise/README.md.
 *
 *   npx tsx bench/pairwise.ts                       # mock (default): offline, $0, synthetic; exercises the harness only
 *   npx tsx bench/pairwise.ts --split dev           # the 30% dev split (prompt/judge tuning); default is the held-out test split
 *   OPENROUTER_API_KEY=... KEPLAR_LIVE_MODELS=1 npx tsx bench/pairwise.ts --live --max-usd 40 --baseline claude-sonnet-5 --judge glm-5.3
 *
 * A live run needs --live, OPENROUTER_API_KEY and a hard --max-usd. Every call reserves its worst case first (SpendGuard); a call that
 * would cross the cap is never sent, and the run stops with a partial report marked ABORTED.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { catalogById } from "@/lib/orchestration/catalog";
import { checkAnswer, contextFor, judgePair, loadTasks, reportMarkdown, splitTasks, summarize, type PairRow, type PairTask, type Split } from "./lib/pairwise";
import { CapExceededError, SpendGuard } from "./lib/spend";
import { OpenRouterBenchProvider } from "./lib/providers";
import { seeded } from "./lib/rng";
import type { Item } from "./lib/types";

const VERSION = "tasks.v1";
const SEED = 20261019;
const KEPLAR_REQUEST_CAP_USD = 1.5; // Pro's per-request cap: the worst case reserved before each Keplar answer
const BASELINE_SYSTEM = "You are a helpful assistant. Answer the user's request well: accurate, complete and clear.";

type Args = { live: boolean; maxUsd: number | null; split: Split | "all"; baseline: string; judge: string; out: string; yes: boolean; limit: number | null };

function args(argv: string[]): Args {
  const get = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const split = (get("--split") ?? "test") as Args["split"];
  if (!["dev", "test", "all"].includes(split)) throw new Error("--split must be dev, test or all");
  return {
    live: argv.includes("--live"),
    maxUsd: get("--max-usd") ? Number(get("--max-usd")) : null,
    split,
    baseline: get("--baseline") ?? "claude-sonnet-5",
    judge: get("--judge") ?? "glm-5.3",
    out: get("--out") ?? "bench/out/pairwise",
    yes: argv.includes("--yes"),
    limit: get("--limit") ? Number(get("--limit")) : null,
  };
}

/** The judge must not share a family with the baseline or with any model Keplar may route to for this run's plan. */
export function judgeAllowed(judge: string, baseline: string): string | null {
  const j = catalogById.get(judge);
  const b = catalogById.get(baseline);
  if (!j) return `Unknown judge model ${judge}`;
  if (!b) return `Unknown baseline model ${baseline}`;
  if (j.family === b.family) return `The judge (${j.family}) is the same family as the baseline: pick another judge.`;
  return null;
}

type Answer = { text: string; ok: boolean; latencyMs: number; usd: number };

/** Mock arms: synthetic answers whose quality is seeded per task, so the harness and the statistics can be exercised offline. */
function mockAnswer(arm: "keplar" | "baseline", t: PairTask): Answer {
  const r = seeded("pairwise-mock", arm, t.id)();
  const good = t.checks ? `${t.checks.all?.join(" ") ?? ""} ${t.checks.number ?? ""}`.trim() : "";
  return { text: `${r > 0.5 ? `A careful answer. ${good}` : "A short answer."} (mock ${arm})`, ok: true, latencyMs: Math.round(800 + r * 4000), usd: 0 };
}
const mockJudge = async (_system: string, prompt: string) => {
  const careful1 = /<response_1>\nA careful/.test(prompt);
  const careful2 = /<response_2>\nA careful/.test(prompt);
  return JSON.stringify({ winner: careful1 === careful2 ? "tie" : careful1 ? "1" : "2", reason: "mock" });
};

const dummyItem = (t: PairTask): Item => ({ dataset: "fresh", id: t.id, question: t.prompt, answer: "", answerType: "exact", stratum: t.category, hasImage: false, noReveal: false, synthetic: false, meta: {} } as Item);

async function main() {
  const a = args(process.argv.slice(2));
  const all = loadTasks(readFileSync("bench/pairwise/tasks.v1.jsonl", "utf8"));
  const splits = splitTasks(all);
  let tasks = a.split === "all" ? all : all.filter((t) => splits.get(t.id) === a.split);
  if (a.limit) tasks = tasks.slice(0, a.limit);
  const at = new Date().toISOString().slice(0, 10);

  let keplarAnswer: (t: PairTask) => Promise<Answer> = async (t) => mockAnswer("keplar", t);
  let baselineAnswer: (t: PairTask) => Promise<Answer> = async (t) => mockAnswer("baseline", t);
  let judge = mockJudge;
  let judgeSpent = 0;
  let guard: SpendGuard | null = null;

  if (a.live) {
    const key = process.env.OPENROUTER_API_KEY ?? "";
    if (!key) throw new Error("--live needs OPENROUTER_API_KEY");
    if (!(a.maxUsd && a.maxUsd > 0)) throw new Error("--live needs a hard --max-usd cap");
    const bad = judgeAllowed(a.judge, a.baseline);
    if (bad) throw new Error(bad);
    const worst = tasks.length * (KEPLAR_REQUEST_CAP_USD + 0.1 + 0.06);
    console.log(`Worst case for ${tasks.length} tasks: about $${worst.toFixed(2)} (cap $${a.maxUsd.toFixed(2)}).`);
    if (!a.yes) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const ok = (await rl.question('This calls paid APIs. Type "yes" to continue: ')).trim().toLowerCase() === "yes";
      rl.close();
      if (!ok) { console.log("Not confirmed. Nothing was run."); return; }
    }
    guard = new SpendGuard(a.maxUsd, at);
    const g = guard;
    const provider = new OpenRouterBenchProvider(key, g, at);
    const { engineDeps } = await import("@/lib/orchestration/orchestrator");
    const { runCore } = await import("@/lib/core/run");
    const { USD_PER_UNIT } = await import("@/lib/orchestration/compute");
    const deps = engineDeps();
    if (!deps) throw new Error("The product pipeline is not live: set KEPLAR_LIVE_MODELS=1 and OPENROUTER_API_KEY.");
    keplarAnswer = async (t) => {
      const release = g.reserve(KEPLAR_REQUEST_CAP_USD, `keplar ${t.id}`);
      const t0 = Date.now();
      try {
        let text = "";
        let units = 0;
        const memory = contextFor(t.context);
        for await (const e of runCore({ prompt: t.prompt, plan: "pro", routing: { depth: "auto" } as never, computeRemaining: 1e7, limits: { maxRequestUsd: KEPLAR_REQUEST_CAP_USD, maxDeepResearchUsd: 5 }, ...(memory ? { memory: `${memory}The question:\n` } : {}) }, { ...deps, run: { started: false, settled: false, plannedUnits: 0 } })) {
          if (e.type === "answer") { text = e.answer.markdown; units = e.answer.compute.units; }
        }
        const usd = units * USD_PER_UNIT;
        g.commit(usd);
        return { text, ok: text.trim().length > 0, latencyMs: Date.now() - t0, usd };
      } finally { release(); }
    };
    baselineAnswer = async (t) => {
      const r = await provider.call({ modelId: a.baseline, role: "answer", system: BASELINE_SYSTEM, prompt: contextFor(t.context) + t.prompt, maxTokens: 3000, run: 0, mock: { item: dummyItem(t), run: 0 } });
      return { text: r.text, ok: r.ok && r.text.trim().length > 0, latencyMs: r.latencyMs, usd: r.costUsd };
    };
    judge = async (system, prompt) => {
      const r = await provider.call({ modelId: a.judge, role: "judge", system, prompt, maxTokens: 400, temperature: 0, run: 0, mock: { item: dummyItem({ id: "judge", category: "judge", prompt }), run: 0 } });
      judgeSpent += r.costUsd;
      return r.ok ? r.text : "";
    };
  }

  const rows: PairRow[] = [];
  let aborted: string | null = null;
  for (const t of tasks) {
    try {
      const [k, b] = await Promise.all([keplarAnswer(t), baselineAnswer(t)]);
      const before = judgeSpent;
      const j = k.ok && b.ok ? await judgePair(t, k.text, b.text, judge, SEED) : null;
      rows.push({
        id: t.id, category: t.category, split: splits.get(t.id)!, outcome: j?.outcome ?? null, consistent: j?.consistent ?? null,
        ...(j ? {} : { excluded: !k.ok ? "keplar answer failed" : !b.ok ? "baseline answer failed" : "unreadable verdict" }),
        keplarCheck: k.ok ? checkAnswer(t, k.text) : null, baselineCheck: b.ok ? checkAnswer(t, b.text) : null,
        keplarLatencyMs: k.ok ? k.latencyMs : null, baselineLatencyMs: b.ok ? b.latencyMs : null, keplarUsd: k.usd, baselineUsd: b.usd, judgeUsd: judgeSpent - before,
      });
      console.log(`${t.id.padEnd(4)} ${rows.at(-1)!.outcome ?? `excluded (${rows.at(-1)!.excluded})`}`);
    } catch (e) {
      if (e instanceof CapExceededError) { aborted = e.message; break; }
      throw e;
    }
  }

  const summary = summarize(rows, SEED);
  mkdirSync(a.out, { recursive: true });
  const stamp = `${at}-${a.live ? "live" : "mock"}-${a.split}`;
  writeFileSync(`${a.out}/${stamp}.json`, JSON.stringify({ version: VERSION, mode: a.live ? "live" : "mock", split: a.split, baseline: a.baseline, judge: a.judge, aborted, rows, summary }, null, 2));
  const md = (aborted ? `**RUN ABORTED: ${aborted}**\n\n` : "") + reportMarkdown(summary, { mode: a.live ? "live" : "mock", split: a.split, keplar: "Keplar (Core, Pro, Auto)", baseline: a.baseline, judge: a.judge, date: at, version: VERSION });
  writeFileSync(`${a.out}/${stamp}.md`, md);
  console.log(`\n${md}\nWrote ${a.out}/${stamp}.json and .md${guard ? ` (spent $${guard.spent.toFixed(2)})` : ""}`);
  if (aborted) process.exitCode = 3;
}

if (process.argv[1]?.endsWith("pairwise.ts")) main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
