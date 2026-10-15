/**
 * Real experience stats for Space Studio.
 *
 * Players (CCU): Roblox publishes only the CURRENT player count (games.roblox.com/v1/games: playing, visits, favoritedCount), no
 * history. So Space Studio records its own samples: whenever stats are read, or the daily cron runs, every tracked universe whose
 * newest sample is older than 60 s is sampled (one call per 50 universes). Points exist only where a sample was taken; there is no
 * interpolation and no filler.
 *   - space_ccu_min   one row per universe per minute with a sample (t, playing, visits, favorites). Kept 4 days (1h and 24h views).
 *   - space_ccu_hour  one row per universe per hour: the highest `playing` seen in that hour and the first sample's time. Kept 120 days
 *                     (7d, 30d and 90d views). The max of hourly maxes is the max of the samples, so these views are exact.
 *
 * Revenue: from the experience's own beacon (./beacon.ts), never estimated from public data.
 *   - Net Robux per sale = floor(price x 0.7): the creator's 70% share of a developer product or game pass sale, rounded down per
 *     sale. (Roblox's actual payout can differ, e.g. for sales through other creators' experiences; the beacon only sees prices.)
 *   - space_rev_min / space_rev_hour  per universe per minute / hour of the SALE time: net, sales, net per source (atomic increments,
 *                     only after the sale's idempotency row was created). Minute rows kept 4 days, hour rows 120 days.
 *   - robux.pending is an ESTIMATE: net Robux from sales in the last 72 hours. Roblox holds recent sales as pending for a few days
 *     before they become available; the exact hold isn't published per sale, so this is "sales young enough to probably still be
 *     pending", not Roblox's own figure.
 *
 * Range totals over 7d/30d/90d use hourly rows, so the start of the window is at hour granularity.
 */
import { keepAlive } from "@/lib/create/platform/after";
import { collection, type Row } from "@/lib/create/platform/store";
import { HttpError } from "@/lib/create/platform/http";
import { experiences, listExperiences, type ExperienceRow, type LastSample } from "./experiences";
import { gamesInfo } from "./roblox-api";

export const RANGES = { "1h": { ms: 3_600_000, bucket: 60_000 }, "24h": { ms: 86_400_000, bucket: 900_000 }, "7d": { ms: 7 * 86_400_000, bucket: 3_600_000 }, "30d": { ms: 30 * 86_400_000, bucket: 6 * 3_600_000 }, "90d": { ms: 90 * 86_400_000, bucket: 86_400_000 } } as const;
export type RangeId = keyof typeof RANGES;
export const SAMPLE_EVERY_MS = 60_000;
export const MINUTE_KEEP_MS = 4 * 86_400_000;
export const HOUR_KEEP_MS = 120 * 86_400_000;
export const SALE_KEEP_MS = 8 * 86_400_000;
export const PENDING_WINDOW_HOURS = 72;
export const CREATOR_SHARE = 0.7;

/** Net Robux to the creator for one sale at `price` Robux (70%, rounded down per sale). */
export const netRobux = (price: number) => Math.floor(price * CREATOR_SHARE);

type CcuMin = Row & { universeId: string; t: string; playing: number; visits: number; favorites: number };
type CcuHour = Row & { universeId: string; t: string; max: number; first: string };
type Rev = Row & { universeId: string; t: string; net: number; sales: number; product: number; gamepass: number };

export const ccuMin = () => collection<CcuMin>("space_ccu_min");
export const ccuHour = () => collection<CcuHour>("space_ccu_hour");
export const revMin = () => collection<Rev>("space_rev_min");
export const revHour = () => collection<Rev>("space_rev_hour");

const floorTo = (ms: number, step: number) => Math.floor(ms / step) * step;
export const minuteIso = (ms: number) => new Date(floorTo(ms, 60_000)).toISOString();
export const hourIso = (ms: number) => new Date(floorTo(ms, 3_600_000)).toISOString();

/* ── sampling ─────────────────────────────────────────────────────────── */

/** Store one sample (minute row, hour max, the experience's newest counters) for one workspace. */
export async function recordSample(wsId: string, universeId: string, s: { playing: number; visits: number; favorites: number }, now: number) {
  const t = new Date(now).toISOString();
  const m = minuteIso(now);
  await ccuMin().insertIfAbsent({ id: `${universeId}:${m}`, workspaceId: wsId, universeId, t, ...s });
  const h = hourIso(now);
  const hid = `${universeId}:${h}`;
  const hr = await ccuHour().insertIfAbsent({ id: hid, workspaceId: wsId, universeId, t: h, max: s.playing, first: t });
  if (!hr.inserted && s.playing > hr.row.max) await ccuHour().update(wsId, hid, { max: s.playing });
  const last: LastSample = { at: t, ...s };
  await experiences().update(wsId, universeId, { lastSampleAt: now, last });
}

