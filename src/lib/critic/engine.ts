/**
 * The deterministic half of the AI Critic: every rule over every file, scored. Pure (runs on the server, in tests, and in the
 * browser for the live session's instant `check`).
 */
import { Ctx, type CriticOptions } from "./context";
import { a11yRules } from "./rules-a11y";
import { designRules } from "./rules-design";
import { perfRules, uxRules } from "./rules-perf-ux";
import { codeRules } from "./rules-code";
import { CATEGORY_LABEL, SEVERITY_ORDER, type Category, type CategoryScore, type CriticReport, type Finding, type Severity } from "./types";

export const RULE_COUNT = 63;
const CATS: Category[] = ["a11y", "design", "ux", "perf", "code"];
const WEIGHT: Record<Category, number> = { a11y: 0.26, design: 0.22, ux: 0.2, perf: 0.14, code: 0.18 };
const PENALTY: Record<Severity, number> = { critical: 16, major: 7, minor: 2.5, info: 0.6 };

export function runRules(files: Record<string, string>, opts: CriticOptions = {}): Finding[] {
  const c = new Ctx(files, opts);
  const run = (f: (c: Ctx) => void) => { try { f(c); } catch (e) { console.error("[critic] rule group failed", e); } };
  run(a11yRules);
  run(designRules);
  run(perfRules);
  run(uxRules);
  run(codeRules);
  return sortFindings(c.findings);
}

export const sortFindings = (f: Finding[]) => [...f].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.category.localeCompare(b.category) || a.file.localeCompare(b.file) || a.line - b.line);

/** Repeats of one rule count less and less (ten off-grid paddings are one habit, not ten problems). */
export function score(findings: Finding[]): { score: number; categories: CategoryScore[] } {
  const per = new Map<Category, number>();
  const seen = new Map<string, number>();
  for (const f of findings) {
    const k = (seen.get(f.rule) ?? 0) + 1;
    seen.set(f.rule, k);
    const factor = k <= 2 ? 1 : k <= 5 ? 0.5 : 0.15;
    per.set(f.category, (per.get(f.category) ?? 0) + PENALTY[f.severity] * factor);
  }
  const categories = CATS.map((category) => {
    const list = findings.filter((f) => f.category === category);
    return { category, score: Math.max(0, Math.round(100 - (per.get(category) ?? 0))), findings: list.length, critical: list.filter((f) => f.severity === "critical").length, major: list.filter((f) => f.severity === "major").length };
  });
  let total = Math.round(categories.reduce((a, c) => a + c.score * WEIGHT[c.category], 0));
  const crit = findings.filter((f) => f.severity === "critical").length;
  if (crit) total = Math.min(total, 69 - Math.min(20, (crit - 1) * 5));
  return { score: Math.max(0, total), categories };
}

export const gradeOf = (s: number): CriticReport["grade"] => (s >= 90 ? "Ship it" : s >= 75 ? "Almost there" : s >= 55 ? "Needs work" : "Not ready");

/** A specific, countable summary (never "looks good overall"). */
export function summarize(findings: Finding[], categories: CategoryScore[]): string {
  if (!findings.length) return "No issues found by any check.";
  const crit = findings.filter((f) => f.severity === "critical");
  const fixable = findings.filter((f) => f.patch?.length).length;
  const parts: string[] = [];
  if (crit.length) parts.push(`${crit.length} blocker${crit.length === 1 ? "" : "s"}: ${[...new Set(crit.map((f) => f.title))].slice(0, 2).join("; ")}${crit.length > 2 ? "…" : ""}.`);
  const worst = [...categories].filter((c) => c.findings).sort((a, b) => a.score - b.score)[0];
  if (worst) {
    const top = findings.find((f) => f.category === worst.category && f.severity !== "info");
    if (top) parts.push(`Weakest: ${CATEGORY_LABEL[worst.category]} (${worst.score}) — ${top.title.toLowerCase()} in ${top.file}:${top.line}.`);
  }
  parts.push(`${fixable} of ${findings.length} can be fixed in one click.`);
  return parts.join(" ");
}

export function buildReport(base: Pick<CriticReport, "id" | "workspaceId" | "siteId" | "version" | "createdAt"> & { live?: boolean }, files: Record<string, string>, findings: Finding[], passes: CriticReport["passes"]): CriticReport {
  const sorted = sortFindings(findings);
  const { score: s, categories } = score(sorted);
  return { ...base, score: s, grade: gradeOf(s), summary: summarize(sorted, categories), categories, findings: sorted, passes, files: Object.keys(files).length, bytes: Object.values(files).reduce((a, x) => a + x.length, 0) };
}
