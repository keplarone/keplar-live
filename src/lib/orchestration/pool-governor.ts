/**
 * Global request governor for the shared OpenRouter FREE key.
 *
 * Every Free-plan request (and every small-talk request on any plan) is sent with ONE key whose quota is counted in REQUESTS by OpenRouter,
 * for the whole app: 20 requests/minute and 50 requests/day (1000/day once $10 of credit was ever bought), reset 00:00 UTC
 * (https://openrouter.ai/docs/api-reference/limits). A retry or a stand-in is a request like any other. So every request is counted
 * here BEFORE it is sent:
 *
 *  - a token bucket (capacity and refill = FREE_POOL_RPM per minute, default 20) smooths bursts on this instance, and a shared
 *    per-minute counter (same table as the daily question counter) holds the limit across serverless instances;
 *  - a shared daily counter against FREE_POOL_DAILY_LIMIT (default 50; set 1000 once the account qualifies) minus a small reserve for
 *    other features on the same key (FREE_POOL_RESERVE, default 5%);
 *  - staged degradation as the pool fills, instead of burning requests on 429 fallbacks:
 *      normal    <50% of the day used: everything as designed (2-model panel + combined review; stand-ins and 2 fallbacks allowed)
 *      tight     >=50%: no stand-in requests, one fallback
 *      low       >=80% (or too few requests left for a consensus answer): single-model answers, no fallbacks
 *      exhausted nothing left today / this minute: a friendly "busy, try shortly" with a Retry-After; nothing is sent.
 *
 * The day budget follows the key's real quota: when FREE_POOL_DAILY_LIMIT is not set, OpenRouter's own report for the key
 * (GET /key -> free_model_daily_requests.limit: 50, or 1000 once the account qualifies) replaces the 50 default, refreshed every
 * 10 minutes in the background. Without it the governor kept a 1000/day key at 47 requests, so Free answered "at capacity for today"
 * after about 15 questions site-wide. An explicit FREE_POOL_DAILY_LIMIT always wins; a failed or odd report keeps the current budget.
 *
 * A count is never given back after a 429 (it is not known whether OpenRouter charged it; counting it is the safe side).
 * Counts only; no message text. Paid providers are not governed here.
 */
import { claimOne, dayOf, resetOf, usedToday } from "@/lib/usage/daily";

export const POOL_KEY = "pool:openrouter-free";
export const POOL_BUSY_MESSAGE = "Free is busy right now, so this request wasn't sent. Please try again shortly.";

export type PoolConfig = { dailyLimit: number; reserve: number; usable: number; rpm: number };

export function poolConfig(env: Record<string, string | undefined> = process.env): PoolConfig {
  const int = (v: string | undefined, d: number, min: number) => (v != null && v.trim() !== "" && Number.isFinite(Number(v)) && Math.floor(Number(v)) >= min ? Math.floor(Number(v)) : d);
  const dailyLimit = int(env.FREE_POOL_DAILY_LIMIT, 50, 1);
  const reserve = Math.min(dailyLimit - 1, int(env.FREE_POOL_RESERVE, Math.ceil(dailyLimit * 0.05), 0));
  return { dailyLimit, reserve, usable: dailyLimit - reserve, rpm: int(env.FREE_POOL_RPM, 20, 1) };
}

/** Classic token bucket, injectable clock. */
export class TokenBucket {
  private tokens: number;
  private at: number;
  constructor(private readonly capacity: number, private readonly perMinute: number, now = Date.now()) {
    this.tokens = capacity;
    this.at = now;
  }
  private refill(now: number) {
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.at) / 60_000) * this.perMinute);
    this.at = now;
  }
  left(now = Date.now()): number {
    this.refill(now);
    return this.tokens;
  }
  take(now = Date.now()): { ok: true } | { ok: false; retryAfterMs: number } {
    this.refill(now);
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return { ok: true };
    }
    return { ok: false, retryAfterMs: Math.ceil(((1 - this.tokens) / this.perMinute) * 60_000) };
  }
  give(now = Date.now()) {
    this.refill(now);
    this.tokens = Math.min(this.capacity, this.tokens + 1);
  }
}

export type PoolLevel = "normal" | "tight" | "low" | "exhausted";
const ORDER: PoolLevel[] = ["normal", "tight", "low", "exhausted"];
const worse = (a: PoolLevel, b: PoolLevel): PoolLevel => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

/** Pure: how full the pool is, from the day's use and the requests left this minute. */
export function levelFor(used: number, usable: number, minuteLeft: number, rpm: number): PoolLevel {
  const day: PoolLevel = used >= usable ? "exhausted" : used / usable >= 0.8 ? "low" : used / usable >= 0.5 ? "tight" : "normal";
  const minute: PoolLevel = minuteLeft < 1 ? "exhausted" : minuteLeft < 3 ? "low" : minuteLeft < rpm * 0.4 ? "tight" : "normal";
  return worse(day, minute);
}