/**
 * Sample every given (workspace, universe) whose newest sample is older than 60 s. One Roblox call per 50 distinct universes; a
 * universe Roblox didn't return (or returned without counters) gets no sample. Returns how many samples were stored.
 */
export async function sampleStale(rows: Pick<ExperienceRow, "workspaceId" | "universeId" | "lastSampleAt">[], now = Date.now()): Promise<number> {
  const stale = rows.filter((r) => !(typeof r.lastSampleAt === "number" && now - r.lastSampleAt < SAMPLE_EVERY_MS));
  const ids = [...new Set(stale.map((r) => r.universeId))];
  let stored = 0;
  for (let i = 0; i < ids.length; i += 50) {
    let info;
    try {
      info = await gamesInfo(ids.slice(i, i + 50));
    } catch {
      continue; // Roblox didn't answer: no sample (never a made-up one)
    }
    for (const r of stale) {
      const g = info.get(r.universeId);
      if (!g || g.playing === null || g.visits === null || g.favorites === null) continue;
      await recordSample(r.workspaceId, r.universeId, { playing: g.playing, visits: g.visits, favorites: g.favorites }, now);
      stored++;
    }
  }
  return stored;
}

/** Retention for every stats collection (cross-tenant, rows past their window only). */
export async function pruneStats(now = Date.now(), limit = 5000) {
  const { sales } = await import("./beacon");
  const iso = (keep: number) => new Date(now - keep).toISOString();
  const [a, b, c, d, e] = await Promise.all([
    ccuMin().purgeSystemBefore("t", iso(MINUTE_KEEP_MS), limit), revMin().purgeSystemBefore("t", iso(MINUTE_KEEP_MS), limit),
    ccuHour().purgeSystemBefore("t", iso(HOUR_KEEP_MS), limit), revHour().purgeSystemBefore("t", iso(HOUR_KEEP_MS), limit),
    sales().purgeSystemBefore("t", iso(SALE_KEEP_MS), limit),
  ]);
  return a + b + c + d + e;
}

/** Everything recorded for one universe in one workspace (when it stops being tracked). */
export async function purgeUniverseData(wsId: string, universeId: string) {
  const { sales } = await import("./beacon");
  for (const col of [ccuMin(), ccuHour(), revMin(), revHour(), sales()] as ReturnType<typeof collection<Row & { universeId: string }>>[]) {
    const rows = await col.list(wsId, (r) => r.universeId === universeId);
    for (let i = 0; i < rows.length; i += 25) await Promise.all(rows.slice(i, i + 25).map((r) => col.remove(wsId, r.id)));
  }
}

/* ── bucketing (pure) ─────────────────────────────────────────────────── */

export type Point = { t: string; v: number };

/** Max per bucket for one universe, then summed across universes per bucket. Only buckets that have samples. */
export function bucketMaxSum(rows: { universeId: string; t: string; v: number }[], bucketMs: number): Point[] {
  const per = new Map<string, Map<number, number>>();
  for (const r of rows) {
    const k = floorTo(Date.parse(r.t), bucketMs);
    const m = per.get(r.universeId) ?? new Map<number, number>();
    m.set(k, Math.max(m.get(k) ?? -Infinity, r.v));
    per.set(r.universeId, m);
  }
  const sum = new Map<number, number>();
  for (const m of per.values()) for (const [k, v] of m) sum.set(k, (sum.get(k) ?? 0) + v);
  return [...sum].sort((a, b) => a[0] - b[0]).map(([k, v]) => ({ t: new Date(k).toISOString(), v }));
}

/** Sum per bucket. Only buckets that have values. */
export function bucketSum(rows: { t: string; v: number }[], bucketMs: number): Point[] {
  const sum = new Map<number, number>();
  for (const r of rows) {
    const k = floorTo(Date.parse(r.t), bucketMs);
    sum.set(k, (sum.get(k) ?? 0) + r.v);
  }
  return [...sum].sort((a, b) => a[0] - b[0]).map(([k, v]) => ({ t: new Date(k).toISOString(), v }));
}

/* ── the stats view ───────────────────────────────────────────────────── */

