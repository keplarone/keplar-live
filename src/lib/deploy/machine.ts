/**
 * Deployments as an explicit state machine. Pure and client-safe: the server drives it, the UI renders it, tests pin it.
 *
 *   queued ──start──▶ running ──(steps in order)──▶ live ──(a newer deploy goes live)──▶ superseded
 *                        │                                           ▲
 *                        └──fail──▶ failed        rollback = a new deploy of an older version (fast path, same machine)
 *   queued/running (before promote) ──cancel──▶ canceled
 *
 * Steps run strictly in plan order; each is pending → running → ok | warn | failed | skipped, with timestamped log lines.
 * Exactly one deployment of a creation is live at a time: going live supersedes the previous one.
 */
export type DeployStatus = "queued" | "running" | "live" | "failed" | "superseded" | "canceled";
export type DeployKind = "deploy" | "rollback";
export type StepId = "resolve" | "validate" | "scan" | "critic" | "snapshot" | "promote" | "purge" | "verify" | "domains";
export type StepState = "pending" | "running" | "ok" | "warn" | "failed" | "skipped";
export type LogLevel = "info" | "ok" | "warn" | "error";
export type LogLine = { at: string; text: string; level: LogLevel };
export type Step = { id: StepId; label: string; state: StepState; startedAt: string | null; endedAt: string | null; lines: LogLine[] };
export type Manifest = { hash: string; files: number; bytes: number; entries: { path: string; hash: string; bytes: number }[] };

export type Deploy = {
  id: string;
  workspaceId: string;
  siteId: string;
  kind: DeployKind;
  version: number;
  /** The version that was live when this started (what a rollback of THIS deploy returns to). */
  fromVersion: number | null;
  status: DeployStatus;
  steps: Step[];
  by: string;
  byName: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  url: string | null;
  manifest: Manifest | null;
  criticScore: number | null;
  error: string | null;
};

export const STEP_LABEL: Record<StepId, string> = { resolve: "Resolve version", validate: "Validate & sanitize", scan: "Safety scan", critic: "Critic score", snapshot: "Immutable snapshot", promote: "Promote to live", purge: "Purge edge cache", verify: "Verify live render", domains: "Domains & SSL" };

/** Full pipeline for a version that has never been live; rollback (a version that WAS live before) skips the re-checks. */
export const PLAN: Record<DeployKind, StepId[]> = {
  deploy: ["resolve", "validate", "scan", "critic", "snapshot", "promote", "purge", "verify", "domains"],
  rollback: ["resolve", "validate", "snapshot", "promote", "purge", "verify", "domains"],
};

export class DeployStateError extends Error {}

export function createDeploy(i: { id: string; workspaceId: string; siteId: string; kind: DeployKind; version: number; fromVersion: number | null; by: string; byName: string; at: string }): Deploy {
  return { id: i.id, workspaceId: i.workspaceId, siteId: i.siteId, kind: i.kind, version: i.version, fromVersion: i.fromVersion, status: "queued", steps: PLAN[i.kind].map((id) => ({ id, label: STEP_LABEL[id], state: "pending", startedAt: null, endedAt: null, lines: [] })), by: i.by, byName: i.byName, createdAt: i.at, startedAt: null, finishedAt: null, url: null, manifest: null, criticScore: null, error: null };
}

export type DeployEvent =
  | { type: "start" }
  | { type: "step-start"; step: StepId }
  | { type: "log"; step: StepId; text: string; level?: LogLevel }
  | { type: "step-end"; step: StepId; state: "ok" | "warn" | "skipped" }
  | { type: "fail"; step?: StepId; error: string }
  | { type: "live"; url: string }
  | { type: "supersede" }
  | { type: "cancel" };

const DONE: StepState[] = ["ok", "warn", "skipped"];
const MAX_LINES = 60;

