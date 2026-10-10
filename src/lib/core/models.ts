/**
 * Specialist routing for Core: each sub-step goes to the model best suited to its kind of work (reasoning, math, code,
 * writing), and every check is done by a model from a different family than the one that did the work (an independent
 * second look). Uses the same rosters as the rest of Ask, so plan rules hold: Free sees only $0 `:free` models, and the
 * registry refuses anything else before it is sent.
 */
import { loadFreeCatalog, loadLiveCatalog } from "@/lib/orchestration/catalog-sync";
import { FREE_ROLES, LIVE_ROLES } from "@/lib/orchestration/live-catalog";
import type { ModelSpec } from "@/lib/orchestration/types";
import type { CoreStepKind } from "./types";

type Chainable = { chain(model: ModelSpec, media?: boolean): unknown[]; freeOnly?: boolean };

export type CoreModels = {
  planner: ModelSpec;
  writer: ModelSpec;
  /** The best model for a kind of step, avoiding `avoidFamily` when another good one exists. */
  forKind(kind: CoreStepKind, avoidFamily?: string): ModelSpec;
  /** An independent checker: a different family from `of`. */
  critic(of: ModelSpec): ModelSpec;
  all: ModelSpec[];
};

const WANT: Record<CoreStepKind, string[]> = {
  math: ["reasoning", "coding"],
  code: ["coding", "reasoning"],
  reason: ["reasoning", "knowledge-work"],
  search: ["knowledge-work", "reasoning", "speed"],
  retrieve: ["long-context", "reasoning"],
  write: ["writing", "knowledge-work", "multilingual"],
};

/** Models known to answer cleanly and quickly on the shared free hosts (scripts/free-bench.mts); slow or flaky hosts go last. */
const FREE_PREFERENCE = ["free:nemotron-3-super", "free:qwen3.8-27b", "free:gemma-4-31b", "free:dots-3-note", "free:gemma-4-26b-a4b"];

export function coreModels(registry: Chainable, opts: { roster?: ModelSpec[] } = {}): CoreModels | null {
  const free = Boolean(registry.freeOnly);
  const roster = opts.roster ?? (free ? loadFreeCatalog().roster : loadLiveCatalog());
  const all = roster.filter((m) => m.routable && registry.chain(m).length > 0);
  if (!all.length) return null;
  const byId = new Map(all.map((m) => [m.id, m]));
  const rank = (m: ModelSpec) => {
    if (free) { const i = FREE_PREFERENCE.indexOf(m.id); return i < 0 ? 99 : i; }
    return m.role === "judge" ? 0 : m.role === "primary" ? 1 : 2;
  };
  const sorted = [...all].sort((a, b) => rank(a) - rank(b));
  const roles = free ? FREE_ROLES : LIVE_ROLES;
  // Paid: the judge tier plans and writes (it reasons best). Free: the most reliable free model (the Ultra is too slow to plan in time).
  const planner = (free ? byId.get(roles.synthesizer) : sorted.find((m) => m.role === "judge")) ?? sorted[0];
  const writer = byId.get(roles.synthesizer) ?? planner;
  const forKind = (kind: CoreStepKind, avoidFamily?: string): ModelSpec => {
    const want = WANT[kind];
    const score = (m: ModelSpec) => {
      const s = want.reduce((a, w, i) => a + (m.strengths.includes(w) ? (want.length - i) * 2 : 0), 0);
      return s - rank(m) * 0.5 - (avoidFamily && m.family === avoidFamily ? 3 : 0) - (m.role === "fast-cheap" ? 2 : 0);
    };
    return [...all].sort((a, b) => score(b) - score(a))[0];
  };
  const critic = (of: ModelSpec): ModelSpec => sorted.find((m) => m.family !== of.family && m.role !== "fast-cheap") ?? sorted.find((m) => m.id !== of.id) ?? of;
  return { planner, writer, forKind, critic, all };
}
