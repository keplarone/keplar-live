/**
 * Free plan: questions per day. One question = one count, exactly.
 *
 *  - Counted per UTC day in Postgres (one atomic upsert per claim; `INSERT .. ON CONFLICT DO UPDATE .. WHERE used < limit`),
 *    so the limit holds across serverless instances and survives refreshes, new tabs and restarts. Without a database it
 *    falls back to process memory (dev and tests).
 *  - A question is CLAIMED when it is accepted (so two parallel questions cannot both take the last one) and RELEASED if it
 *    ends without an answer on screen: a failure, a rejected/unreliable answer, no model responding, a stop before the
 *    answer. Only delivered answers keep their count.
 *  - Subjects: the signed-in account (50), or for a signed-out visitor a signed per-browser id (50); plus the network (IP)
 *    ceiling (`dailyIpRequests`) for both. Resets at 00:00 UTC.
 */
import { keepAlive } from "@/lib/create/platform/after";
import { FREE_UPGRADE_HINT } from "@/lib/upgrade-copy";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { authSecret } from "@/lib/accounts/secret";
import { isStoreUnavailable, neonConfigured, neonQuery } from "@/lib/create/platform/neon";

export type DailyMeter = { used: number; limit: number; left: number; resetsAt: string };

export const dayOf = (now: Date = new Date()) => now.toISOString().slice(0, 10);
/** Next 00:00 UTC. */
export const resetOf = (now: Date = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();

export const meterOf = (used: number, limit: number, now: Date = new Date()): DailyMeter => {
  const u = Math.max(0, Math.min(limit, used));
  return { used: u, limit, left: Math.max(0, limit - u), resetsAt: resetOf(now) };
};

/* ── storage ── */
const mem = new Map<string, number>();
let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  ready ??= neonQuery("CREATE TABLE IF NOT EXISTS keplar_daily_use (key text NOT NULL, day date NOT NULL, used integer NOT NULL DEFAULT 0, PRIMARY KEY (key, day))")
    .then(() => undefined)
    .catch((e) => { ready = null; throw e; });
  return ready;
}
const memKey = (key: string, day: string) => `${day}|${key}`;

/** Atomically add one if `used < limit`. Returns the new count, or null when the limit is already reached. */
export async function claimOne(key: string, limit: number, day = dayOf()): Promise<number | null> {
  if (neonConfigured()) {
    try {
      await ensure();
      const rows = await neonQuery(
        `INSERT INTO keplar_daily_use AS t (key, day, used) VALUES ($1, $2::date, 1)
         ON CONFLICT (key, day) DO UPDATE SET used = t.used + 1 WHERE t.used < $3::integer
         RETURNING used::text AS used`,
        [key, day, String(limit)],
      );
      if (Math.random() < 0.01) keepAlive(() => neonQuery("DELETE FROM keplar_daily_use WHERE day < (now() at time zone 'utc')::date - 3"), "daily-use prune");
      return rows[0] ? Number(rows[0].used) : null;
    } catch (e) {
      if (!isStoreUnavailable(e)) console.error("[usage] daily counter unavailable; using this instance's count");
    }
  }
  const k = memKey(key, day);
  const used = mem.get(k) ?? 0;
  if (used >= limit) return null;
  if (mem.size > 50_000) mem.clear();
  mem.set(k, used + 1);
  return used + 1;
}

/** Give one back (never below zero). */
export async function releaseOne(key: string, day = dayOf()): Promise<void> {
  if (neonConfigured()) {
    try {
      await ensure();
      await neonQuery("UPDATE keplar_daily_use SET used = GREATEST(used - 1, 0) WHERE key = $1 AND day = $2::date", [key, day]);
      return;
    } catch {
      console.error("[usage] could not release a daily count");
    }
  }
  const k = memKey(key, day);
  mem.set(k, Math.max(0, (mem.get(k) ?? 0) - 1));
}

export async function usedToday(key: string, day = dayOf()): Promise<number> {
  if (neonConfigured()) {
    try {
      await ensure();
      const rows = await neonQuery("SELECT used::text AS used FROM keplar_daily_use WHERE key = $1 AND day = $2::date", [key, day]);
      return rows[0] ? Number(rows[0].used) : 0;
    } catch {
      /* fall through to memory */
    }
  }
  return mem.get(memKey(key, day)) ?? 0;
}

/** Tests only. */
export const resetDailyMemory = () => mem.clear();

/* ── signed-out visitors: a signed per-browser id ── */
export const DEVICE_COOKIE = "keplar_dev";
const sig = (id: string) => createHmac("sha256", createHmac("sha256", authSecret()).update("keplar:device-id:v1").digest()).update(id).digest("base64url").slice(0, 22);

