/**
 * Reason mode: the visible verification steps behind one answer, built ONLY from what the engine actually did and reported on the
 * finished answer (models asked and how they responded, the agreement score, each cross-model review finding, web source checks,
 * research pages). Nothing is invented: a step with no data is left out, and a single-model answer says so.
 */
import type { KeplarAnswer } from "@/lib/orchestration/types";

export type TrailStep = { kind: string; text: string; tone?: "ok" | "warn" };

const OUTCOME: Record<string, string> = {
  held: "held up", revised: "was reworded", removed: "was left out", "kept-as-dissent": "is kept as a minority view",
  supported: "is supported by the pages found", contradicted: "is contradicted by the pages found", inconclusive: "stayed inconclusive",
};

const list = (xs: string[]) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function reasonTrail(a: Pick<KeplarAnswer, "models" | "consensus" | "verification" | "sourcing" | "research" | "disagreements" | "interpretation">): TrailStep[] {
  const steps: TrailStep[] = [];
  if (a.interpretation) steps.push({ kind: "Read the question", text: a.interpretation });
  const panel = a.models.filter((m) => m.slot === "panel");
  const answered = panel.filter((m) => m.status === "responded");
  const failed = panel.filter((m) => m.status === "failed" || m.status === "refused");
  if (panel.length) {
    steps.push({ kind: "Asked independently", text: `${panel.length} model${panel.length === 1 ? "" : "s"} worked on it separately: ${list(panel.map((m) => m.name))}.${failed.length ? ` ${list(failed.map((m) => m.name))} did not give a usable answer.` : ""}` });
  }
  if (a.consensus.level === "single" || answered.length === 1) {
    steps.push({ kind: "Agreement", text: "Only one model answered, so there was nothing to cross-check. Treat this answer with more care.", tone: "warn" });
  } else if (a.consensus.responded > 1) {
    const score = a.consensus.score === null ? "" : ` (agreement ${Math.round(a.consensus.score)}%)`;
    steps.push({ kind: "Compared", text: `${a.consensus.summary || `${a.consensus.agree} of ${a.consensus.responded} agreed`}${score}.`, tone: a.consensus.level === "consensus" ? "ok" : a.consensus.level === "none" ? "warn" : undefined });
  }
  for (const d of a.disagreements.slice(0, 4)) {
    steps.push({ kind: "Disagreement", text: `${d.topic}: ${d.resolution || d.positions.map((p) => p.stance).join(" vs ")}`, tone: "warn" });
  }
  const reviewer = a.verification.reviewer;
  for (const c of a.verification.checks.slice(0, 8)) {
    const what = OUTCOME[c.outcome] ?? c.outcome;
    steps.push({ kind: c.kind === "web" ? "Checked on the web" : "Reviewed", text: `${c.finding} It ${what}.${c.resolution ? ` ${c.resolution}` : ""}`, tone: c.outcome === "held" || c.outcome === "supported" ? "ok" : c.outcome === "removed" || c.outcome === "contradicted" ? "warn" : undefined });
  }
  if (a.verification.mode === "cross-model" && !a.verification.checks.length && reviewer) {
    steps.push({ kind: "Reviewed", text: `${reviewer} reviewed the draft against each model's answer and found nothing to change.`, tone: "ok" });
  }
  if (a.sourcing && (a.sourcing.state === "checked" || a.sourcing.state === "no_sources")) {
    const ok = a.sourcing.claims.filter((c) => c.support === "supported").length;
    const bad = a.sourcing.claims.filter((c) => c.support === "contradicted").length;
    steps.push({ kind: "Sources", text: a.sourcing.state === "no_sources" ? "A web search ran but found no pages to check the claims against." : `${a.sourcing.claims.length} claim${a.sourcing.claims.length === 1 ? "" : "s"} checked against web pages: ${ok} supported${bad ? `, ${bad} contradicted` : ""}.`, tone: bad ? "warn" : ok ? "ok" : undefined });
  }
  if (a.research?.sources.length) steps.push({ kind: "Research", text: `Read ${a.research.sources.length} page${a.research.sources.length === 1 ? "" : "s"} from ${a.research.queries.length} search${a.research.queries.length === 1 ? "" : "es"}; the answer cites ${a.research.cited.length}.` });
  if (steps.length) steps.push({ kind: "Wrote one answer", text: "Keplar combined what held up into the answer above and kept open points as stated uncertainty." });
  return steps;
}
