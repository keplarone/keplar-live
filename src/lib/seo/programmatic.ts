/**
 * Publish decision for a programmatic record.
 * Indexable only when the quality bar passes, including schema that matches the page.
 * Callers set `noindex` from `decision.indexable` and omit the URL from their sitemap when it is false.
 */
import { assessPage, type PageDraft, type QualityBar, type QualityReport, PROGRAMMATIC_BAR } from "./quality";

export type ProgrammaticRecord = PageDraft & { clusterId?: string };

export function decidePublish(
  record: ProgrammaticRecord,
  others: { path: string; text: string }[] = [],
  taken: { path: string; title: string; description: string; h1: string }[] = [],
  bar: QualityBar = PROGRAMMATIC_BAR,
): QualityReport {
  return assessPage(record, others, taken, bar);
}

/** Sitemap membership follows the same bit as indexing. A failing page can still render for its author. */
export function includeInSitemap(report: QualityReport): boolean {
  return report.indexable;
}
