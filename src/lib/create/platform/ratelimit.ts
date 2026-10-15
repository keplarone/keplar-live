/**
 * Rate limits per IP and per account. Fixed windows.
 * - Upstash Redis REST (UPSTASH_REDIS_REST_URL + _TOKEN): shared across all
 *   instances (INCR + EXPIRE NX in one pipeline).
 * - Otherwise: in-memory, per instance (mock).
 */
import { keepAlive } from "./after";
import { neonConfigured, neonQuery } from "./neon";

export class RateLimitError extends Error {
  status = 429;
  constructor(message: string, public retryAfterSec = 60) {
    super(message);
  }
}

const windows = new Map<string, { start: number; count: number }>();

function memoryHit(key: string, windowSec: number): number {
  const t = Date.now();
  const w = windows.get(key);
  if (!w || t - w.start > windowSec * 1000) {
    windows.set(key, { start: t, count: 1 });
    if (windows.size > 50_000) windows.clear();
    return 1;
  }
  w.count += 1;
  return w.count;
}

async function upstashHit(key: string, windowSec: number): Promise<number | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify([["INCR", `rl:${key}`], ["EXPIRE", `rl:${key}`, String(windowSec), "NX"]]),
      cache: "no-store",
      signal: AbortSignal.timeout(1500), // a slow Upstash must not slow every request: on timeout fall through like any error
    });
    const data = (await res.json()) as { result?: number }[];
    return typeof data?.[0]?.result === "number" ? data[0].result : null;
  } catch {
    return null; // fail open to the in-memory limiter below
  }
}

/** Shared fixed window in Postgres (one upsert). Null when there is no database or it fails (caller falls back to memory). */
async function postgresHit(key: string, windowSec: number): Promise<number | null> {
  if (!neonConfigured()) return null;
  try {
    await ensureRateSchema();
    const rows = await neonQuery(
      `INSERT INTO keplar_ratelimit AS t (key, window_start, hits) VALUES ($1, now(), 1)
       ON CONFLICT (key) DO UPDATE SET
         hits = CASE WHEN t.window_start <= now() - make_interval(secs => $2::double precision) THEN 1 ELSE t.hits + 1 END,
         window_start = CASE WHEN t.window_start <= now() - make_interval(secs => $2::double precision) THEN now() ELSE t.window_start END
       RETURNING hits::text AS hits`,
      [key, String(windowSec)],
    );
    if (Math.random() < 0.01) keepAlive(() => neonQuery("DELETE FROM keplar_ratelimit WHERE window_start < now() - interval '2 days'"), "rate-limit prune");
    const n = Number(rows[0]?.hits);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

let rateReady: Promise<void> | null = null;
function ensureRateSchema(): Promise<void> {
  rateReady ??= neonQuery("CREATE TABLE IF NOT EXISTS keplar_ratelimit (key text PRIMARY KEY, window_start timestamptz NOT NULL, hits integer NOT NULL)")
    .then(() => undefined)
    .catch((e) => {
      rateReady = null;
      throw e;
    });
  return rateReady;
}

export const rateLimitBackend = () => (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN ? "upstash" : neonConfigured() ? "postgres" : "memory");

/**
 * Throws RateLimitError when `key` exceeds `max` hits per `windowSec` (default 60 s).
 * Backends: Upstash, else (with `shared: true`) Postgres, else process memory. Use `shared` for the
 * per-user counters that must hold across serverless instances; the coarse per-IP edge limit stays in memory.
 */
export async function rateLimit(key: string, max: number, windowSec = 60, opts: { shared?: boolean } = {}) {
  const n = await countHit(key, windowSec, opts);
  if (n > max) throw new RateLimitError("Too many requests. Try again in a minute.", windowSec);
}

/** Records one hit on `key` and returns the hits in its current window (1 = the first). Same backends as rateLimit. */
export async function countHit(key: string, windowSec = 60, opts: { shared?: boolean } = {}): Promise<number> {
  return (await upstashHit(key, windowSec)) ?? (opts.shared ? await postgresHit(key, windowSec) : null) ?? memoryHit(key, windowSec);
}

export function clientIpOf(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** Per-IP and per-account limit for one bucket. */
export async function limitRequest(req: Request, bucket: string, opts: { perIp: number; perAccount?: number; accountId?: string | null; windowSec?: number }) {
  await rateLimit(`ip:${clientIpOf(req)}:${bucket}`, opts.perIp, opts.windowSec);
  if (opts.accountId && opts.perAccount) await rateLimit(`acct:${opts.accountId}:${bucket}`, opts.perAccount, opts.windowSec);
}
