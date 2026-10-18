/**
 * Structured answer blocks the synthesizer may append as one ```keplar-ui fence.
 * The markdown stays a complete answer; these blocks are an optional view of it.
 * Agreement counts and per-item splits are never part of the model's JSON: the
 * server fills them from the real responses.
 */

export type RichSplit = { model: string; said: string };

export type RankedItem = {
  rank: number;
  name: string;
  maker?: string;
  why: string;
  tags: string[];
  /** Only when that number appears in the model responses or their citations. */
  score?: string;
  /** Sentences taken from the actual responses, and only when those sentences differ. */
  split?: RichSplit[];
};

export type RichBlock =
  | { type: "ranked"; title?: string; note: string; items: RankedItem[] }
  | { type: "compare"; title?: string; columns: string[]; rows: { label: string; cells: string[] }[] }
  | { type: "cards"; title?: string; items: { title: string; body: string; tag?: string }[] }
  | { type: "timeline"; title?: string; items: { when: string; title: string; body?: string }[] }
  | { type: "steps"; title?: string; items: { title: string; body: string }[] }
  | { type: "proscons"; title?: string; pros: string[]; cons: string[] }
  | { type: "stats"; title?: string; items: { label: string; value: string; note?: string }[] }
  | { type: "callout"; text: string }
  | { type: "sources"; items: { title: string; url: string; domain: string }[] };

export type RichAnswer = { blocks: RichBlock[] };

/** Counts already computed by the comparator. The rich view never invents these. */
export type AgreementCounts = {
  level: "consensus" | "partial" | "none" | "single" | "unscored";
  agree: number;
  disagree: number;
  summary: string;
};
