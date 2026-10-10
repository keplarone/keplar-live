/**
 * "Show me the disagreement": turns what the pipeline really produced into the view model for the side-by-side block.
 * Pure and client-safe (no server imports). Every line comes from a field the pipeline filled in: the compared positions (which models
 * held which stance), the reviewer's checks (what held, what was revised, removed or kept as a minority view) and the recorded resolution.
 * Nothing is inferred or written here. When the pipeline recorded no reason for the choice, the view says so instead of making one up.
 */
import type { Disagreement } from "@/lib/orchestration/types";

/** The synthesizer's stand-in when the model wrote no resolution line. It is not a reason, so the view never shows it as one. */
export const GENERIC_RESOLUTION = "The synthesis weighed the evidence and reasoning behind each position; see the answer.";

export type DvCheck = { kind: string; finding: string; models?: string[]; outcome: string; resolution: string };
export type DvInput = {
  consensus: { level: string; agree: number; disagree: number; responded: number; consulted: number };
  models?: { name: string; slot?: string; status: string; stance?: string }[];
  disagreements: Disagreement[];
  /** Cross-model review findings (never web checks; those are shown as sources). */
  checks?: DvCheck[];
  /** Display name of the model that reviewed the draft, when one did. */
  reviewer?: string;
};

export type DvColumn = { stance: string; summary: string; models: string[]; count: number; total: number; lead: boolean };
export type DvStep = { outcome: string; finding: string; resolution: string };
export type DisagreementViewModel = {
  headline: string;
  topic: string;
  tie: boolean;
  columns: DvColumn[];
  /** Points the models or the reviewer's checks agreed on. Empty when the pipeline recorded none. */
  agreed: string[];
  /** Points that stayed apart, were revised, removed or kept as a minority view. */
  differ: string[];
  why: { recorded: boolean; text: string; reviewer?: string; steps: DvStep[] };
  /** Models asked that did not answer: they are missing votes, not dissent. */
  notes: string[];
};

const OUTCOME_LABEL: Record<string, string> = {
  held: "Held up",
  revised: "Reworded",
  removed: "Left out",
  "kept-as-dissent": "Kept as a minority view",
  supported: "Supported",
  contradicted: "Contradicted",
  inconclusive: "Inconclusive",
};
const HELD = new Set(["held", "supported"]);
const APART = new Set(["revised", "removed", "kept-as-dissent", "contradicted"]);

const one = (s: string) => s.replace(/\s+/g, " ").trim();
const endDot = (s: string) => (/[.!?…]$/.test(s) ? s : `${s}.`);

/** Null when there is nothing to compare (one model, or every model took the same position). */
export function buildDisagreementView(input: DvInput): DisagreementViewModel | null {
  const d = input.disagreements[0];
  const c = input.consensus;
  if (!d || d.positions.length < 2 || c.level === "single") return null;
  const positions = [...d.positions].sort((x, y) => y.models.length - x.models.length);
  const total = positions.reduce((n, p) => n + p.models.length, 0) || c.responded;
  const tie = positions[0].models.length === positions[1].models.length;
  const columns: DvColumn[] = positions.map((p, i) => ({ stance: p.stance, summary: p.summary, models: p.models, count: p.models.length, total, lead: !tie && i === 0 }));
  const headline = tie ? `The models split ${positions.map((p) => p.models.length).join(" – ")}` : `${positions[0].models.length} of ${total} models agree`;

  const checks = (input.checks ?? []).filter((k) => k.kind !== "web" && k.finding);
  const agreed: string[] = [];
  if (!tie) agreed.push(`${positions[0].models.length} of ${total} models took the same position: ${endDot(one(positions[0].stance))}`);
  for (const k of checks.filter((k) => HELD.has(k.outcome))) agreed.push(`The review kept this: ${endDot(one(k.finding))}`);
  const differ: string[] = positions.slice(tie ? 0 : 1).map((p) => `${p.models.length} of ${total} ${p.models.length === 1 ? "says" : "say"}: ${endDot(one(p.stance))}`);
  for (const k of checks.filter((k) => APART.has(k.outcome))) differ.push(`${OUTCOME_LABEL[k.outcome]}: ${endDot(one(k.finding))}`);

  const resolution = one(d.resolution || "");
  const recorded = Boolean(resolution) && resolution !== GENERIC_RESOLUTION;
  const steps: DvStep[] = checks.filter((k) => k.resolution).map((k) => ({ outcome: OUTCOME_LABEL[k.outcome] ?? k.outcome, finding: one(k.finding), resolution: one(k.resolution) }));
  const why = {
    recorded,
    text: recorded ? resolution : input.reviewer ? "No specific reason for this choice was recorded. A second model reviewed the draft against the responses; its findings are listed below." : "No specific reason for this choice was recorded for this answer.",
    ...(input.reviewer ? { reviewer: input.reviewer } : {}),
    steps,
  };
  const notes: string[] = [];
  const silent = (input.models ?? []).filter((m) => (m.slot ?? "panel") === "panel" && (m.status === "failed" || m.status === "refused"));
  if (silent.length) notes.push(`${silent.map((m) => m.name).join(", ")} did not answer, so ${silent.length === 1 ? "it is" : "they are"} not counted on either side.`);
  return { headline, topic: d.topic, tie, columns, agreed, differ, why, notes };
}
