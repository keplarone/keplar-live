/**
 * Roblox Cloud API logic (routes under src/app/api/roblox-cloud): create a job from a Studio snapshot, start, watch, pause,
 * resume, stop, review the changes and mark them applied. Every call is the signed-in owner's own workspace; writes are
 * same-origin and rate limited; the snapshot is validated and capped before it is stored.
 */
import { assertSameAccount } from "@/lib/accounts/account-guard";
import { assertCanSpend } from "@/lib/create/platform/compute";
import { HttpError } from "@/lib/create/platform/http";
import { id as newId } from "@/lib/create/platform/ids";
import { EntitlementError } from "@/lib/create/platform/plans";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace, type Workspace } from "@/lib/create/platform/workspace";
import { STUDIO_PLANS } from "@/lib/desktop/studio-bridge";
import { isSameOrigin } from "@/lib/security/origin";
import { hasSpaceCloudPlan } from "@/lib/space-studio/cloud";
import { CLOUD_LIMITS, currentSource, emptyUsage, fileId, files, jobs, jobView, logEntry, PATH, SCRIPT_CLASSES, sha, type CloudFile, type CloudJob, type StopMode } from "./model";

const bad = (m: string, code = "bad_request") => new HttpError(400, m, code);
const MODES: StopMode[] = ["until_done", "time", "checkpoint"];

export async function cloudOwner(req: Request, write: boolean): Promise<Workspace> {
  if (write && !isSameOrigin(req)) throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
  const ws = await currentWorkspace(req); // 401 when signed out
  assertSameAccount(req, ws.userId);
  if (!STUDIO_PLANS.has(ws.plan) && !(await hasSpaceCloudPlan(ws.id))) throw new EntitlementError("Roblox Cloud comes with Keplar Lite, Plus and Pro.", "lite");
  if (write) await rateLimit(`roblox-cloud:${ws.id}`, 60, 60, { shared: true });
  return ws;
}

export async function jobOf(ws: Workspace, id: string): Promise<CloudJob> {
  const j = typeof id === "string" && id.length <= 64 ? await jobs().get(ws.id, id) : null;
  if (!j) throw new HttpError(404, "That Roblox Cloud job was not found.", "not_found");
  return j;
}

