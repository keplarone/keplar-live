/**
 * Blender Cloud worker: watches a job's render machine in bounded slices on Keplar's servers (src/lib/blender-cloud/model.ts).
 *
 * Blender renders on the machine by itself; a slice only looks every few seconds: which frames are written, how far the
 * current one is, whether Blender stopped. It charges the machine time as it goes (real minutes at RENDER_CREDIT_RATE), honors
 * pause and stop, stops at the person's budget or time limit, and starts the render again on a fresh session for the frames
 * still missing when a machine session ends (sessions are capped, 45 minutes on Vercel Hobby). When the frames are done it can
 * join them into a video, then stops the machine: its files are kept for download. A slice that dies leaves a lease that expires;
 * the next status poll or the daily cron picks the job up again (the render keeps going on the machine meanwhile).
 */
import { randomUUID } from "node:crypto";
import { withCostTag } from "@/lib/cost/context";
import { assertCanSpend, chargeUnits, CreditLimitError, USD_PER_UNIT } from "@/lib/create/platform/compute";
import { workspaceById, type Workspace } from "@/lib/create/platform/workspace";
import { STUDIO_PLANS } from "@/lib/desktop/studio-bridge";
import { SPACE_CLOUD_ENDED, SPACE_PRODUCT, spaceJobMayRun } from "@/lib/space-studio/cloud";
import { addCloudMinutes } from "@/lib/space-studio/store";
import { workerBase } from "@/lib/roblox-cloud/worker";
import { encodeScript, killScript, parsePoll, pollScript, readLog, renderScript, sandboxMachines, type Machine, type Machines, type Poll } from "./machine";
import { frameList, frameOf, isActive, jobs, logEntry, machineSpec, RENDER_CREDIT_RATE, RENDER_LIMITS, SYSTEM_WS, system, usdPerMachineMinute, type OutputFile, type RenderJob, type RenderStatus } from "./model";

export type WorkerDeps = {
  machines?: Machines;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  trigger?: (job: Pick<RenderJob, "id" | "workspaceId">) => Promise<void>;
  /** Charges credits for machine time (default: the credit ledger). Throws CreditLimitError when the account is out. */
  charge?: (ws: Workspace, units: number, usd: number, jobId: string) => Promise<void>;
  sliceMs?: number;
  pollMs?: number;
};

const iso = (ms: number) => new Date(ms).toISOString();
const ACTION = "agent.blender_render";
/** Credits a job keeps in hand: it stops when less than this is left of its budget. */
const RESERVE_UNITS = 10;
const MAX_RESTARTS = 60;

export const unitsPerMinute = (vcpus: number) => (usdPerMachineMinute(vcpus) * RENDER_CREDIT_RATE) / USD_PER_UNIT;
export const monthKey = (ms: number) => `month:${new Date(ms).toISOString().slice(0, 7)}`;

async function defaultCharge(ws: Workspace, units: number, usd: number, jobId: string) {
  await withCostTag({ feature: "agents", userId: ws.userId, plan: ws.plan, route: "/api/blender-cloud/worker" }, () => chargeUnits(ws, ACTION, units, usd, jobId, { dailySafetyCap: false }));
  // The next minutes must be affordable too, so a job stops when the account runs out instead of overdrawing it.
  await assertCanSpend(ws, Math.ceil(unitsPerMinute(machineSpec().vcpus)), { kind: "agent", dailySafetyCap: false });
}

/** Starts the next slice through the internal route (authorized with CRON_SECRET). It answers at once and works in the background. */
export async function triggerNext(job: Pick<RenderJob, "id" | "workspaceId">, deps: { fetch?: typeof fetch; env?: Record<string, string | undefined> } = {}): Promise<void> {
  const env = deps.env ?? process.env;
  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("[blender-cloud] CRON_SECRET is not set: the next slice starts on the next status poll or the daily cron");
    return;
  }
  const res = await (deps.fetch ?? fetch)(`${workerBase(env)}/api/blender-cloud/worker`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ jobId: job.id, workspaceId: job.workspaceId }),
    signal: AbortSignal.timeout(15_000),
  }).catch((e: unknown) => { console.error("[blender-cloud] hand-over failed:", e instanceof Error ? e.name : "error"); return null; });
  if (res && !res.ok) console.error(`[blender-cloud] hand-over answered ${res.status}`);
}

async function takeLease(job: RenderJob, now: number): Promise<string | null> {
  if (job.leaseUntil && Date.parse(job.leaseUntil) > now && job.leaseId) return null;
  const leaseId = randomUUID();
  await jobs().update(job.workspaceId, job.id, { leaseId, leaseUntil: iso(now + RENDER_LIMITS.leaseMs) });
  const again = await jobs().get(job.workspaceId, job.id);
  return again?.leaseId === leaseId ? leaseId : null;
}

