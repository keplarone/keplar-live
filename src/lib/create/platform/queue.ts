/**
 * Durable background jobs.
 *
 * - Jobs with an Inngest function (INNGEST_JOBS, currently agent.run) go to Inngest when it is enabled (durable steps, retries,
 *   concurrency per workspace). Nothing below applies to them.
 * - Every other job (and every job without Inngest) is a row in the store (`queue_jobs`) before anything runs, so it survives the
 *   instance that queued it. It starts right after the response through Next's `after()` (Vercel keeps the function alive until it
 *   settles, up to the route's maxDuration); outside a request it starts at once.
 * - A running job holds a lease that a heartbeat extends. When an instance dies mid-job the lease expires and the reaper
 *   (reapJobs) starts it again: opportunistically when its owner reads job status, and from the daily cron. Each run is claimed with
 *   an atomic insert (`queue_claims`, one id per run), so two reapers never run the same attempt twice.
 * - A job that crashed `maxAttempts` times is marked failed and its `onGiveUp` hook runs (for media: the job shows as failed and
 *   nothing is charged). A handler may also yield (return { requeue: true }) when it is close to the time limit; the next read of
 *   its status or the cron continues it.
 */
import { INNGEST_JOBS, inngest, inngestEnabled } from "@/lib/inngest/client";
import { keepAlive } from "./after";
import { id as newId, now } from "./ids";
import { collection } from "./store";

export type JobContext = {
  /** 1 for the first run, then +1 for every resume (after a crash, a yield or a failed attempt). */
  run: number;
  /** True when an earlier run of this job started and did not finish (the instance died or the handler yielded). */
  resumed: boolean;
  /** Epoch ms by which this run should yield (return { requeue: true }) so it never outlives its function. */
  deadline: number;
  /** Extends the lease; long steps call it between provider polls (an automatic heartbeat also runs). */
  heartbeat: () => Promise<void>;
};
export type JobResult = void | { requeue: true; delayMs?: number };
type Handler = (payload: Record<string, unknown>, ctx: JobContext) => Promise<JobResult>;
export type JobOptions = {
  /** Crashed or failed runs before the job is given up (default 3). Yields don't count. */
  maxAttempts?: number;
  /** Lease length; a run whose lease lapsed is considered dead (default 90 s). */
  leaseMs?: number;
  /** Called once when the job is given up, with the last error. Never throws into the queue. */
  onGiveUp?: (payload: Record<string, unknown>, error: string) => Promise<void>;
};

export type QueueJob = {
  id: string;
  workspaceId: string;
  name: string;
  payload: Record<string, unknown>;
  status: "queued" | "running" | "failed";
  /** Runs started so far (each is claimed once in queue_claims). */
  runs: number;
  /** Runs that crashed (lease lapsed) or threw. */
  attempts: number;
  maxAttempts: number;
  leaseUntil: string | null;
  /** Not before this time. */
  runAfter: string;
  /** The reaper leaves a queued job alone until then (its own `after()` kick is still due). */
  orphanAfter: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
};
type Claim = { id: string; workspaceId: string; jobId: string; at: string };

export const queueJobs = () => collection<QueueJob>("queue_jobs");
const claims = () => collection<Claim>("queue_claims");

const handlers = new Map<string, { run: Handler; opts: JobOptions }>();
export const DEFAULT_LEASE_MS = 90_000;
/** A queued job whose kick never ran (the instance died before the response finished) is picked up this long after it was due. */
export const ORPHAN_GRACE_MS = 60_000;
/** Time one run may take before it should yield; under the 300 s maxDuration of the routes that run jobs. */
export const RUN_BUDGET_MS = 240_000;
/** Safety cap on resumes of one job (yields included), so nothing can loop forever. */
export const MAX_RUNS = 60;

export function defineJob(name: string, handler: Handler, opts: JobOptions = {}) {
  handlers.set(name, { run: handler, opts });
}

