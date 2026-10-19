/**
 * Per-user job concurrency across serverless instances. A job takes one of N numbered slots
 * (a row per slot in the store, so every instance sees the same ones). A slot that was never
 * released (crashed function) expires after `ttlMs`, so a user is never locked out for good.
 */
import { HttpError } from "./http";
import { now } from "./ids";
import { collection } from "./store";

type Slot = { id: string; workspaceId: string; kind: string; startedAt: string; expiresAt: string; units?: number };
const slots = () => collection<Slot>("job_slots");

export const JOB_TTL_MS = 6 * 60_000;

/** `prefix` keeps separate job kinds (site builds, images) from sharing slots. */
export async function acquireJobSlot(workspaceId: string, kind: string, max: number, ttlMs = JOB_TTL_MS, prefix = "slot", busyMessage?: string): Promise<() => Promise<void>> {
  return (await acquireJobSlotHandle(workspaceId, kind, max, ttlMs, prefix, busyMessage)).release;
}

export type JobSlotHandle = { id: string; release: () => Promise<void> };

/** acquireJobSlot, also returning the slot id (for setJobSlotUnits). */
export async function acquireJobSlotHandle(workspaceId: string, kind: string, max: number, ttlMs = JOB_TTL_MS, prefix = "slot", busyMessage?: string): Promise<JobSlotHandle> {
  const at = Date.now();
  for (let i = 0; i < Math.max(1, max); i++) {
    const id = `${prefix}${i}`;
    const row: Slot = { id, workspaceId, kind, startedAt: now(), expiresAt: new Date(at + ttlMs).toISOString() };
    const r = await slots().insertIfAbsent(row);
    let got = r.inserted;
    // An expired slot (crashed function) is taken over by exactly one caller: the one that inserts the marker for that expiry.
    // The marker keeps the old, past expiry, so it never counts as a running job.
    if (!got && new Date(r.row.expiresAt).getTime() <= at) {
      const marker = await slots().insertIfAbsent({ ...r.row, id: `${id}~${r.row.expiresAt}` });
      if (marker.inserted) {
        await slots().update(workspaceId, id, row);
        got = true;
      }
    }
    if (got) {
      let released = false;
      return {
        id,
        release: async () => {
          if (released) return;
          released = true;
          await slots().remove(workspaceId, id).catch(() => false);
        },
      };
    }
  }
  throw new HttpError(429, busyMessage ?? (max === 1 ? "You already have a build running. Wait for it to finish." : `You already have ${max} builds running. Wait for one to finish.`), "too_many_jobs");
}

export async function activeJobs(workspaceId: string): Promise<number> {
  const at = Date.now();
  return (await slots().list(workspaceId, (s) => new Date(s.expiresAt).getTime() > at)).length;
}

/** Records the credits a running job has reserved on its slot, so other instances can count them. */
export async function setJobSlotUnits(workspaceId: string, id: string, units: number): Promise<void> {
  await slots().update(workspaceId, id, { units: Math.max(0, units) });
}

/** Credits reserved by this workspace's live slots with `prefix`, other than `exceptId`. */
export async function reservedJobUnits(workspaceId: string, prefix: string, exceptId?: string): Promise<number> {
  const at = Date.now();
  const live = await slots().list(workspaceId, (s) => s.id !== exceptId && s.id.startsWith(prefix) && !s.id.includes("~") && new Date(s.expiresAt).getTime() > at);
  return live.reduce((n, s) => n + (typeof s.units === "number" && s.units > 0 ? s.units : 0), 0);
}
