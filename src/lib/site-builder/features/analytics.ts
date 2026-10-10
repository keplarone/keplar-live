/**
 * Owner analytics for published sites. Cookie-free and script-free: the server counts a page view when it serves the page.
 * Stored per view: site, path, day, and (a) a visitor mark that is a hash of IP + browser + a secret + the day, so it cannot be
 * linked from one day to the next and the IP itself is never stored, (b) the referring site's host, never a full URL.
 * Not counted: bots, link previews, prefetches, Do Not Track / Global Privacy Control visitors, previews, the owner's builder.
 * Capped per site per day, and the cap is shown ("5,000+") rather than hidden.
 */
import { createHmac } from "node:crypto";
import { pageViews } from "@/lib/business/repo";
import { id, now } from "@/lib/create/platform/ids";
import { clientIpOf, rateLimit } from "@/lib/create/platform/ratelimit";
import type { Site } from "../types";

export const DAILY_CAP = 5000;
export const KEEP_DAYS = 90;
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

export async function recordSiteView(site: Site, req: Request, path: string) {
  if (site.featureSettings?.analytics === false || !countable(req.headers)) return;
  const day = now().slice(0, 10);
  try {
    await rateLimit(`an:cap:${site.id}:${day}`, DAILY_CAP, 86_400, { shared: true });
    const ip = clientIpOf(req);
    const mark = visitorMark(ip, req.headers.get("user-agent") ?? "", day);
    await rateLimit(`an:v:${site.id}:${mark}`, 200, 3600, { shared: true }); // one visitor can't inflate the count by reloading in a loop
    const ref = refHost(req.headers.get("referer"), new URL(req.url).hostname);
    await pageViews().insert({ id: id("pv"), workspaceId: site.workspaceId, projectId: site.id, path: path.slice(0, 200), day, at: now(), v: mark, ...(ref ? { ref } : {}) });
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
  const rows = await pageViews().list(site.workspaceId, (v) => v.projectId === site.id && v.day >= since);
  const byDay = new Map<string, { views: number; marks: Set<string> }>();
  const pages = new Map<string, number>();
  const refs = new Map<string, number>();
  for (let i = 0; i < n; i++) byDay.set(new Date(at - (n - 1 - i) * 864e5).toISOString().slice(0, 10), { views: 0, marks: new Set() });
  for (const r of rows) {
    const d = byDay.get(r.day);
    if (!d) continue;
    d.views++;
    if (r.v) d.marks.add(r.v);
    pages.set(r.path, (pages.get(r.path) ?? 0) + 1);
    if (r.ref) refs.set(r.ref, (refs.get(r.ref) ?? 0) + 1);
  }
  const series = [...byDay].map(([day, d]) => ({ day, views: d.views, visitors: d.marks.size }));
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

/** Delete the views older than the retention period for one site (called when the owner opens the stats). */
export async function pruneViews(site: Pick<Site, "id" | "workspaceId">, at = Date.now()) {
  const cutoff = new Date(at - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  for (const v of await pageViews().list(site.workspaceId, (x) => x.projectId === site.id && x.day < cutoff)) await pageViews().remove(site.workspaceId, v.id);
}

