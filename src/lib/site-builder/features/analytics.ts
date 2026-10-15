/**
 * Owner analytics for published sites. Cookie-free and script-free: the server counts a page view when it serves the page.
 * Stored as per-day counters (src/lib/business/traffic.ts): views per site and day, per page and per referring host, and the
 * day's visitors. A visitor is told apart by a mark that is a hash of IP + browser + a secret + the day, used only as a short-lived
 * rate-limit key (never stored with the counts, never linkable across days); the IP itself is never stored. Referrers: host only.
 * Not counted: bots, link previews, prefetches, Do Not Track / Global Privacy Control visitors, previews, the owner's builder.
 * Capped per site per day, and the cap is shown ("5,000+") rather than hidden.
 */
import { createHmac } from "node:crypto";
import { pageViewCounts, pageViews } from "@/lib/business/repo";
import { countView, KEEP_DAYS, maybePruneViews } from "@/lib/business/traffic";
import { now } from "@/lib/create/platform/ids";
import { clientIpOf, countHit, rateLimit } from "@/lib/create/platform/ratelimit";
import type { Site } from "../types";

export const DAILY_CAP = 5000;
/** Views one visitor can add to a site per day (reloading in a loop can't inflate the count). */
export const VISITOR_DAILY_CAP = 200;
export { KEEP_DAYS };
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|monitor|uptime|curl\/|wget|python-|go-http|java\/|httpclient|lighthouse|pingdom/i;
const secret = () => process.env.BETTER_AUTH_SECRET || "dev-only-form-secret";

/** Whether this request should be counted at all. */
export function countable(headers: Headers): boolean {
  const ua = headers.get("user-agent") ?? "";
  if (!ua || BOT.test(ua)) return false;
  if (headers.get("dnt") === "1" || headers.get("sec-gpc") === "1") return false;
  const purpose = `${headers.get("sec-purpose") ?? ""} ${headers.get("purpose") ?? ""} ${headers.get("x-moz") ?? ""}`;
  if (/prefetch|prerender/i.test(purpose)) return false;
  return true;
}

export const visitorMark = (ip: string, ua: string, day: string) => createHmac("sha256", secret()).update(`an1:${day}:${ip}:${ua}`).digest("base64url").slice(0, 11);

export function refHost(referer: string | null, ownHost: string): string {
  try {
    const h = new URL(referer ?? "").hostname.toLowerCase().replace(/^www\./, "");
    return h && h !== ownHost.toLowerCase().replace(/^www\./, "") && /^[a-z0-9.-]{1,60}$/.test(h) ? h : "";
  } catch {
    return "";
  }
}

/**
 * Counts one view. Everything it needs from the request is read before the first await, so callers can run it after the response
 * (keepAlive / afterResponse): a page is never slowed by its own analytics.
 */
export async function recordSiteView(site: Site, req: Request, path: string) {
  if (site.featureSettings?.analytics === false || !countable(req.headers)) return;
  const day = now().slice(0, 10);
  const mark = visitorMark(clientIpOf(req), req.headers.get("user-agent") ?? "", day);
  const ref = refHost(req.headers.get("referer"), new URL(req.url).hostname);
  try {
    await rateLimit(`an:cap:${site.id}:${day}`, DAILY_CAP, 86_400, { shared: true });
    // The mark changes every day, so this key is per visitor per day: hit 1 is a new visitor, and one visitor adds at most VISITOR_DAILY_CAP views.
    const hits = await countHit(`an:v:${site.id}:${mark}`, 86_400, { shared: true });
    if (hits > VISITOR_DAILY_CAP) return;
    await countView({ workspaceId: site.workspaceId, projectId: site.id, path, day, ...(ref ? { ref } : {}), newVisitor: hits === 1 });
  } catch {
    /* over a cap, or the store is busy: a missed view is better than a slow page */
  }
}

export type Summary = {
  days: number;
  views: number;
  visitors: number;
  series: { day: string; views: number; visitors: number }[];
  pages: { path: string; views: number }[];
  referrers: { host: string; views: number }[];
  /** Days that hit the daily cap: those days show at least this many views. */
  cappedDays: string[];
};

export async function summarize(site: Pick<Site, "id" | "workspaceId">, days = 30, at = Date.now()): Promise<Summary> {
  const n = Math.min(Math.max(Math.floor(days) || 30, 1), KEEP_DAYS);
  const since = new Date(at - (n - 1) * 864e5).toISOString().slice(0, 10);
  const [legacy, counts] = await Promise.all([
    pageViews().list(site.workspaceId, (v) => v.projectId === site.id && v.day >= since),
    pageViewCounts().list(site.workspaceId, (c) => c.projectId === site.id && c.day >= since),
  ]);
  const byDay = new Map<string, { views: number; visitors: number; marks: Set<string> }>();
  const pages = new Map<string, number>();
  const refs = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  for (let i = 0; i < n; i++) byDay.set(new Date(at - (n - 1 - i) * 864e5).toISOString().slice(0, 10), { views: 0, visitors: 0, marks: new Set() });
  // Counters (every view since the switch to aggregates).
  for (const c of counts) {
    const views = Number(c.views) || 0;
    if (c.kind === "day") {
      const d = byDay.get(c.day);
      if (!d) continue;
      d.views += views;
      d.visitors += Number(c.visitors) || 0;
    } else if (c.kind === "path") add(pages, c.key, views);
    else if (c.kind === "ref") add(refs, c.key, views);
  }
  // Legacy one-row-per-view records, until they age out.
  for (const r of legacy) {
    const d = byDay.get(r.day);
    if (!d) continue;
    d.views++;
    if (r.v) d.marks.add(r.v);
    add(pages, r.path, 1);
    if (r.ref) add(refs, r.ref, 1);
  }
  const series = [...byDay].map(([day, d]) => ({ day, views: d.views, visitors: d.visitors + d.marks.size }));
  const top = <T extends string>(m: Map<string, number>, k: T) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10).map(([key, views]) => ({ [k]: key, views }));
  return {
    days: n,
    views: series.reduce((a, d) => a + d.views, 0),
    visitors: series.reduce((a, d) => a + d.visitors, 0),
    series,
    pages: top(pages, "path") as Summary["pages"],
    referrers: top(refs, "host") as Summary["referrers"],
    cappedDays: series.filter((d) => d.views >= DAILY_CAP).map((d) => d.day),
  };
}

/**
 * Retention, called when the owner opens the stats: views older than KEEP_DAYS go in one bulk delete per collection (every site at
 * once, at most once an hour per instance; the hourly retention job does the same). `_site` is kept for the callers' signature.
 */
export async function pruneViews(_site: Pick<Site, "id" | "workspaceId">, at = Date.now()) {
  await maybePruneViews(at);
}
