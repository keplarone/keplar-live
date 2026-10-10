/**
 * Per-user job concurrency across serverless instances. A job takes one of N numbered slots
 * (a row per slot in the store, so every instance sees the same ones). A slot that was never
 * released (crashed function) expires after `ttlMs`, so a user is never locked out for good.
 */
import { HttpError } from "./http";
import { now } from "./ids";
import { collection } from "./store";

type Slot = { id: string; workspaceId: string; kind: string; startedAt: string; expiresAt: string };
const slots = () => collection<Slot>("job_slots");

export const JOB_TTL_MS = 6 * 60_000;

/** `prefix` keeps separate job kinds (site builds, images) from sharing slots. */
export async function acquireJobSlot(workspaceId: string, kind: string, max: number, ttlMs = JOB_TTL_MS, prefix = "slot", busyMessage?: string): Promise<() => Promise<void>> {
  const at = Date.now();
  for (let i = 0; i < Math.max(1, max); i++) {
    const id = `${prefix}${i}`;
    const row: Slot = { id, workspaceId, kind, startedAt: now(), expiresAt: new Date(at + ttlMs).toISOString() };
    const r = await slots().insertIfAbsent(row);
    let got = r.inserted;
    if (!got && new Date(r.row.expiresAt).getTime() <= at) {
      await slots().update(workspaceId, id, row);
      got = true;
    }
    if (got) {
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        await slots().remove(workspaceId, id).catch(() => false);
      };
    }
  }
  throw new HttpError(429, busyMessage ?? (max === 1 ? "You already have a build running. Wait for it to finish." : `You already have ${max} builds running. Wait for one to finish.`), "too_many_jobs");
}

export async function activeJobs(workspaceId: string): Promise<number> {
  const at = Date.now();
  return (await slots().list(workspaceId, (s) => new Date(s.expiresAt).getTime() > at)).length;
}
