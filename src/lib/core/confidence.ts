/**
 * Calibrated confidence in plain words. Built from evidence Keplar actually has (how the models agreed, what the
 * reviewer found, whether the math or code was run and matched, the final review score, whether the work was cut short),
 * then nudged toward what really happened to answers with that confidence before (the learned calibration table).
 * Agreement is not truth, so even a unanimous, checked answer tops out below certainty.
 */
import type { KeplarAnswer } from "@/lib/orchestration/types";
import type { CoreCheck, Confidence, StopReason } from "./types";

export type ConfidenceInput = {
  consensus?: KeplarAnswer["consensus"];
  verification?: KeplarAnswer["verification"];
  checks: CoreCheck[];
  criticScore: number | null;
  stepsFailed: number;
  stoppedBy: StopReason;
  calibration?: Record<string, number>;
};

export const bucketOf = (x: number) => (Math.round(Math.max(0, Math.min(1, x)) * 10) / 10).toFixed(1);

export function confidence(i: ConfidenceInput): Confidence {
  let s = 0.6;
  const why: string[] = [];
  const c = i.consensus;
  if (c) {
    if (c.level === "consensus") { s += 0.15; why.push(`${c.agree || c.responded} models agreed`); }
    else if (c.level === "partial") { s -= 0.05; why.push("the models partly disagreed"); }
    else if (c.level === "none") { s -= 0.2; why.push("the models disagreed"); }
    else if (c.level === "single") { s -= 0.05; }
  }
  const v = i.verification?.checks ?? [];
  const removed = v.filter((x) => x.outcome === "removed" || x.outcome === "contradicted").length;
  if (removed) { s -= Math.min(0.15, removed * 0.05); why.push(`the reviewer removed ${removed} claim${removed === 1 ? "" : "s"}`); }
  const exPass = i.checks.filter((x) => x.kind === "execution" && x.outcome === "passed").length;
  const exFail = i.checks.filter((x) => (x.kind === "execution" || x.kind === "syntax") && x.outcome === "failed").length;
  if (exPass) { s += 0.12; why.push("the math or code was checked by running it"); }
  if (exFail && !exPass) { s -= 0.1; why.push("a run check didn't pass"); }
  if (i.criticScore !== null) {
    s += (i.criticScore - 7) * 0.04;
    if (i.criticScore >= 8) why.push(`it passed an independent final review (${i.criticScore}/10)`);
    else why.push(`the final review scored it ${i.criticScore}/10`);
  }
  if (i.stepsFailed) { s -= Math.min(0.2, i.stepsFailed * 0.08); why.push(`${i.stepsFailed} step${i.stepsFailed === 1 ? "" : "s"} couldn't be verified`); }
  if (i.stoppedBy === "budget" || i.stoppedBy === "time" || i.stoppedBy === "pool") { s -= 0.05; why.push("checking stopped at the plan's limit"); }
  s = Math.max(0.05, Math.min(0.95, s));
  const seen = i.calibration?.[bucketOf(s)];
  if (typeof seen === "number") s = Math.max(0.05, Math.min(0.95, 0.7 * s + 0.3 * seen));
  const level: Confidence["level"] = s >= 0.78 ? "high" : s >= 0.55 ? "medium" : "low";
  const lead = level === "high" ? "High confidence" : level === "medium" ? "Medium confidence" : "Low confidence";
  const tail = level === "low" ? " Double-check this before relying on it." : level === "medium" ? " Worth a quick check if it matters." : "";
  const words = `${lead}${why.length ? `: ${joinWords(why.slice(0, 3))}.` : "."}${tail}`;
  return { level, score: Math.round(s * 100) / 100, words };
}

function joinWords(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
