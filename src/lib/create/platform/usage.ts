/**
 * Per-user usage guards for /api/keplar (limits live in orchestration/limits.ts).
 *
 *  - burst: questions per minute, per account (or per IP when signed out) and per IP
 *  - daily (paid plans): questions per rolling 24 h per account / per IP, plus a signed per-browser
 *    counter cookie (works across serverless instances without a database). Free uses an exact
 *    per-day count instead (lib/usage/daily.ts) that is returned when a question gets no answer.
 *  - daily USD: provider spend per account per UTC day from the Usage ledger (Plus/Pro)
 *  - concurrency: questions running at once, and credits reserved by running questions
 *
 * Counters use Upstash when configured (shared) and process memory otherwise, so
 * without Upstash the burst/daily numbers are per serverless instance (best effort).
 * Concurrency is claimed before any await (so one instance can't over-admit), and
 * signed-in paid plans also take a shared "answer" job slot (jobs.ts) that every
 * instance sees. Each running answer records its planned credits on that slot, and
 * the route subtracts other slots' credits from what is left. The hard stops that
 * do not depend on this: the credit balance, the per-request cost cap, the live
 * daily spend guard and the global daily cap.
 */
import { FREE_UPGRADE_HINT } from "@/lib/upgrade-copy";
import { createHmac, timingSafeEqual } from "node:crypto";
import { authSecret } from "@/lib/accounts/secret";
import { limitsFor, type LimitPlan } from "@/lib/orchestration/limits";
import { collection } from "./store";
import { clientIpOf, rateLimit, RateLimitError } from "./ratelimit";
import { activeCooldown } from "./cooldown";
import { assertNotStopped } from "@/lib/ops/controls";
import { costGuardForSpend } from "@/lib/cost/hooks";
import type { Workspace } from "./workspace";
import { acquireJobSlotHandle, reservedJobUnits, setJobSlotUnits, type JobSlotHandle } from "./jobs";
import { HttpError } from "./http";

export class UsageLimitError extends Error {
  constructor(message: string, public code: "burst" | "daily" | "daily_ip" | "daily_spend" | "concurrent" | "cooldown", public retryAfterSec = 60) {
    super(message);
  }
}

const DAY = 86_400;
const UPGRADE = ` ${FREE_UPGRADE_HINT}`;

/** Rolling 24 h counter for one key; throws UsageLimitError past `max`. */
async function hit(key: string, max: number, windowSec: number, code: UsageLimitError["code"], message: string) {
  try {
    await rateLimit(key, max, windowSec, { shared: true });
  } catch (e) {
    if (e instanceof RateLimitError) throw new UsageLimitError(message, code, windowSec);
    throw e;
  }
}

/* ── per-browser signed counter (Free fairness across instances) ── */
export const USAGE_COOKIE = "keplar_use";
const today = () => new Date().toISOString().slice(0, 10);
const sign = (data: string) => createHmac("sha256", createHmac("sha256", authSecret()).update("keplar:usage-cookie:v1").digest()).update(data).digest("base64url");

export function readUsageCookie(cookieHeader: string | null | undefined, day = today()): number {
  const raw = cookieHeader?.split(";").map((p) => p.trim()).find((p) => p.startsWith(`${USAGE_COOKIE}=`))?.slice(USAGE_COOKIE.length + 1);
  if (!raw) return 0;
  const [d, n, sig] = raw.split(".");
  if (!d || !n || !sig || d !== day) return 0;
  const want = Buffer.from(sign(`${d}.${n}`));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return 0;
  const c = Number(n);
  return Number.isInteger(c) && c >= 0 ? c : 0;
}

