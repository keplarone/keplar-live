/**
 * Page quality gates, shared by the content tests (tests/kb-content.test.ts, tests/seo-quality.test.ts), the programmatic
 * publishers (trend pages, tools, reports) and the sitemap. One definition of "good enough to index": a page that fails a
 * gate is not published and not listed, so the site can grow without thin or duplicated pages.
 *
 * Pure functions, no I/O. Thresholds are the ones the knowledge-base tests have enforced since 3 Oct 2026, so existing
 * content passes unchanged.
 */
import { wordCount } from "@/lib/kb/md";

export const QUALITY = {
  /** <title> including the " · Keplar" suffix the layout template adds. */
  titleMin: 15,
  titleMax: 62,
  descriptionMin: 60,
  descriptionMax: 175,
  /** Six-word shingles, as in the knowledge-base duplicate check. */
  shingleWords: 6,
  /** Two pages that share more than this (Jaccard over shingles) are near-duplicates. */
  maxJaccard: 0.12,
  /** A page whose shingles are mostly contained in another page is a copy even if the other page is much longer. */
  maxContainment: 0.3,
} as const;

export type PageFacts = {
  path: string;
  title: string;
  description: string;
  /** Visible body text (no nav, footer or markup). */
  text: string;
  /** Internal links in the body, as paths. Optional: pages that have no link data skip the link check. */
  internalLinks?: string[];
  /** Number of <h1> elements when known. */
  h1?: number;
};

export type Check = { name: string; ok: boolean; detail?: string };
export type Gate = { pass: boolean; checks: Check[]; reasons: string[] };

/** Lower-cased word n-grams. Punctuation is dropped so a comma does not hide a copied sentence. */
export function shingles(text: string, n: number = QUALITY.shingleWords): Set<string> {
  const w = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}

/** Jaccard similarity of two shingle sets and the share of the smaller set contained in the larger. */
export function overlap(a: Set<string>, b: Set<string>): { jaccard: number; containment: number } {
  if (a.size === 0 || b.size === 0) return { jaccard: 0, containment: 0 };
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const x of small) if (big.has(x)) inter++;
  return { jaccard: inter / (a.size + b.size - inter), containment: inter / small.size };
}

export type DuplicatePair = { a: string; b: string; jaccard: number; containment: number };

/** Every pair of pages that reads as a copy of the other under QUALITY thresholds. */
export function nearDuplicates(pages: PageFacts[], limits: { maxJaccard?: number; maxContainment?: number } = {}): DuplicatePair[] {
  const maxJ = limits.maxJaccard ?? QUALITY.maxJaccard;
  const maxC = limits.maxContainment ?? QUALITY.maxContainment;
  const list = pages.map((p) => ({ path: p.path, sh: shingles(p.text) }));
  const out: DuplicatePair[] = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const o = overlap(list[i].sh, list[j].sh);
      if (o.jaccard > maxJ || o.containment > maxC) out.push({ a: list[i].path, b: list[j].path, ...o });
    }
  }
  return out;
}

export type MetadataCollision = { kind: "title" | "description"; value: string; paths: string[] };

/** Titles or descriptions used by more than one page (case-insensitive). */
export function metadataCollisions(pages: PageFacts[]): MetadataCollision[] {
  const out: MetadataCollision[] = [];
  for (const kind of ["title", "description"] as const) {
    const by = new Map<string, string[]>();
    for (const p of pages) {
      const v = p[kind].trim().toLowerCase();
      if (!v) continue;
      by.set(v, [...(by.get(v) ?? []), p.path]);
    }
    for (const [value, paths] of by) if (paths.length > 1) out.push({ kind, value, paths });
  }
  return out;
}

export type GateOptions = {
  /** Words of visible body text the page must have. */
  minWords: number;
  /** Internal links the body must carry (0 = not checked). */
  minInternalLinks?: number;
  /** Other published pages to compare against for duplication. */
  others?: PageFacts[];
  /** Phrases that must not appear (unsupported claims, banned wording). */
  banned?: RegExp[];
};

/** Run every gate on one page. The checks are reported in full so an admin page or a test can show which one failed. */
export function gatePage(p: PageFacts, opts: GateOptions): Gate {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push(ok ? { name, ok } : { name, ok, detail });
  const title = p.title.trim();
  const desc = p.description.trim();
  add("title length", title.length >= QUALITY.titleMin && title.length <= QUALITY.titleMax, `${title.length} characters, need ${QUALITY.titleMin}–${QUALITY.titleMax}`);
  add("description length", desc.length >= QUALITY.descriptionMin && desc.length <= QUALITY.descriptionMax, `${desc.length} characters, need ${QUALITY.descriptionMin}–${QUALITY.descriptionMax}`);
  const words = wordCount(p.text);
  add("body length", words >= opts.minWords, `${words} words, need ${opts.minWords}`);
  if (p.h1 !== undefined) add("one h1", p.h1 === 1, `${p.h1} h1 elements`);
  if ((opts.minInternalLinks ?? 0) > 0 && p.internalLinks) {
    const n = new Set(p.internalLinks.filter((l) => l !== p.path)).size;
    add("internal links", n >= (opts.minInternalLinks ?? 0), `${n} links, need ${opts.minInternalLinks}`);
  }
  for (const re of opts.banned ?? []) {
    const m = `${title}\n${desc}\n${p.text}`.match(re);
    add(`banned wording ${re.source}`, !m, m ? `found "${m[0]}"` : undefined);
  }
  if (opts.others?.length) {
    const dupes = nearDuplicates([p, ...opts.others.filter((o) => o.path !== p.path)]).filter((d) => d.a === p.path || d.b === p.path);
    add("not a near-duplicate", dupes.length === 0, dupes.map((d) => `${d.a === p.path ? d.b : d.a} (jaccard ${d.jaccard.toFixed(2)}, containment ${d.containment.toFixed(2)})`).join("; "));
    const taken = metadataCollisions([p, ...opts.others.filter((o) => o.path !== p.path)]).filter((c) => c.paths.includes(p.path));
    add("unique title and description", taken.length === 0, taken.map((c) => `${c.kind} shared with ${c.paths.filter((x) => x !== p.path).join(", ")}`).join("; "));
  }
  const reasons = checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail ?? "failed"}`);
  return { pass: reasons.length === 0, checks, reasons };
}
