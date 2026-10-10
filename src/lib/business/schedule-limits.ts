/**
 * What each plan may schedule, and what the server can honestly deliver.
 *
 * Plan limits (enforced when a schedule is saved, and again when a slot is about to run):
 *   - fastest cadence: Plus daily, Pro hourly, Business every 15 minutes; Free and Lite have no agents at all (so scheduled runs never
 *     touch the shared Free pool: they only run on a paid plan, with the paid plan's own Usage allowance and per-agent caps)
 *   - scheduled runs per day across the workspace (all agents together)
 *   - agents per plan: ENTITLEMENTS[plan].agents (3 / 10 / 50)
 *
 * Delivery limits, by driver (src/lib/business/scheduler.ts):
 *   - Inngest (INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY): a tick every 5 minutes, so a slot runs within about 5 minutes of its time.
 *   - Vercel Cron only (always on, /api/cron/agents): the Hobby plan runs a cron at most ONCE A DAY, at a time Vercel picks within the
 *     hour; Pro can run it every minute. With the daily cron alone, an agent runs once a day at the first check after its slot, so a
 *     schedule faster than daily still produces at most one run per day. `effectiveCadence` says so in the UI instead of promising more.
 */
import type { PlanId } from "@/lib/create/platform/plans";

export const MIN_INTERVAL_MINUTES: Record<PlanId, number> = { free: Infinity, lite: Infinity, plus: 1440, pro: 60, business: 15 };
export const SCHEDULED_RUNS_PER_DAY: Record<PlanId, number> = { free: 0, lite: 0, plus: 12, pro: 96, business: 480 };

export const minIntervalFor = (plan: PlanId) => MIN_INTERVAL_MINUTES[plan] ?? Infinity;

export function cadenceName(minutes: number): string {
  if (!Number.isFinite(minutes)) return "no scheduled agents";
  if (minutes >= 1440) return "once a day";
  if (minutes >= 60) return "hourly";
  return `every ${minutes} minutes`;
}

export type Driver = "inngest" | "vercel-cron";
/** Which driver is firing schedules. "inngest" has its own 5-minute tick; the daily Vercel cron is always the catch-all. */
export function scheduleDriver(inngestOn: boolean): Driver {
  return inngestOn ? "inngest" : "vercel-cron";
}

/** The honest statement shown beside a schedule. */
export function effectiveCadence(driver: Driver, vercelCronMinutes = Number(process.env.KEPLAR_VERCEL_CRON_MINUTES) || 1440): { precisionMinutes: number; note: string } {
  if (driver === "inngest") return { precisionMinutes: 5, note: "Agents run within about 5 minutes of the time you set." };
  if (vercelCronMinutes >= 1440) return { precisionMinutes: 1440, note: "Agents run once a day, within the hour you set. A schedule more frequent than daily still runs once a day for now." };
  return { precisionMinutes: vercelCronMinutes, note: `Agents run within about ${vercelCronMinutes} minutes of the time you set.` };
}

/** How far back the Vercel Cron check looks for a slot that has not run: 24 h by default (the Hobby plan's once-a-day cron), 1 h when Inngest ticks too. */
export function cronWindowMinutes(env: Record<string, string | undefined> = process.env, inngestOn = false): number {
  const n = Number(env.KEPLAR_AGENT_CRON_WINDOW_MINUTES);
  if (Number.isFinite(n) && n >= 5 && n <= 24 * 60) return Math.floor(n);
  return inngestOn ? 60 : 24 * 60;
}
