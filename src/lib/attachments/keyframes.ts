/**
 * Scene-aware keyframe choice (pure). The browser samples more candidate frames than it sends, records a tiny 16×9 luma
 * signature for each, and this picks the frames that best cover the clip: the biggest visual changes (cuts, new slides,
 * new scenes) win, with a minimum spacing so one busy moment can't take every slot, and the gaps are filled evenly.
 */

/** Mean absolute difference between two luma signatures (0..255). */
export function sigDiff(a: Uint8Array | number[], b: Uint8Array | number[]): number {
  let d = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) d += Math.abs(a[i] - b[i]);
  return n ? d / n : 0;
}

/** Indices (ascending) of the `n` candidates to keep. */
export function selectKeyframes(sigs: (Uint8Array | number[])[], times: number[], n: number): number[] {
  const m = sigs.length;
  if (m <= n) return sigs.map((_, i) => i);
  const change = sigs.map((s, i) => (i === 0 ? Infinity : sigDiff(s, sigs[i - 1])));
  const span = (times[m - 1] - times[0]) || 1;
  const minGap = (span / n) * 0.45;
  const chosen = new Set<number>([0]);
  // Biggest changes first, respecting the spacing.
  const byChange = change.map((c, i) => ({ c, i })).filter((x) => x.i > 0 && x.c >= 6).sort((a, b) => b.c - a.c);
  for (const { i } of byChange) {
    if (chosen.size >= Math.ceil(n * 0.7)) break;
    if ([...chosen].every((j) => Math.abs(times[j] - times[i]) >= minGap)) chosen.add(i);
  }
  // Fill: repeatedly take the candidate farthest (in time) from everything chosen.
  while (chosen.size < n) {
    let best = -1, bestGap = -1;
    for (let i = 0; i < m; i++) {
      if (chosen.has(i)) continue;
      const gap = Math.min(...[...chosen].map((j) => Math.abs(times[j] - times[i])));
      if (gap > bestGap) { best = i; bestGap = gap; }
    }
    if (best < 0) break;
    chosen.add(best);
  }
  return [...chosen].sort((a, b) => a - b);
}

/** Candidate count for a clip that will send `n` frames. */
export const candidatesFor = (n: number) => Math.min(40, Math.round(n * 2.5));
