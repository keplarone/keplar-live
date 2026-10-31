/**
 * Keplar's own visitor counts for the admin "Traffic & revenue" card. Cookie-free and script-free, like the published-site
 * analytics (site-builder/features/analytics.ts, whose bot / prefetch / DNT / GPC rules and referrer rule are reused):
 * the server notes a page load when it serves it. Per visitor and day ONE row is kept (collection `traffic_visits`):
 *   - id = day + a daily visitor code: an HMAC of IP + browser + a secret + the UTC day. It cannot be linked from one day to
 *     the next, the IP and browser string are never stored, and nothing is set in the browser.
 *   - the first route segment of the landing page ("/pricing", never the full path or query), the referring site's host,
 *     first/last seen and a hit count.
 * Not counted: bots, link previews, prefetches, Do Not Track / Global Privacy Control visitors, files, API calls, admin, customer
 * sites, shared-answer and token links. Writes are batched and run after the response (waitUntil); a visitor is written at most
 * once every 5 minutes per instance, batches go out only when the database is awake anyway or every ~30 minutes (flush-gate.ts),
 * and one instance writes at most DAILY_NEW_CAP new visitors a day.
 * Because the code changes every day, "visitors" over several days are visitor-days: someone who returns on another day counts again.
 * Raw rows are rolled up into one `traffic_daily` row per day after 35 days, so all-time totals survive without per-visitor rows.
 */
import { createHmac } from "node:crypto";
import { collection } from "@/lib/create/platform/store";
import { clientIpOf } from "@/lib/create/platform/ratelimit";
import { countable, refHost } from "@/lib/site-builder/features/analytics";
import { routeOf } from "./route";
import { flushDue, telemetryWrite } from "./flush-gate";
import { isStoreUnavailable } from "@/lib/create/platform/neon";

export const LIVE_WINDOW_MS = 5 * 60_000;
export const RAW_DAYS = 35;
export const DAILY_NEW_CAP = 20_000;
/** A returning visitor's row is rewritten at most this often per instance (hits add up in memory meanwhile). Was 60 s. */
const REWRITE_MS = 5 * 60_000;
const FLUSH_DELAY_MS = 1_500;
const SYSTEM = "system";

export type VisitRow = { id: string; workspaceId: string; day: string; first: string; last: string; hits: number; route: string; ref?: string };
export type DailyRow = { id: string; workspaceId: string; day: string; visitors: number; hits: number };
const visits = () => collection<VisitRow>("traffic_visits");
const daily = () => collection<DailyRow>("traffic_daily");

const secret = () => process.env.BETTER_AUTH_SECRET || "dev-only-form-secret";
export const trafficMark = (ip: string, ua: string, day: string) => createHmac("sha256", secret()).update(`tv1:${day}:${ip}:${ua}`).digest("base64url").slice(0, 11);
export const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

export { routeOf };

/** A real page load (or in-app navigation), not an asset, API call or prefetch. */
export function isPageLoad(method: string, headers: Headers): boolean {
  if (method !== "GET") return false;
  if (headers.get("next-router-prefetch") || headers.get("x-middleware-prefetch")) return false;
  const dest = headers.get("sec-fetch-dest");
  const doc = dest ? dest === "document" : (headers.get("accept") ?? "").includes("text/html");
  return doc || headers.get("rsc") === "1";
}

type Seen = { lastFlush: number; hits: number; first: string; route: string; ref?: string; queued: boolean };
const seen = new Map<string, Seen>();
const queue = new Set<string>();
let seenDay = "";
let newToday = 0;
let flushPromise: Promise<void> | null = null;
let lastFlushAt = 0;

/**
 * Note one request. Returns a promise for `event.waitUntil` only when this call started a new batch; null otherwise
 * (not countable, already written within the minute, or a batch is already waiting). Never throws.
 */
export function noteVisit(req: Request, at = Date.now()): Promise<void> | null {
  try {
    const url = new URL(req.url);
    if (!isPageLoad(req.method, req.headers) || !countable(req.headers)) return null;
    const route = routeOf(url.pathname);
    if (!route) return null;
    const day = dayOf(at);
    if (day !== seenDay) {
      seen.clear();
      queue.clear();
      seenDay = day;
      newToday = 0;
    }
    const mark = trafficMark(clientIpOf(req), req.headers.get("user-agent") ?? "", day);
    const key = `${day}:${mark}`;
    const iso = new Date(at).toISOString();
    let s = seen.get(key);
    if (!s) {
      if (newToday >= DAILY_NEW_CAP || seen.size > DAILY_NEW_CAP * 2) return null;
      newToday++;
      const ref = refHost(req.headers.get("referer"), url.hostname);
      s = { lastFlush: 0, hits: 0, first: iso, route, ...(ref ? { ref } : {}), queued: false };
      seen.set(key, s);
    }
    s.hits++;
    if (!s.queued && at - s.lastFlush >= REWRITE_MS) {
      s.queued = true;
      queue.add(key);
    }
    // Written in batches when the database is awake anyway, or at most every ~30 min (flush-gate.ts); never while it is unavailable.
    if (queue.size === 0 || flushPromise || !flushDue(lastFlushAt, queue.size)) return null;
    lastFlushAt = Date.now();
    flushPromise = new Promise<void>((resolve) => setTimeout(resolve, FLUSH_DELAY_MS)).then(async () => { await flush(); }).finally(() => {
      flushPromise = null;
    });
    return flushPromise;
  } catch {
    return null;
  }
}

