import { allDocs } from "@/lib/kb/docs";
import { allPosts } from "@/lib/kb/blog";
import { guides } from "@/lib/content/guides";
import { editorialPages } from "@/lib/content/editorial";
import { landingPages } from "@/lib/content/landing";
import { isIndexable, site } from "@/lib/site";
import { buildPage, existingCoverage, matchTerm, runGates, screenQuery, termSlug, type Candidate, type SiteDoc } from "./logic";
import { fetchRelated, fetchTrending, SEEDS, trendCookie } from "./sources";
import { allRows, getSettings, log, trendPages, type TrendRow } from "./store";

export const INDEXNOW_KEY = "794a2fb6c986d2a4fdc970229ac50be4";

/** Every existing public page as text, for the coverage and duplicate gates. */
export function siteDocs(): SiteDoc[] {
  return [
    ...allDocs().map((d) => ({ path: d.path, title: d.title, description: d.description, text: d.text, keywords: d.keywords })),
    ...allPosts().map((p) => ({ path: p.path, title: p.title, description: p.description, text: p.text, keywords: p.keywords })),
    ...guides.map((g) => ({ path: g.path, title: g.title, description: g.metaDescription, text: `${g.title} ${g.metaDescription}` })),
    ...editorialPages.map((e) => ({ path: e.path, title: e.h1, description: e.metaDescription, text: `${e.h1} ${e.metaDescription}` })),
    ...landingPages.map((l) => ({ path: l.path, title: l.h1, description: l.metaDescription, text: `${l.h1} ${l.metaDescription}` })),
  ];
}

export async function pingIndexNow(urls: string[], doFetch: typeof fetch = fetch): Promise<string> {
  if (!urls.length) return "nothing to submit";
  if (!isIndexable) return "skipped (not the production site)";
  try {
    const host = new URL(site.url).host;
    const res = await doFetch("https://api.indexnow.org/IndexNow", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key: INDEXNOW_KEY, keyLocation: `${site.url}/${INDEXNOW_KEY}.txt`, urlList: urls.slice(0, 50) }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.status === 200 || res.status === 202 ? `accepted (HTTP ${res.status})` : `not accepted (HTTP ${res.status})`;
  } catch (e) {
    return `failed (${e instanceof Error ? e.name : "error"})`;
  }
}

export type RunDeps = {
  now?: () => Date;
  trending?: () => Promise<{ items: Candidate[]; error?: string }>;
  related?: (seed: string) => Promise<{ items: Candidate[]; error?: string }>;
  seeds?: readonly string[];
  docs?: SiteDoc[];
  ping?: (urls: string[]) => Promise<string>;
};
export type RunSummary = { skipped?: string; candidates: number; screened: number; matched: number; built: number; published: string[]; held: string[]; rejected: { slug: string; reasons: string[] }[]; errors: string[]; indexNow?: string };

const day = (d: Date) => d.toISOString().slice(0, 10);

