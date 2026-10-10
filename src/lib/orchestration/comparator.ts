import type { Comparator, Comparison, ConsensusLevel, Position, ProviderResult, Verification } from "./types";

/** Stance used by live providers until positions are extracted. */
export const UNCLASSIFIED = "unclassified";

function level(score: number | null, responded: number): ConsensusLevel {
  if (responded <= 1 || score == null) return "single";
  if (score >= 80) return "consensus";
  if (score >= 60) return "partial";
  return "none";
}

/**
 * Groups responses by stance. Refusals and failures are missing votes, not
 * dissent. After verification, each position is weighted by how much of its
 * evidence held up, so a well-supported minority can outweigh a weak majority.
 */
export class EvidenceWeightedComparator implements Comparator {
  compare(results: ProviderResult[]): Comparison {
    const ok = results.filter((r): r is Extract<ProviderResult, { ok: true }> => r.ok);
    const missing = results.length - ok.length;
    // Live providers return free text; positions need an extraction pass
    // (TODO: LLM position extractor on the verifier tier). Never guess agreement.
    if (ok.length > 1 && ok.some((r) => r.stance === UNCLASSIFIED)) {
      return { level: "unscored", score: null, agree: 0, disagree: 0, missing, positions: [], majorityStance: null };
    }
    const groups = new Map<string, Position>();
    for (const r of ok) {
      const g = groups.get(r.stance) ?? { stance: r.stance, summary: r.text, modelIds: [] };
      g.modelIds.push(r.modelId);
      groups.set(r.stance, g);
    }
    const positions = [...groups.values()].sort((a, b) => b.modelIds.length - a.modelIds.length);
    const top = positions[0];
    const agree = top?.modelIds.length ?? 0;
    const score = ok.length ? Math.round((agree / ok.length) * 100) : null;
    return {
      level: level(score, ok.length),
      score: ok.length > 1 ? score : null,
      agree,
      disagree: ok.length - agree,
      missing,
      positions,
      majorityStance: top && positions.filter((p) => p.modelIds.length === agree).length === 1 ? top.stance : null,
    };
  }

  finalize(c: Comparison, v: Verification, results: ProviderResult[]): Comparison {
    if (c.level === "unscored") return c;
    const responded = c.agree + c.disagree;
    if (responded <= 1) return { ...c, level: "single", score: null };
    const removed = new Set(v.removed.map((x) => x.id));
    const weightOf = (stance: string) => {
      const claims = results.flatMap((r) => (r.ok && r.stance === stance ? r.claims : []));
      if (!claims.length) return 0.5;
      const support = claims.filter((x) => !removed.has(x.id)).length / claims.length;
      return 0.25 + 0.75 * support;
    };
    const weighted = c.positions.map((p) => ({ p, w: p.modelIds.length * weightOf(p.stance) }));
    const total = weighted.reduce((a, b) => a + b.w, 0);
    weighted.sort((a, b) => b.w - a.w);
    const lead = weighted[0];
    const score = total ? Math.round((lead.w / total) * 100) : null;
    return {
      ...c,
      positions: weighted.map((x) => x.p),
      score,
      level: level(score, responded),
      majorityStance: lead.p.stance,
      agree: lead.p.modelIds.length,
      disagree: responded - lead.p.modelIds.length,
    };
  }
}
