/**
 * Create: the assistant's note after a build. Instead of only "Built X: 4 screens", it narrates the decisions that matter
 * to the person (why a layout or stack fits their goal, what it trades away) and the assumptions the planner made, so
 * they can correct them. Plain words (CREATE_EXPLAIN_STYLE); nothing here claims feelings.
 */
export type BuildDecision = { choice: string; why: string; tradeoff?: string };

const clean = (s: string) => s.replace(/\s+/g, " ").trim().replace(/[.;,]+$/, "");

/** The note shown in the Create conversation after a build. `stats` is the existing one-line summary. */
export function narrateBuild(stats: string, spec: { decisions?: BuildDecision[]; assumptions?: string[] }): string {
  const lines = [stats];
  const d = (spec.decisions ?? []).filter((x) => x.choice && x.why).slice(0, 3);
  if (d.length) {
    lines.push("", "Why it's built this way:");
    for (const x of d) lines.push(`- **${clean(x.choice)}**: ${clean(x.why)}.${x.tradeoff ? ` Trade-off: ${clean(x.tradeoff)}.` : ""}`);
  }
  const a = (spec.assumptions ?? []).map(clean).filter(Boolean).slice(0, 3);
  if (a.length) lines.push("", `Assumptions to check: ${a.join("; ")}. Tell me if any are wrong and I'll adjust.`);
  return lines.join("\n");
}

/** The person's own words for the conversation log: reference briefs appended for the model are not shown back. */
export const promptForDisplay = (prompt: string) => prompt.split("\n\nReferences (inspiration only).")[0];
