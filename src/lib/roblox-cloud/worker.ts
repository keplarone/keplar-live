/**
 * Roblox Cloud worker: runs a job in bounded slices on Keplar's servers, so it keeps going after the person closes Keplar.
 *
 * One slice: take the job's lease, then run Opus 5.5 turns against the snapshot tools until the slice's time is up, saving a
 * checkpoint after every turn (conversation, edited scripts, plan, usage, log). Then it hands over to the next slice, which
 * resumes from that checkpoint. A slice that dies (a crashed or killed function) leaves a lease that expires, and the job is
 * picked up again by the next status poll or by the daily cron (src/app/api/cron/roblox-cloud). Every turn is charged at its
 * real cost, and the job stops on its own at the person's budget, time limit, a finished goal, repeated failures or no progress.
 */
import { randomUUID } from "node:crypto";
import { withCostTag } from "@/lib/cost/context";
import { CreditLimitError } from "@/lib/create/platform/compute";
import { HttpError } from "@/lib/create/platform/http";
import { EntitlementError } from "@/lib/create/platform/plans";
import { workspaceById, type Workspace } from "@/lib/create/platform/workspace";
import { STUDIO_PLANS } from "@/lib/desktop/studio-bridge";
import { site } from "@/lib/site";
import { lineDiff } from "@/lib/site-builder/diff";
import { buildTools, runStudioTurn } from "@/lib/studio/agent";
import { checkLuau } from "./luau-check";
import { CLOUD_LIMITS, currentSource, emptyUsage, files, jobs, logEntry, type CloudFile, type CloudJob, type CloudReport, type JobStatus } from "./model";
import { openingMessage, ROBLOX_CLOUD_PROFILE } from "./prompt";
import { CLOUD_TOOL_DEFS, CLOUD_TOOL_POLICY, runCloudTool, type ToolState } from "./tools";

/** Units a turn must leave room for before it starts (a typical cloud turn costs far less). */
const TURN_RESERVE_UNITS = 150;

export type WorkerDeps = {
  fetch?: typeof fetch;
  now?: () => number;
  /** Starts the next slice. Default: the internal worker route (worker() in this file). */
  trigger?: (job: Pick<CloudJob, "id" | "workspaceId">) => Promise<void>;
  sliceMs?: number;
};

const iso = (ms: number) => new Date(ms).toISOString();
const isActive = (s: JobStatus) => s === "queued" || s === "running";

/** The base URL slices call to hand over (production: keplar.one; previews: their own URL; local: localhost). */
export function workerBase(env: Record<string, string | undefined> = process.env): string {
  if (env.KEPLAR_INTERNAL_URL) return env.KEPLAR_INTERNAL_URL.replace(/\/$/, "");
  if (env.VERCEL_ENV === "production") return site.url.replace(/\/$/, "");
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return `http://localhost:${env.PORT ?? 3000}`;
}

/** Starts the next slice through the internal route (authorized with CRON_SECRET). It answers at once and works in the background. */
export async function triggerNext(job: Pick<CloudJob, "id" | "workspaceId">, deps: { fetch?: typeof fetch; env?: Record<string, string | undefined> } = {}): Promise<void> {
  const env = deps.env ?? process.env;
  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("[roblox-cloud] CRON_SECRET is not set: the next slice starts on the next status poll or the daily cron");
    return;
  }
  const res = await (deps.fetch ?? fetch)(`${workerBase(env)}/api/roblox-cloud/worker`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ jobId: job.id, workspaceId: job.workspaceId }),
    signal: AbortSignal.timeout(15_000),
  }).catch((e: unknown) => { console.error("[roblox-cloud] hand-over failed:", e instanceof Error ? e.name : "error"); return null; });
  if (res && !res.ok) console.error(`[roblox-cloud] hand-over answered ${res.status}`);
}

