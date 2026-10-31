/**
 * When background telemetry (page-visit counts, "on the site now", consented growth / SEO events) may write to the database.
 *
 * Neon bills compute for every minute the database is awake and suspends it after ~5 idle minutes. Small writes arriving every
 * few seconds kept it awake around the clock (Oct 2026: the Free plan's monthly compute was used up in four weeks). So telemetry is
 * held in memory and written in one batch:
 *   - right away when the store was used for real work on this instance in the last AWAKE_MS (it is awake anyway; costs ~nothing),
 *     but not more often than every MIN_GAP_MS;
 *   - otherwise at most once every MAX_HOLD_MS (one wake-up), or sooner when the backlog reaches BACKLOG_FLUSH items;
 *   - never while the store is unavailable (neon.ts circuit): the batch waits, bounded, and goes out when it is back.
 * KEPLAR_TELEMETRY_FLUSH=immediate writes every batch at once (tests, local debugging). KEPLAR_TELEMETRY_HOLD_MIN overrides MAX_HOLD.
 * Trade-off: a batch still in memory when an instance is recycled is lost (counts are approximate by design; no billing, security
 * or account data goes through here).
 */
import { asTelemetry, isStoreUnavailable, lastStoreActivity, storeUnavailableNow } from "@/lib/create/platform/neon";

export const AWAKE_MS = 4 * 60_000;
export const MIN_GAP_MS = 60_000;
export const BACKLOG_FLUSH = 1_000;
export function maxHoldMs(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.KEPLAR_TELEMETRY_HOLD_MIN);
  return Number.isFinite(n) && n >= 1 && n <= 24 * 60 ? n * 60_000 : 30 * 60_000;
}
export const flushImmediately = (env: Record<string, string | undefined> = process.env) => env.KEPLAR_TELEMETRY_FLUSH === "immediate";

/** Whether a telemetry batch held since `lastFlushAt` should be written now. */
export function flushDue(lastFlushAt: number, backlog: number, now = Date.now(), env: Record<string, string | undefined> = process.env): boolean {
  if (backlog <= 0) return false;
  if (flushImmediately(env)) return true;
  if (storeUnavailableNow(now)) return false;
  const since = now - lastFlushAt;
  if (since < MIN_GAP_MS) return false;
  if (backlog >= BACKLOG_FLUSH || since >= maxHoldMs(env)) return true;
  return now - lastStoreActivity() < AWAKE_MS;
}

/** Runs a telemetry write without counting it as activity that keeps the database "awake" for the gate above. */
export const telemetryWrite = asTelemetry;

/**
 * An in-memory batch of rows written together when flushDue says so. `push` returns a promise for `after()` / waitUntil when it
 * started a write, null otherwise. Bounded: past `cap` the oldest items are dropped. Never throws.
 */
export function telemetryBuffer<T>(name: string, write: (item: T) => Promise<unknown>, cap = 5_000) {
  let items: T[] = [];
  let lastFlushAt = 0;
  let inflight: Promise<number> | null = null;
  const flush = async (): Promise<number> => {
    if (inflight) return inflight;
    const batch = items.splice(0, 500);
    if (!batch.length) return 0;
    lastFlushAt = Date.now();
    inflight = telemetryWrite(async () => {
      let n = 0;
      for (let i = 0; i < batch.length; i++) {
        try {
          await write(batch[i]);
          n++;
        } catch (e) {
          // Store went away mid-batch: keep the rest for the next window instead of failing each one.
          if (isStoreUnavailable(e) || storeUnavailableNow()) {
            items = [...batch.slice(i), ...items].slice(-cap);
            break;
          }
          console.error(`[${name}] not recorded:`, e instanceof Error ? e.name : "error");
        }
      }
      return n;
    }).finally(() => {
      inflight = null;
    });
    return inflight;
  };
  return {
    push(item: T, now = Date.now()): Promise<number> | null {
      items.push(item);
      if (items.length > cap) items = items.slice(-cap);
      if (inflight || !flushDue(lastFlushAt, items.length, now)) return null;
      return flush();
    },
    flush,
    size: () => items.length,
    reset() {
      items = [];
      lastFlushAt = 0;
      inflight = null;
    },
  };
}