export function readDeviceId(cookieHeader: string | null | undefined): string | null {
  const raw = cookieHeader?.split(";").map((p) => p.trim()).find((p) => p.startsWith(`${DEVICE_COOKIE}=`))?.slice(DEVICE_COOKIE.length + 1);
  if (!raw) return null;
  const [id, s] = raw.split(".");
  if (!id || !s || !/^[A-Za-z0-9_-]{16,40}$/.test(id)) return null;
  const want = Buffer.from(sig(id));
  const got = Buffer.from(s);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}

export function newDeviceId(): { id: string; setCookie: (secure: boolean) => string } {
  const id = randomBytes(15).toString("base64url");
  return { id, setCookie: (secure) => `${DEVICE_COOKIE}=${id}.${sig(id)}; Path=/; Max-Age=${400 * 86_400}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}` };
}

/* ── what a Free question counts against ── */
export type DailySubjects = { primary: string; ip: string; ipLimit: number; limit: number; setCookie: string | null };

export function dailySubjects(a: { workspaceId: string; anonymous: boolean; ip: string; cookie: string | null | undefined; secure: boolean; limit: number; ipLimit: number }): DailySubjects {
  if (!a.anonymous) return { primary: `acct:${a.workspaceId}`, ip: `ip:${a.ip}`, ipLimit: a.ipLimit, limit: a.limit, setCookie: null };
  const known = readDeviceId(a.cookie);
  if (known) return { primary: `dev:${known}`, ip: `ip:${a.ip}`, ipLimit: a.ipLimit, limit: a.limit, setCookie: null };
  const fresh = newDeviceId();
  return { primary: `dev:${fresh.id}`, ip: `ip:${a.ip}`, ipLimit: a.ipLimit, limit: a.limit, setCookie: fresh.setCookie(a.secure) };
}

export type Claim = { meter: DailyMeter; release: () => Promise<DailyMeter>; setCookie: string | null };
export class DailyLimitError extends Error {
  constructor(message: string, public kind: "account" | "network", public meter: DailyMeter) {
    super(message);
  }
}

const clock = (iso: string) => `${iso.slice(11, 16)} UTC`;

/**
 * Take one of today's questions. Throws DailyLimitError (friendly message with the reset time) when the account/browser
 * or the network has used them all. The returned `release` gives it back (idempotent) and returns the fresh meter.
 */
export async function claimDaily(s: DailySubjects, now: Date = new Date()): Promise<Claim> {
  const day = dayOf(now);
  const reset = resetOf(now);
  const used = await claimOne(s.primary, s.limit, day);
  if (used === null) {
    throw new DailyLimitError(`You've used all ${s.limit} of today's questions on the Free plan. They reset at 00:00 UTC (${clock(reset)}), when a new day starts. ${FREE_UPGRADE_HINT}`, "account", meterOf(s.limit, s.limit, now));
  }
  const ipUsed = await claimOne(s.ip, s.ipLimit, day);
  if (ipUsed === null) {
    await releaseOne(s.primary, day);
    throw new DailyLimitError(`This network has reached today's question limit. It resets at 00:00 UTC (${clock(reset)}). Signing in or upgrading helps if others share this connection.`, "network", meterOf(used - 1, s.limit, now));
  }
  let released = false;
  return {
    meter: meterOf(used, s.limit, now),
    setCookie: s.setCookie,
    release: async () => {
      if (!released) {
        released = true;
        await Promise.all([releaseOne(s.primary, day), releaseOne(s.ip, day)]);
      }
      return meterOf(await usedToday(s.primary, day), s.limit, now);
    },
  };
}

/**
 * Debate on Free counts as more than one question (debate.ts DEBATE_POLICY.free.freeQuestions). Takes `extra` more of today's questions on
 * top of `first` and returns one Claim whose release gives all of them back. Null (and nothing extra kept) when they aren't all left:
 * the caller then answers normally with the one question already claimed.
 */
export async function claimExtra(s: DailySubjects, first: Claim, extra: number, now: Date = new Date()): Promise<Claim | null> {
  const got: Claim[] = [];
  for (let i = 0; i < extra; i++) {
    try {
      got.push(await claimDaily(s, now));
    } catch (e) {
      if (!(e instanceof DailyLimitError)) { await Promise.all(got.map((c) => c.release())); throw e; }
      await Promise.all(got.map((c) => c.release()));
      return null;
    }
  }
  const all = [first, ...got];
  return {
    meter: got.length ? got[got.length - 1]!.meter : first.meter,
    setCookie: first.setCookie,
    release: async () => {
      const meters = await Promise.all(all.map((c) => c.release()));
      return meters[meters.length - 1]!;
    },
  };
}

/** Read-only meter for the Ask UI, the account page and the usage indicator. */
export async function dailyMeter(s: Pick<DailySubjects, "primary" | "limit">, now: Date = new Date()): Promise<DailyMeter> {
  return meterOf(await usedToday(s.primary, dayOf(now)), s.limit, now);
}