export async function runTrends(deps: RunDeps = {}): Promise<RunSummary> {
  const now = (deps.now ?? (() => new Date()))();
  const today = day(now);
  const out: RunSummary = { candidates: 0, screened: 0, matched: 0, built: 0, published: [], held: [], rejected: [], errors: [] };
  const st = await getSettings();
  if (st.paused) {
    await log("run", "Skipped: paused (kill switch)");
    return { ...out, skipped: "paused" };
  }
  // Rotate through the seeds so one run makes few requests to Google.
  const all = deps.seeds ?? SEEDS;
  const start = (Math.floor(now.getTime() / 864e5) * 3) % all.length;
  const seeds = [0, 1, 2].map((i) => all[(start + i) % all.length]);
  const cands: Candidate[] = [];
  const t = await (deps.trending ?? fetchTrending)();
  cands.push(...t.items);
  if (t.error) out.errors.push(t.error);
  const cookie = deps.related ? "" : await trendCookie();
  for (const s of seeds) {
    const r = await (deps.related ?? ((x: string) => fetchRelated(x, cookie)))(s);
    cands.push(...r.items);
    if (r.error) out.errors.push(r.error);
    if (!deps.related) await new Promise((res) => setTimeout(res, 1500));
  }
  const seen = new Set<string>();
  const unique = cands.filter((c) => { const k = c.query.toLowerCase().trim(); if (seen.has(k)) return false; seen.add(k); return true; });
  out.candidates = unique.length;
  const screened = unique.filter((c) => screenQuery(c.query).ok);
  out.screened = screened.length;

  const docs = deps.docs ?? siteDocs();
  const rows = await allRows();
  const bySlug = new Map(rows.map((r) => [r.id, r]));
  const publishedToday = rows.filter((r) => r.publishedAt?.startsWith(today)).length;
  let live = rows.filter((r) => r.status === "published").length;
  let madeToday = publishedToday;
  const newUrls: string[] = [];

  for (const c of screened) {
    const term = matchTerm(c.query);
    if (!term) continue;
    out.matched++;
    const slug = termSlug(term);
    const prior = bySlug.get(slug);
    if (prior && (prior.status === "published" || prior.status === "rolled_back" || prior.status === "held")) continue; // a human decision or a finished page stands
    if (prior?.status === "rejected" && prior.createdAt.startsWith(today)) continue;
    const covered = existingCoverage(term, docs);
    if (covered) {
      await store(slug, { status: "rejected", query: c.query, source: c.source, reason: `already covered by ${covered.path}` }, now, prior);
      out.rejected.push({ slug, reasons: [`already covered by ${covered.path}`] });
      continue;
    }
    const also = screened.filter((x) => x.query !== c.query && matchTerm(x.query) === term).map((x) => x.query).slice(0, 8);
    const page = buildPage(c, term, docs, also, today);
    out.built++;
    const gates = runGates(page, docs.map((d) => ({ path: d.path, text: d.text })), rows.filter((r) => r.status !== "rejected" && r.id !== slug).map((r) => ({ slug: r.id })));
    if (!gates.pass) {
      await store(slug, { status: "rejected", query: c.query, source: c.source, page, gates, reason: gates.reasons.join("; ") }, now, prior);
      out.rejected.push({ slug, reasons: gates.reasons });
      continue;
    }
    const canPublish = st.autoPublish && madeToday < st.maxPerDay && live < st.maxLive;
    if (canPublish) {
      await store(slug, { status: "published", publishedAt: now.toISOString(), query: c.query, source: c.source, page, gates }, now, prior);
      out.published.push(slug);
      newUrls.push(`${site.url}/topics/${slug}`);
      madeToday++;
      live++;
    } else {
      await store(slug, { status: "held", query: c.query, source: c.source, page, gates, reason: !st.autoPublish ? "auto-publish is off" : "daily or total limit reached" }, now, prior);
      out.held.push(slug);
    }
  }
  if (newUrls.length) {
    out.indexNow = await (deps.ping ?? pingIndexNow)(newUrls);
    for (const slug of out.published) await trendPages().update("system", slug, { indexNow: out.indexNow });
  }
  await log("run", `Candidates ${out.candidates}, passed screen ${out.screened}, matched ${out.matched}, built ${out.built}, published ${out.published.length}, held ${out.held.length}, rejected ${out.rejected.length}${out.errors.length ? `, source errors ${out.errors.length}` : ""}`, { published: out.published, held: out.held, rejected: out.rejected, errors: out.errors, indexNow: out.indexNow });
  return out;
}

async function store(slug: string, v: Omit<TrendRow, "id" | "workspaceId" | "createdAt">, now: Date, prior?: TrendRow) {
  const row: TrendRow = { id: slug, workspaceId: "system", createdAt: now.toISOString(), ...v };
  if (prior) await trendPages().update("system", slug, row);
  else await trendPages().insert(row);
}

/** Admin: publish a held page (it already passed the gates), or roll a published page back. Both are logged. */
export async function adminPublish(slug: string, by: string, now = new Date()): Promise<boolean> {
  const r = await trendPages().get("system", slug);
  if (!r || r.status !== "held" || !r.page || !r.gates?.pass) return false;
  await trendPages().update("system", slug, { status: "published", publishedAt: now.toISOString() });
  await log("publish", `Published ${slug} (approved by ${by})`);
  const res = await pingIndexNow([`${site.url}/topics/${slug}`]);
  await trendPages().update("system", slug, { indexNow: res });
  return true;
}
export async function adminRollback(slug: string, by: string, now = new Date()): Promise<boolean> {
  const r = await trendPages().get("system", slug);
  if (!r || r.status === "rolled_back") return false;
  await trendPages().update("system", slug, { status: "rolled_back", rolledBackAt: now.toISOString(), rolledBackBy: by });
  await log("rollback", `Rolled back ${slug} (by ${by})`);
  return true;
}
/** Kill switch + rollback of everything published by the tracker. */
export async function adminRollbackAll(by: string): Promise<number> {
  let n = 0;
  for (const r of await allRows()) if (r.status === "published" && (await adminRollback(r.id, by))) n++;
  return n;
}