const iso = (ms: number) => new Date(ms).toISOString();
/** Unref'd: a pending retry never keeps a script or test process alive (inside a request, `after()` holds the function open). */
const sleep = (ms: number) => new Promise<void>((r) => (setTimeout(r, ms) as { unref?: () => void }).unref?.());

export async function enqueue(name: string, payload: Record<string, unknown>, opts: { delayMs?: number } = {}) {
  const event = INNGEST_JOBS[name];
  if (event && inngestEnabled()) {
    await inngest.send({ name: event, data: payload, ...(opts.delayMs ? { ts: Date.now() + opts.delayMs } : {}) });
    return;
  }
  const h = handlers.get(name);
  if (!h) throw new Error(`No job handler registered for "${name}"`);
  const t = Date.now();
  const delay = Math.max(0, opts.delayMs ?? 0);
  const job: QueueJob = {
    id: newId("job"),
    workspaceId: typeof payload.workspaceId === "string" && payload.workspaceId ? payload.workspaceId : "system",
    name,
    payload,
    status: "queued",
    runs: 0,
    attempts: 0,
    maxAttempts: Math.max(1, h.opts.maxAttempts ?? 3),
    leaseUntil: null,
    runAfter: iso(t + delay),
    orphanAfter: iso(t + delay + ORPHAN_GRACE_MS),
    createdAt: iso(t),
    updatedAt: iso(t),
  };
  await queueJobs().insert(job);
  kick(job.workspaceId, job.id, delay);
  return job.id;
}

/** Start (or continue) one job after the response, or now outside a request. */
function kick(workspaceId: string, jobId: string, delayMs = 0) {
  keepAlive(async () => {
    if (delayMs > 0) await sleep(delayMs);
    await runJob(workspaceId, jobId);
  }, "queue job");
}

async function giveUp(job: QueueJob, error: string) {
  await queueJobs().update(job.workspaceId, job.id, { status: "failed", leaseUntil: null, error: error.slice(0, 500), updatedAt: now() });
  const onGiveUp = handlers.get(job.name)?.opts.onGiveUp;
  if (onGiveUp) await onGiveUp(job.payload, error).catch((e) => console.error(`[queue] ${job.name} give-up hook failed`, e instanceof Error ? e.message : e));
}

/**
 * Run one stored job if it is due and nobody holds it. Returns what happened (tests and the reaper's report).
 * Safe to call from several instances at once: the per-run claim lets exactly one of them start the run.
 */
