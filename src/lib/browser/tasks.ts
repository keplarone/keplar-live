/**
 * Keplar Browser tasks, saved on Keplar's servers (Keplar Cloud for browsing): a task keeps running after the person closes
 * the tab, every step is saved as it happens, and the person can come back to the result or stop it.
 *  - One running task per account at a time; the newest MAX_KEPT tasks are kept, older ones are deleted.
 *  - A task runs inside one server invocation (MAX_STEPS steps fit well inside its time limit). If that invocation dies, the
 *    lease runs out and the task reads as "interrupted" instead of "running" forever. Nothing is retried behind the person's back.
 *  - Only the newest screenshot is kept (older steps keep their note and address), so rows stay small.
 */
import { collection } from "@/lib/create/platform/store";
import { id as newId, now } from "@/lib/create/platform/ids";
import { memoryModelDeps } from "@/lib/memory/extract";
import type { Classification } from "@/lib/orchestration/types";
import { SYSTEM } from "./policy";
import type { Decide, Outcome, Step } from "./run";
import type { Browser } from "playwright-core";

export const MAX_KEPT = 20;
export const LEASE_MS = 6 * 60_000;

export type TaskStatus = "running" | "done" | "needs_you" | "failed" | "stopped";
export type BrowserTaskRow = {
  id: string;
  workspaceId: string;
  goal: string;
  url?: string;
  status: TaskStatus;
  steps: Step[];
  answer?: string;
  reason?: string;
  stopRequested?: boolean;
  leaseUntil?: string;
  createdAt: string;
  updatedAt: string;
};
export type TaskView = Omit<BrowserTaskRow, "workspaceId" | "leaseUntil" | "stopRequested" | "status"> & { status: TaskStatus | "interrupted" };

export const taskRows = () => collection<BrowserTaskRow>("browser_tasks");

/** What the person sees: a running task whose server invocation ended without finishing reads as interrupted. */
export function taskView(t: BrowserTaskRow, at = Date.now()): TaskView {
  const lost = t.status === "running" && (!t.leaseUntil || Date.parse(t.leaseUntil) < at);
  return { id: t.id, goal: t.goal, ...(t.url ? { url: t.url } : {}), steps: t.steps, ...(t.answer ? { answer: t.answer } : {}), ...(t.reason ? { reason: t.reason } : {}), createdAt: t.createdAt, updatedAt: t.updatedAt, status: lost ? "interrupted" : t.status, ...(lost ? { reason: "The task was interrupted on Keplar's servers before it finished. Start it again to retry." } : {}) };
}

export async function listTasks(workspaceId: string): Promise<BrowserTaskRow[]> {
  return (await taskRows().list(workspaceId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createTask(workspaceId: string, goal: string, url?: string): Promise<BrowserTaskRow> {
  const all = await listTasks(workspaceId);
  if (all.some((t) => taskView(t).status === "running")) throw new TaskBusy();
  for (const old of all.slice(MAX_KEPT - 1)) await taskRows().remove(workspaceId, old.id);
  const t = now();
  const row: BrowserTaskRow = { id: newId("bt"), workspaceId, goal, ...(url ? { url } : {}), status: "running", steps: [], leaseUntil: new Date(Date.now() + LEASE_MS).toISOString(), createdAt: t, updatedAt: t };
  return taskRows().insert(row);
}

export class TaskBusy extends Error {
  constructor() {
    super("A browser task is already running. Stop it or wait for it to finish.");
  }
}

const CLS: Classification = { kind: "general", complexity: "moderate", capabilities: [], estimatedInputTokens: 2500, estimatedOutputTokens: 120, needsWeb: false, rationale: "Browser step." };

/** The live models choose each step (free models, under the shared spend guard), or null when live models are off. */
export function modelDecide(signal?: AbortSignal): Decide | null {
  const deps = memoryModelDeps();
  if (!deps?.models.length) return null;
  return async (prompt) => {
    for (const model of deps.models.slice(0, 3)) {
      try {
        const sig = signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
        const r = await deps.registry.once({ model, prompt, system: SYSTEM, classification: CLS, params: { maxOutputTokens: 400 }, slot: "panel", signal: sig });
        if (r.ok && r.text) return r.text;
      } catch {
        /* next model */
      }
    }
    return null;
  };
}

type RunDeps = { decide: Decide; withBrowser?: <T>(fn: (b: Browser) => Promise<T>) => Promise<T>; run?: typeof import("./run").runBrowserTask };

/** Run a saved task to the end, saving each step; stops between steps when the person asks. Never throws. */
export async function runStoredTask(task: BrowserTaskRow, deps: RunDeps): Promise<void> {
  const rows = taskRows();
  const ctl = new AbortController();
  const steps: Step[] = [];
  const save = (patch: Partial<BrowserTaskRow>) => rows.update(task.workspaceId, task.id, { ...patch, updatedAt: now() });
  let outcome: Outcome;
  try {
    const withBrowser = deps.withBrowser ?? (await import("@/lib/site-builder/qa/browser")).withBrowser;
    const run = deps.run ?? (await import("./run")).runBrowserTask;
    outcome = await withBrowser((browser) =>
      run(
        { goal: task.goal, url: task.url },
        {
          browser,
          decide: deps.decide,
          signal: ctl.signal,
          onStep: (s) => {
            steps.forEach((x) => delete x.shot);
            steps.push(s);
            void (async () => {
              const cur = await rows.get(task.workspaceId, task.id).catch(() => null);
              if (cur?.stopRequested) ctl.abort();
              await save({ steps: steps.map((x) => ({ ...x })), leaseUntil: new Date(Date.now() + LEASE_MS).toISOString() }).catch(() => undefined);
            })();
          },
        },
      ),
    );
  } catch (e) {
    outcome = { status: "failed", reason: e instanceof Error && e.message.startsWith("The test browser could not start") ? "Keplar's browser couldn't start on the server. Nothing was opened." : "The browser task didn't finish. Nothing was bought, sent or changed.", steps: steps.length };
  }
  const cur = await rows.get(task.workspaceId, task.id).catch(() => null);
  const stopped = cur?.stopRequested && outcome.status !== "done";
  await save({
    status: stopped ? "stopped" : outcome.status,
    steps,
    ...(outcome.answer ? { answer: outcome.answer } : {}),
    reason: stopped ? "You stopped the task. The browser was closed." : outcome.reason,
    leaseUntil: undefined,
  }).catch(() => undefined);
}
