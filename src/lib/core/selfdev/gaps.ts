/**
 * Gap finding: group recent turns that went badly (low reward, low confidence, failed checks, negative signals) by their
 * content-free tags, so the pipeline can see where Keplar is weak ("math word problems with failing checks", "questions that
 * needed the web while search was unavailable"). Topic words appear only for people who opted in to sharing.
 */
import { turnReward } from "./outcomes";
import type { GapCluster, TurnRow } from "./types";

export const BAD_REWARD = 0.45;
export const MIN_CLUSTER = 5;

export function isBad(t: TurnRow): boolean {
  return turnReward(t) < BAD_REWARD || t.confidence < 0.45 || (t.fb.down ?? 0) > 0 || (t.fb.correct ?? 0) > 0 || (t.fb.regenerate ?? 0) > 0 || (t.fb.confused ?? 0) > 0;
}

/** The tags that define a cluster: the task's needs and domain plus what went wrong (tool trouble, stop reason). */
function keyTags(t: TurnRow): string[] {
  const keep = t.tags.filter((x) => /^(needs:|domain:|tool:|stopped:(budget|time|pool))/.test(x) || x === "long-context").sort();
  return [`cat:${t.category}`, ...keep];
}

function needOf(tags: string[]): GapCluster["need"] {
  if (tags.includes("tool:search-unavailable")) return "code"; // search itself is missing: that needs infrastructure, not a prompt
  if (tags.some((t) => t === "needs:web" || t === "long-context")) return "retrieval";
  if (tags.includes("tool:execution-failed") || tags.some((t) => t === "needs:code" || t === "needs:math")) return "tool";
  return "prompt";
}

function labelOf(tags: string[]): string {
  const parts: string[] = [];
  const cat = tags.find((t) => t.startsWith("cat:"))?.slice(4);
  if (cat) parts.push(cat.replace(/_/g, " "));
  for (const t of tags) {
    if (t.startsWith("needs:")) parts.push(`needs ${t.slice(6)}`);
    else if (t.startsWith("domain:")) parts.push(t.slice(7));
    else if (t === "long-context") parts.push("long context");
    else if (t.startsWith("tool:")) parts.push(t.slice(5).replace(/-/g, " "));
    else if (t.startsWith("stopped:")) parts.push(`stopped by ${t.slice(8)}`);
  }
  return parts.join(" · ") || "general";
}

/**
 * Clusters of bad turns, worst first. A turn joins the cluster for its full tag set and, so that sparse tag combinations
 * still add up, the cluster for its category plus its single most specific tag.
 */
export function findGaps(turns: TurnRow[], minTurns = MIN_CLUSTER): GapCluster[] {
  const groups = new Map<string, { tags: string[]; all: TurnRow[]; bad: TurnRow[] }>();
  const add = (tags: string[], t: TurnRow, bad: boolean) => {
    const k = tags.join("|");
    const g = groups.get(k) ?? { tags, all: [], bad: [] };
    g.all.push(t);
    if (bad) g.bad.push(t);
    groups.set(k, g);
  };
  for (const t of turns) {
    const bad = isBad(t);
    const tags = keyTags(t);
    add(tags, t, bad);
    if (tags.length > 2) add(tags.slice(0, 2), t, bad);
  }
  const out: GapCluster[] = [];
  for (const [key, g] of groups) {
    if (g.bad.length < minTurns) continue;
    const badRate = g.bad.length / g.all.length;
    if (badRate < 0.3) continue;
    const examples = [...new Set(g.bad.map((t) => t.topic).filter((x): x is string => Boolean(x)))].slice(0, 5);
    out.push({ key, label: labelOf(g.tags), turns: g.all.length, badRate: Math.round(badRate * 100) / 100, tags: g.tags, examples, need: needOf(g.tags) });
  }
  // Prefer the more specific cluster when a broad one covers the same failures.
  return out.sort((a, b) => b.badRate * Math.log(1 + b.turns) - a.badRate * Math.log(1 + a.turns) || b.tags.length - a.tags.length).slice(0, 12);
}