/** Frames written so far (only the ones this job asked for) and the output files with their sizes. */
export function framesFrom(poll: Poll, job: Pick<RenderJob, "settings">): { done: number[]; outputs: OutputFile[] } {
  const want = new Set(frameList(job.settings));
  const done = poll.files.map(frameOf).filter((f): f is number => f !== null && want.has(f)).sort((a, b) => a - b);
  const outputs = poll.files.filter((n) => frameOf(n) !== null || n === "video.mp4").map((name) => ({ name, bytes: poll.sizes.get(name) ?? 0 }));
  return { done, outputs };
}

export const remainingFrames = (job: Pick<RenderJob, "settings" | "done">) => {
  const have = new Set(job.done);
  return frameList(job.settings).filter((f) => !have.has(f));
};

/** Starts (or restarts) the render for the frames still missing, on the machine's current session. */
export async function startRender(m: Machine, job: RenderJob, now: number): Promise<RenderJob["run"]> {
  const frames = remainingFrames(job);
  await m.spawn(renderScript(frames));
  return { phase: "render", startedAt: iso(now), session: m.session, doneAtStart: job.done.length };
}

/** Charges machine time since the last charge (capped: a machine can't run longer than one session unwatched). */
async function chargeTime(ws: Workspace, job: RenderJob, now: number, deps: WorkerDeps): Promise<void> {
  const from = Date.parse(job.chargedTo ?? job.run?.startedAt ?? iso(now));
  const minutes = Math.max(0, Math.min((now - from) / 60_000, machineSpec().sessionMinutes));
  job.chargedTo = iso(now);
  if (minutes <= 0) return;
  const vcpus = job.machine?.vcpus ?? machineSpec().vcpus;
  job.usage.machineMinutes = Math.round((job.usage.machineMinutes + minutes) * 1000) / 1000;
  const due = Math.ceil(job.usage.machineMinutes * unitsPerMinute(vcpus)) - job.usage.units;
  const usd = minutes * usdPerMachineMinute(vcpus);
  job.usage.usd = Math.round((job.usage.usd + usd) * 1e6) / 1e6;
  await system().increment(SYSTEM_WS, monthKey(now), { minutes }, { id: monthKey(now), workspaceId: SYSTEM_WS, minutes: 0 });
  if (due > 0) {
    job.usage.units += due;
    await (deps.charge ?? defaultCharge)(ws, due, usd, job.id);
  }
}

