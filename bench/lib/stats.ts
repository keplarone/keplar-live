/** Statistics (plan §3, §4.6): bootstrap CIs, paired tests, Holm, calibration, selective accuracy. */
import { mulberry32 } from "./rng";

export const BOOTSTRAP_RESAMPLES = 10_000;

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export type CI = { estimate: number; lo: number; hi: number };

/** Percentile bootstrap over items (seeded). */
export function bootstrapMeanCI(xs: number[], seed: number, resamples = BOOTSTRAP_RESAMPLES, alpha = 0.05): CI {
  const n = xs.length;
  if (!n) return { estimate: NaN, lo: NaN, hi: NaN };
  const rng = mulberry32(seed);
  const stats = new Float64Array(resamples);
  for (let b = 0; b < resamples; b++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += xs[Math.floor(rng() * n)];
    stats[b] = s / n;
  }
  const sorted = Array.from(stats).sort((a, b) => a - b);
  return { estimate: mean(xs), lo: quantile(sorted, alpha / 2), hi: quantile(sorted, 1 - alpha / 2) };
}

/** Wilson score interval (reported alongside the bootstrap for small n). */
export function wilson(k: number, n: number, z = 1.96): CI {
  if (!n) return { estimate: NaN, lo: NaN, hi: NaN };
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const w = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { estimate: p, lo: Math.max(0, c - w), hi: Math.min(1, c + w) };
}

/** Paired bootstrap of the mean difference a − b over the same items. */
export function pairedBootstrapCI(a: number[], b: number[], seed: number, resamples = BOOTSTRAP_RESAMPLES): CI {
  if (a.length !== b.length) throw new Error("paired arrays differ in length");
  return bootstrapMeanCI(a.map((x, i) => x - b[i]), seed, resamples);
}

function logChoose(n: number, k: number): number {
  let s = 0;
  for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i);
  return s;
}

/** Exact two-sided McNemar test on discordant pairs (b = a right & b wrong, c = a wrong & b right). */
export function mcnemarExact(b: number, c: number): number {
  const n = b + c;
  if (n === 0) return 1;
  const k = Math.min(b, c);
  let p = 0;
  for (let i = 0; i <= k; i++) p += Math.exp(logChoose(n, i) - n * Math.LN2);
  return Math.min(1, 2 * p);
}

/** Holm step-down adjusted p-values (same order as input). */
export function holm(ps: number[]): number[] {
  const idx = ps.map((p, i) => ({ p, i })).sort((x, y) => x.p - y.p);
  const m = ps.length;
  const adj = new Array<number>(m);
  let running = 0;
  idx.forEach(({ p, i }, r) => {
    running = Math.max(running, Math.min(1, (m - r) * p));
    adj[i] = running;
  });
  return adj;
}

/* ─────────────────────────── calibration ─────────────────────────── */

export type Bin = { lo: number; hi: number; n: number; meanConf: number; accuracy: number; gap: number };

/** Equal-width reliability table (10 bins, plan §3). Confidence 1.0 goes in the top bin. */
export function reliabilityTable(conf: number[], correct: number[], bins = 10): Bin[] {
  const out: Bin[] = [];
  for (let k = 0; k < bins; k++) {
    const lo = k / bins;
    const hi = (k + 1) / bins;
    const ids = conf.map((c, i) => i).filter((i) => (k === bins - 1 ? conf[i] >= lo && conf[i] <= hi : conf[i] >= lo && conf[i] < hi));
    const mc = mean(ids.map((i) => conf[i]));
    const acc = mean(ids.map((i) => correct[i]));
    out.push({ lo, hi, n: ids.length, meanConf: ids.length ? mc : NaN, accuracy: ids.length ? acc : NaN, gap: ids.length ? Math.abs(acc - mc) : NaN });
  }
  return out;
}

export function ece(conf: number[], correct: number[], bins = 10): number {
  const n = conf.length;
  if (!n) return NaN;
  return reliabilityTable(conf, correct, bins).reduce((a, b) => a + (b.n ? (b.n / n) * b.gap : 0), 0);
}

/** Adaptive (equal-mass) ECE. */
export function adaptiveEce(conf: number[], correct: number[], bins = 10): number {
  const n = conf.length;
  if (!n) return NaN;
  const order = conf.map((c, i) => i).sort((a, b) => conf[a] - conf[b]);
  let total = 0;
  for (let k = 0; k < bins; k++) {
    const ids = order.slice(Math.floor((k * n) / bins), Math.floor(((k + 1) * n) / bins));
    if (!ids.length) continue;
    total += (ids.length / n) * Math.abs(mean(ids.map((i) => correct[i])) - mean(ids.map((i) => conf[i])));
  }
  return total;
}

export const brier = (conf: number[], correct: number[]) => mean(conf.map((c, i) => (c - correct[i]) ** 2));

/** Accuracy on the most-confident fraction of items, and the area under the risk–coverage curve. */
export function selective(conf: number[], correct: number[]): { at50: number; at80: number; at100: number; aurc: number } {
  const n = conf.length;
  if (!n) return { at50: NaN, at80: NaN, at100: NaN, aurc: NaN };
  const order = conf.map((c, i) => i).sort((a, b) => conf[b] - conf[a] || a - b);
  const accAt = (f: number) => {
    const k = Math.max(1, Math.round(f * n));
    return mean(order.slice(0, k).map((i) => correct[i]));
  };
  let risk = 0;
  let cum = 0;
  order.forEach((i, r) => {
    cum += correct[i];
    risk += 1 - cum / (r + 1);
  });
  return { at50: accAt(0.5), at80: accAt(0.8), at100: accAt(1), aurc: risk / n };
}

export function percentile(xs: number[], q: number): number {
  return quantile([...xs].sort((a, b) => a - b), q);
}