export function reduce(d: Deploy, ev: DeployEvent, at: string): Deploy {
  const bad = (why: string): never => { throw new DeployStateError(`${ev.type} not allowed: ${why} (status ${d.status})`); };
  const steps = d.steps.map((s) => ({ ...s, lines: s.lines }));
  const idx = (id: StepId) => { const i = steps.findIndex((s) => s.id === id); if (i < 0) bad(`no step ${id} in a ${d.kind}`); return i; };
  switch (ev.type) {
    case "start":
      if (d.status !== "queued") bad("only a queued deploy can start");
      return { ...d, status: "running", startedAt: at };
    case "step-start": {
      if (d.status !== "running") bad("not running");
      const i = idx(ev.step);
      if (steps[i].state !== "pending") bad(`step ${ev.step} already ${steps[i].state}`);
      if (steps.slice(0, i).some((s) => !DONE.includes(s.state))) bad(`steps before ${ev.step} are not finished`);
      steps[i] = { ...steps[i], state: "running", startedAt: at };
      return { ...d, steps };
    }
    case "log": {
      if (d.status !== "running") bad("not running");
      const i = idx(ev.step);
      if (steps[i].state !== "running") bad(`step ${ev.step} is not running`);
      steps[i] = { ...steps[i], lines: [...steps[i].lines, { at, text: ev.text.slice(0, 300), level: ev.level ?? "info" }].slice(-MAX_LINES) };
      return { ...d, steps };
    }
    case "step-end": {
      if (d.status !== "running") bad("not running");
      const i = idx(ev.step);
      if (steps[i].state !== "running") bad(`step ${ev.step} is not running`);
      steps[i] = { ...steps[i], state: ev.state, endedAt: at };
      return { ...d, steps };
    }
    case "fail": {
      if (d.status !== "running" && d.status !== "queued") bad("already finished");
      const failed = steps.map((s) => (s.state === "running" || (ev.step && s.id === ev.step && s.state === "pending") ? { ...s, state: "failed" as const, endedAt: at, startedAt: s.startedAt ?? at } : s.state === "pending" ? { ...s, state: "skipped" as const } : s));
      return { ...d, status: "failed", steps: failed, finishedAt: at, error: ev.error.slice(0, 300) };
    }
    case "live": {
      if (d.status !== "running") bad("not running");
      if (steps.some((s) => !DONE.includes(s.state))) bad("steps are not finished");
      if (steps.find((s) => s.id === "promote")?.state !== "ok") bad("not promoted");
      return { ...d, status: "live", finishedAt: at, url: ev.url };
    }
    case "supersede":
      if (d.status !== "live") bad("only the live deploy can be superseded");
      return { ...d, status: "superseded" };
    case "cancel": {
      if (d.status !== "queued" && d.status !== "running") bad("already finished");
      if (steps.some((s) => s.id === "promote" && s.state !== "pending")) bad("already promoting; roll back instead");
      return { ...d, status: "canceled", finishedAt: at, steps: steps.map((s) => (s.state === "pending" || s.state === "running" ? { ...s, state: "skipped" as const, endedAt: s.state === "running" ? at : s.endedAt } : s)) };
    }
  }
}

/** The deploy currently serving visitors (newest live one; there is at most one when the store is consistent). */
export const liveOf = (deploys: Deploy[]) => [...deploys].filter((d) => d.status === "live").sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""))[0] ?? null;

/** A version that has been live before skips the re-checks (rollback); anything else takes the full pipeline. */
export const kindFor = (version: number, deploys: Deploy[]): DeployKind => (deploys.some((d) => d.version === version && (d.status === "live" || d.status === "superseded")) ? "rollback" : "deploy");

export type RollbackTarget = { version: number; wasLive: boolean; lastLiveAt: string | null; current: boolean };
/** Every retained version can be promoted; ones that were live before are marked known-good. */
export function rollbackTargets(retained: number[], deploys: Deploy[], liveVersion: number | null): RollbackTarget[] {
  return [...retained].sort((a, b) => b - a).map((v) => {
    const past = deploys.filter((d) => d.version === v && (d.status === "live" || d.status === "superseded")).sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""));
    return { version: v, wasLive: past.length > 0, lastLiveAt: past[0]?.finishedAt ?? null, current: v === liveVersion };
  });
}

/** A running deploy that stopped reporting (crashed function) for this long is treated as failed. */
export const STALE_MS = 180_000;
export const isStale = (d: Deploy, nowMs: number) => (d.status === "running" || d.status === "queued") && nowMs - Date.parse(d.startedAt ?? d.createdAt) > STALE_MS;

export const durationMs = (d: Pick<Deploy, "startedAt" | "finishedAt">) => (d.startedAt && d.finishedAt ? Date.parse(d.finishedAt) - Date.parse(d.startedAt) : null);