export type PoolStatus = {
  level: PoolLevel;
  dailyLimit: number;
  usable: number;
  usedToday: number;
  remainingToday: number;
  /** Requests that can still go out this minute (the smaller of this instance's bucket and the shared minute count). */
  minuteLeft: number;
  rpm: number;
  resetsAt: string;
};

export type Admission = { ok: true; level: PoolLevel } | { ok: false; reason: "minute" | "day"; retryAfterSec: number };
export type RequestPlan = { mode: "full" | "single" | "busy"; retryAfterSec: number; status: PoolStatus };

export type PoolIo = {
  claim: (key: string, limit: number, day: string) => Promise<number | null>;
  used: (key: string, day: string) => Promise<number>;
  now: () => number;
  /** The key's real free-model requests per day as the provider reports it, or null when unknown. Optional: without it the configured budget stands. */
  quota?: () => Promise<number | null>;
};

/** Pure: the per-day free-model request limit from OpenRouter's GET /key body (`data.free_model_daily_requests.limit`), or null. */
export function quotaFromKeyInfo(body: unknown): number | null {
  const data = (body as { data?: unknown } | null)?.data ?? body;
  const limit = (data as { free_model_daily_requests?: { limit?: unknown } } | null)?.free_model_daily_requests?.limit;
  return typeof limit === "number" && Number.isInteger(limit) && limit >= 1 && limit <= 1_000_000 ? limit : null;
}

