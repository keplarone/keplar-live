/**
 * Blender Cloud API logic (routes under src/app/api/blender-cloud): create a job with its render machine, start the render once
 * the desktop app has uploaded the scene, watch, pause, resume, stop, hand out download access, and clean up. Every call is the
 * signed-in owner's own workspace; writes are same-origin and rate limited. Capacity is shared: a monthly machine-time cap and a
 * cap on machines running at once keep Keplar inside its Vercel Sandbox allowance.
 */
import { randomBytes } from "node:crypto";
import { assertSameAccount } from "@/lib/accounts/account-guard";
import { assertCanSpend } from "@/lib/create/platform/compute";
import { HttpError } from "@/lib/create/platform/http";
import { id as newId } from "@/lib/create/platform/ids";
import { EntitlementError } from "@/lib/create/platform/plans";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace, type Workspace } from "@/lib/create/platform/workspace";
import { STUDIO_PLANS } from "@/lib/desktop/studio-bridge";
import { isSameOrigin } from "@/lib/security/origin";
import { agentScript, IMAGE_RECIPE, JOB_DIR, machineScripts, parsePoll, pollScript, sandboxMachines, type Machine, type Machines } from "./machine";
import { emptyUsage, ENGINES, FORMATS, isActive, jobs, jobView, logEntry, machineSpec, RENDER_LIMITS, SYSTEM_WS, system, type RenderJob, type RenderSettings, type SceneReport } from "./model";
import { framesFrom, monthKey, triggerNext, unitsPerMinute } from "./worker";

const bad = (m: string, code = "bad_request") => new HttpError(400, m, code);
const iso = (ms: number) => new Date(ms).toISOString();

export type ApiDeps = { machines?: Machines; now?: () => number; trigger?: (j: Pick<RenderJob, "id" | "workspaceId">) => Promise<void> };

