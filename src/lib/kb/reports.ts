import { csv, loadDir, type Loaded } from "./load";
import type { Node } from "./md";

/**
 * Original research reports (content/reports/*.md): dated, reproducible evaluations with their data files in the repository.
 * A report must carry the sections REQUIRED_SECTIONS below (tests/seo-reports.test.ts); a new run is a new page, and an
 * existing report is never rewritten after publication, only corrected with a dated note.
 */
export type Report = {
  slug: string;
  path: string;
  title: string;
  /** Short <title> for search results; the long title stays the headline. */
  metaTitle: string;
  description: string;
  /** What kind of report: an evaluation, a survey, an index. */
  kind: string;
  published: string;
  updated: string;
  /** Repository paths of the raw data the report is built from. */
  dataFiles: string[];
  keywords: string[];
  related: string[];
  nodes: Node[];
  words: number;
  text: string;
};

export const REQUIRED_SECTIONS = ["summary", "method", "results", "limitations", "reproduce", "data"] as const;

const toReport = (l: Loaded): Report => ({
  slug: l.rel,
  path: `/reports/${l.rel}`,
  title: l.front.title,
  metaTitle: l.front.metaTitle || l.front.title,
  description: l.front.description,
  kind: l.front.kind || "report",
  published: l.front.published,
  updated: l.front.updated ?? l.front.published,
  dataFiles: csv(l.front.dataFiles),
  keywords: csv(l.front.keywords),
  related: csv(l.front.related),
  nodes: l.nodes,
  words: l.words,
  text: l.text,
});

let cache: Report[] | null = null;
export function allReports(): Report[] {
  if (!cache) cache = loadDir("reports").map(toReport).sort((a, b) => b.published.localeCompare(a.published) || a.title.localeCompare(b.title));
  return cache;
}
export const reportBySlug = (slug: string) => allReports().find((r) => r.slug === slug);

/** The required section ids a report is missing (empty when complete). */
export function missingSections(r: Report): string[] {
  const ids = new Set(r.nodes.filter((n): n is Extract<Node, { t: "h2" | "h3" }> => n.t === "h2").map((n) => n.id));
  return REQUIRED_SECTIONS.filter((s) => !ids.has(s));
}