/** Removes the oldest finished jobs (and their scripts) beyond the per-workspace limit, and anything past its expiry. */
async function prune(ws: Workspace) {
  const all = (await jobs().list(ws.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const now = Date.now();
  const drop = all.filter((j, i) => (i >= CLOUD_LIMITS.keepJobs || Date.parse(j.expiresAt) < now) && !["queued", "running"].includes(j.status));
  for (const j of drop) await removeJob(ws.id, j.id);
}

export async function removeJob(workspaceId: string, jobId: string) {
  const fs = await files().list(workspaceId, (f) => f.jobId === jobId);
  for (const f of fs) await files().remove(workspaceId, f.id);
  await jobs().remove(workspaceId, jobId);
}

export async function createDraft(ws: Workspace, b: Record<string, unknown>, opts: { product?: CloudJob["product"] } = {}): Promise<CloudJob> {
  const goal = typeof b.goal === "string" ? b.goal.trim() : "";
  if (goal.length < 8) throw bad("Describe what Keplar should work on (a sentence or two).");
  if (goal.length > CLOUD_LIMITS.maxGoalChars) throw bad(`Keep the goal under ${CLOUD_LIMITS.maxGoalChars} characters.`);
  const mode = MODES.find((m) => m === b.mode) ?? "until_done";
  const maxUnits = Math.floor(Number(b.maxUnits));
  if (!Number.isFinite(maxUnits) || maxUnits < CLOUD_LIMITS.minUnits || maxUnits > CLOUD_LIMITS.maxUnitsCap) throw bad(`Set a budget between ${CLOUD_LIMITS.minUnits} and ${CLOUD_LIMITS.maxUnitsCap} credits.`);
  const maxMinutes = Math.floor(Number(b.maxMinutes));
  if (!Number.isFinite(maxMinutes) || maxMinutes < 10 || maxMinutes > CLOUD_LIMITS.maxMinutesCap) throw bad(`Set a time limit between 10 minutes and ${CLOUD_LIMITS.maxMinutesCap / 60} hours.`);
  const place = (b.place ?? {}) as { id?: unknown; name?: unknown };
  const placeName = typeof place.name === "string" ? place.name.slice(0, 120) : "";
  if (!placeName) throw bad("Which game is this? Connect Roblox Studio first.");
  const tree = typeof b.tree === "string" ? b.tree.slice(0, CLOUD_LIMITS.maxTreeChars) : "";
  await prune(ws);
  const active = await jobs().list(ws.id, (j) => j.status === "queued" || j.status === "running");
  if (active.length) throw new HttpError(409, "A Roblox Cloud job is already running for this account. Wait for it, or stop it first.", "job_running");
  const now = new Date();
  const job: CloudJob = {
    id: newId("rc"), workspaceId: ws.id, createdAt: now.toISOString(), updatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + CLOUD_LIMITS.keepDays * 864e5).toISOString(),
    place: { id: typeof place.id === "string" ? place.id.slice(0, 80) : "", name: placeName }, goal, mode, maxUnits, maxMinutes, status: "draft", tree, scriptCount: 0,
    slices: 0, plan: [], log: [logEntry("info", "Snapshot upload started.")], usage: emptyUsage(), messages: [], stall: 0, failures: 0,
    ...(opts.product ? { product: opts.product } : {}),
  };
  return jobs().insert(job);
}

export type IncomingScript = { path: string; className: CloudFile["className"]; source: string; runContext?: string };

export function validateScripts(raw: unknown): IncomingScript[] {
  if (!Array.isArray(raw) || !raw.length) throw bad("Send at least one script.");
  return raw.map((r, i) => {
    const s = (r ?? {}) as Record<string, unknown>;
    if (typeof s.path !== "string" || !PATH.test(s.path)) throw bad(`Script ${i + 1} has an invalid path.`);
    if (typeof s.className !== "string" || !SCRIPT_CLASSES.has(s.className)) throw bad(`${s.path}: class must be Script, LocalScript or ModuleScript.`);
    if (typeof s.source !== "string") throw bad(`${s.path}: source is missing.`);
    if (Buffer.byteLength(s.source, "utf8") > CLOUD_LIMITS.maxScriptBytes) throw bad(`${s.path} is larger than ${CLOUD_LIMITS.maxScriptBytes / 1000} KB.`);
    const runContext = typeof s.runContext === "string" && /^(Legacy|Server|Client|Plugin)$/.test(s.runContext) ? s.runContext : undefined;
    return { path: s.path, className: s.className as CloudFile["className"], source: s.source, ...(runContext ? { runContext } : {}) };
  });
}

export async function addScripts(ws: Workspace, job: CloudJob, raw: unknown): Promise<{ scripts: number; bytes: number }> {
  if (job.status !== "draft") throw new HttpError(409, "This job has already started; its snapshot can't change.", "not_draft");
  const incoming = validateScripts(raw);
  const existing = await files().list(ws.id, (f) => f.jobId === job.id);
  const have = new Map(existing.map((f) => [f.path, f]));
  let bytes = existing.reduce((n, f) => n + Buffer.byteLength(f.base, "utf8"), 0);
  for (const s of incoming) {
    if (have.has(s.path)) continue; // a resent batch is harmless
    bytes += Buffer.byteLength(s.source, "utf8");
    if (have.size >= CLOUD_LIMITS.maxScripts) throw bad(`A job can carry at most ${CLOUD_LIMITS.maxScripts} scripts.`);
    if (bytes > CLOUD_LIMITS.maxSnapshotBytes) throw bad(`The snapshot is over ${CLOUD_LIMITS.maxSnapshotBytes / 1e6} MB of scripts. Start from a smaller part of the game.`);
    const f: CloudFile = { id: fileId(job.id, s.path), workspaceId: ws.id, jobId: job.id, path: s.path, className: s.className, base: s.source, baseHash: sha(s.source), ...(s.runContext ? { runContext: s.runContext } : {}) };
    await files().insert(f);
    have.set(s.path, f);
  }
  await jobs().update(ws.id, job.id, { scriptCount: have.size, updatedAt: new Date().toISOString() });
  return { scripts: have.size, bytes };
}

/** Before starting: the account must be able to cover at least the first part of the budget. */
export async function assertCanStart(ws: Workspace, job: CloudJob) {
  if (job.status !== "draft") throw new HttpError(409, "This job has already started.", "not_draft");
  await assertCanSpend(ws, CLOUD_LIMITS.minUnits, { kind: "agent", dailySafetyCap: false });
}

export async function control(ws: Workspace, job: CloudJob, action: unknown): Promise<CloudJob> {
  const now = new Date().toISOString();
  if (action === "pause") {
    if (!["queued", "running"].includes(job.status)) throw new HttpError(409, "Only a running job can be paused.", "not_running");
    return (await jobs().update(ws.id, job.id, { control: "pause", updatedAt: now }))!;
  }
  if (action === "stop") {
    if (job.status === "paused" || job.status === "draft") return (await jobs().update(ws.id, job.id, { status: "stopped", stopReason: "Stopped by you.", finishedAt: now, updatedAt: now }))!;
    if (!["queued", "running"].includes(job.status)) throw new HttpError(409, "This job has already ended.", "ended");
    return (await jobs().update(ws.id, job.id, { control: "stop", updatedAt: now }))!;
  }
  if (action === "resume") {
    if (job.status !== "paused") throw new HttpError(409, "Only a paused job can be resumed.", "not_paused");
    const active = await jobs().list(ws.id, (j) => j.status === "queued" || j.status === "running");
    if (active.length) throw new HttpError(409, "Another Roblox Cloud job is running. Stop it first.", "job_running");
    await assertCanSpend(ws, CLOUD_LIMITS.minUnits, { kind: "agent", dailySafetyCap: false });
    return (await jobs().update(ws.id, job.id, { status: "queued", control: undefined, leaseUntil: undefined, leaseId: undefined, updatedAt: now, heartbeatAt: now, log: [...job.log, logEntry("info", "Resumed by you.")].slice(-CLOUD_LIMITS.maxLog) }))!;
  }
  throw bad("Unknown action.");
}

/** The reviewable changes: for each changed, created or deleted script, its original and new source (to diff and apply). */
export async function changes(ws: Workspace, job: CloudJob) {
  const fs = await files().list(ws.id, (f) => f.jobId === job.id && f.next !== undefined && !(f.created && f.next === null));
  return fs
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => ({ path: f.path, className: f.className, runContext: f.runContext ?? null, status: f.created ? "created" : f.next === null ? "deleted" : "changed", base: f.base, baseHash: f.baseHash, next: currentSource(f), applied: f.applied === true }));
}

export async function markApplied(ws: Workspace, job: CloudJob, paths: unknown) {
  if (!Array.isArray(paths)) throw bad("paths must be a list.");
  const want = new Set(paths.filter((p): p is string => typeof p === "string").slice(0, CLOUD_LIMITS.maxScripts));
  const fs = await files().list(ws.id, (f) => f.jobId === job.id && want.has(f.path));
  for (const f of fs) await files().update(ws.id, f.id, { applied: true });
  await jobs().update(ws.id, job.id, { log: [...job.log, logEntry("info", `Applied ${fs.length} change${fs.length === 1 ? "" : "s"} in Studio.`)].slice(-CLOUD_LIMITS.maxLog) });
  return { applied: fs.length };
}

export { jobView };
