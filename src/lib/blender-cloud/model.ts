/**
 * Blender Cloud rendering: render a .blend on Keplar's servers while the person's computer is off (docs/blender-cloud.md).
 *
 * Each job gets its own render machine (a Vercel Sandbox started from a prepared image with Blender, src/lib/blender-cloud/
 * machine.ts). The desktop app packs the scene (textures included) and uploads it straight to that machine with the job's
 * token; Blender renders there with no network access; the frames stay on the machine (kept when it stops) until the
 * desktop app downloads them. Keplar's server only starts, watches, bills and stops the machine.
 *
 * Collections (per workspace, deleted with the account):
 *   blender_cloud_jobs    one row per job: settings, the scene report, the machine, progress, usage, log
 *   system_blender_cloud  workspace "system": the prepared image and this month's machine time (the capacity guard)
 */
import { collection } from "@/lib/create/platform/store";

const envInt = (name: string, fallback: number, min: number, max: number) => {
  const n = Math.floor(Number(process.env[name]));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

export const RENDER_LIMITS = {
  /** The packed scene (compressed .blend with its textures). */
  maxSceneBytes: 2_000_000_000,
  maxFrames: 2_500,
  minUnits: 100,
  maxUnitsCap: 20_000,
  maxMinutesCap: 24 * 60,
  /** A machine waits this long for the upload, then the job ends (so an abandoned upload stops costing). */
  uploadMinutes: 30,
  /** One worker slice watches the render this long, then hands over (well inside the 300 s function limit). */
  sliceMs: 200_000,
  pollMs: 20_000,
  leaseMs: 6 * 60_000,
  /** Finished renders stay downloadable this long; then the machine and its files are deleted. */
  keepDays: 3,
  keepJobs: 8,
  maxLog: 120,
} as const;

/** Machine size and session length come from the Vercel plan (Hobby: 4 vCPUs, 45-minute sessions; Pro: 8 and 24 hours). */
export const machineSpec = () => ({
  vcpus: envInt("KEPLAR_RENDER_VCPUS", 4, 1, 32),
  sessionMinutes: envInt("KEPLAR_RENDER_SESSION_MIN", 44, 5, 24 * 60),
  /** Machine hours all accounts together may use per calendar month (Hobby includes 5 CPU-hours: about 1.25 hours of 4 vCPUs). */
  monthlyHours: envInt("KEPLAR_RENDER_MONTHLY_HOURS", 1, 0, 100_000),
  /** Render machines running at once, across all accounts. */
  concurrent: envInt("KEPLAR_RENDER_CONCURRENT", 2, 0, 1_000),
});

/** What a machine-minute costs Keplar (Vercel Sandbox, iad1: $0.128 per vCPU-hour of CPU, $0.0212 per GB-hour, 2 GB per vCPU). */
export const usdPerMachineMinute = (vcpus: number) => (vcpus * 0.128 + vcpus * 2 * 0.0212) / 60;
/** Credits are charged at this multiple of the machine's cost (rendering keeps every core busy, so this is close to real use). */
export const RENDER_CREDIT_RATE = 1.5;

export type RenderEngine = "CYCLES" | "BLENDER_EEVEE" | "BLENDER_WORKBENCH";
export type RenderFormat = "PNG" | "JPEG" | "OPEN_EXR";
export const ENGINES: RenderEngine[] = ["CYCLES", "BLENDER_EEVEE", "BLENDER_WORKBENCH"];
export const FORMATS: RenderFormat[] = ["PNG", "JPEG", "OPEN_EXR"];

/** What the add-on found in the scene (shown to the person; the render itself reads the uploaded file). */
export type SceneReport = {
  file: string;
  blender: string;
  engine: string;
  frameStart: number;
  frameEnd: number;
  frameCurrent: number;
  fps: number;
  resX: number;
  resY: number;
  resPercent: number;
  samples: number | null;
  objects: number;
  missing: string[];
  warnings: string[];
};

export type RenderSettings = {
  engine: RenderEngine;
  frameStart: number;
  frameEnd: number;
  frameStep: number;
  resPercent: number;
  /** Override the scene's render samples (Cycles or EEVEE). Absent = the scene's own. */
  samples?: number;
  format: RenderFormat;
  /** For an animation: also join the frames into an MP4 at the scene's frame rate. */
  video: boolean;
};

export type RenderStatus = "uploading" | "queued" | "rendering" | "paused" | "done" | "stopped" | "failed";
export type LogEntry = { at: string; kind: "info" | "frame" | "error" | "stop"; text: string };
export type RenderUsage = { units: number; usd: number; machineMinutes: number };
export type OutputFile = { name: string; bytes: number };

export type RenderJob = {
  id: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  file: string;
  report: SceneReport;
  settings: RenderSettings;
  maxUnits: number;
  maxMinutes: number;
  status: RenderStatus;
  stopReason?: string;
  /** Set when the job was created from Space Studio: its Space Studio plan (src/lib/space-studio/cloud.ts) gates it instead of the Keplar plan. */
  product?: "space-studio";
  control?: "pause" | "stop";
  /** The job's render machine. `token` is the secret the desktop app uploads and downloads with; never in jobView. */
  machine?: { name: string; url: string; token: string; vcpus: number };
  sceneBytes?: number;
  /** Frames rendered so far (from the files on the machine). */
  done: number[];
  /** The frame being rendered and how far along, from Blender's log. */
  current?: { frame: number; progress: string };
  /** Seconds the last frames took, for the time estimate. */
  frameSeconds: number[];
  /** The running step: frames or the video, the machine session it runs in, when it started and how many frames were done then. */
  run?: { phase: "render" | "video"; startedAt: string; session: string; doneAtStart: number };
  /** Times the render was started again on a fresh machine session (a session lasts at most sessionMinutes). */
  restarts: number;
  /** Machine time is charged up to this moment. */
  chargedTo?: string;
  startedAt?: string;
  finishedAt?: string;
  heartbeatAt?: string;
  leaseUntil?: string;
  leaseId?: string;
  slices: number;
  usage: RenderUsage;
  outputs: OutputFile[];
  /** The machine was stopped (kept for download) or deleted. */
  machineState?: "running" | "stopped" | "deleted";
  downloadedAt?: string;
  log: LogEntry[];
};

export type SystemRow = {
  id: string;
  workspaceId: string;
  /** "image": the prepared Blender image. "month:YYYY-MM": machine minutes used that month, all accounts together. */
  snapshotId?: string;
  blender?: string;
  recipe?: string;
  builtAt?: string;
  minutes?: number;
};

export const jobs = () => collection<RenderJob>("blender_cloud_jobs");
export const system = () => collection<SystemRow>("system_blender_cloud");
export const SYSTEM_WS = "system";

export const emptyUsage = (): RenderUsage => ({ units: 0, usd: 0, machineMinutes: 0 });
export const isActive = (s: RenderStatus) => s === "uploading" || s === "queued" || s === "rendering";

/** The frames a job renders, in order. */
export function frameList(s: Pick<RenderSettings, "frameStart" | "frameEnd" | "frameStep">): number[] {
  const out: number[] = [];
  for (let f = s.frameStart; f <= s.frameEnd && out.length <= RENDER_LIMITS.maxFrames; f += Math.max(1, s.frameStep)) out.push(f);
  return out;
}

/** The frame number in an output file name (frame_00012.png -> 12). */
export const frameOf = (name: string): number | null => {
  const m = /^frame_(-?\d{1,7})\.(png|jpg|exr)$/.exec(name);
  return m ? Number(m[1]) : null;
};

/** What the person sees about a job (no machine token). */
export function jobView(j: RenderJob) {
  const total = frameList(j.settings).length;
  const avg = j.frameSeconds.length ? j.frameSeconds.reduce((a, b) => a + b, 0) / j.frameSeconds.length : null;
  return {
    id: j.id, file: j.file, report: j.report, settings: j.settings, maxUnits: j.maxUnits, maxMinutes: j.maxMinutes, status: j.status,
    stopReason: j.stopReason ?? null, control: j.control ?? null, createdAt: j.createdAt, startedAt: j.startedAt ?? null, finishedAt: j.finishedAt ?? null,
    expiresAt: j.expiresAt, frames: { total, done: j.done.length, current: j.current ?? null, secondsPerFrame: avg === null ? null : Math.round(avg) },
    usage: j.usage, outputs: j.outputs, machine: j.machine ? { vcpus: j.machine.vcpus, state: j.machineState ?? "running" } : null,
    downloadedAt: j.downloadedAt ?? null, log: j.log.slice(-40),
  };
}

export function logEntry(kind: LogEntry["kind"], text: string): LogEntry {
  return { at: new Date().toISOString(), kind, text: text.slice(0, 300) };
}