export function usageCookieHeader(count: number, secure: boolean, day = today()): string {
  const n = String(count);
  return `${USAGE_COOKIE}=${day}.${n}.${sign(`${day}.${n}`)}; Path=/api/keplar; Max-Age=${DAY}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/* ── in-flight questions (per instance) ── */
const running = new Map<string, { n: number; units: number }>();
export const inflight = (wsKey: string) => running.get(wsKey) ?? { n: 0, units: 0 };

function begin(wsKey: string): () => void {
  const cur = running.get(wsKey) ?? { n: 0, units: 0 };
  running.set(wsKey, { n: cur.n + 1, units: cur.units });
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const c = running.get(wsKey) ?? { n: 1, units: 0 };
    if (c.n <= 1 && c.units <= 0) running.delete(wsKey);
    else running.set(wsKey, { n: Math.max(0, c.n - 1), units: c.units });
  };
}

/** Credits reserved by a running question; released when it ends. */
export function reserveUnits(wsKey: string, units: number): () => void {
  const cur = running.get(wsKey) ?? { n: 0, units: 0 };
  running.set(wsKey, { n: cur.n, units: cur.units + units });
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const c = running.get(wsKey);
    if (c) running.set(wsKey, { n: c.n, units: Math.max(0, c.units - units) });
  };
}

type LedgerRow = { id: string; workspaceId: string; usd: number; at: string };

/** Provider USD this account spent since 00:00 UTC (from the Usage ledger). */
export async function spentTodayUsd(ws: Workspace): Promise<number> {
  const start = `${today()}T00:00:00.000Z`;
  return collection<LedgerRow>("compute_ledger").sum(ws.id, "usd", { field: "at", gte: start });
}

/** A shared answer slot outlives the route's 300 s limit by a margin, so a crashed instance's slot frees itself. */
export const ANSWER_SLOT_TTL_MS = 330_000;
const ANSWER_SLOT_PREFIX = "answer";
const BUSY = "Keplar is still working on your earlier questions. Wait for one to finish.";

export type UsageGate = {
  release: () => void;
  wsKey: string;
  setCookie: string | null;
  /** Records this answer's planned credits on its shared slot (paid plans, signed in); a no-op otherwise. */
  holdUnits: (units: number) => void;
  /** Credits other running answers of this account have reserved, on any instance (0 without a shared slot). */
  reservedElsewhere: () => Promise<number>;
};

/**
 * Checks every per-user guard before a question starts. Throws UsageLimitError
 * (the route answers 429 with the message) or returns a handle whose `release`
 * must run when the question ends. `free` plan: counts toward the daily cap.
 */
export async function enterUsage(req: Request, ws: Workspace, opts: { countsDaily: boolean }): Promise<UsageGate> {
  const plan = ws.plan as LimitPlan;
  const L = limitsFor(plan);
  const ip = clientIpOf(req);
  const wsKey = ws.anonymous ? `ip:${ip}` : `ws:${ws.id}`;
  const free = plan === "free";
  const up = free ? UPGRADE : "";

  // Checked and claimed in one synchronous step, before the first await, so parallel requests on this instance can't all pass.
  if (inflight(wsKey).n >= L.concurrent) throw new UsageLimitError(BUSY, "concurrent", 10);
  const local = begin(wsKey);
  try {
    return await checkUsage(req, ws, opts, { L, ip, wsKey, free, up, local });
  } catch (e) {
    local();
    throw e;
  }
}

async function checkUsage(req: Request, ws: Workspace, opts: { countsDaily: boolean }, c: { L: ReturnType<typeof limitsFor>; ip: string; wsKey: string; free: boolean; up: string; local: () => void }): Promise<UsageGate> {
  const { L, free } = c;
  // The shared slot that caps paid answers across instances, taken alongside the checks below (no extra round trip before the
  // first byte) and given back if any of them refuses.
  const slotP: Promise<JobSlotHandle | Error> | null = !free && !ws.anonymous ? acquireJobSlotHandle(ws.id, "answer", L.concurrent, ANSWER_SLOT_TTL_MS, ANSWER_SLOT_PREFIX, BUSY).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e)))) : null;
  try {
    return await checkWithSlot(req, ws, opts, c, slotP);
  } catch (e) {
    if (slotP) void slotP.then((h) => { if (!(h instanceof Error)) void h.release(); });
    throw e;
  }
}

async function checkWithSlot(req: Request, ws: Workspace, opts: { countsDaily: boolean }, c: { L: ReturnType<typeof limitsFor>; ip: string; wsKey: string; free: boolean; up: string; local: () => void }, slotP: Promise<JobSlotHandle | Error> | null): Promise<UsageGate> {
  const { L, ip, wsKey, free, up, local } = c;
  // Operator global stop: nothing that costs money runs (throws a 503 with a plain message).
  await assertNotStopped();
  // Cost guard (src/lib/cost): per-feature kill switch, throttle, quotas and Free daily limits for this route's feature.
  await costGuardForSpend(ws);

  // Usage cooldown (spend velocity across answers, Create, slides, study): refuse before anything else is counted.
  const cd = await activeCooldown(ws);
  if (cd) throw new UsageLimitError(cd.message, "cooldown", Math.ceil(cd.remainingMs / 1000));

  await hit(`use:${wsKey}:burst`, L.burstPerMin, 60, "burst", "You're asking quickly. Wait a few seconds and try again.");
  // Network-wide cap for signed-out visitors. Its own key: an anonymous wsKey is already `ip:<ip>`, so reusing
  // `use:ip:<ip>:burst` counted every signed-out question twice on one counter (Free got 3 a minute, not 6).
  if (ws.anonymous) await hit(`use:net:${ip}:burst`, L.burstPerMin * 2, 60, "burst", "You're asking quickly. Wait a few seconds and try again.");


  let setCookie: string | null = null;
  // Free: the daily question count is claimed (and given back when no answer is shown) in claimDaily (lib/usage/daily.ts), in the route.
  if (opts.countsDaily && !free) {
    const secure = new URL(req.url).protocol === "https:" || (process.env.BETTER_AUTH_URL ?? "").startsWith("https://");
    const used = readUsageCookie(req.headers.get("cookie"));
    if (used >= L.dailyRequests) throw new UsageLimitError(`You've reached today's limit of ${L.dailyRequests} questions. It resets at 00:00 UTC.${up}`, "daily", DAY);
    await hit(`use:${wsKey}:day`, L.dailyRequests, DAY, "daily", `You've reached today's limit of ${L.dailyRequests} questions. It resets in 24 hours.${up}`);
    await hit(`use:ip:${ip}:day`, L.dailyIpRequests, DAY, "daily_ip", `This network has reached today's question limit. Try again later.${up}`);
    setCookie = usageCookieHeader(used + 1, secure);
  }

  if (L.dailyUsd && !ws.admin) {
    const spent = await spentTodayUsd(ws);
    if (spent >= L.dailyUsd) throw new UsageLimitError("You've reached today's usage cap for your plan. It resets at 00:00 UTC. Your monthly credits are kept.", "daily_spend", DAY);
  }
  const slot = slotP ? await slotP : null;
  if (slot instanceof HttpError && slot.status === 429) throw new UsageLimitError(BUSY, "concurrent", 10);
  if (slot instanceof Error) throw slot;
  const held = slot;
  return {
    release: () => { local(); if (held) void held.release(); },
    wsKey,
    setCookie,
    holdUnits: (units) => { if (held) void setJobSlotUnits(ws.id, held.id, units).catch(() => undefined); },
    reservedElsewhere: () => (held ? reservedJobUnits(ws.id, ANSWER_SLOT_PREFIX, held.id).catch(() => 0) : Promise.resolve(0)),
  };
}
