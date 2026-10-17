/**
 * Pure geometry for the Business dashboard charts (TimeChart.tsx), after Space Studio's dashboard (renderer/dashboard/chart.ts).
 * Everything is computed in pixel space from real points only: no resampling and no filling in.
 */

export const DAY = 86_400_000;

export type TPoint = { t: number; v: number };
export type XY = { x: number; y: number };

/** Round axis ticks from 0: steps of 1, 2, 2.5 or 5 x 10^n, at least `minTop` high (so 3 views don't fill the chart). */
export function niceTicks(max: number, count = 4, minTop = 4): number[] {
  const m = Math.max(max, minTop);
  const raw = m / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * pow).find((s) => s >= raw) ?? 10 * pow;
  const top = Math.ceil(m / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(+v.toFixed(6));
  return ticks;
}

/** 1.2K, 34K, 1.5M: axis labels. */
export function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${+(n / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${+(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${+(n / 1e3).toFixed(0)}K`;
  if (a >= 1e3) return `${+(n / 1e3).toFixed(1)}K`;
  return `${+n.toFixed(a < 10 && n % 1 ? 1 : 0)}`;
}

/** A day key ("2026-10-12") as local midnight, so labels never shift a day across time zones. */
export function dayStart(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).getTime();
}

const md = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const wmd = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
export const dayLabel = (t: number) => md.format(new Date(t));
export const dayLabelLong = (t: number) => wmd.format(new Date(t));

/**
 * A smooth path through the points using monotone cubic interpolation (Fritsch-Carlson), which never overshoots: the curve
 * between two samples stays between their values, so it can't invent a peak or dip that wasn't measured.
 */
export function buildPaths(px: XY[], baseline: number): { line: string; area: string; dots: string } {
  const f = (n: number) => n.toFixed(2);
  if (!px.length) return { line: "", area: "", dots: "" };
  if (px.length === 1) {
    const p = px[0]!;
    return { line: "", area: "", dots: `M${f(p.x - 2.6)},${f(p.y)}a2.6,2.6 0 1,0 5.2,0a2.6,2.6 0 1,0 -5.2,0` };
  }
  const line = monotone(px);
  const area = `${line}L${f(px[px.length - 1]!.x)},${f(baseline)}L${f(px[0]!.x)},${f(baseline)}Z`;
  return { line, area, dots: "" };
}

function monotone(p: XY[]): string {
  const n = p.length;
  const f = (v: number) => v.toFixed(2);
  if (n === 2) return `M${f(p[0]!.x)},${f(p[0]!.y)}L${f(p[1]!.x)},${f(p[1]!.y)}`;
  const dx: number[] = [];
  const s: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = p[i + 1]!.x - p[i]!.x || 1e-6;
    dx.push(h);
    s.push((p[i + 1]!.y - p[i]!.y) / h);
  }
  const m: number[] = [s[0]!];
  for (let i = 1; i < n - 1; i++) {
    if (s[i - 1]! * s[i]! <= 0) m.push(0);
    else {
      const w1 = 2 * dx[i]! + dx[i - 1]!;
      const w2 = dx[i]! + 2 * dx[i - 1]!;
      m.push((w1 + w2) / (w1 / s[i - 1]! + w2 / s[i]!));
    }
  }
  m.push(s[n - 2]!);
  let d = `M${f(p[0]!.x)},${f(p[0]!.y)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i]!;
    d += `C${f(p[i]!.x + h / 3)},${f(p[i]!.y + (m[i]! * h) / 3)} ${f(p[i + 1]!.x - h / 3)},${f(p[i + 1]!.y - (m[i + 1]! * h) / 3)} ${f(p[i + 1]!.x)},${f(p[i + 1]!.y)}`;
  }
  return d;
}

/** Index of the point nearest to x (points sorted by x). */
export function nearest(px: XY[], x: number): number {
  if (!px.length) return -1;
  let lo = 0;
  let hi = px.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (px[mid]!.x < x) lo = mid;
    else hi = mid;
  }
  return Math.abs(px[lo]!.x - x) <= Math.abs(px[hi]!.x - x) ? lo : hi;
}

export const easeOut = (p: number) => 1 - Math.pow(1 - p, 4);
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