export async function renderOwner(req: Request, write: boolean): Promise<Workspace> {
  if (write && !isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
  const ws = await currentWorkspace(req); // 401 when signed out
  assertSameAccount(req, ws.userId);
  if (!STUDIO_PLANS.has(ws.plan)) throw new EntitlementError("Blender Cloud rendering comes with Keplar Lite, Plus and Pro.", "lite");
  if (write) await rateLimit(`blender-cloud:${ws.id}`, 60, 60, { shared: true });
  return ws;
}

export async function jobOf(ws: Workspace, id: string): Promise<RenderJob> {
  const j = typeof id === "string" && id.length <= 64 ? await jobs().get(ws.id, id) : null;
  if (!j) throw new HttpError(404, "That render was not found.", "not_found");
  return j;
}

const int = (v: unknown, min: number, max: number, what: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${what} must be a whole number from ${min} to ${max}.`);
  return n;
};
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const strs = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, n).map((x) => x.slice(0, max)) : []);

export function validateReport(raw: unknown): SceneReport {
  const r = (raw ?? {}) as Record<string, unknown>;
  const file = str(r.file, 160).trim();
  if (!file) throw bad("Which scene is this? Connect Blender with a saved .blend first.");
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    file, blender: str(r.blender, 40), engine: str(r.engine, 40), frameStart: Math.round(num(r.frameStart, 1)), frameEnd: Math.round(num(r.frameEnd, 1)), frameCurrent: Math.round(num(r.frameCurrent, 1)),
    fps: num(r.fps, 24), resX: Math.round(num(r.resX, 1920)), resY: Math.round(num(r.resY, 1080)), resPercent: Math.round(num(r.resPercent, 100)),
    samples: typeof r.samples === "number" && Number.isFinite(r.samples) ? Math.round(r.samples) : null, objects: Math.round(num(r.objects, 0)), missing: strs(r.missing, 40, 300), warnings: strs(r.warnings, 20, 300),
  };
}

export function validateSettings(raw: unknown): RenderSettings {
  const s = (raw ?? {}) as Record<string, unknown>;
  const engine = ENGINES.find((e) => e === s.engine);
  if (!engine) throw bad("Pick Cycles, EEVEE or Workbench.");
  const format = FORMATS.find((f) => f === s.format) ?? "PNG";
  const frameStart = int(s.frameStart, -100_000, 1_000_000, "The first frame");
  const frameEnd = int(s.frameEnd, frameStart, 1_000_000, "The last frame");
  const frameStep = int(s.frameStep ?? 1, 1, 1000, "The frame step");
  const count = Math.floor((frameEnd - frameStart) / frameStep) + 1;
  if (count > RENDER_LIMITS.maxFrames) throw bad(`One job renders at most ${RENDER_LIMITS.maxFrames.toLocaleString("en-US")} frames.`);
  const resPercent = int(s.resPercent ?? 100, 10, 200, "The resolution percentage");
  const samples = s.samples === undefined || s.samples === null || s.samples === "" ? undefined : int(s.samples, 1, 65_536, "Samples");
  return { engine, frameStart, frameEnd, frameStep, resPercent, ...(samples ? { samples } : {}), format, video: s.video === true && count > 1 && format !== "OPEN_EXR" };
}

/** The prepared Blender image, built on first use (about a minute) and again whenever the recipe changes. */
export async function ensureImage(machines: Machines, now: () => number = Date.now): Promise<string> {
  const row = await system().get(SYSTEM_WS, "image");
  if (row?.snapshotId && row.recipe === IMAGE_RECIPE) return row.snapshotId;
  // One build at a time: whoever takes the lock builds; others wait for it.
  const lock = await system().insertIfAbsent({ id: "image-lock", workspaceId: SYSTEM_WS, builtAt: iso(now()) });
  if (!lock.inserted && Date.parse(lock.row.builtAt ?? "") > now() - 4 * 60_000) {
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const again = await system().get(SYSTEM_WS, "image");
      if (again?.snapshotId && again.recipe === IMAGE_RECIPE) return again.snapshotId;
    }
    throw new HttpError(503, "The render machine image is still being prepared. Try again in a minute.", "image_building");
  }
  if (!lock.inserted) await system().update(SYSTEM_WS, "image-lock", { builtAt: iso(now()) });
  try {
    const img = await machines.buildImage();
    const next = { id: "image", workspaceId: SYSTEM_WS, snapshotId: img.snapshotId, blender: img.blender, recipe: IMAGE_RECIPE, builtAt: iso(now()) };
    if (row) await system().update(SYSTEM_WS, "image", next);
    else await system().insert(next);
    if (row?.snapshotId && row.snapshotId !== img.snapshotId) await machines.dropImage(row.snapshotId).catch(() => undefined);
    return img.snapshotId;
  } finally {
    await system().remove(SYSTEM_WS, "image-lock").catch(() => undefined);
  }
}

/** Shared capacity: this month's machine time and the machines running now, across every account. */
export async function capacity(now: number) {
  const spec = machineSpec();
  const used = (await system().get(SYSTEM_WS, monthKey(now)))?.minutes ?? 0;
  const running = (await jobs().listSystem((j) => isActive(j.status))).length;
  return { usedMinutes: Math.round(used), monthlyMinutes: spec.monthlyHours * 60, running, concurrent: spec.concurrent, open: used < spec.monthlyHours * 60 && running < spec.concurrent };
}

export async function removeJob(job: RenderJob, deps: ApiDeps = {}) {
  if (job.machine) {
    const m = await (deps.machines ?? sandboxMachines).get(job.machine.name, false).catch(() => null);
    await m?.remove().catch(() => undefined);
  }
  await jobs().remove(job.workspaceId, job.id);
}

async function prune(ws: Workspace, deps: ApiDeps) {
  const now = (deps.now ?? Date.now)();
  const all = (await jobs().list(ws.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const [i, j] of all.entries()) {
    if (isActive(j.status) || j.status === "paused") continue;
    if (i >= RENDER_LIMITS.keepJobs || Date.parse(j.expiresAt) < now) await removeJob(j, deps);
  }
}

/** Creates the job and its machine. The machine waits for the scene: the desktop app uploads it straight there with the token. */
export async function createJob(ws: Workspace, b: Record<string, unknown>, deps: ApiDeps = {}) {
  const machines = deps.machines ?? sandboxMachines;
  const now = (deps.now ?? Date.now)();
  const report = validateReport(b.report);
  const settings = validateSettings(b.settings);
  const maxUnits = int(b.maxUnits, RENDER_LIMITS.minUnits, RENDER_LIMITS.maxUnitsCap, "The budget");
  const maxMinutes = int(b.maxMinutes, 5, RENDER_LIMITS.maxMinutesCap, "The time limit (minutes)");
  const sceneBytes = int(b.sceneBytes, 1, RENDER_LIMITS.maxSceneBytes, "The scene size");
  await prune(ws, deps);
  if ((await jobs().list(ws.id, (j) => isActive(j.status))).length) throw new HttpError(409, "A cloud render is already running for this account. Wait for it, or stop it first.", "job_running");
  const cap = await capacity(now);
  if (cap.usedMinutes >= cap.monthlyMinutes) throw new HttpError(503, "Cloud rendering has used all of this month's machine time. It opens again next month; you can still render in Blender on your computer.", "at_capacity");
  if (cap.running >= cap.concurrent) throw new HttpError(503, "Every render machine is busy right now. Try again in a few minutes.", "busy");
  await assertCanSpend(ws, Math.max(RENDER_LIMITS.minUnits, Math.ceil(unitsPerMinute(machineSpec().vcpus) * 5)), { kind: "agent", dailySafetyCap: false });

  const snapshotId = await ensureImage(machines, deps.now);
  const spec = machineSpec();
  const id = newId("br");
  const job: RenderJob = {
    id, workspaceId: ws.id, createdAt: iso(now), updatedAt: iso(now), expiresAt: iso(now + RENDER_LIMITS.keepDays * 864e5), file: report.file, report, settings, maxUnits, maxMinutes,
    status: "uploading", done: [], frameSeconds: [], restarts: 0, slices: 0, usage: emptyUsage(), outputs: [], sceneBytes, log: [logEntry("info", "Starting a render machine.")],
  };
  await jobs().insert(job);
  let m: Machine;
  try {
    m = await machines.create({ name: `blender-${id}`.replace(/_/g, "-"), snapshotId, vcpus: spec.vcpus, sessionMinutes: spec.sessionMinutes, keepDays: RENDER_LIMITS.keepDays, jobId: id });
    const token = randomBytes(24).toString("hex");
    await m.run(`mkdir -p ${JOB_DIR}/out`);
    await m.write([
      ...machineScripts(),
      { path: `${JOB_DIR}/token`, content: Buffer.from(token) },
      { path: `${JOB_DIR}/settings.json`, content: Buffer.from(JSON.stringify({ ...settings, fps: report.fps })) },
    ]);
    await m.spawn(agentScript());
    job.machine = { name: m.name, url: m.url, token, vcpus: spec.vcpus };
  } catch (e) {
    await jobs().update(ws.id, id, { status: "failed", stopReason: "A render machine couldn't be started. Nothing was charged.", finishedAt: iso(now) });
    console.error("[blender-cloud] machine start failed:", e instanceof Error ? e.message.slice(0, 200) : "error");
    throw new HttpError(503, "A render machine couldn't be started right now. Nothing was charged; try again in a few minutes.", "machine_failed");
  }
  const saved = (await jobs().update(ws.id, id, { machine: job.machine, machineState: "running", log: [...job.log, logEntry("info", "The machine is ready. Uploading the scene from your computer.")] }))!;
  return { job: saved, upload: { url: job.machine.url, token: job.machine.token, maxBytes: RENDER_LIMITS.maxSceneBytes } };
}

/** The upload went through: check the scene is on the machine, then queue the render and start watching it. */
export async function startJob(ws: Workspace, job: RenderJob, deps: ApiDeps = {}): Promise<RenderJob> {
  if (job.status !== "uploading" || !job.machine) throw new HttpError(409, "This render has already started.", "not_uploading");
  const m = await (deps.machines ?? sandboxMachines).get(job.machine.name, false);
  if (!m) throw new HttpError(409, "The render machine is gone. Start a new render.", "machine_gone");
  const poll = parsePoll((await m.run(pollScript())).out);
  if (!poll.sceneBytes) throw new HttpError(409, "The scene hasn't finished uploading yet.", "not_uploaded");
  await assertCanSpend(ws, RENDER_LIMITS.minUnits, { kind: "agent", dailySafetyCap: false });
  const now = (deps.now ?? Date.now)();
  const next = (await jobs().update(ws.id, job.id, { status: "queued", sceneBytes: poll.sceneBytes, updatedAt: iso(now), heartbeatAt: iso(now), log: [...job.log, logEntry("info", "Scene uploaded. The render starts now and keeps going if you close Keplar or turn your computer off.")].slice(-RENDER_LIMITS.maxLog) }))!;
  await (deps.trigger ?? triggerNext)(next);
  return next;
}

export async function control(ws: Workspace, job: RenderJob, action: unknown, deps: ApiDeps = {}): Promise<RenderJob> {
  const now = iso((deps.now ?? Date.now)());
  if (action === "pause") {
    if (job.status !== "queued" && job.status !== "rendering") throw new HttpError(409, "Only a running render can be paused.", "not_running");
    return (await jobs().update(ws.id, job.id, { control: "pause", updatedAt: now }))!;
  }
  if (action === "stop") {
    if (job.status === "uploading") {
      await (await (deps.machines ?? sandboxMachines).get(job.machine?.name ?? "", false).catch(() => null))?.stop().catch(() => undefined);
      return (await jobs().update(ws.id, job.id, { status: "stopped", stopReason: "Canceled before the render started. Nothing was charged.", finishedAt: now, updatedAt: now, machineState: "stopped" }))!;
    }
    if (job.status === "paused") return (await jobs().update(ws.id, job.id, { status: "stopped", stopReason: `Stopped by you. ${job.done.length} frame${job.done.length === 1 ? "" : "s"} rendered.`, finishedAt: now, updatedAt: now }))!;
    if (job.status !== "queued" && job.status !== "rendering") throw new HttpError(409, "This render has already ended.", "ended");
    return (await jobs().update(ws.id, job.id, { control: "stop", updatedAt: now }))!;
  }
  if (action === "resume") {
    if (job.status !== "paused") throw new HttpError(409, "Only a paused render can be resumed.", "not_paused");
    if ((await jobs().list(ws.id, (j) => isActive(j.status))).length) throw new HttpError(409, "Another cloud render is running. Stop it first.", "job_running");
    await assertCanSpend(ws, RENDER_LIMITS.minUnits, { kind: "agent", dailySafetyCap: false });
    const next = (await jobs().update(ws.id, job.id, { status: "queued", control: undefined, run: undefined, leaseUntil: undefined, leaseId: undefined, updatedAt: now, heartbeatAt: now, log: [...job.log, logEntry("info", "Resumed by you.")].slice(-RENDER_LIMITS.maxLog) }))!;
    await (deps.trigger ?? triggerNext)(next);
    return next;
  }
  throw bad("Unknown action.");
}

/**
 * Download access: wakes the machine if it was stopped (its files come back), starts the agent and returns where to fetch the
 * files and the token. The desktop app downloads them to this computer, then calls downloaded() so the machine stops again.
 */
export async function download(ws: Workspace, job: RenderJob, deps: ApiDeps = {}) {
  if (isActive(job.status) && job.status !== "rendering") throw new HttpError(409, "Nothing to download yet.", "not_ready");
  if (!job.machine || job.machineState === "deleted") throw new HttpError(410, "These renders were deleted from the cloud.", "deleted");
  const m = await (deps.machines ?? sandboxMachines).get(job.machine.name, job.status !== "rendering");
  if (!m) throw new HttpError(410, "These renders were deleted from the cloud.", "deleted");
  await m.spawn(agentScript());
  const poll = parsePoll((await m.run(pollScript())).out);
  const { outputs } = framesFrom(poll, job);
  if (!outputs.length) throw new HttpError(409, "No frames have been rendered yet.", "not_ready");
  const now = iso((deps.now ?? Date.now)());
  if (job.status !== "rendering") await jobs().update(ws.id, job.id, { machineState: "running", outputs, updatedAt: now });
  return { url: job.machine.url, token: job.machine.token, files: outputs };
}

/** The desktop app has the files: the machine stops again (unless the render is still going), keeping them for the rest of the period. */
export async function downloaded(ws: Workspace, job: RenderJob, deps: ApiDeps = {}) {
  const now = iso((deps.now ?? Date.now)());
  if (job.status !== "rendering" && job.status !== "queued" && job.machine) {
    const m = await (deps.machines ?? sandboxMachines).get(job.machine.name, false).catch(() => null);
    if (m && m.status === "running") await m.stop().catch(() => undefined);
  }
  return (await jobs().update(ws.id, job.id, { downloadedAt: now, updatedAt: now, ...(job.status !== "rendering" && job.status !== "queued" ? { machineState: "stopped" as const } : {}) }))!;
}

/**
 * Daily and on every list: ends uploads that never finished, stops machines left awake after a download, deletes expired jobs
 * with their machines, and deletes machines whose job is gone (a deleted account, for example).
 */
export async function cleanup(deps: ApiDeps = {}): Promise<{ expired: number; stopped: number; orphans: number }> {
  const machines = deps.machines ?? sandboxMachines;
  const now = (deps.now ?? Date.now)();
  let expired = 0, stopped = 0, orphans = 0;
  for (const j of await jobs().listSystem()) {
    if (j.status === "uploading" && Date.parse(j.createdAt) + RENDER_LIMITS.uploadMinutes * 60_000 < now) {
      await (await machines.get(j.machine?.name ?? "", false).catch(() => null))?.stop().catch(() => undefined);
      await jobs().update(j.workspaceId, j.id, { status: "failed", stopReason: `The upload didn't finish within ${RENDER_LIMITS.uploadMinutes} minutes. Nothing was charged.`, finishedAt: iso(now), machineState: "stopped" });
      stopped++;
    } else if (!isActive(j.status) && j.status !== "paused" && Date.parse(j.expiresAt) < now) {
      await removeJob(j, { ...deps, machines });
      expired++;
    } else if (!isActive(j.status) && j.machineState === "running" && Date.parse(j.updatedAt) < now - 60 * 60_000) {
      await (await machines.get(j.machine?.name ?? "", false).catch(() => null))?.stop().catch(() => undefined);
      await jobs().update(j.workspaceId, j.id, { machineState: "stopped" });
      stopped++;
    }
  }
  const known = new Set((await jobs().listSystem()).map((j) => j.machine?.name).filter(Boolean));
  for (const name of await machines.listNames().catch(() => [] as string[])) {
    if (known.has(name)) continue;
    await (await machines.get(name, false).catch(() => null))?.remove().catch(() => undefined);
    orphans++;
  }
  return { expired, stopped, orphans };
}

