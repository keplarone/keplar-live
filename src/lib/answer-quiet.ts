import type { KeplarAnswer } from "@/lib/orchestration/types";

/** The one-line summary next to "Reasoning summary": the first sentence of what actually happened. */
export function reasoningMeta(reasoning: string): string {
  const first = (reasoning || "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0] ?? "";
  if (!first) return "";
  return first.length > 90 ? `${first.slice(0, 89).trimEnd()}…` : first;
}

/** Which sections have nothing to say for this answer. */
export function quietIds(a: KeplarAnswer): Set<string> {
  const c = a.consensus;
  const q = new Set<string>();
  if (c.level === "single" || c.level === "unscored") q.add("consensus");
  if (c.consulted <= 1) q.add("models");
  if (!a.sources.some((s) => s.kind === "model" || s.kind === "web" || s.kind === "attachment" || s.title === "Exact check")) q.add("sources");
  if (!a.disagreements.length) q.add("disagreements");
  if (a.verification.mode === "not-needed") q.add("verification");
  return q;
}
