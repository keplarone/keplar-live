/**
 * Keplar Growth Intelligence: the job runner behind /api/cron/growth (one Vercel Cron a day; weekly and monthly jobs run on their day).
 *
 * Each job, per period (day, ISO week or month):
 *  - runs at most once: an atomic claim on `growth_job_runs` (<job>:<period>), the same exactly-once claim the billing webhooks use;
 *    a run stuck "processing" past STALE_MS (a crashed function) is taken over by exactly one later call;
 *  - is skipped, and says why, when growth jobs are paused (all or this job), the global stop is on, or its configuration is
 *    missing (a key it needs, or a spend budget of 0): nothing that needs a credential or money runs without one;
 *  - runs under a timeout, with one retry after a short wait for a thrown error;
 *  - records its outcome (ok / failed / skipped, a short summary, spend, duration, error class). The run rows are the audit trail.
 * A failure alerts the owner (email/webhook) and releases the claim, so the next call (the next day, or "Run now") retries it.
 * Jobs never touch customers' data beyond aggregate reads, and never spend beyond their own budget.
 */
import { collection } from "@/lib/create/platform/store";
import { claimEvent, finishEvent, releaseEvent, type ClaimRow } from "@/lib/billing/event-claim";
import { opsControls } from "@/lib/ops/controls";
import { alertOwner } from "@/lib/accounts/alerts";

export type Cadence = "daily" | "weekly" | "monthly";

export type JobContext = {
  now: Date;
  period: string;
  /** Aborts when the job's timeout is reached. Pass it to every fetch. */
  signal: AbortSignal;
  /** USD this run may spend (0 for jobs that spend nothing). */
  budgetUsd: number;
};

export type JobResult = { summary: string; costUsd?: number; data?: Record<string, unknown> };

export type GrowthJob = {
  id: string;
  label: string;
  cadence: Cadence;
  /** What the job reads and writes, shown on the Command Center. */
  description: string;
  timeoutMs: number;
  /** Max USD per run. Jobs that call paid APIs read it from the environment and are skipped at 0. */
  budgetUsd?: () => number;
  /** A reason the job can't run here (missing key, budget 0), or null when it can. */
  requires?: () => string | null;
  run: (ctx: JobContext) => Promise<JobResult>;
};

export type RunStatus = "ok" | "failed" | "skipped";
export type RunRow = ClaimRow & {
  job: string;
  period: string;
  status?: RunStatus;
  summary?: string;
  costUsd?: number;
  durationMs?: number;
  error?: string;
  finishedAt?: string;
  data?: Record<string, unknown>;
};

export type GrowthControls = { id: string; workspaceId: string; paused: boolean; pausedJobs: string[]; updatedAt: string; updatedBy: string };

const SYSTEM = "system";
const runs = () => collection<RunRow>("growth_job_runs");
const controlsRows = () => collection<GrowthControls>("growth_controls");

/* ─────────────── periods ─────────────── */

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** ISO 8601 week, e.g. "2026-W43". */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export const periodOf = (cadence: Cadence, d: Date) => (cadence === "daily" ? isoDay(d) : cadence === "weekly" ? isoWeek(d) : isoDay(d).slice(0, 7));

/** Weekly jobs run on Mondays (UTC), monthly jobs on the 1st. A manual run ignores the day. */
export function isDue(cadence: Cadence, d: Date): boolean {
  if (cadence === "daily") return true;
  if (cadence === "weekly") return d.getUTCDay() === 1;
  return d.getUTCDate() === 1;
}

/* ─────────────── controls ─────────────── */

export async function growthControls(): Promise<GrowthControls> {
  return (await controlsRows().get(SYSTEM, "controls").catch(() => null)) ?? { id: "controls", workspaceId: SYSTEM, paused: false, pausedJobs: [], updatedAt: new Date(0).toISOString(), updatedBy: "" };
}

export async function setGrowthControls(patch: Partial<Pick<GrowthControls, "paused" | "pausedJobs">>, by: string): Promise<GrowthControls> {
  const cur = await growthControls();
  const next: GrowthControls = { ...cur, ...patch, pausedJobs: [...new Set(patch.pausedJobs ?? cur.pausedJobs)].slice(0, 50), updatedAt: new Date().toISOString(), updatedBy: by };
  if (await controlsRows().get(SYSTEM, "controls")) await controlsRows().update(SYSTEM, "controls", next);
  else await controlsRows().insert(next);
  return next;
}

/* ─────────────── running ─────────────── */

const RETRY_WAIT_MS = 2000;

async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    // Reject first, then abort: the race must settle with the timeout, not with the job's own reaction to the abort.
    timer = setTimeout(() => { reject(Object.assign(new Error(`timed out after ${ms} ms`), { name: "TimeoutError" })); ctl.abort(); }, ms);
  });
  try {
    return await Promise.race([fn(ctl.signal), expired]);
  } finally {
    clearTimeout(timer);
  }
}