/** For the panel: the account's jobs, the shared capacity and the machine's price. Ends this account's uploads that never finished. */
export async function overview(ws: Workspace, deps: ApiDeps = {}) {
  const now = (deps.now ?? Date.now)();
  for (const j of await jobs().list(ws.id, (x) => x.status === "uploading" && Date.parse(x.createdAt) + RENDER_LIMITS.uploadMinutes * 60_000 < now)) {
    await (await (deps.machines ?? sandboxMachines).get(j.machine?.name ?? "", false).catch(() => null))?.stop().catch(() => undefined);
    await jobs().update(ws.id, j.id, { status: "failed", stopReason: `The upload didn't finish within ${RENDER_LIMITS.uploadMinutes} minutes. Nothing was charged.`, finishedAt: iso(now), machineState: "stopped" });
  }
  const all = (await jobs().list(ws.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const cap = await capacity(now);
  const spec = machineSpec();
  return { jobs: all.map(jobView), capacity: { open: cap.open, minutesLeft: Math.max(0, cap.monthlyMinutes - cap.usedMinutes), busy: cap.running >= cap.concurrent }, machine: { vcpus: spec.vcpus, sessionMinutes: spec.sessionMinutes, creditsPerMinute: Math.round(unitsPerMinute(spec.vcpus) * 10) / 10 } };
}
