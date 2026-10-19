/**
 * Page-change monitor for public, official pages: competitors' pricing and release-notes pages, and the submission and methodology
 * pages of the ranking platforms Keplar tracks. Weekly. For each page it stores a hash of the readable text and the time it was
 * read; when the hash changes, the page is marked "changed since <date>" for a person to review. It does not interpret the change:
 * the report lists what changed (a fact: the page text is different) and leaves the meaning to a reviewer.
 *
 * Polite by construction: one GET per page per week, a descriptive user agent, robots.txt respected (a page its site disallows for
 * all agents is skipped and says so), no login, no cookies, no paywalled or rate-limited retries.
 */
import { createHash } from "node:crypto";
import { collection } from "@/lib/create/platform/store";
import { disallowed } from "./seo-audit";

export type WatchTarget = { id: string; group: "competitor" | "leaderboard"; owner: string; kind: string; url: string };
export type WatchRow = {
  id: string;
  workspaceId: string;
  group: WatchTarget["group"];
  owner: string;
  kind: string;
  url: string;
  hash: string | null;
  /** first 600 characters of the readable text, for the reviewer */
  excerpt: string;
  lastCheckedAt: string;
  lastStatus: number | "robots-disallowed" | "error";
  changedAt: string | null;
  /** set when someone reviewed the latest change */
  reviewedAt: string | null;
  history: { at: string; hash: string }[];
};

const SYSTEM = "system";
export const watchRows = () => collection<WatchRow>("growth_watch_pages");

const UA = "KeplarPageWatch/1.0 (+https://keplar.one; weekly check of public pages)";

/** Pure: the readable text of an HTML page (scripts, styles and tags removed, whitespace collapsed). */
export function readableText(html: string): string {
  return html
    // End tags may carry whitespace or junk before ">" (</script >, </script foo>): browsers still end the element there.
    .replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style\b[^>]*>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pure: a hash that ignores volatile bits (years and dates, digits in long numbers like build ids) so a footer date isn't a "change". */
export function contentHash(text: string): string {
  const stable = text.replace(/\b(19|20)\d{2}-\d{2}-\d{2}(T[\d:.]+Z?)?\b/g, "<date>").replace(/\b[0-9a-f]{12,}\b/gi, "<id>");
  return createHash("sha256").update(stable).digest("hex").slice(0, 32);
}

export type PageFetch = (url: string, signal: AbortSignal) => Promise<{ status: number; text: string }>;

const defaultFetch: PageFetch = async (url, signal) => {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,text/plain" }, redirect: "follow", signal });
  return { status: r.status, text: r.status < 400 ? (await r.text()).slice(0, 2_000_000) : "" };
};

/** Pure: apply one check to the stored row. */
export function nextRow(prev: WatchRow | null, t: WatchTarget, now: string, result: { status: WatchRow["lastStatus"]; text?: string }): WatchRow {
  const base: WatchRow = prev ?? { id: t.id, workspaceId: SYSTEM, group: t.group, owner: t.owner, kind: t.kind, url: t.url, hash: null, excerpt: "", lastCheckedAt: now, lastStatus: result.status, changedAt: null, reviewedAt: null, history: [] };
  const row: WatchRow = { ...base, group: t.group, owner: t.owner, kind: t.kind, url: t.url, lastCheckedAt: now, lastStatus: result.status };
  if (result.text === undefined) return row;
  const hash = contentHash(result.text);
  if (base.hash && base.hash !== hash) { row.changedAt = now; row.reviewedAt = null; }
  if (base.hash !== hash) row.history = [...base.history, { at: now, hash }].slice(-12);
  row.hash = hash;
  row.excerpt = result.text.slice(0, 600);
  return row;
}

export async function checkTargets(targets: WatchTarget[], opts: { signal: AbortSignal; now: Date; fetchPage?: PageFetch }): Promise<{ checked: number; changed: WatchRow[]; failed: number; disallowed: number }> {
  const f = opts.fetchPage ?? defaultFetch;
  const now = opts.now.toISOString();
  const robotsCache = new Map<string, string[]>();
  const changed: WatchRow[] = [];
  let failed = 0, blocked = 0, checked = 0;
  for (const t of targets) {
    if (opts.signal.aborted) break;
    const prev = await watchRows().get(SYSTEM, t.id);
    const origin = new URL(t.url).origin;
    if (!robotsCache.has(origin)) {
      const r = await f(`${origin}/robots.txt`, opts.signal).catch(() => null);
      robotsCache.set(origin, r && r.status === 200 ? disallowed(r.text) : []);
    }
    const path = new URL(t.url).pathname;
    let result: { status: WatchRow["lastStatus"]; text?: string };
    if (robotsCache.get(origin)!.some((rule) => rule && path.startsWith(rule))) { result = { status: "robots-disallowed" }; blocked++; }
    else {
      const r = await f(t.url, opts.signal).catch(() => null);
      if (!r) { result = { status: "error" }; failed++; }
      else if (r.status >= 400) { result = { status: r.status }; failed++; }
      else result = { status: r.status, text: readableText(r.text) };
    }
    const row = nextRow(prev, t, now, result);
    if (prev) await watchRows().update(SYSTEM, t.id, row);
    else await watchRows().insert(row);
    if (row.changedAt === now) changed.push(row);
    checked++;
  }
  return { checked, changed, failed, disallowed: blocked };
}

export async function markReviewed(id: string): Promise<void> {
  await watchRows().update(SYSTEM, id, { reviewedAt: new Date().toISOString() });
}

export const allWatched = () => watchRows().list(SYSTEM);