export type RunOutcome = { job: string; period: string; status: RunStatus | "already-ran"; summary: string; costUsd?: number; durationMs?: number };

/**
 * Runs one job for its current period. `force` (a manual "Run now") ignores the weekday/month-day check but never the claim, the
 * pause, the global stop or a missing configuration.
 */
export async function runJob(job: GrowthJob, opts: { now?: Date; force?: boolean; sleep?: (ms: number) => Promise<void> } = {}): Promise<RunOutcome> {
  const now = opts.now ?? new Date();
  const period = periodOf(job.cadence, now);
  const id = `${job.id}:${period}`;
  const skip = async (summary: string): Promise<RunOutcome> => {
    // A skip is recorded but never claims the period: the job runs once the reason is gone.
    await runs().insert({ id: `${id}:skip:${now.getTime()}`, workspaceId: SYSTEM, type: "skip", at: now.toISOString(), result: "skipped", job: job.id, period, status: "skipped", summary, finishedAt: now.toISOString() }).catch(() => undefined);
    return { job: job.id, period, status: "skipped", summary };
  };
  if (!opts.force && !isDue(job.cadence, now)) return { job: job.id, period, status: "skipped", summary: "Not due today." };
  const controls = await growthControls();
  if (controls.paused) return skip("Growth jobs are paused.");
  if (controls.pausedJobs.includes(job.id)) return skip("This job is paused.");
  const ops = await opsControls().catch(() => null);
  if (ops?.globalStop || process.env.KEPLAR_GLOBAL_STOP === "1") return skip("The global stop is on.");
  const missing = job.requires?.() ?? null;
  if (missing) return skip(missing);
  const budgetUsd = Math.max(0, job.budgetUsd?.() ?? 0);

  const claim = await claimEvent(runs(), { id, workspaceId: SYSTEM, type: "run", job: job.id, period } as Omit<RunRow, "result" | "at" | "attempt">, now.toISOString());
  if (!claim.claimed) return { job: job.id, period, status: "already-ran", summary: `Already ${claim.result} for ${period}.` };

  const started = Date.now();
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await withTimeout(job.timeoutMs, (signal) => job.run({ now, period, signal, budgetUsd }));
      const durationMs = Date.now() - started;
      await finishEvent(runs(), SYSTEM, id, "ok");
      await runs().update(SYSTEM, id, { status: "ok", summary: r.summary.slice(0, 500), costUsd: r.costUsd ?? 0, durationMs, finishedAt: new Date().toISOString(), ...(r.data ? { data: r.data } : {}) });
      return { job: job.id, period, status: "ok", summary: r.summary, costUsd: r.costUsd ?? 0, durationMs };
    } catch (e) {
      lastError = e;
      // A timeout is not retried inside the same invocation: it would only time out again.
      if ((e as Error)?.name === "TimeoutError" || attempt === 1) break;
      await sleep(RETRY_WAIT_MS);
    }
  }
  const durationMs = Date.now() - started;
  const errorName = lastError instanceof Error ? lastError.name : "Error";
  const message = lastError instanceof Error ? lastError.message.slice(0, 200) : "failed";
  // The failure is logged as its own row, and the claim is released so the next call retries the period.
  await runs().insert({ id: `${id}:fail:${now.getTime()}`, workspaceId: SYSTEM, type: "fail", at: now.toISOString(), result: "failed", job: job.id, period, status: "failed", summary: message, durationMs, error: errorName, finishedAt: new Date().toISOString() }).catch(() => undefined);
  await releaseEvent(runs(), SYSTEM, id);
  await alertOwner(`Growth job failed: ${job.label}`, `${job.id} (${period}) failed after ${durationMs} ms: ${errorName}: ${message}`).catch(() => undefined);
  return { job: job.id, period, status: "failed", summary: message, durationMs };
}

/** Every job due today, one after another (a slow job can't starve the others of the function's time: each has its own timeout). */
export async function runDue(jobs: GrowthJob[], opts: { now?: Date } = {}): Promise<RunOutcome[]> {
  const out: RunOutcome[] = [];
  for (const job of jobs) out.push(await runJob(job, opts));
  return out;
}

/** Recent runs, newest first, for the Command Center. */
export async function recentRuns(limit = 60): Promise<RunRow[]> {
  const all = await runs().list(SYSTEM);
  return all.filter((r) => r.status || r.result === "processing").sort((a, b) => (b.finishedAt ?? b.at).localeCompare(a.finishedAt ?? a.at)).slice(0, limit);
}

/** The latest finished "ok" run of a job, with its data. */
export async function latestOk(job: string): Promise<RunRow | null> {
  const all = await runs().list(SYSTEM, (r) => r.job === job && r.status === "ok");
  return all.sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""))[0] ?? null;
}
