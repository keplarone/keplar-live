/**
 * Roblox Cloud: the overnight Roblox development jobs (docs/roblox-cloud.md).
 *
 * Roblox Studio does not run on Keplar's servers, so a job works on a snapshot of the game's scripts taken from the person's
 * own Studio (through the desktop app): Opus 5.5 reads and edits those scripts in the cloud, every edit is checked with
 * Luau's own analyzer, and the result is a set of reviewable changes. Nothing reaches the real game until the person reviews
 * the changes and applies them in Studio, where each one is checked against the current script first (no silent overwrite).
 *
 * Collections (per workspace, deleted with the account):
 *   roblox_cloud_jobs   one row per job: goal, limits, status, plan, log, usage, the conversation checkpoint, the report
 *   roblox_cloud_files  one row per script in the job's snapshot: path, class, the original and the edited source
 */
import { createHash } from "node:crypto";
import { collection } from "@/lib/create/platform/store";

export const CLOUD_LIMITS = {
  /** Snapshot caps: what one job may carry (the person's Studio sends it in batches). */
  maxScripts: 800,
  maxScriptBytes: 400_000,
  maxSnapshotBytes: 6_000_000,
  maxTreeChars: 40_000,
  maxBatchBytes: 3_000_000,
  maxGoalChars: 4_000,
  /** A person can't spend more than this on one job, whatever they choose. */
  maxUnitsCap: 20_000,
  minUnits: 300,
  maxMinutesCap: 12 * 60,
  maxTurns: 160,
  /** One slice runs at most this long, then hands over to the next slice (well inside the 300 s function limit). */
  sliceMs: 200_000,
  /** A running slice renews its lease each turn; a lease older than this means the slice died and another may take over. */
  leaseMs: 6 * 60_000,
  /** Turns in a row with no edit and no plan progress before the job stops as unproductive. */
  stallTurns: 12,
  /** Model failures in a row before the job stops as blocked. */
  maxFailures: 3,
  maxLog: 200,
  /** The conversation is compacted above this size (old tool results shortened), so turns stay cheap. */
  compactChars: 260_000,
  keepDays: 30,
  /** Jobs kept per workspace (the oldest finished ones are removed beyond this). */
  keepJobs: 8,
} as const;

export type StopMode = "until_done" | "time" | "checkpoint";
export type JobStatus = "draft" | "queued" | "running" | "paused" | "done" | "stopped" | "blocked" | "failed";
export type PlanStep = { title: string; status: "todo" | "doing" | "done" | "skipped" };
export type LogEntry = { at: string; kind: "info" | "edit" | "check" | "plan" | "error" | "stop"; text: string };
export type CloudUsage = { turns: number; units: number; usd: number; promptTokens: number; cachedTokens: number; completionTokens: number };
export type CloudReport = {
  summary: string;
  done: string[];
  unresolved: string[];
  testing: string[];
  files: { path: string; status: "changed" | "created" | "deleted"; plus: number; minus: number }[];
  checks: { before: number; after: number; unchecked: number };
};

export type CloudJob = {
  id: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  place: { id: string; name: string };
  goal: string;
  mode: StopMode;
  maxUnits: number;
  maxMinutes: number;
  status: JobStatus;
  /** Why it stopped (budget, time, finished, stalled, cancelled, out of credits, model unavailable…), in plain words. */
  stopReason?: string;
  /** Set when the job was created from Space Studio: its Space Studio plan (src/lib/space-studio/cloud.ts) gates it instead of the Keplar plan. */
  product?: "space-studio";
  /** The person asked it to pause or stop: honored at the next turn boundary. */
  control?: "pause" | "stop";
  tree: string;
  scriptCount: number;
  startedAt?: string;
  finishedAt?: string;
  heartbeatAt?: string;
  leaseUntil?: string;
  leaseId?: string;
  slices: number;
  plan: PlanStep[];
  log: LogEntry[];
  usage: CloudUsage;
  /** The model conversation so far (the checkpoint a new slice resumes from). */
  messages: unknown[];
  stall: number;
  failures: number;
  baseline?: { problems: number; unchecked: number; files: number };
  report?: CloudReport;
};

export type CloudFile = {
  id: string;
  workspaceId: string;
  jobId: string;
  path: string;
  className: "Script" | "LocalScript" | "ModuleScript";
  /** RunContext for Scripts that set it (Legacy / Server / Client), kept so a created script behaves the same. */
  runContext?: string;
  base: string;
  baseHash: string;
  /** Present once edited in the cloud (null = deleted). Absent = unchanged. */
  next?: string | null;
  created?: boolean;
  applied?: boolean;
  /** Problems Luau's analyzer found in the original before the job started (for the report's before/after count). */
  baseProblems?: number;
};

export const jobs = () => collection<CloudJob>("roblox_cloud_jobs");
export const files = () => collection<CloudFile>("roblox_cloud_files");

export const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);
export const fileId = (jobId: string, path: string) => `${jobId}:${sha(path)}`;
export const emptyUsage = (): CloudUsage => ({ turns: 0, units: 0, usd: 0, promptTokens: 0, cachedTokens: 0, completionTokens: 0 });

/** Script paths: service/child/child, names may not contain "/" (escaped as "∕" by the snapshot); a duplicate name ends in #2, #3… */
export const PATH = /^[A-Za-z][A-Za-z0-9]*(?:\/[^/\n]{1,120}){1,40}$/;
export const SCRIPT_CLASSES = new Set(["Script", "LocalScript", "ModuleScript"]);

/** The current source of a file as the job sees it. */
export const currentSource = (f: CloudFile): string | null => (f.next === undefined ? f.base : f.next);

/** What the person sees about a job (no conversation, no sources). */
export function jobView(j: CloudJob) {
  return {
    id: j.id, place: j.place, goal: j.goal, mode: j.mode, maxUnits: j.maxUnits, maxMinutes: j.maxMinutes, status: j.status,
    stopReason: j.stopReason ?? null, control: j.control ?? null, createdAt: j.createdAt, startedAt: j.startedAt ?? null, finishedAt: j.finishedAt ?? null,
    heartbeatAt: j.heartbeatAt ?? null, slices: j.slices, scriptCount: j.scriptCount, plan: j.plan, log: j.log.slice(-60), usage: j.usage,
    baseline: j.baseline ?? null, report: j.report ?? null,
  };
}

export function logEntry(kind: LogEntry["kind"], text: string): LogEntry {
  return { at: new Date().toISOString(), kind, text: text.slice(0, 400) };
}