export function parseRange(raw: string | null): RangeId {
  const r = (raw ?? "24h") as RangeId;
  if (!(r in RANGES)) throw new HttpError(400, "range must be 1h, 24h, 7d, 30d or 90d.", "bad_range");
  return r;
}

export async function statsFor(wsId: string, universe: string, range: RangeId, now = Date.now(), opts: { sample?: boolean } = {}) {
  const all = await listExperiences(wsId);
  const scope = universe === "all" ? all : all.filter((e) => e.universeId === universe);
  if (universe !== "all" && !scope.length) throw new HttpError(404, "You don't track that experience.", "experience_not_found");
  if (opts.sample !== false && scope.length) {
    await sampleStale(scope, now);
    if (Math.random() < 0.05) keepAlive(() => pruneStats(now), "space stats prune");
  }
  const ids = new Set(scope.map((e) => e.universeId));
  const fresh = universe === "all" ? await listExperiences(wsId) : await Promise.all(scope.map((e) => experiences().get(wsId, e.universeId)));
  const exps = fresh.filter((e): e is ExperienceRow => Boolean(e) && ids.has(e!.universeId));

  const { ms, bucket } = RANGES[range];
  const start = now - ms;
  const fine = range === "1h" || range === "24h";
  const startIso = new Date(start).toISOString();
  const hourStartIso = hourIso(start); // hour rows overlapping the window
  const inScope = (r: { universeId: string }) => ids.has(r.universeId);

  // now: newest counters per experience, summed for "all"
  const lasts = exps.map((e) => e.last).filter((l): l is LastSample => Boolean(l));
  const nowView = lasts.length
    ? { playing: lasts.reduce((n, l) => n + l.playing, 0), visits: lasts.reduce((n, l) => n + l.visits, 0), favorites: lasts.reduce((n, l) => n + l.favorites, 0), at: lasts.map((l) => l.at).sort().at(-1)! }
    : null;

  // CCU
  const hours = await ccuHour().list(wsId, inScope);
  const ccuRows = fine
    ? (await ccuMin().list(wsId, (r) => inScope(r) && r.t >= startIso && r.t <= new Date(now).toISOString())).map((r) => ({ universeId: r.universeId, t: r.t, v: r.playing }))
    : hours.filter((r) => r.t >= hourStartIso).map((r) => ({ universeId: r.universeId, t: r.t, v: r.max }));
  const points = bucketMaxSum(ccuRows, bucket);
  const firsts = hours.map((h) => h.first).sort();

  // Revenue
  const connected = exps.some((e) => e.beaconLastEventAt !== null);
  const minuteRev = await revMin().list(wsId, (r) => inScope(r) && r.t >= new Date(Math.min(start, now - PENDING_WINDOW_HOURS * 3_600_000)).toISOString());
  const revRows = fine ? minuteRev.filter((r) => r.t >= startIso) : await revHour().list(wsId, (r) => inScope(r) && r.t >= hourStartIso);
  const total = revRows.reduce((n, r) => n + r.net, 0);
  const pendingSince = new Date(now - PENDING_WINDOW_HOURS * 3_600_000).toISOString();
  const pending = minuteRev.filter((r) => r.t >= pendingSince).reduce((n, r) => n + r.net, 0);
  const lastSaleAt = exps.map((e) => e.lastSaleAt).filter((x): x is string => Boolean(x)).sort().at(-1) ?? null;

  return {
    range,
    universe,
    now: nowView,
    ccu: { points, peak: points.length ? Math.max(...points.map((p) => p.v)) : null, sampledSince: firsts[0] ?? null },
    revenue: {
      connected,
      points: bucketSum(revRows.map((r) => ({ t: r.t, v: r.net })), bucket),
      total,
      sales: revRows.reduce((n, r) => n + r.sales, 0),
      bySource: { product: revRows.reduce((n, r) => n + r.product, 0), gamepass: revRows.reduce((n, r) => n + r.gamepass, 0) },
    },
    robux: { earned: connected ? total : null, pending: connected ? pending : null, pendingWindowHours: PENDING_WINDOW_HOURS, lastSaleAt },
  };
}

/** The daily cron: sample every tracked universe across all workspaces, then apply retention. */
export async function sampleAllTracked(now = Date.now()) {
  const rows = await experiences().listSystem();
  const sampled = await sampleStale(rows, now);
  const pruned = await pruneStats(now);
  return { experiences: rows.length, sampled, pruned };
}