async function finish(job: RenderJob, m: Machine | null, status: RenderStatus, reason: string, now: number, extra: Partial<RenderJob> = {}) {
  if (m) {
    await m.run(killScript()).catch(() => undefined);
    await m.stop().catch(() => undefined);
  }
  const ended: Partial<RenderJob> = {
    status, stopReason: reason, finishedAt: iso(now), updatedAt: iso(now), leaseUntil: iso(now), leaseId: undefined, control: undefined, current: undefined, run: undefined,
    expiresAt: iso(now + RENDER_LIMITS.keepDays * 864e5), machineState: m ? "stopped" : job.machineState, usage: job.usage, chargedTo: job.chargedTo, done: job.done, outputs: job.outputs,
    log: [...job.log, logEntry("stop", reason)].slice(-RENDER_LIMITS.maxLog), ...extra,
  };
  await jobs().update(job.workspaceId, job.id, ended);
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Runs one slice of a job. Safe to call twice: the lease makes sure only one slice watches a job at a time. */
export async function runSlice(workspaceId: string, jobId: string, deps: WorkerDeps = {}): Promise<{ status: RenderStatus | "missing" | "busy" }> {
  const clock = deps.now ?? Date.now;
  const t0 = clock();
  const before = await jobs().get(workspaceId, jobId);
  const out = await runSliceInner(workspaceId, jobId, deps);
  // Space Studio jobs: machine time watched by this slice counts toward the plan's monthly cloud minutes (src/lib/space-studio/cloud.ts).
  if (before?.product === SPACE_PRODUCT && (before.status === "queued" || before.status === "rendering") && out.status !== "missing" && out.status !== "busy") {
    await addCloudMinutes(workspaceId, (clock() - t0) / 60_000, clock()).catch(() => undefined);
  }
  return out;
}

async function runSliceInner(workspaceId: string, jobId: string, deps: WorkerDeps): Promise<{ status: RenderStatus | "missing" | "busy" }> {
  const clock = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const machines = deps.machines ?? sandboxMachines;
  const sliceStart = clock();
  let job = await jobs().get(workspaceId, jobId);
  if (!job) return { status: "missing" };
  if (job.status !== "queued" && job.status !== "rendering") return { status: job.status };
  const leaseId = await takeLease(job, sliceStart);
  if (!leaseId) return { status: "busy" };
  job = (await jobs().get(workspaceId, jobId))!;

  const ws = await workspaceById(workspaceId);
  if (job.product === SPACE_PRODUCT) {
    // Space Studio jobs are gated by the Space Studio plan, checked again every time a slice picks the job up.
    if (!ws || !(await spaceJobMayRun(workspaceId, jobId, sliceStart))) {
      await finish(job, job.machine ? await machines.get(job.machine.name, false).catch(() => null) : null, "stopped", `${SPACE_CLOUD_ENDED}. ${plural(job.done.length, "frame")} rendered; they're ready to download.`, clock());
      return { status: "stopped" };
    }
  } else if (!ws || !STUDIO_PLANS.has(ws.plan)) {
    await finish(job, job.machine ? await machines.get(job.machine.name, false).catch(() => null) : null, "stopped", "Blender Cloud needs Keplar Lite, Plus or Pro, and this account's plan does not include it now.", clock());
    return { status: "stopped" };
  }
  if (!job.machine) { await finish(job, null, "failed", "This job has no render machine.", clock()); return { status: "failed" }; }
  job.slices += 1;
  await jobs().update(workspaceId, jobId, { slices: job.slices, heartbeatAt: iso(sliceStart) });
  const sliceMs = deps.sliceMs ?? RENDER_LIMITS.sliceMs;
  const pollMs = deps.pollMs ?? RENDER_LIMITS.pollMs;

  while (clock() - sliceStart < sliceMs) {
    const live = await jobs().get(workspaceId, jobId);
    if (!live || live.leaseId !== leaseId) return { status: "busy" };
    const now = clock();
    let m = await machines.get(job.machine.name, false);
    if (!m) { await finish(job, null, "failed", "The render machine is gone, so the render can't continue.", now, { machineState: "deleted" }); return { status: "failed" }; }

    if (live.control === "stop" || live.control === "pause") {
      if (job.status === "rendering") await chargeTime(ws, job, now, deps).catch(() => undefined);
      if (live.control === "stop") {
        await finish(job, m, "stopped", `Stopped by you. ${plural(job.done.length, "frame")} rendered; they're ready to download.`, now);
        return { status: "stopped" };
      }
      await m.run(killScript()).catch(() => undefined);
      await m.stop().catch(() => undefined);
      await jobs().update(workspaceId, jobId, { status: "paused", control: undefined, run: undefined, current: undefined, machineState: "stopped", usage: job.usage, chargedTo: job.chargedTo, leaseUntil: iso(now), leaseId: undefined, updatedAt: iso(now), log: [...job.log, logEntry("stop", `Paused by you after ${plural(job.done.length, "frame")}. Resume to render the rest.`)].slice(-RENDER_LIMITS.maxLog) });
      return { status: "paused" };
    }

    // Queued (new, resumed, or its session ended): bring the machine up and start the frames still missing.
    const sessionEnded = m.status !== "running" || (job.run && job.run.session !== m.session);
    if (job.status === "queued" || sessionEnded) {
      if (job.restarts >= MAX_RESTARTS) { await finish(job, m, "failed", "The render was restarted too many times, so it stopped.", now); return { status: "failed" }; }
      if (m.status !== "running") m = (await machines.get(job.machine.name, true))!;
      const resumed = job.status !== "queued";
      if (resumed) await chargeTime(ws, job, now, deps).catch(() => undefined);
      job.status = "rendering";
      job.startedAt ??= iso(now);
      job.run = await startRender(m, job, now);
      job.chargedTo = iso(now);
      if (resumed) job.restarts += 1;
      job.log.push(logEntry("info", resumed ? `The machine session ended, so the render continues on a new one (${plural(remainingFrames(job).length, "frame")} to go).` : `Rendering ${plural(remainingFrames(job).length, "frame")} on ${job.machine.vcpus} CPU cores.`));
      await jobs().update(workspaceId, jobId, { status: "rendering", startedAt: job.startedAt, run: job.run, restarts: job.restarts, chargedTo: job.chargedTo, machineState: "running", usage: job.usage, log: job.log.slice(-RENDER_LIMITS.maxLog), heartbeatAt: iso(now), leaseUntil: iso(now + RENDER_LIMITS.leaseMs), updatedAt: iso(now) });
      await sleep(pollMs);
      continue;
    }

    const poll = parsePoll((await m.run(pollScript())).out);
    const before = job.done.length;
    const got = framesFrom(poll, job);
    job.done = got.done;
    job.outputs = got.outputs;
    const log = readLog(poll.log);
    job.current = job.run?.phase === "video" ? { frame: 0, progress: "Making the video" } : log.frame !== null ? { frame: log.frame, progress: log.progress } : job.current;
    if (job.done.length > before) {
      job.log.push(logEntry("frame", `${plural(job.done.length, "frame")} of ${frameList(job.settings).length} done.`));
      const run = job.run!;
      const secs = (now - Date.parse(run.startedAt)) / 1000 / Math.max(1, job.done.length - run.doneAtStart);
      job.frameSeconds = [...job.frameSeconds, Math.round(secs)].slice(-8);
    }
    try {
      await chargeTime(ws, job, now, deps);
    } catch (e) {
      if (!(e instanceof CreditLimitError)) throw e;
      await finish(job, m, "stopped", `Stopped: this account is out of credits. ${plural(job.done.length, "frame")} rendered.`, now);
      return { status: "stopped" };
    }

    const minutes = (now - Date.parse(job.startedAt!)) / 60_000;
    if (job.usage.units + RESERVE_UNITS > job.maxUnits) { await finish(job, m, "stopped", `Stopped at your budget of ${job.maxUnits} credits. ${plural(job.done.length, "frame")} rendered.`, now); return { status: "stopped" }; }
    if (minutes >= job.maxMinutes) { await finish(job, m, "stopped", `Stopped at your time limit. ${plural(job.done.length, "frame")} rendered.`, now); return { status: "stopped" }; }

    const left = remainingFrames(job);
    if (job.run?.phase === "video") {
      if (poll.videoExit !== null) {
        const made = poll.files.includes("video.mp4") && poll.videoExit === 0;
        await finish(job, m, "done", made ? `Done: ${plural(job.done.length, "frame")} and a video.` : `Done: ${plural(job.done.length, "frame")}. The video couldn't be made; the frames are all there.`, now);
        return { status: "done" };
      }
    } else if (poll.exit !== null && !poll.alive) {
      if (!left.length) {
        if (job.settings.video && job.done.length > 1 && job.settings.format !== "OPEN_EXR") {
          await m.spawn(encodeScript());
          job.run = { phase: "video", startedAt: iso(now), session: m.session, doneAtStart: job.done.length };
          job.log.push(logEntry("info", "All frames done. Joining them into a video."));
        } else {
          await finish(job, m, "done", `Done: ${plural(job.done.length, "frame")}.`, now);
          return { status: "done" };
        }
      } else if (poll.exit === 0 && job.done.length > before) {
        job.run = await startRender(m, job, now); // Blender stopped early but made progress: carry on with the rest
      } else {
        const why = log.error ?? (poll.exit === 137 ? "The render machine ran out of memory." : `Blender stopped (exit code ${poll.exit}).`);
        await finish(job, m, "failed", job.done.length ? `${why} ${plural(job.done.length, "frame")} rendered before that; they're ready to download.` : `${why} No frames were rendered.`, now);
        return { status: "failed" };
      }
    }

    const t = clock();
    await jobs().update(workspaceId, jobId, { done: job.done, outputs: job.outputs, current: job.current, frameSeconds: job.frameSeconds, run: job.run, usage: job.usage, chargedTo: job.chargedTo, log: job.log.slice(-RENDER_LIMITS.maxLog), heartbeatAt: iso(t), updatedAt: iso(t), leaseUntil: iso(t + RENDER_LIMITS.leaseMs) });
    await sleep(pollMs);
  }

  await jobs().update(workspaceId, jobId, { leaseUntil: iso(clock()), leaseId: undefined, updatedAt: iso(clock()) });
  await (deps.trigger ?? triggerNext)(job);
  return { status: "rendering" };
}

/** Restarts jobs whose slice died (lease expired while still active). Used by status polls and the daily cron. */
export async function resumeStale(deps: WorkerDeps = {}, limit = 10): Promise<number> {
  const now = (deps.now ?? Date.now)();
  const stale = await jobs().listSystem((j) => (j.status === "queued" || j.status === "rendering") && (!j.leaseUntil || Date.parse(j.leaseUntil) < now) && Date.parse(j.heartbeatAt ?? j.updatedAt) < now - 60_000);
  for (const j of stale.slice(0, limit)) await (deps.trigger ?? triggerNext)(j);
  return Math.min(stale.length, limit);
}

export { isActive };