/** Write the queued visitors (insert, or update an existing day row). Errors are swallowed: a missed count never breaks a page. */
export function flush(at = Date.now()): Promise<number> {
  return telemetryWrite(() => flushNow(at));
}

async function flushNow(at: number): Promise<number> {
  const keys = [...queue].slice(0, 300);
  let n = 0;
  for (const key of keys) {
    queue.delete(key);
    const s = seen.get(key);
    if (!s) continue;
    const hits = s.hits;
    s.hits = 0;
    s.queued = false;
    s.lastFlush = at;
    try {
      const last = new Date(at).toISOString();
      const row: VisitRow = { id: key, workspaceId: SYSTEM, day: key.slice(0, 10), first: s.first, last, hits, route: s.route, ...(s.ref ? { ref: s.ref } : {}) };
      const r = await visits().insertIfAbsent(row);
      if (!r.inserted) {
        await visits().increment(SYSTEM, key, { hits }, { ...row, hits: 0 });
        await visits().update(SYSTEM, key, { last });
      }
      n++;
    } catch (e) {
      if (isStoreUnavailable(e)) {
        // The database went away: keep this visitor (and the rest of the batch) for the next window instead of logging each one.
        s.hits += hits;
        s.queued = true;
        queue.add(key);
        break;
      }
      console.error("[traffic] visit not recorded:", e instanceof Error ? e.name : "error");
    }
  }
  return n;
}

/** Test hook: forget in-process state. */
export function resetTrafficState() {
  seen.clear();
  queue.clear();
  seenDay = "";
  newToday = 0;
  flushPromise = null;
  lastFlushAt = 0;
}

export type TrafficSummary = {
  generatedAt: string;
  live: number;
  today: number;
  last7: number;
  last30: number;
  allTime: number;
  /** First day with any counted visit (counting started then). */
  since: string | null;
  pageLoadsToday: number;
  topRoutes7: { route: string; visitors: number }[];
  topReferrers7: { host: string; visitors: number }[];
  /** True when more rows existed than were read (figures are then a floor). */
  truncated: boolean;
};

const ROW_LIMIT = 100_000;

/** Fold raw rows older than RAW_DAYS into one row per day, then delete them. Idempotent; best effort. */
export async function rollupTraffic(now = Date.now()): Promise<number> {
  const cutoff = dayOf(now - (RAW_DAYS - 1) * 864e5);
  const old = (await visits().listSystemRange({ field: "day", gte: "0000-00-00", lt: cutoff }, ROW_LIMIT)) as VisitRow[];
  if (!old.length) return 0;
  const byDay = new Map<string, { visitors: number; hits: number }>();
  for (const r of old) {
    const d = byDay.get(r.day) ?? { visitors: 0, hits: 0 };
    d.visitors++;
    d.hits += r.hits || 0;
    byDay.set(r.day, d);
  }
  for (const [day, d] of byDay) await daily().insertIfAbsent({ id: day, workspaceId: SYSTEM, day, visitors: d.visitors, hits: d.hits });
  // Only rows below the cutoff go; a day cut by the row limit is left for the next run (insertIfAbsent keeps the first, smaller, total, so skip purge then).
  if (old.length >= ROW_LIMIT) return 0;
  return visits().purgeSystemBefore("day", cutoff, ROW_LIMIT);
}

export async function trafficSummary(now = Date.now()): Promise<TrafficSummary> {
  await rollupTraffic(now).catch((e) => console.error("[traffic] rollup failed:", e instanceof Error ? e.name : "error"));
  const today = dayOf(now);
  const d7 = dayOf(now - 6 * 864e5);
  const d30 = dayOf(now - 29 * 864e5);
  const liveSince = new Date(now - LIVE_WINDOW_MS).toISOString();
  const raw = (await visits().listSystemRange({ field: "day", gte: dayOf(now - (RAW_DAYS - 1) * 864e5) }, ROW_LIMIT)) as VisitRow[];
  const rolled = await daily().listSystem();
  const routes = new Map<string, number>();
  const refs = new Map<string, number>();
  let live = 0, t = 0, w = 0, m = 0, loads = 0;
  let since: string | null = rolled.reduce<string | null>((a, r) => (a === null || r.day < a ? r.day : a), null);
  for (const r of raw) {
    if (since === null || r.day < since) since = r.day;
    if (r.last >= liveSince) live++;
    if (r.day === today) { t++; loads += r.hits || 0; }
    if (r.day >= d7) {
      w++;
      routes.set(r.route, (routes.get(r.route) ?? 0) + 1);
      if (r.ref) refs.set(r.ref, (refs.get(r.ref) ?? 0) + 1);
    }
    if (r.day >= d30) m++;
  }
  const top = <K extends string>(map: Map<string, number>, key: K) => [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([k, visitors]) => ({ [key]: k, visitors }));
  return {
    generatedAt: new Date(now).toISOString(),
    live,
    today: t,
    last7: w,
    last30: m,
    allTime: raw.length + rolled.reduce((a, r) => a + r.visitors, 0),
    since,
    pageLoadsToday: loads,
    topRoutes7: top(routes, "route") as TrafficSummary["topRoutes7"],
    topReferrers7: top(refs, "host") as TrafficSummary["topReferrers7"],
    truncated: raw.length >= ROW_LIMIT,
  };
}

/** Cheap live number for the 10-second refresh: only rows touched in the last five minutes. */
export async function liveVisitors(now = Date.now()): Promise<number> {
  const rows = await visits().listSystemRange({ field: "last", gte: new Date(now - LIVE_WINDOW_MS).toISOString() }, 20_000);
  return rows.length;
}