export async function loadFiles(job: Pick<CloudJob, "id" | "workspaceId">): Promise<Map<string, CloudFile>> {
  const rows = await files().list(job.workspaceId, (f) => f.jobId === job.id);
  return new Map(rows.map((f) => [f.path, f]));
}

/** Shortens old tool results and drops old reasoning once the conversation gets large, so later turns stay cheap. */
export function compact(messages: unknown[], limit: number = CLOUD_LIMITS.compactChars): unknown[] {
  if (JSON.stringify(messages).length <= limit) return messages;
  const keep = 16;
  return messages.map((m, i) => {
    if (i === 0 || i >= messages.length - keep || !m || typeof m !== "object") return m;
    const r = m as Record<string, unknown>;
    if (r.role === "tool" && typeof r.content === "string" && r.content.length > 240) return { ...r, content: `${r.content.slice(0, 200)} … (older result shortened; read again if you need it)` };
    if (r.role === "assistant" && r.reasoning_details) { const rest = { ...r }; delete rest.reasoning_details; return rest; }
    return m;
  });
}

/** Baseline: every script checked once before any change, so the job (and the report) knows what was already broken. */
export async function baselineCheck(map: Map<string, CloudFile>): Promise<{ problems: number; unchecked: number; files: number; summary: string; perFile: Map<string, number> }> {
  let problems = 0, unchecked = 0;
  const lines: string[] = [];
  const perFile = new Map<string, number>();
  for (const f of [...map.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    const r = await checkLuau(f.base);
    if (!r.checked) { unchecked++; continue; }
    perFile.set(f.path, r.problems.length);
    if (!r.problems.length) continue;
    problems += r.problems.length;
    if (lines.length < 40) lines.push(...r.problems.slice(0, 3).map((p) => `${f.path}:${p.line} (${p.kind}): ${p.message}`));
  }
  const summary = problems ? `${problems} problem${problems === 1 ? "" : "s"} in ${[...perFile.values()].filter((n) => n > 0).length} scripts${unchecked ? `; ${unchecked} large scripts not checked` : ""}:\n${lines.join("\n")}` : `No problems found${unchecked ? ` (${unchecked} large scripts not checked)` : ""}.`;
  return { problems, unchecked, files: map.size, summary, perFile };
}

/** Moves a draft with a full snapshot to queued: checks the baseline, writes the opening message, and starts the first slice. */
export async function startJob(job: CloudJob, deps: WorkerDeps = {}): Promise<CloudJob> {
  const map = await loadFiles(job);
  if (!map.size) throw new HttpError(400, "The snapshot has no scripts yet. Send the scripts first.", "empty_snapshot");
  const base = await baselineCheck(map);
  await Promise.all([...map.values()].map((f) => files().update(f.workspaceId, f.id, { baseProblems: base.perFile.get(f.path) })));
  const now = (deps.now ?? Date.now)();
  const messages = [{ role: "user", content: openingMessage({ goal: job.goal, mode: job.mode, place: job.place.name, scripts: map.size, baseline: base.summary, minutes: job.maxMinutes }) }];
  const next = await jobs().update(job.workspaceId, job.id, {
    status: "queued", scriptCount: map.size, messages, baseline: { problems: base.problems, unchecked: base.unchecked, files: base.files },
    log: [...job.log, logEntry("check", `Baseline: ${base.problems} problem${base.problems === 1 ? "" : "s"} in the snapshot${base.unchecked ? `, ${base.unchecked} large scripts not checked` : ""}.`), logEntry("info", "Queued. Work starts in a moment and continues even if you close Keplar.")],
    updatedAt: iso(now), heartbeatAt: iso(now),
  });
  await (deps.trigger ?? triggerNext)(job);
  return next!;
}

/** The report's file list and check counts, computed from the snapshot (not from the model). */
export async function buildReport(job: CloudJob, map: Map<string, CloudFile>, said: Omit<CloudReport, "files" | "checks">): Promise<CloudReport> {
  const out: CloudReport["files"] = [];
  const before = job.baseline?.problems ?? 0;
  let after = before, unchecked = 0;
  for (const f of [...map.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    if (f.next === undefined) continue;
    if (f.created && f.next === null) continue;
    const next = f.next ?? "";
    const ops = lineDiff(f.base, next);
    out.push({ path: f.path, status: f.created ? "created" : f.next === null ? "deleted" : "changed", plus: ops.filter((o) => o.t === "+").length, minus: ops.filter((o) => o.t === "-").length });
    after -= f.baseProblems ?? 0;
    if (f.next !== null) {
      const r = await checkLuau(next);
      if (r.checked) after += r.problems.length;
      else unchecked++;
    }
  }
  return { ...said, files: out, checks: { before, after: Math.max(0, after), unchecked } };
}

async function finishJob(job: CloudJob, map: Map<string, CloudFile>, status: JobStatus, reason: string, said?: Omit<CloudReport, "files" | "checks">, now = Date.now()) {
  const report = await buildReport(job, map, said ?? { summary: reason, done: [], unresolved: [reason], testing: [] });
  await jobs().update(job.workspaceId, job.id, { status, stopReason: reason, report, finishedAt: iso(now), updatedAt: iso(now), leaseUntil: iso(now), log: [...job.log, logEntry("stop", reason)].slice(-CLOUD_LIMITS.maxLog) });
}

async function persistFiles(map: Map<string, CloudFile>, dirty: Set<string>) {
  for (const path of dirty) {
    const f = map.get(path);
    if (!f) continue;
    const existing = await files().get(f.workspaceId, f.id);
    if (existing) await files().update(f.workspaceId, f.id, { next: f.next, className: f.className, created: f.created });
    else await files().insert(f);
  }
  dirty.clear();
}

/** Takes the lease when it is free (or expired). Returns the lease id, or null when another slice holds it. */
async function takeLease(job: CloudJob, now: number): Promise<string | null> {
  if (job.leaseUntil && Date.parse(job.leaseUntil) > now && job.leaseId) return null;
  const leaseId = randomUUID();
  await jobs().update(job.workspaceId, job.id, { leaseId, leaseUntil: iso(now + CLOUD_LIMITS.leaseMs) });
  const again = await jobs().get(job.workspaceId, job.id);
  return again?.leaseId === leaseId ? leaseId : null;
}

/** Runs one slice of a job. Safe to call twice: the lease makes sure only one slice works on a job at a time. */
export async function runSlice(workspaceId: string, jobId: string, deps: WorkerDeps = {}): Promise<{ status: JobStatus | "missing" | "busy"; turns: number }> {
  const clock = deps.now ?? Date.now;
  const sliceStart = clock();
  let job = await jobs().get(workspaceId, jobId);
  if (!job) return { status: "missing", turns: 0 };
  if (!isActive(job.status)) return { status: job.status, turns: 0 };
  const leaseId = await takeLease(job, sliceStart);
  if (!leaseId) return { status: "busy", turns: 0 };
  job = (await jobs().get(workspaceId, jobId))!;
  const map = await loadFiles(job);

  const ws: Workspace | null = await workspaceById(workspaceId);
  if (!ws || !STUDIO_PLANS.has(ws.plan)) {
    await finishJob(job, map, "blocked", "Roblox Cloud needs Keplar Lite, Plus or Pro, and this account's plan does not include it now.", undefined, clock());
    return { status: "blocked", turns: 0 };
  }
  job.status = "running";
  job.startedAt ??= iso(sliceStart);
  job.slices += 1;
  await jobs().update(workspaceId, jobId, { status: "running", startedAt: job.startedAt, slices: job.slices, heartbeatAt: iso(sliceStart) });

  const tools = buildTools(CLOUD_TOOL_DEFS as unknown as unknown[], (n) => CLOUD_TOOL_POLICY[n]);
  const st: ToolState = { files: map, tree: job.tree, jobId, workspaceId, dirty: new Set() };
  let turns = 0;
  let timeNoticeSent = job.messages.some((m) => typeof (m as { content?: unknown }).content === "string" && String((m as { content: string }).content).startsWith("Time is up"));
  const sliceMs = deps.sliceMs ?? CLOUD_LIMITS.sliceMs;

  while (clock() - sliceStart < sliceMs) {
    const live = await jobs().get(workspaceId, jobId);
    if (!live || live.leaseId !== leaseId) return { status: "busy", turns };
    if (live.control === "stop") { await finishJob(job, map, "stopped", "Stopped by you.", undefined, clock()); return { status: "stopped", turns }; }
    if (live.control === "pause") {
      await jobs().update(workspaceId, jobId, { status: "paused", control: undefined, leaseUntil: iso(clock()), updatedAt: iso(clock()), log: [...job.log, logEntry("stop", "Paused by you. Resume to continue from here.")].slice(-CLOUD_LIMITS.maxLog) });
      return { status: "paused", turns };
    }
    if (job.usage.turns >= CLOUD_LIMITS.maxTurns) { await finishJob(job, map, "stopped", `Stopped at the ${CLOUD_LIMITS.maxTurns}-turn limit for one job.`, undefined, clock()); return { status: "stopped", turns }; }
    if (job.usage.units + TURN_RESERVE_UNITS > job.maxUnits) { await finishJob(job, map, "stopped", `Stopped at your budget of ${job.maxUnits} credits (${job.usage.units} used).`, undefined, clock()); return { status: "stopped", turns }; }
    const elapsedMin = (clock() - Date.parse(job.startedAt!)) / 60_000;
    if (elapsedMin >= job.maxMinutes) {
      if (!timeNoticeSent) {
        job.messages.push({ role: "user", content: "Time is up. Call finish now with your report: what was done, what is unresolved, and what to test." });
        timeNoticeSent = true;
      } else if (elapsedMin >= job.maxMinutes + 5) {
        await finishJob(job, map, "stopped", `Stopped at your time limit of ${job.maxMinutes} minutes.`, undefined, clock());
        return { status: "stopped", turns };
      }
    }

    let turn: Awaited<ReturnType<typeof runStudioTurn>>;
    try {
      // Attributed to the owner in the cost meter (this runs from the worker, not from their browser request).
      turn = await withCostTag({ feature: "agents", userId: ws.userId, plan: ws.plan, route: "/api/roblox-cloud/worker" }, () => runStudioTurn(ws, { messages: job.messages as never, tools }, { fetch: deps.fetch }, ROBLOX_CLOUD_PROFILE));
      job.failures = 0;
    } catch (e) {
      if (e instanceof CreditLimitError || e instanceof EntitlementError) { await finishJob(job, map, "blocked", `Stopped: ${e.message}`, undefined, clock()); return { status: "blocked", turns }; }
      const msg = e instanceof HttpError ? e.message : "The model call failed.";
      job.failures += 1;
      job.log.push(logEntry("error", msg));
      if (e instanceof HttpError && e.code.startsWith("model_") && e.code !== "model_busy") { await finishJob(job, map, "blocked", msg, undefined, clock()); return { status: "blocked", turns }; }
      if (job.failures >= CLOUD_LIMITS.maxFailures) { await finishJob(job, map, "blocked", `Stopped after ${job.failures} failed model calls in a row: ${msg}`, undefined, clock()); return { status: "blocked", turns }; }
      await jobs().update(workspaceId, jobId, { failures: job.failures, log: job.log.slice(-CLOUD_LIMITS.maxLog), heartbeatAt: iso(clock()), leaseUntil: iso(clock() + CLOUD_LIMITS.leaseMs) });
      await new Promise((r) => setTimeout(r, Math.min(20_000, 2_000 * 2 ** job.failures)));
      continue;
    }
    turns++;
    job.usage = {
      turns: job.usage.turns + 1, units: job.usage.units + turn.units, usd: Math.round((job.usage.usd + turn.usage.usd) * 1e6) / 1e6,
      promptTokens: job.usage.promptTokens + turn.usage.promptTokens, cachedTokens: job.usage.cachedTokens + turn.usage.cachedTokens, completionTokens: job.usage.completionTokens + turn.usage.completionTokens,
    };
    job.messages.push(turn.message);
    if (turn.text) job.log.push(logEntry("info", turn.text));

    let progressed = false;
    let finished: Omit<CloudReport, "files" | "checks"> | undefined;
    for (const a of turn.actions) {
      const r = await runCloudTool(st, a.name, a.args);
      job.messages.push({ role: "tool", tool_call_id: a.id, content: r.text.slice(0, 12_000) });
      if (r.effects.edited) { progressed = true; job.log.push(logEntry("edit", `${a.name.replace("_script", "")}: ${r.effects.edited}${/problem/.test(r.text) && !/no problems/.test(r.text) ? " (check found problems)" : ""}`)); }
      if (r.effects.plan) { progressed = progressed || JSON.stringify(r.effects.plan) !== JSON.stringify(job.plan); job.plan = r.effects.plan; job.log.push(logEntry("plan", `Plan: ${job.plan.filter((s) => s.status === "done").length} of ${job.plan.length} steps done.`)); }
      if (r.effects.finished) finished = r.effects.finished;
    }
    for (const b of turn.blocked) job.messages.push({ role: "tool", tool_call_id: b.id, content: `${b.name} is not available in Roblox Cloud.` });
    if (turn.done && !finished) {
      // The model stopped without the report: ask once, then close with what it said.
      const asked = job.messages.slice(-3).some((m) => (m as { content?: unknown }).content === "Call finish with your report now.");
      if (asked) finished = { summary: turn.text || "The job ended without a report.", done: [], unresolved: [], testing: [] };
      else job.messages.push({ role: "user", content: "Call finish with your report now." });
    }
    job.stall = progressed ? 0 : job.stall + 1;

    await persistFiles(map, st.dirty);
    job.messages = compact(job.messages);
    const t = clock();
    await jobs().update(workspaceId, jobId, { messages: job.messages, usage: job.usage, plan: job.plan, log: job.log.slice(-CLOUD_LIMITS.maxLog), stall: job.stall, failures: job.failures, heartbeatAt: iso(t), updatedAt: iso(t), leaseUntil: iso(t + CLOUD_LIMITS.leaseMs) });
    if (finished) { await finishJob(job, map, "done", "Finished.", finished, clock()); return { status: "done", turns }; }
    if (job.stall >= CLOUD_LIMITS.stallTurns) { await finishJob(job, map, "stopped", `Stopped: ${job.stall} turns in a row without an edit or plan progress, so more turns were unlikely to help.`, undefined, clock()); return { status: "stopped", turns }; }
  }

  // Slice time is up with work left: release the lease and hand over to the next slice.
  await jobs().update(workspaceId, jobId, { leaseUntil: iso(clock()), leaseId: undefined, updatedAt: iso(clock()) });
  await (deps.trigger ?? triggerNext)(job);
  return { status: "running", turns };
}

/** Restarts jobs whose slice died (lease expired while still active). Used by status polls and the daily cron. */
export async function resumeStale(deps: WorkerDeps = {}, limit = 10): Promise<number> {
  const now = (deps.now ?? Date.now)();
  const stale = await jobs().listSystem((j) => isActive(j.status) && (!j.leaseUntil || Date.parse(j.leaseUntil) < now) && Date.parse(j.heartbeatAt ?? j.updatedAt) < now - 60_000);
  for (const j of stale.slice(0, limit)) await (deps.trigger ?? triggerNext)(j);
  return Math.min(stale.length, limit);
}

export { currentSource, emptyUsage };
