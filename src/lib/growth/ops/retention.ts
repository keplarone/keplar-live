/**
 * Usage retention from first-party product events (growth_events): consenting browsers only, keyed by the random per-browser id,
 * never an account. So these are lower bounds for real activity (visitors who declined analytics are invisible), and the
 * Command Center says so.
 *
 *  - Active browsers: distinct browsers that started a question on the day / in the last 7 / 30 days (DAU, WAU, MAU).
 *  - Weekly cohorts: browsers grouped by the ISO week of their first question; a cohort is "retained in week n" when a browser asked
 *    again n weeks later. Week 0 is always 100%.
 * Pure functions (unit-tested); the job reads the events and stores the result.
 */
import { isoWeek } from "./runner";

export type ActivityRow = { vid: string; at: string; event: string };

const DAY = 864e5;

export function activeCounts(rows: ActivityRow[], now: Date): { dau: number; wau: number; mau: number; stickiness: number | null } {
  const t = now.getTime();
  const within = (ms: number) => new Set(rows.filter((r) => r.event === "ask_started" && t - Date.parse(r.at) < ms && Date.parse(r.at) <= t).map((r) => r.vid)).size;
  const dau = within(DAY);
  const wau = within(7 * DAY);
  const mau = within(30 * DAY);
  return { dau, wau, mau, stickiness: mau ? Math.round((dau / mau) * 1000) / 1000 : null };
}

const weekStart = (d: Date) => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() || 7) - 1));
  return t.getTime();
};

export type Cohort = { week: string; size: number; retained: (number | null)[] };

/** Weekly cohorts by first question, up to `weeks` weeks after. A week that hasn't ended yet for a cohort is null, not 0. */
export function weeklyCohorts(rows: ActivityRow[], now: Date, weeks = 8): Cohort[] {
  const asks = rows.filter((r) => r.event === "ask_started").map((r) => ({ vid: r.vid, t: Date.parse(r.at) })).filter((r) => Number.isFinite(r.t));
  const first = new Map<string, number>();
  for (const r of asks) first.set(r.vid, Math.min(first.get(r.vid) ?? Infinity, r.t));
  const activeWeeks = new Map<string, Set<number>>();
  for (const r of asks) {
    const n = Math.floor((weekStart(new Date(r.t)) - weekStart(new Date(first.get(r.vid)!))) / (7 * DAY));
    (activeWeeks.get(r.vid) ?? activeWeeks.set(r.vid, new Set()).get(r.vid)!).add(n);
  }
  const byWeek = new Map<number, string[]>();
  for (const [vid, t] of first) (byWeek.get(weekStart(new Date(t))) ?? byWeek.set(weekStart(new Date(t)), []).get(weekStart(new Date(t)))!).push(vid);
  const current = weekStart(now);
  return [...byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([ws, vids]) => {
    const elapsed = Math.floor((current - ws) / (7 * DAY));
    const retained = Array.from({ length: weeks + 1 }, (_, n) => {
      if (n > elapsed) return null;
      const k = vids.filter((v) => activeWeeks.get(v)?.has(n)).length;
      return Math.round((k / vids.length) * 1000) / 1000;
    });
    return { week: isoWeek(new Date(ws)), size: vids.length, retained };
  });
}
