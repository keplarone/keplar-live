/**
 * Seeded, stratified subsets (plan §4.2) and the held-out dev split used to
 * choose the best single model (plan §2, arm 8).
 *
 * NOTE: the plan names numpy.random.default_rng(20260927). This harness uses a
 * seeded mulberry32 stream instead, so the draw is reproducible but not
 * identical to numpy's. Pre-register the written item-ID manifest
 * (`--plan-only`, then `--ids <manifest>`) rather than the RNG.
 */
import { seeded, shuffle } from "./rng";
import type { DatasetId, Item } from "./types";

/** Proportional allocation per stratum (largest remainder), then a seeded draw within each stratum. */
export function stratifiedSample(items: Item[], n: number, seed: number, salt: string): Item[] {
  if (n >= items.length) return [...items];
  const groups = new Map<string, Item[]>();
  for (const it of [...items].sort((a, b) => a.id.localeCompare(b.id))) {
    const g = groups.get(it.stratum) ?? [];
    g.push(it);
    groups.set(it.stratum, g);
  }
  const keys = [...groups.keys()].sort();
  const quotas = keys.map((k) => {
    const exact = (groups.get(k)!.length / items.length) * n;
    return { k, base: Math.floor(exact), rem: exact - Math.floor(exact) };
  });
  let left = n - quotas.reduce((a, q) => a + q.base, 0);
  const tieRng = seeded(seed, salt, "ties");
  const order = quotas.map((q) => ({ q, t: tieRng() })).sort((a, b) => b.q.rem - a.q.rem || a.t - b.t);
  for (const { q } of order) {
    if (left <= 0) break;
    if (q.base < groups.get(q.k)!.length) { q.base++; left--; }
  }
  const out: Item[] = [];
  for (const q of quotas) out.push(...shuffle(groups.get(q.k)!, seeded(seed, salt, q.k)).slice(0, q.base));
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export type Split = { test: Item[]; dev: Item[]; devOverlapsTest: boolean; notes: string[] };

export function makeSplit(pool: Item[], want: number | "all", devFrac: number, minDev: number, seed: number, ds: DatasetId): Split {
  const notes: string[] = [];
  const nTarget = want === "all" ? pool.length : want;
  const devN = Math.max(minDev, Math.round(devFrac * nTarget));
  if (want !== "all" && pool.length >= nTarget + devN) {
    const test = stratifiedSample(pool, nTarget, seed, `${ds}:test`);
    const ids = new Set(test.map((i) => i.id));
    const dev = stratifiedSample(pool.filter((i) => !ids.has(i.id)), devN, seed, `${ds}:dev`);
    return { test, dev, devOverlapsTest: false, notes };
  }
  // Not enough items for a disjoint dev split of the requested size: hold the dev split out of the pool.
  if (pool.length > devN + 1) {
    const dev = stratifiedSample(pool, devN, seed, `${ds}:dev`);
    const ids = new Set(dev.map((i) => i.id));
    const rest = pool.filter((i) => !ids.has(i.id));
    const test = stratifiedSample(rest, Math.min(nTarget, rest.length), seed, `${ds}:test`);
    if (test.length < nTarget) notes.push(`${ds}: ${test.length} test items (wanted ${nTarget}); ${dev.length} held out as the dev split.`);
    return { test, dev, devOverlapsTest: false, notes };
  }
  notes.push(`${ds}: pool too small (${pool.length}) for a separate dev split; dev = test (best-single choice is NOT held out).`);
  return { test: [...pool], dev: [...pool], devOverlapsTest: true, notes };
}

/** Mock-only filler so pilot/lean-sized dry runs work without the real datasets. Never used live. */
export function syntheticFill(ds: DatasetId, pool: Item[], need: number): Item[] {
  const strata = [...new Set(pool.map((i) => i.stratum))];
  if (!strata.length) strata.push("synthetic");
  const mc = ds === "gpqa-diamond";
  const out: Item[] = [];
  for (let k = 0; k < need; k++) {
    const n = String(k + 1).padStart(4, "0");
    out.push({
      dataset: ds,
      id: `synthetic-${ds}-${n}`,
      question: mc ? `Synthetic placeholder question ${n}.\nA) alpha\nB) beta\nC) gamma\nD) delta` : `Synthetic placeholder question ${n}?`,
      answer: mc ? "ABCD"[k % 4] : `answer ${n}`,
      answerType: mc || (ds === "hle-diamond" && k % 5 === 0) ? "mc" : "exact",
      stratum: strata[k % strata.length],
      hasImage: false,
      noReveal: ds === "hle-diamond" || ds === "gpqa-diamond",
      synthetic: true,
      meta: {},
    });
    if (ds === "hle-diamond" && k % 5 === 0) {
      out[k].answer = "ABCDE"[k % 5 === 0 ? (k / 5) % 5 : 0];
      out[k].question += "\nAnswer Choices:\nA. one\nB. two\nC. three\nD. four\nE. five";
    }
  }
  return out;
}