/** Asks OpenRouter for the shared Free key's day quota (counts only; the key is sent as auth and never logged). */
async function fetchQuota(env: Record<string, string | undefined> = process.env): Promise<number | null> {
  const key = (env.OPENROUTER_API_KEY_FREE || env.OPENROUTER_API_KEY || "").trim();
  if (!key) return null;
  const base = (env.OPENROUTER_BASE_URL || env.KEPLAR_OPENROUTER_BASE || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  try {
    const r = await fetch(`${base}/key`, { headers: { authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(2500) });
    return r.ok ? quotaFromKeyInfo(await r.json()) : null;
  } catch {
    return null;
  }
}

const realIo: PoolIo = { claim: (k, l, d) => claimOne(k, l, d), used: (k, d) => usedToday(k, d), now: () => Date.now(), quota: () => fetchQuota() };
const QUOTA_REFRESH_MS = 10 * 60_000;
const QUOTA_RETRY_MS = 60_000;

const minuteKey = (now: number) => `${POOL_KEY}:m:${new Date(now).toISOString().slice(0, 16)}`;
const secondsToReset = (now: number) => Math.max(1, Math.ceil((Date.parse(resetOf(new Date(now))) - now) / 1000));
const secondsToNextMinute = (now: number) => Math.max(1, 60 - Math.floor((now % 60_000) / 1000));

/** Requests one consensus answer needs: 2 panel models + 1 combined review/write. */
export const CONSENSUS_CALLS = 3;

export class PoolGovernor {
  private readonly bucket: TokenBucket;
  private lastLevel: PoolLevel = "normal";
  private lastUsed = 0;
  private quotaAt = 0;
  private quotaRun: Promise<void> | null = null;
  private quotaKnown = false;

  /**
   * `fixedLimit`: the day budget was set by hand (FREE_POOL_DAILY_LIMIT), so the provider's report is not asked for.
   * The default reads the env; tests pass their own config and io.
   */
  constructor(
    public cfg: PoolConfig = poolConfig(),
    private readonly io: PoolIo = realIo,
    private readonly fixedLimit: boolean = io === realIo ? Boolean(process.env.FREE_POOL_DAILY_LIMIT?.trim()) : !io.quota,
  ) {
    this.bucket = new TokenBucket(cfg.rpm, cfg.rpm, io.now());
  }

  /**
   * Keeps the day budget in step with the key's real quota. Only the first attempt on an instance waits for the report (at most
   * ~2.5 s); refreshes and retries after a failed report run in the background so no later question waits on them.
   */
  async syncQuota(): Promise<void> {
    if (this.fixedLimit || !this.io.quota) return;
    const now = this.io.now();
    const first = this.quotaAt === 0;
    if (this.quotaRun) return first ? this.quotaRun : undefined;
    if (!first && now - this.quotaAt < (this.quotaKnown ? QUOTA_REFRESH_MS : QUOTA_RETRY_MS)) return;
    const quota = this.io.quota;
    const run = (async () => {
      const limit = await quota().catch(() => null);
      this.quotaAt = Math.max(1, this.io.now());
      if (limit !== null) {
        this.cfg = poolConfig({ FREE_POOL_DAILY_LIMIT: String(limit), FREE_POOL_RESERVE: process.env.FREE_POOL_RESERVE, FREE_POOL_RPM: String(this.cfg.rpm) });
        this.quotaKnown = true;
      }
    })().finally(() => {
      this.quotaRun = null;
    });
    this.quotaRun = run;
    if (first) await run;
  }

  /** Counted right before a request goes out. `ok: false` means: do not send. */
  async admit(): Promise<Admission> {
    await this.syncQuota();
    const now = this.io.now();
    const day = dayOf(new Date(now));
    const t = this.bucket.take(now);
    if (!t.ok) {
      this.lastLevel = "exhausted";
      return { ok: false, reason: "minute", retryAfterSec: Math.max(1, Math.ceil(t.retryAfterMs / 1000)) };
    }
    const m = await this.io.claim(minuteKey(now), this.cfg.rpm, day);
    if (m === null) {
      this.bucket.give(now);
      this.lastLevel = "exhausted";
      return { ok: false, reason: "minute", retryAfterSec: secondsToNextMinute(now) };
    }
    const used = await this.io.claim(POOL_KEY, this.cfg.usable, day);
    if (used === null) {
      this.bucket.give(now);
      this.lastLevel = "exhausted";
      this.lastUsed = this.cfg.usable;
      return { ok: false, reason: "day", retryAfterSec: secondsToReset(now) };
    }
    this.lastUsed = used;
    this.lastLevel = levelFor(used, this.cfg.usable, Math.min(this.bucket.left(now), this.cfg.rpm - m), this.cfg.rpm);
    return { ok: true, level: this.lastLevel };
  }

  /** Read-only picture of the pool (also refreshes what hedges/fallbacks decide on). */
  async status(): Promise<PoolStatus> {
    await this.syncQuota();
    const now = this.io.now();
    const day = dayOf(new Date(now));
    const [used, m] = await Promise.all([this.io.used(POOL_KEY, day), this.io.used(minuteKey(now), day)]);
    const minuteLeft = Math.max(0, Math.min(Math.floor(this.bucket.left(now)), this.cfg.rpm - m));
    const level = levelFor(used, this.cfg.usable, minuteLeft, this.cfg.rpm);
    this.lastLevel = level;
    this.lastUsed = used;
    return { level, dailyLimit: this.cfg.dailyLimit, usable: this.cfg.usable, usedToday: used, remainingToday: Math.max(0, this.cfg.usable - used), minuteLeft, rpm: this.cfg.rpm, resetsAt: resetOf(new Date(now)) };
  }

  /** Before a question starts: a full consensus answer, a single-model answer, or "busy" (nothing is sent, nothing is counted against the person). */
  async planFor(needed = CONSENSUS_CALLS): Promise<RequestPlan> {
    const status = await this.status();
    const now = this.io.now();
    if (status.remainingToday < 1) return { mode: "busy", retryAfterSec: secondsToReset(now), status };
    if (status.minuteLeft < 1) {
      const bucketLeft = this.bucket.left(now);
      const wait = bucketLeft < 1 ? Math.max(1, Math.ceil(((1 - bucketLeft) / this.cfg.rpm) * 60)) : secondsToNextMinute(now);
      return { mode: "busy", retryAfterSec: wait, status };
    }
    if (status.level === "low" || status.remainingToday < needed || status.minuteLeft < needed) return { mode: "single", retryAfterSec: 0, status };
    return { mode: "full", retryAfterSec: 0, status };
  }

  level(): PoolLevel {
    return this.lastLevel;
  }
  /** Stand-in requests (a second model started because the first is slow) only while the pool is comfortable. */
  hedgesAllowed(): boolean {
    return this.lastLevel === "normal";
  }
  /** Substitute models tried after a 429/error on a request. */
  maxFallbacks(): number {
    return this.lastLevel === "normal" ? 2 : this.lastLevel === "tight" ? 1 : 0;
  }
  usedSoFar(): number {
    return this.lastUsed;
  }
}

/** The one governor for this process (state is shared across instances through the daily table). */
let shared: PoolGovernor | null = null;
export const sharedPool = (): PoolGovernor => (shared ??= new PoolGovernor());
/** Tests only. */
export const resetSharedPool = () => { shared = null; };

/** The friendly text for a "busy" refusal, with when to come back. */
export function busyMessage(retryAfterSec: number): string {
  if (retryAfterSec >= 3600) return "Free is at capacity for today and resets at 00:00 UTC. Paid plans use other models and aren't affected. Please try again then.";
  if (retryAfterSec >= 90) return `Free is busy right now. Please try again in about ${Math.ceil(retryAfterSec / 60)} minutes.`;
  return `Free is busy right now. Please try again in ${Math.max(1, Math.ceil(retryAfterSec))} seconds.`;
}
