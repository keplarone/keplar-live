/**
 * Site search over the published pages. Plain text is pulled out of the saved HTML on request (sites are small), so there is
 * no index to go stale. Pages that sit behind a members gate are never searchable: their text would leak to signed-out visitors.
 */
import { findPlaceholders } from "./placeholders";

export type Hit = { file: string; /** Set for non-page results (blog posts): the path under the site base. */ path?: string; title: string; snippet: string; score: number };
/** Extra searchable text that isn't a saved page, e.g. published blog posts. */
export type Extra = { path: string; title: string; text: string };
export const MAX_QUERY = 80;
export const MAX_HITS = 20;

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
export function plainText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<head\b[\s\S]*?<\/head>/i, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#?\w+);/g, (m, e: string) => ENT[e] ?? (/^#\d+$/.test(e) ? String.fromCodePoint(Math.min(Number(e.slice(1)), 0x10ffff)) : m))
    .replace(/\s+/g, " ")
    .trim();
}
const titleOf = (html: string, file: string) => {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const t = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return plainText(h1 ?? t ?? "").slice(0, 100) || (file === "index.html" ? "Home" : file.replace(/\.html$/, ""));
};

export const terms = (q: string) => [...new Set(q.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/\s+/).filter((t) => t.length >= 2))].slice(0, 6);

export const isGated = (html: string) => findPlaceholders(html).some((p) => p.feature === "members" && p.attrs.gate === "page");

/** Pages a visitor may search: real pages, not the 404 page, not members-only pages. */
export const searchablePages = (files: Record<string, string>) =>
  Object.entries(files).filter(([f, h]) => f.endsWith(".html") && f !== "404.html" && !isGated(h));

export function search(files: Record<string, string>, query: string, extra: Extra[] = []): Hit[] {
  const ts = terms(query.slice(0, MAX_QUERY));
  if (!ts.length) return [];
  const hits: Hit[] = [];
  const docs = [...searchablePages(files).map(([file, html]) => ({ file, path: undefined as string | undefined, text: plainText(html).slice(0, 200_000), title: titleOf(html, file) })), ...extra.map((e) => ({ file: "", path: e.path, text: e.text.slice(0, 200_000), title: e.title }))];
  for (const { file, path, text, title } of docs) {
    const low = text.toLowerCase();
    const tl = title.toLowerCase();
    if (!ts.every((t) => low.includes(t) || tl.includes(t))) continue;
    let score = 0;
    for (const t of ts) {
      if (tl.includes(t)) score += 10;
      let at = low.indexOf(t);
      for (let n = 0; at !== -1 && n < 20; n++, at = low.indexOf(t, at + t.length)) score += 1;
    }
    const first = Math.min(...ts.map((t) => (low.indexOf(t) === -1 ? Infinity : low.indexOf(t))));
    const from = Number.isFinite(first) ? Math.max(0, first - 60) : 0;
    const snippet = `${from > 0 ? "…" : ""}${text.slice(from, from + 180)}${from + 180 < text.length ? "…" : ""}`;
    hits.push({ file, ...(path ? { path } : {}), title, snippet, score });
  }
  return hits.sort((a, b) => b.score - a.score || (a.path ?? a.file).localeCompare(b.path ?? b.file)).slice(0, MAX_HITS);
}

/** Escape and mark the matched words. The only HTML produced is <mark>. */
export function highlight(text: string, ts: string[]): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  if (!ts.length) return esc(text);
  const re = new RegExp(`(${ts.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(re).map((part, i) => (i % 2 ? `<mark>${esc(part)}</mark>` : esc(part))).join("");
}
