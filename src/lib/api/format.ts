/**
 * The public shape of an answer (API v1). Built only from fields the pipeline produced, like the app's answer card and the shared pages.
 * Stable on purpose: add fields, never rename or remove them within v1. Provider cost and internal ids never appear.
 */
import { buildDisagreementView } from "@/lib/disagreement-view";
import type { KeplarAnswer } from "@/lib/orchestration/types";

export type V1Answer = {
  object: "answer";
  id: string;
  /** The final answer, as Markdown. */
  answer: string;
  /** How many of the consulted models agreed. `level` is "single" when only one model answered. */
  agreement: { level: string; agree: number; disagree: number; responded: number; consulted: number; summary: string };
  /** Where the models differed. null when there was nothing to compare (one model, or the same position everywhere). */
  disagreement: null | {
    headline: string;
    topic: string;
    tie: boolean;
    positions: { stance: string; summary: string; models: string[]; count: number; of: number }[];
    agreed: string[];
    differ: string[];
    why: { recorded: boolean; text: string };
  };
  models: { name: string; provider: string; status: string }[];
  /** Sources the models cited. Keplar has not checked them unless `source_check` says so. A note that no page was fetched is not listed here. */
  sources: { kind: string; title: string; url: string | null }[];
  /** Present when Deep Research ran or was skipped. `pages_read` counts pages Keplar actually retrieved. */
  research?: { pages_read: number; cited: number; note: string | null };
  /** Present only when Keplar checked claims against web pages it retrieved (BETA, off unless enabled). */
  source_check: null | { state: string; note: string; claims: { text: string; support: string; finding: string; sources: { title: string; url: string }[] }[] };
  usage: { credits: number };
  created: string;
  /** Only when the request listed `tools`: what each one did ("used", "requested", "unavailable" or "failed"). */
  tools?: { type: string; status: string; detail: string }[];
};

export function toV1Answer(a: KeplarAnswer, at = new Date()): V1Answer {
  const view = buildDisagreementView({ consensus: a.consensus, models: a.models, disagreements: a.disagreements, checks: a.verification.checks, reviewer: a.verification.mode === "cross-model" ? a.verification.reviewer : undefined });
  const c = a.consensus;
  return {
    object: "answer",
    id: a.id,
    answer: a.markdown,
    agreement: { level: String(c.level), agree: c.agree, disagree: c.disagree, responded: c.responded, consulted: c.consulted, summary: c.summary },
    disagreement: view
      ? {
          headline: view.headline,
          topic: view.topic,
          tie: view.tie,
          positions: view.columns.map((x) => ({ stance: x.stance, summary: x.summary, models: x.models, count: x.count, of: x.total })),
          agreed: view.agreed,
          differ: view.differ,
          why: { recorded: view.why.recorded, text: view.why.text },
        }
      : null,
    models: a.models.map((m) => ({ name: m.name, provider: m.provider, status: m.status })),
    sources: a.sources.filter((s) => s.kind !== "note" || Boolean(s.url)).map((s) => ({ kind: s.kind, title: s.title, url: s.url ?? null })),
    ...(a.research
      ? { research: { pages_read: a.research.sources.length, cited: a.research.cited.length, note: a.research.off ?? null } }
      : {}),
    source_check: a.sourcing && a.sourcing.state === "checked" ? { state: a.sourcing.state, note: a.sourcing.note, claims: a.sourcing.claims.map((x) => ({ text: x.text, support: x.support, finding: x.finding, sources: x.sources })) } : null,
    usage: { credits: a.compute.units },
    created: at.toISOString(),
  };
}

export type V1Error = { error: { code: string; message: string; retry_after?: number } };
export const v1Error = (code: string, message: string, retryAfter?: number): V1Error => ({ error: { code, message, ...(retryAfter ? { retry_after: retryAfter } : {}) } });
