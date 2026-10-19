/**
 * Benchmark regression check: compares two pairwise result files (bench/pairwise.ts output) and says whether the newer one is a
 * meaningful regression. Used by the weekly benchmark workflow, which opens an issue when it is; nothing changes production routing
 * (a routing change goes through a reviewed pull request).
 *
 *   npx tsx bench/regress.ts <previous.json> <current.json>     exit 0 = no regression, 2 = regression, 1 = unusable input
 *
 * A regression is either:
 *  - the current win rate's Wilson interval lies entirely below the previous point estimate, with at least 15 decisive pairs, or
 *  - the deterministic check pass rate dropped by 15 points or more over at least 10 checked tasks.
 * Smaller moves are noise at these sample sizes and are reported as such.
 */
import { readFileSync } from "node:fs";
import type { PairSummary } from "./lib/pairwise";

export type Verdict = { regression: boolean; reasons: string[]; notes: string[] };

export function compareRuns(prev: PairSummary, cur: PairSummary): Verdict {
  const reasons: string[] = [];
  const notes: string[] = [];
  const decisive = cur.wins + cur.losses;
  if (prev.winRate && cur.winRate) {
    if (decisive >= 15 && cur.winRate.hi < prev.winRate.estimate) reasons.push(`Win rate fell to ${(cur.winRate.estimate * 100).toFixed(1)}% [${(cur.winRate.lo * 100).toFixed(1)}, ${(cur.winRate.hi * 100).toFixed(1)}], entirely below the previous ${(prev.winRate.estimate * 100).toFixed(1)}%.`);
    else notes.push(`Win rate ${(prev.winRate.estimate * 100).toFixed(1)}% -> ${(cur.winRate.estimate * 100).toFixed(1)}% (${decisive} decisive pairs): within noise.`);
  } else notes.push("No win rate to compare (no decisive pairs in one of the runs).");
  const rate = (s: PairSummary) => (s.checks.tasks ? s.checks.keplar / s.checks.tasks : null);
  const a = rate(prev), b = rate(cur);
  if (a !== null && b !== null && cur.checks.tasks >= 10) {
    if (a - b >= 0.15) reasons.push(`Deterministic checks passed fell from ${(a * 100).toFixed(0)}% to ${(b * 100).toFixed(0)}%.`);
    else notes.push(`Deterministic checks ${(a * 100).toFixed(0)}% -> ${(b * 100).toFixed(0)}%.`);
  }
  if (cur.excluded > prev.excluded + 3) notes.push(`More exclusions: ${prev.excluded} -> ${cur.excluded} (failed answers or unreadable verdicts).`);
  return { regression: reasons.length > 0, reasons, notes };
}

if (process.argv[1]?.endsWith("regress.ts")) {
  try {
    const [p, c] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, "utf8")) as { mode: string; summary: PairSummary });
    if (!p || !c) throw new Error("usage: regress.ts <previous.json> <current.json>");
    if (p.mode !== "live" || c.mode !== "live") throw new Error("Both runs must be live runs (mock results say nothing about quality).");
    const v = compareRuns(p.summary, c.summary);
    console.log([v.regression ? "REGRESSION" : "No regression", ...v.reasons.map((r) => `- ${r}`), ...v.notes.map((n) => `- ${n}`)].join("\n"));
    process.exitCode = v.regression ? 2 : 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}
