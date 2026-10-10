/**
 * Prompt / strategy variants and how a turn picks one (a bandit with a safety cap).
 *
 * Each target (planner, step solver, critic, insights, retrieval hints, tool settings) has one champion and at most one
 * canary. A canary starts at the configured share of traffic (10% by default) and can earn up to 50% as its posterior
 * reward beats the champion's (Thompson-style, but deterministic per answer id so a turn is reproducible). Whether a canary
 * becomes champion, or is rolled back, is decided by the scheduled pipeline (pipeline.ts) - never here.
 */
import { createHash } from "node:crypto";
import { now } from "@/lib/create/platform/ids";
import { getCoreState, listVariants, SYSTEM, variantRows } from "./repo";
import { VARIANT_TARGETS, type CoreState, type Stats, type VariantParams, type VariantRow, type VariantTarget } from "./types";

/** Built-in champions: the prompts in prompts.ts as written, no strategy text. */
export function seedVariant(target: VariantTarget): VariantRow {
  return { id: `seed-${target}`, workspaceId: SYSTEM, target, label: "Built-in", text: "", params: {}, status: "champion", origin: "seed", createdAt: "2026-10-06T00:00:00.000Z", stats: { turns: 0, good: 0, bad: 0 } };
}

/** First candidates to compare against the built-ins (they go through the same evals, canary and promotion as generated ones). */
export const STARTER_CANDIDATES: Omit<VariantRow, "workspaceId" | "createdAt" | "stats" | "status">[] = [
  { id: "starter-step-units", target: "step", label: "Units and sanity bounds", text: "Before giving a numeric result, restate the quantity asked for with its unit, and check the result against a rough estimate (order of magnitude). If they disagree, find the mistake.", params: {}, origin: "auto", cluster: "starter" },
  { id: "starter-critic-strict", target: "critic", label: "Stricter final bar", text: "Recompute any number that matters yourself before accepting it.", params: { passScore: 9 }, origin: "auto", cluster: "starter" },
  { id: "starter-insight-risk", target: "insight", label: "Lead with the risk", text: "Prefer a concrete risk or common mistake over an extra idea when both are useful.", params: { maxNext: 2 }, origin: "auto", cluster: "starter" },
];

export type ActiveSet = { state: CoreState; byTarget: Record<VariantTarget, { champion: VariantRow; canary: VariantRow | null }> };

let cache: { at: number; set: ActiveSet } | null = null;
let refreshing: Promise<unknown> | null = null;
const TTL = 60_000;

export function setActiveForTests(set: ActiveSet | null) {
  cache = set ? { at: Date.now(), set } : null;
}

export async function loadActive(force = false): Promise<ActiveSet> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.set;
  const [state, rows] = await Promise.all([getCoreState(), listVariants()]);
  const byTarget = {} as ActiveSet["byTarget"];
  for (const t of VARIANT_TARGETS) {
    const champion = rows.find((r) => r.target === t && r.status === "champion") ?? seedVariant(t);
    const canary = rows.find((r) => r.target === t && r.status === "canary") ?? null;
    byTarget[t] = { champion, canary };
  }
  const set = { state, byTarget };
  cache = { at: Date.now(), set };
  return set;
}

/** Cached view for the hot path; never throws (a store hiccup means the built-in prompts). */
export async function activeSafe(): Promise<ActiveSet | null> {
  try {
    return await loadActive();
  } catch {
    return null;
  }
}

/**
 * The admin kill switch, for the hot path: answers from the cached state without waiting (a stale or missing cache starts
 * a refresh in the background), so turning Core off reaches every server within about a minute and the fast path never
 * waits on the database.
 */
export function peekKilled(): boolean {
  if ((!cache || Date.now() - cache.at >= TTL) && !refreshing) refreshing = loadActive(true).catch(() => undefined).finally(() => { refreshing = null; });
  return cache?.set.state.killed ?? false;
}

/** Deterministic uniform in [0,1) from a string. */
export function unit(s: string): number {
  return parseInt(createHash("sha256").update(s).digest("hex").slice(0, 8), 16) / 0x100000000;
}

export const posterior = (s: Stats) => (s.good + 1) / (s.good + s.bad + 2);

/** Share of traffic for a canary: the configured start, up to 50% as it out-earns the champion (needs 20+ turns to move). */
export function canaryShare(canary: Stats, champion: Stats, startPct: number): number {
  const start = Math.min(50, Math.max(1, startPct)) / 100;
  if (canary.turns < 20) return start;
  const lift = posterior(canary) - posterior(champion);
  return Math.min(0.5, Math.max(start * 0.5, start + lift * 2));
}

export type Picked = { ids: Partial<Record<VariantTarget, string>>; text: Partial<Record<VariantTarget, string>>; params: VariantParams };

/** The variants this turn uses. Frozen = built-ins only. */
export function pick(set: ActiveSet | null, turnSeed: string): Picked {
  const out: Picked = { ids: {}, text: {}, params: {} };
  if (!set) return out;
  for (const t of VARIANT_TARGETS) {
    const { champion, canary } = set.byTarget[t];
    let v = set.state.frozen ? seedVariant(t) : champion;
    if (!set.state.frozen && canary && unit(`${turnSeed}:${t}`) < canaryShare(canary.stats, champion.stats, set.state.canaryPct)) v = canary;
    out.ids[t] = v.id;
    if (v.text) out.text[t] = v.text;
    Object.assign(out.params, v.params);
  }
  return out;
}

/**
 * Credit a turn's reward in [0,1] to the variants it used (`from` = the reward already credited for this turn, when a later
 * signal changes it: only the difference moves, and the turn is not counted twice).
 */
export async function credit(ids: Partial<Record<VariantTarget, string>>, reward: number, from: number | null = null): Promise<void> {
  const r = Math.max(0, Math.min(1, reward));
  const d = from === null ? r : r - Math.max(0, Math.min(1, from));
  for (const [t, id] of Object.entries(ids) as [VariantTarget, string][]) {
    if (!id) continue;
    try {
      const row = (await variantRows().get(SYSTEM, id)) ?? (id.startsWith("seed-") ? await variantRows().insert({ ...seedVariant(t), createdAt: now() }) : null);
      if (!row) continue;
      const s = row.stats ?? { turns: 0, good: 0, bad: 0 };
      const stats = from === null ? { turns: s.turns + 1, good: s.good + r, bad: s.bad + (1 - r) } : { turns: s.turns, good: Math.max(0, s.good + d), bad: Math.max(0, s.bad - d) };
      await variantRows().update(SYSTEM, id, { stats });
    } catch {
      /* learning is best effort */
    }
  }
}
