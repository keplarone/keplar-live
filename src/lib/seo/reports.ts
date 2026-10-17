/**
 * A public research report has to carry methodology, data, limitations, and how to reproduce it.
 * `published: false` stays out of the sitemap even when the text is complete.
 * The 12-item Core run is recorded here as unpublished: its own writeup says the answer key
 * for one item was wrong and multi-step was not measured as Thorough. Those are not a benchmark.
 */

export type ReportDraft = {
  slug: string;
  title: string;
  published: boolean;
  methodology: string;
  data: string;
  limitations: string;
  reproduce: string;
  /** Repo path the numbers or the refusal come from. */
  source: string;
};

export type ReportAssessment = { ok: boolean; indexable: boolean; reasons: string[] };

const SECTIONS = ["methodology", "data", "limitations", "reproduce"] as const;

export function assessReport(report: ReportDraft): ReportAssessment {
  const reasons: string[] = [];
  if (!/^[a-z0-9-]{3,80}$/.test(report.slug)) reasons.push("slug");
  if (report.title.trim().length < 12) reasons.push("title");
  for (const key of SECTIONS) {
    if (report[key].trim().length < 80) reasons.push(`${key} is too short to publish`);
  }
  if (!report.source.startsWith("docs/") && !report.source.startsWith("src/")) reasons.push("source must be a path in this repo");
  const blob = `${report.title}\n${report.methodology}\n${report.data}\n${report.limitations}`;
  if (/\b(trusted by|customers love|guaranteed|#1|most accurate)\b/i.test(blob)) reasons.push("unsupported claim");
  const ok = reasons.length === 0;
  return { ok, indexable: ok && report.published, reasons };
}

/**
 * Not published. The source writeup (docs/core-intelligence-evals.md) says this was 12 of 29 items
 * on free models, that item s2 had a wrong answer key, and that the multi-step items were not a
 * Thorough measurement. Quoting a winner from that file would misstate the run.
 */
export const CORE_EVAL_NOTE: ReportDraft = {
  slug: "core-eval-2026-10-06",
  title: "Internal Core eval note, 6 October 2026",
  published: false,
  methodology: "The harness, items, and scorers are in the repo. The run used the Free roster only, compared plain Ask with Core at Thorough, and scored 12 items chosen ahead of time. Scoring rules are exact numbers, substring checks, or hidden tests.",
  data: "The raw rows are in docs/core-eval-results.json and the narrative is in docs/core-intelligence-evals.md. This note does not repeat the scores, because the writeup says one answer key was wrong and one category was not measured under the condition being tested.",
  limitations: "Twelve items is not a benchmark of Keplar against other products. One item's answer key was wrong, so both arms scored zero on it no matter the answer. Multi-step in the main run was not a Thorough result. Substring checks are lenient. Do not cite this file as a ranking.",
  reproduce: "Items and scorers: src/lib/core/bench.ts. Harness: src/lib/core/selfdev/evals.ts. Runner: scripts/core-eval.mts. The writeup names the item ids and the free-model roster used that day.",
  source: "docs/core-intelligence-evals.md",
};

export function publishedReports(reports: ReportDraft[] = [CORE_EVAL_NOTE]): ReportDraft[] {
  return reports.filter((r) => assessReport(r).indexable);
}