export async function runJob(workspaceId: string, jobId: string, at = Date.now(), deadline?: number): Promise<"ran" | "requeued" | "failed" | "gave_up" | "busy" | "not_due" | "missing"> {
  const job = await queueJobs().get(workspaceId, jobId);
  if (!job || job.status === "failed") return "missing";
  const h = handlers.get(job.name);
  if (!h) return "missing"; // a job for a handler this build doesn't know; left for a build that does
  if (job.status === "running" && job.leaseUntil && Date.parse(job.leaseUntil) > at) return "busy";
  if (job.status === "queued" && Date.parse(job.runAfter) > at) return "not_due";
  // A "running" job whose lease lapsed died with its instance: that counts as a failed attempt.
  const attempts = job.attempts + (job.status === "running" ? 1 : 0);
  if (attempts >= job.maxAttempts) {
    await giveUp(job, job.error ?? "The job stopped before it finished.");
    return "gave_up";
  }
  if (job.runs >= MAX_RUNS) {
    await giveUp(job, "The job took too many steps.");
    return "gave_up";
  }
  const run = job.runs + 1;
  const claim = await claims().insertIfAbsent({ id: `${job.id}#${run}`, workspaceId: job.workspaceId, jobId: job.id, at: iso(at) });
  if (!claim.inserted) return "busy";
  const leaseMs = h.opts.leaseMs ?? DEFAULT_LEASE_MS;
  const lease = () => iso(Date.now() + leaseMs);
  await queueJobs().update(job.workspaceId, job.id, { status: "running", runs: run, attempts, leaseUntil: lease(), updatedAt: now() });
  const heartbeat = async () => {
    await queueJobs().update(job.workspaceId, job.id, { leaseUntil: lease(), updatedAt: now() }).catch(() => null);
  };
  const beat = setInterval(() => void heartbeat(), Math.max(1_000, Math.floor(leaseMs / 3)));
  (beat as { unref?: () => void }).unref?.();
  try {
    const result = await h.run(job.payload, { run, resumed: job.runs > 0, deadline: Math.min(Date.now() + RUN_BUDGET_MS, deadline ?? Infinity), heartbeat });
    clearInterval(beat);
    if (result && result.requeue) {
      const due = Date.now() + Math.max(0, result.delayMs ?? 0);
      // Yielded close to the time limit: no kick from here (this function is about to end). Status reads and the cron continue it.
      await queueJobs().update(job.workspaceId, job.id, { status: "queued", leaseUntil: null, runAfter: iso(due), orphanAfter: iso(due), updatedAt: now() });
      return "requeued";
    }
    await queueJobs().remove(job.workspaceId, job.id);
    return "ran";
  } catch (err) {
    clearInterval(beat);
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[queue] job ${job.name} failed (attempt ${attempts + 1}/${job.maxAttempts})`, message);
    if (attempts + 1 >= job.maxAttempts) {
      await giveUp({ ...job, attempts: attempts + 1 }, message);
      return "failed";
    }
    const backoff = 15_000 * 2 ** attempts;
    const due = Date.now() + backoff;
    await queueJobs().update(job.workspaceId, job.id, { status: "queued", attempts: attempts + 1, leaseUntil: null, error: message.slice(0, 500), runAfter: iso(due), orphanAfter: iso(due + ORPHAN_GRACE_MS), updatedAt: now() });
    kick(job.workspaceId, job.id, backoff);
    return "requeued";
  }
}

/** Jobs that should be running but aren't: queued and past their grace time, or running with a lapsed lease. */
export function isStuck(j: QueueJob, at = Date.now()): boolean {
  if (j.status === "queued") return Date.parse(j.orphanAfter ?? j.runAfter) <= at;
  if (j.status === "running") return !j.leaseUntil || Date.parse(j.leaseUntil) <= at;
  return false;
}

/**
 * Requeue (run again) or fail stuck jobs. Scoped to one workspace when `workspaceId` is given (opportunistic, on status reads),
 * otherwise every workspace (the daily cron). Runs them one after another until `deadline`; returns per-job outcomes.
 */
export async function reapJobs(opts: { workspaceId?: string; limit?: number; deadline?: number; at?: number } = {}) {
  const at = opts.at ?? Date.now();
  const rows = opts.workspaceId ? await queueJobs().list(opts.workspaceId) : await queueJobs().listSystem();
  const stuck = rows.filter((j) => isStuck(j, at)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, opts.limit ?? 10);
  const out: { id: string; name: string; outcome: Awaited<ReturnType<typeof runJob>> }[] = [];
  for (const j of stuck) {
    if (opts.deadline && Date.now() > opts.deadline) break;
    out.push({ id: j.id, name: j.name, outcome: await runJob(j.workspaceId, j.id, at, opts.deadline).catch(() => "busy" as const) });
  }
  return out;
}

const lastReap = new Map<string, number>();
/**
 * Cheap trigger for status reads: at most every 10 s per workspace per instance, and only after the response.
 * The stuck-job check is one indexed read of the workspace's (normally empty) queue.
 */
export function reapSoon(workspaceId: string, at = Date.now()): void {
  if (at - (lastReap.get(workspaceId) ?? 0) < 10_000) return;
  lastReap.set(workspaceId, at);
  if (lastReap.size > 10_000) lastReap.clear();
  keepAlive(() => reapJobs({ workspaceId, limit: 3, deadline: Date.now() + RUN_BUDGET_MS }), "queue reaper");
}
export const resetReapClock = () => lastReap.clear();
