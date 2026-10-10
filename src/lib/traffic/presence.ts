/**
 * "On the site now": privacy-respecting presence. Pages send a tiny heartbeat every ~15 s while a tab is visible and a leave
 * beacon when it closes. The server keeps one small row per anonymous DAILY code (HMAC of IP + browser + secret + the date, so it
 * cannot be linked across days or turned back into an IP; neither is stored) with the time it was last seen. A visitor counts
 * as present while their row is younger than PRESENCE_TTL_MS. No cookies, no ids besides that rotating code, no path, no
 * referrer, no account. Bots, Do Not Track, Global Privacy Control and prefetches are never counted.
 *
 * Cost: one small UPDATE per visitor per heartbeat, written off the request path in short batches. Rate limits are in memory
 * (a shared limiter would cost a database write per heartbeat). Rows older than 10 minutes are deleted as we go.
 * Caveat: instances do not share memory, but the count is read from the shared database, so it is the same on every instance.
 */
import { createHmac } from "node:crypto";
import { clientIpOf } from "@/lib/create/platform/ratelimit";
import { collection } from "@/lib/create/platform/store";
import { countable } from "@/lib/site-builder/features/analytics";

import { HEARTBEAT_MS, PRESENCE_TTL_MS } from "./presence-config";

export { HEARTBEAT_MS, PRESENCE_TTL_MS };
const MIN_GAP_MS = 5_000;
const FLUSH_DELAY_MS = 1_500;
const PER_MINUTE_CAP = 6_000;
const SYSTEM = "system";

export type PresenceRow = { id: string; workspaceId: string; seen: string };
const rows = () => collection<PresenceRow>("traffic_presence");

const secret = () => process.env.BETTER_AUTH_SECRET || "dev-only-form-secret";
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
export const presenceMark = (ip: string, ua: string, day: string) => createHmac("sha256", secret()).update(`pr1:${day}:${ip}:${ua}`).digest("base64url").slice(0, 11);

const pending = new Map<string, number>(); // mark -> time of the latest heartbeat not yet written
const accepted = new Map<string, number>(); // mark -> last accepted heartbeat (per-visitor throttle)
const left = new Map<string, number>(); // mark -> time of a leave beacon (so a late flush cannot resurrect the row)
let minuteStart = 0;
let minuteCount = 0;
let flushPromise: Promise<void> | null = null;

/** In-memory, per instance. Returns false when this heartbeat should be ignored. */
function rateLimit(mark: string, at: number): boolean {
  if (at - minuteStart >= 60_000) {
    minuteStart = at;
    minuteCount = 0;
    if (accepted.size > 5_000) for (const [k, t] of accepted) if (at - t > 60_000) accepted.delete(k);
    for (const [k, t] of left) if (at - t > 60_000) left.delete(k);
  }
  const prev = accepted.get(mark);
  if (prev !== undefined && at - prev < MIN_GAP_MS) return false;
  if (minuteCount >= PER_MINUTE_CAP) return false;
  minuteCount++;
  accepted.set(mark, at);
  return true;
}

/**
 * Note one heartbeat ("hb") or leave beacon ("bye"). Returns a promise to hand to `after()` (or await) when work was queued, or
 * null when nothing needs to happen. Never throws.
 */
export function noteHeartbeat(req: Request, kind: "hb" | "bye", at = Date.now()): Promise<void> | null {
  try {
    if (!countable(req.headers)) return null;
    const mark = presenceMark(clientIpOf(req), req.headers.get("user-agent") ?? "", dayOf(at));
    if (kind === "bye") {
      pending.delete(mark);
      accepted.delete(mark);
      left.set(mark, at);
      return rows().remove(SYSTEM, mark).then(() => undefined, () => undefined);
    }
    if (!rateLimit(mark, at)) return null;
    pending.set(mark, at);
    if (flushPromise) return null;
    flushPromise = new Promise<void>((resolve) => setTimeout(resolve, FLUSH_DELAY_MS))
      .then(async () => {
        await flush();
      })
      .finally(() => {
        flushPromise = null;
      });
    return flushPromise;
  } catch {
    return null;
  }
}

/** Write the queued heartbeats (update the visitor's row, or create it). Errors are swallowed: presence never breaks a page. */
export async function flush(now?: number): Promise<number> {
  const batch = [...pending].slice(0, 300);
  const ref = now ?? (batch.length ? Math.max(...batch.map(([, at]) => at)) : Date.now()); // purge relative to the newest heartbeat
  let n = 0;
  for (const [mark, at] of batch) {
    if (pending.get(mark) === at) pending.delete(mark);
    if ((left.get(mark) ?? -1) >= at) continue; // they already left
    try {
      const seen = new Date(at).toISOString();
      const hit = await rows().update(SYSTEM, mark, { seen });
      if (!hit) {
        const r = await rows().insertIfAbsent({ id: mark, workspaceId: SYSTEM, seen });
        if (!r.inserted) await rows().update(SYSTEM, mark, { seen });
      }
      n++;
    } catch (e) {
      console.error("[presence] heartbeat not recorded:", e instanceof Error ? e.name : "error");
    }
  }
  if (Math.random() < 0.02) await rows().purgeSystemBefore("seen", new Date(ref - 10 * 60_000).toISOString(), 500).catch(() => 0);
  return n;
}

/** Distinct anonymous visitors whose last heartbeat is younger than the TTL. */
export async function presentNow(now = Date.now()): Promise<number> {
  const live = await rows().listSystemRange({ field: "seen", gte: new Date(now - PRESENCE_TTL_MS).toISOString() }, 20_000);
  return live.length;
}

/** Test hook: forget in-process state. */
export function resetPresenceState() {
  pending.clear();
  accepted.clear();
  left.clear();
  minuteStart = 0;
  minuteCount = 0;
  flushPromise = null;
}
