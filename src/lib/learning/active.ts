/**
 * What the router reads on every question: a synchronous lookup in two small tables kept in memory (client-safe: no storage import).
 *   policy  the promoted, versioned policy (changes only through the nightly pipeline or an admin)
 *   live    small (+/-8%) multipliers recomputed from the running per-model tallies, minimum sample sizes enforced
 * The tables are filled by warm.ts on the server. Until then (and on any failure, with KEPLAR_LEARNING_OFF=1, or when an admin
 * has frozen learning) every multiplier is exactly 1: the router is the baseline.
 */
import { boostOf, clampBoost } from "./policy";
import type { Boosts, Category, Tier } from "./types";

export type Snapshot = { policy: Boosts; live: Boosts; version: number; at: number };
let snap: Snapshot = { policy: {}, live: {}, version: 0, at: 0 };

export const learningOff = () => typeof process !== "undefined" && process.env?.KEPLAR_LEARNING_OFF === "1";

/** The multiplier on a model's routing score for this kind of question (1 when nothing has been learned). */
export function activeBoost(tier: Tier, category: Category, modelId: string): number {
  if (learningOff()) return 1;
  return clampBoost(boostOf(snap.policy, tier, category, modelId) * boostOf(snap.live, tier, category, modelId));
}

export const activeVersion = () => (learningOff() ? 0 : snap.version);
export const snapshotAt = () => snap.at;
export const setSnapshot = (s: Snapshot) => {
  snap = s;
};
export const currentSnapshot = () => snap;

/** Tests only. */
export function setSnapshotForTests(s: Partial<Pick<Snapshot, "policy" | "live" | "version">> | null) {
  snap = s ? { policy: s.policy ?? {}, live: s.live ?? {}, version: s.version ?? 0, at: Date.now() + 3_600_000 } : { policy: {}, live: {}, version: 0, at: 0 };
}
