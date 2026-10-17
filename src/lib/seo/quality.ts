/**
 * Quality bar for a programmatic page. A draft that fails is not indexable.
 * Topics keep their own gates (src/lib/trends/logic.ts). New collections call this
 * so the rules live in one place: length, links, near-duplicates, and schema that
 * matches the visible text.
 */

export const PROGRAMMATIC_BAR = {
  minWords: 300,
  minLinks: 2,
  maxTitle: 70,
  minDescription: 60,
  maxDescription: 175,
  maxSimilarity: 0.6,
} as const;

export type QualityBar = { [K in keyof typeof PROGRAMMATIC_BAR]: number };

export type PageDraft = {
  path: string;
  title: string;
  description: string;
  h1: string;
  /** Visible text a reader sees, not markup. */
  body: string;
  /** Internal paths this page links to. */
  links: string[];
  jsonLd?: unknown[];
};

export type QualityReport = { pass: boolean; indexable: boolean; reasons: string[] };

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Five-word shingles. The same idea as the topics gate, kept here so other publishers do not import the trends module. */
export function shingles(text: string, n = 5): Set<string> {
  const words = text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(" "));
  return out;
}

/** Share of `page`'s shingles that already appear in `other` (0 when `page` has none). */
export function shingleOverlap(page: string, other: string): number {
  const a = shingles(page);
  if (!a.size) return 0;
  const b = shingles(other);
  let hit = 0;
  for (const x of a) if (b.has(x)) hit++;
  return hit / a.size;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Every object in a JSON-LD tree, including nested ratings and @graph members. */
function ldNodes(data: unknown, seen = new Set<object>()): Record<string, unknown>[] {
  if (!data || typeof data !== "object" || seen.has(data)) return [];
  seen.add(data);
  if (Array.isArray(data)) return data.flatMap((item) => ldNodes(item, seen));
  const o = data as Record<string, unknown>;
  return [o, ...Object.values(o).flatMap((value) => ldNodes(value, seen))];
}

function typesOf(node: Record<string, unknown>): string[] {
  const t = node["@type"];
  return Array.isArray(t) ? t.map(String) : t ? [String(t)] : [];
}

function answerText(v: unknown): string {
  if (typeof v === "string") return v;
  const o = asRecord(v);
  if (!o) return "";
  return typeof o.text === "string" ? o.text : "";
}

/**
 * Structured data must be backed by the visible page.
 * FAQ questions and answers, article headlines, and breadcrumb names have to appear in `visible`.
 * Rating and review nodes are refused: Keplar does not publish ratings.
 */
export function validateJsonLd(nodes: unknown[], visible: string): string[] {
  const problems: string[] = [];
  const hay = norm(visible);
  const has = (needle: string) => {
    const n = norm(needle);
    return n.length < 2 || hay.includes(n);
  };
  const all: Record<string, unknown>[] = [];
  for (const node of nodes) all.push(...ldNodes(node));
  for (const node of all) {
    const types = typesOf(node);
    if (types.some((t) => t === "AggregateRating" || t === "Review") || "ratingValue" in node) {
      problems.push("schema includes a rating or review");
    }
    if (types.includes("FAQPage") && Array.isArray(node.mainEntity)) {
      for (const q of node.mainEntity) {
        const row = asRecord(q);
        if (!row) continue;
        const name = typeof row.name === "string" ? row.name : "";
        const text = answerText(row.acceptedAnswer);
        if (name && !has(name)) problems.push(`FAQ question is not on the page: ${name}`);
        if (text && !has(text)) problems.push(`FAQ answer is not on the page: ${text.slice(0, 80)}`);
      }
    }
    if (types.some((t) => t === "Article" || t === "BlogPosting" || t === "TechArticle")) {
      const headline = typeof node.headline === "string" ? node.headline : "";
      if (headline && !has(headline)) problems.push(`article headline is not on the page: ${headline}`);
    }
    if (types.includes("BreadcrumbList") && Array.isArray(node.itemListElement)) {
      for (const item of node.itemListElement) {
        const row = asRecord(item);
        const name = row && typeof row.name === "string" ? row.name : "";
        if (name && name !== "Home" && name !== "Keplar" && !has(name)) problems.push(`breadcrumb is not on the page: ${name}`);
      }
    }
  }
  return problems;
}

export function assessPage(
  draft: PageDraft,
  others: { path: string; text: string }[] = [],
  taken: { path: string; title: string; description: string; h1: string }[] = [],
  bar: QualityBar = PROGRAMMATIC_BAR,
): QualityReport {
  const reasons: string[] = [];
  const words = wordCount(draft.body);
  if (words < bar.minWords) reasons.push(`thin content (${words} words, need ${bar.minWords})`);
  if (!draft.h1.trim()) reasons.push("missing h1");
  if (draft.title.trim().length === 0 || draft.title.length > bar.maxTitle) reasons.push(`title length ${draft.title.length}`);
  if (draft.description.length < bar.minDescription || draft.description.length > bar.maxDescription) reasons.push(`description length ${draft.description.length}`);
  if (norm(draft.title) === norm(draft.description)) reasons.push("title and description are the same");
  const links = draft.links.filter((p) => p.startsWith("/") && p !== draft.path);
  if (new Set(links).size < bar.minLinks) reasons.push(`internal links ${new Set(links).size}, need ${bar.minLinks}`);
  for (const t of taken) {
    if (t.path === draft.path) continue;
    if (t.title === draft.title) reasons.push(`duplicate title with ${t.path}`);
    if (t.description === draft.description) reasons.push(`duplicate description with ${t.path}`);
    if (t.h1 === draft.h1) reasons.push(`duplicate h1 with ${t.path}`);
  }
  let worst = 0;
  let worstPath = "";
  for (const o of others) {
    if (o.path === draft.path) continue;
    const v = shingleOverlap(draft.body, o.text);
    if (v > worst) {
      worst = v;
      worstPath = o.path;
    }
  }
  if (worst >= bar.maxSimilarity) reasons.push(`near duplicate of ${worstPath} (${worst.toFixed(2)})`);
  if (draft.jsonLd?.length) reasons.push(...validateJsonLd(draft.jsonLd, `${draft.h1}\n${draft.body}`));
  return { pass: reasons.length === 0, indexable: reasons.length === 0, reasons };
}

/** Page numbers for a hub that may grow. Page is 1-based and clamped. */
export function paginate<T>(items: T[], page: number, perPage: number): { page: number; pages: number; items: T[]; prev: number | null; next: number | null } {
  const size = Math.max(1, perPage);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(pages, Math.max(1, Math.floor(page) || 1));
  const start = (current - 1) * size;
  return {
    page: current,
    pages,
    items: items.slice(start, start + size),
    prev: current > 1 ? current - 1 : null,
    next: current < pages ? current + 1 : null,
  };
}
