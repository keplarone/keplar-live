/**
 * Where trend candidates come from. Both are Google's own public endpoints, read politely (one request per seed, a short pause, a timeout):
 *  1. "Trending now" RSS for the US (https://trends.google.com/trending/rss?geo=US): the day's trending searches with an approximate-traffic bucket and news links.
 *  2. Related queries for a handful of AI seed topics (the same data Google Trends shows on its website; there is no official API, so this can break or be
 *     rate limited at any time). Every failure is logged and the run continues with whatever it got. Nothing here is a search-volume number.
 * Search Console data replaces this once the founder verifies the property (docs/seo-trends.md).
 */
import type { Candidate } from "./logic";

export const SEEDS = [
  "artificial intelligence", "large language model", "AI agents", "prompt engineering", "AI hallucinations", "multi model AI",
  "retrieval augmented generation", "MCP server", "reasoning model", "AI alignment", "fine tuning", "AI embeddings",
] as const;

const UA = "Mozilla/5.0 (compatible; KeplarTrendReader/1.0; +https://keplar.one/topics)";
const get = async (url: string, headers: Record<string, string> = {}) => {
  const r = await fetch(url, { headers: { "user-agent": UA, ...headers }, signal: AbortSignal.timeout(12_000), cache: "no-store" });
  return { ok: r.ok, status: r.status, text: await r.text(), setCookie: r.headers.get("set-cookie") ?? "" };
};
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'");

export function parseTrendingRss(xml: string): Candidate[] {
  const out: Candidate[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const query = decode(it.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "").trim();
    if (!query) continue;
    const traffic = it.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/)?.[1]?.trim();
    const news = [...it.matchAll(/<ht:news_item>([\s\S]*?)<\/ht:news_item>/g)].map((n) => ({
      title: decode(n[1].match(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/)?.[1] ?? "").trim(),
      source: decode(n[1].match(/<ht:news_item_source>([\s\S]*?)<\/ht:news_item_source>/)?.[1] ?? "").trim(),
      url: decode(n[1].match(/<ht:news_item_url>([\s\S]*?)<\/ht:news_item_url>/)?.[1] ?? "").trim(),
    })).filter((n) => n.title && /^https:\/\//.test(n.url));
    out.push({ query, source: "trending-rss", ...(traffic ? { traffic } : {}), news });
  }
  return out;
}

export async function fetchTrending(): Promise<{ items: Candidate[]; error?: string }> {
  try {
    const r = await get("https://trends.google.com/trending/rss?geo=US");
    if (!r.ok) return { items: [], error: `trending rss HTTP ${r.status}` };
    return { items: parseTrendingRss(r.text) };
  } catch (e) {
    return { items: [], error: `trending rss ${e instanceof Error ? e.name : "error"}` };
  }
}

const strip = (t: string) => JSON.parse(t.replace(/^\)\]\}',?\s*/, ""));

/** Related queries (top and rising) for one seed, US, past three months. Best effort. */
export async function fetchRelated(seed: string, cookie: string): Promise<{ items: Candidate[]; error?: string }> {
  try {
    const exploreReq = JSON.stringify({ comparisonItem: [{ keyword: seed, time: "today 3-m", geo: "US" }], category: 0, property: "" });
    const ex = await get(`https://trends.google.com/trends/api/explore?hl=en-US&tz=240&req=${encodeURIComponent(exploreReq)}`, { cookie });
    if (!ex.ok) return { items: [], error: `explore HTTP ${ex.status}` };
    const widget = (strip(ex.text).widgets as { id: string; token: string; request: unknown }[]).find((w) => w.id === "RELATED_QUERIES");
    if (!widget) return { items: [], error: "no related widget" };
    const rq = await get(`https://trends.google.com/trends/api/widgetdata/relatedsearches?hl=en-US&tz=240&req=${encodeURIComponent(JSON.stringify(widget.request))}&token=${encodeURIComponent(widget.token)}`, { cookie });
    if (!rq.ok) return { items: [], error: `related HTTP ${rq.status}` };
    const lists = strip(rq.text).default.rankedList as { rankedKeyword: { query: string; value: number }[] }[];
    const items: Candidate[] = [];
    (lists[0]?.rankedKeyword ?? []).slice(0, 10).forEach((k) => items.push({ query: k.query, source: "related-top", seed }));
    (lists[1]?.rankedKeyword ?? []).slice(0, 10).forEach((k) => items.push({ query: k.query, source: "related-rising", seed, growth: k.value }));
    return { items };
  } catch (e) {
    return { items: [], error: `${seed}: ${e instanceof Error ? e.name : "error"}` };
  }
}

export async function trendCookie(): Promise<string> {
  try {
    const r = await get("https://trends.google.com/?geo=US");
    return r.setCookie.split(/,(?=\s*\w+=)/).map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ");
  } catch {
    return "";
  }
}
