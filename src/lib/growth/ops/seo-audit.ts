/**
 * Technical SEO audit of keplar.one's own public pages (daily). Reads the sitemaps and robots.txt, then checks a rotating sample of
 * URLs: status, redirect chains, title and description, canonical, noindex, JSON-LD that doesn't parse, H1 count, duplicate titles,
 * and sitemap URLs that robots.txt blocks. It only reads Keplar's own site, at most MAX_PAGES requests a run, one at a time.
 * It reports; it never changes pages (a fix goes through a pull request).
 */
export type Severity = "error" | "warning" | "notice";
export type SeoIssue = { url: string; code: string; severity: Severity; detail: string };
export type PageFacts = { url: string; status: number; redirects: string[]; title: string | null; description: string | null; canonical: string | null; noindex: boolean; h1: number; jsonLdBlocks: number; jsonLdInvalid: number };

export const MAX_PAGES = 40;
const MAX_REDIRECTS = 5;

const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"))?.slice(2).find((x) => x !== undefined) ?? null;
/** Entities decoded once each: "&amp;" goes last, so "&amp;lt;" stays the text "&lt;" instead of becoming "<". */
const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/** Pure: the facts the audit needs from one page's HTML. */
export function readPage(url: string, status: number, redirects: string[], html: string): PageFacts {
  const head = html.slice(0, 200_000);
  const title = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const metas = head.match(/<meta\b[^>]*>/gi) ?? [];
  const links = head.match(/<link\b[^>]*>/gi) ?? [];
  const description = metas.find((m) => /name\s*=\s*["']description["']/i.test(m));
  const robots = metas.filter((m) => /name\s*=\s*["'](robots|googlebot)["']/i.test(m)).map((m) => attr(m, "content") ?? "").join(",");
  const canonical = links.find((l) => /rel\s*=\s*["']canonical["']/i.test(l));
  const blocks = [...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\b[^>]*>/gi)].map((m) => m[1]);
  let invalid = 0;
  for (const b of blocks) { try { JSON.parse(b); } catch { invalid++; } }
  return {
    url,
    status,
    redirects,
    title: title !== undefined ? decode(title) : null,
    description: description ? decode(attr(description, "content") ?? "") : null,
    canonical: canonical ? attr(canonical, "href") : null,
    noindex: /noindex/i.test(robots),
    h1: (html.match(/<h1[\s>]/gi) ?? []).length,
    jsonLdBlocks: blocks.length,
    jsonLdInvalid: invalid,
  };
}

const norm = (u: string) => u.replace(/\/$/, "");

/** Pure: issues for a set of audited pages (duplicate titles are found across the set). */
export function issuesFor(pages: PageFacts[]): SeoIssue[] {
  const out: SeoIssue[] = [];
  const add = (url: string, code: string, severity: Severity, detail: string) => out.push({ url, code, severity, detail });
  for (const p of pages) {
    if (p.status >= 400 || p.status === 0) { add(p.url, "status", "error", `Returned ${p.status || "no response"}.`); continue; }
    if (p.redirects.length > 1) add(p.url, "redirect-chain", "warning", `${p.redirects.length} redirects before the page.`);
    else if (p.redirects.length === 1) add(p.url, "redirect", "notice", "A sitemap URL redirects; list the final URL instead.");
    if (p.noindex) add(p.url, "noindex-in-sitemap", "error", "The page is in the sitemap but says noindex.");
    if (!p.title) add(p.url, "title-missing", "error", "No <title>.");
    else if (p.title.length > 65) add(p.url, "title-long", "notice", `Title is ${p.title.length} characters (search results show about 60).`);
    if (!p.description) add(p.url, "description-missing", "warning", "No meta description.");
    else if (p.description.length < 50 || p.description.length > 170) add(p.url, "description-length", "notice", `Description is ${p.description.length} characters (aim for 50 to 160).`);
    if (!p.canonical) add(p.url, "canonical-missing", "warning", "No canonical link.");
    else if (norm(p.canonical) !== norm(p.redirects.at(-1) ?? p.url)) add(p.url, "canonical-elsewhere", "notice", `Canonical points to ${p.canonical}.`);
    if (p.h1 === 0) add(p.url, "h1-missing", "warning", "No <h1>.");
    else if (p.h1 > 1) add(p.url, "h1-multiple", "notice", `${p.h1} <h1> elements.`);
    if (p.jsonLdInvalid) add(p.url, "jsonld-invalid", "error", `${p.jsonLdInvalid} of ${p.jsonLdBlocks} JSON-LD blocks don't parse.`);
  }
  const byTitle = new Map<string, string[]>();
  for (const p of pages) if (p.title && p.status < 400) (byTitle.get(p.title) ?? byTitle.set(p.title, []).get(p.title)!).push(p.url);
  for (const [title, urls] of byTitle) if (urls.length > 1) for (const u of urls) add(u, "title-duplicate", "warning", `Same title as ${urls.length - 1} other page(s): "${title.slice(0, 80)}".`);
  return out;
}

/** Pure: Disallow rules for `User-agent: *` (simple prefix rules; `*` and `$` patterns are matched literally up to the wildcard). */
export function disallowed(robotsTxt: string): string[] {
  const out: string[] = [];
  let star = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^(user-agent|disallow)\s*:\s*(.*)$/i);
    if (!m) continue;
    if (m[1].toLowerCase() === "user-agent") star = m[2].trim() === "*";
    else if (star && m[2].trim()) out.push(m[2].trim().split("*")[0].replace(/\$$/, ""));
  }
  return out;
}

export const sitemapLocs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decode(m[1]));

/** Today's slice of the sitemap URLs: rotates so every URL is checked over successive days. */
export function sampleFor(urls: string[], dayIndex: number, n = MAX_PAGES): string[] {
  const sorted = [...new Set(urls)].sort();
  if (sorted.length <= n) return sorted;
  const start = (dayIndex * n) % sorted.length;
  return [...sorted.slice(start), ...sorted.slice(0, start)].slice(0, n);
}

export type Fetcher = (url: string, init: { redirect: "manual"; signal: AbortSignal }) => Promise<{ status: number; location: string | null; text: () => Promise<string> }>;

const defaultFetcher: Fetcher = async (url, init) => {
  const r = await fetch(url, { ...init, headers: { "user-agent": "KeplarSiteAudit/1.0 (+https://keplar.one)" } });
  return { status: r.status, location: r.headers.get("location"), text: () => r.text() };
};

async function follow(url: string, f: Fetcher, signal: AbortSignal): Promise<{ status: number; redirects: string[]; html: string }> {
  let cur = url;
  const redirects: string[] = [];
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const r = await f(cur, { redirect: "manual", signal }).catch(() => null);
    if (!r) return { status: 0, redirects, html: "" };
    if (r.status >= 300 && r.status < 400 && r.location) {
      cur = new URL(r.location, cur).toString();
      redirects.push(cur);
      continue;
    }
    return { status: r.status, redirects, html: r.status < 400 ? await r.text() : "" };
  }
  return { status: 0, redirects, html: "" };
}

export type AuditResult = { site: string; sitemapUrls: number; checked: number; issues: SeoIssue[]; counts: Record<Severity, number>; blockedBySitemap: string[] };

export async function runSeoAudit(site: string, opts: { now: Date; signal: AbortSignal; fetcher?: Fetcher }): Promise<AuditResult> {
  const f = opts.fetcher ?? defaultFetcher;
  const base = site.replace(/\/$/, "");
  const robots = await follow(`${base}/robots.txt`, f, opts.signal);
  const rules = robots.status === 200 ? disallowed(robots.html) : [];
  // The sitemap index may list child sitemaps; read one level down.
  const top = await follow(`${base}/sitemap.xml`, f, opts.signal);
  let locs = sitemapLocs(top.html);
  const children = locs.filter((u) => /sitemap[^/]*\.xml$/i.test(u));
  if (children.length) {
    locs = locs.filter((u) => !children.includes(u));
    for (const c of children.slice(0, 10)) locs.push(...sitemapLocs((await follow(c, f, opts.signal)).html));
  }
  for (const extra of ["answers-sitemap.xml", "templates-sitemap.xml", "topics-sitemap.xml"]) {
    if (!children.some((c) => c.endsWith(extra))) locs.push(...sitemapLocs((await follow(`${base}/${extra}`, f, opts.signal)).html));
  }
  const pathOf = (u: string) => { try { return new URL(u).pathname; } catch { return u; } };
  const blocked = locs.filter((u) => rules.some((r) => pathOf(u).startsWith(r)));
  const sample = sampleFor(locs, Math.floor(opts.now.getTime() / 864e5));
  const pages: PageFacts[] = [];
  for (const u of sample) {
    if (opts.signal.aborted) break;
    const r = await follow(u, f, opts.signal);
    pages.push(readPage(u, r.status, r.redirects, r.html));
  }
  const issues = [...issuesFor(pages), ...blocked.slice(0, 20).map((u) => ({ url: u, code: "sitemap-blocked-by-robots", severity: "error" as const, detail: "In the sitemap but robots.txt disallows it." }))];
  if (top.status !== 200) issues.unshift({ url: `${base}/sitemap.xml`, code: "sitemap-unreachable", severity: "error", detail: `sitemap.xml returned ${top.status || "no response"}.` });
  const counts = { error: 0, warning: 0, notice: 0 } as Record<Severity, number>;
  for (const i of issues) counts[i.severity]++;
  return { site: base, sitemapUrls: new Set(locs).size, checked: pages.length, issues: issues.slice(0, 200), counts, blockedBySitemap: blocked.slice(0, 20) };
}
