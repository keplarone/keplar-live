/** Server side of active.ts: refresh the in-memory tables from the database, at most once a minute per server instance. */
import { currentSnapshot, learningOff, setSnapshot, snapshotAt } from "./active";
import { boostsFor, LIVE_SPAN } from "./bandit";
import { keyOf } from "./policy";
import { loadActive } from "./repo";
import type { ArmRow, Boosts } from "./types";

export const REFRESH_MS = 60_000;
let inflight: Promise<void> | null = null;

/** The live multipliers for every (tier, category) that has enough evidence. */
export function liveBoosts(arms: readonly ArmRow[]): Boosts {
  const groups = new Map<string, ArmRow[]>();
  for (const a of arms) groups.set(keyOf(a.tier, a.category), [...(groups.get(keyOf(a.tier, a.category)) ?? []), a]);
  const live: Boosts = {};
  for (const [k, list] of groups) {
    const b = boostsFor(list, LIVE_SPAN);
    if (Object.keys(b).length) live[k] = b;
  }
  return live;
}

async function refresh() {
  const a = await loadActive();
  setSnapshot({ policy: a.frozen ? {} : a.boosts, live: a.frozen ? {} : liveBoosts(a.arms), version: a.frozen ? 0 : a.version, at: Date.now() });
}

/** Never throws and waits at most 1.5 s: the baseline router is always a safe answer. */
export async function warmLearning(now = Date.now()): Promise<void> {
  if (learningOff() || now - snapshotAt() < REFRESH_MS) return;
  inflight ??= Promise.race([refresh(), new Promise<void>((r) => setTimeout(r, 1500))])
    .catch(() => setSnapshot({ ...currentSnapshot(), at: now })) // keep what we had; try again in a minute
    .finally(() => {
      inflight = null;
    });
  await inflight;
}
