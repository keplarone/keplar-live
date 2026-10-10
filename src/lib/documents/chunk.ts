/**
 * Chunking and retrieval over an uploaded guide (pure, no network). Chunks keep their page and a section
 * label (the nearest heading-like line), so answers can cite "p. 4, Cell respiration". Retrieval is plain
 * BM25-style keyword scoring: no embeddings, no extra model call, no extra cost.
 */
export type Chunk = { id: string; page: number; section: string; text: string };

const STOP = new Set("a an and are as at be but by can do does for from has have how i if in into is it its me my of on or our so than that the their them then there these they this to up was we were what when where which who why will with you your about explain tell give show mean means".split(" "));

export const tokenize = (s: string): string[] =>
  (s.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter((w) => !STOP.has(w)).map((w) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, "") : w));

/** A heading-like line: short, no sentence punctuation at the end, or numbered, or all caps. */
function isHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 80) return false;
  if (/^#{1,4}\s/.test(t)) return true;
  if (/^(chapter|section|unit|part|lesson)\s+\w+/i.test(t)) return true;
  if (/^\d+(\.\d+)*[.)]?\s+[A-Z]/.test(t) && !/[.!?]$/.test(t)) return true;
  return /^[A-Z][A-Za-z0-9 ,:&'()/-]{2,}$/.test(t) && !/[.!?,;]$/.test(t) && t.split(" ").length <= 9 && (t === t.toUpperCase() || /^[A-Z]/.test(t) && t.split(" ").filter((w) => /^[A-Z]/.test(w)).length >= Math.ceil(t.split(" ").length / 2));
}

/** Split pages into chunks of about `size` characters at paragraph boundaries. */
export function chunkPages(pages: string[], size = 1400): Chunk[] {
  const out: Chunk[] = [];
  let section = "";
  pages.forEach((text, pi) => {
    const page = pi + 1;
    let cur = "";
    const flush = () => {
      if (cur.trim()) out.push({ id: `c${out.length + 1}`, page, section, text: cur.trim() });
      cur = "";
    };
    for (const para of text.split(/\n+/)) {
      const line = para.trim();
      if (!line) continue;
      if (isHeading(line)) {
        flush();
        section = line.replace(/^#{1,4}\s*/, "").slice(0, 80);
      }
      if (cur && cur.length + line.length + 1 > size) flush();
      if (line.length > size * 1.4) {
        flush();
        for (let i = 0; i < line.length; i += size) {
          cur = line.slice(i, i + size);
          flush();
        }
      } else cur = cur ? `${cur}\n${line}` : line;
    }
    flush();
  });
  return out;
}

export type Scored = Chunk & { score: number };

/** Top `k` chunks for a query, best first. Score 0 chunks are never returned. */
export function retrieve(chunks: Chunk[], query: string, k: number): Scored[] {
  const q = [...new Set(tokenize(query))];
  if (!q.length || !chunks.length) return [];
  const docs = chunks.map((c) => tokenize(`${c.section} ${c.text}`));
  const avg = docs.reduce((a, d) => a + d.length, 0) / docs.length || 1;
  const df = new Map<string, number>();
  for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) ?? 0) + 1);
  const N = docs.length;
  const K1 = 1.4;
  const B = 0.75;
  const scored = chunks.map((c, i): Scored => {
    const d = docs[i];
    const tf = new Map<string, number>();
    for (const w of d) tf.set(w, (tf.get(w) ?? 0) + 1);
    let score = 0;
    for (const w of q) {
      const f = tf.get(w);
      if (!f) continue;
      const idf = Math.log(1 + (N - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));
      score += (idf * f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.length) / avg));
    }
    // A section heading that matches the question is a strong signal.
    const head = new Set(tokenize(c.section));
    for (const w of q) if (head.has(w)) score += 0.8;
    return { ...c, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}

/**
 * Text of the guide within a character budget. When the guide is longer than the budget, an even spread of
 * passages is taken (the start of each evenly spaced chunk), in page order. `coverage` says how much was used.
 */
export function budgetText(chunks: Chunk[], budget: number): { text: string; coverage: number; pages: number[] } {
  const total = chunks.reduce((a, c) => a + c.text.length, 0);
  if (total <= budget) return { text: chunks.map(fmt).join("\n\n"), coverage: 1, pages: [...new Set(chunks.map((c) => c.page))] };
  const per = Math.max(300, Math.floor(budget / chunks.length));
  const picked: Chunk[] = [];
  let used = 0;
  for (const c of chunks) {
    const t = c.text.slice(0, per);
    if (used + t.length > budget) break;
    picked.push({ ...c, text: t });
    used += t.length;
  }
  return { text: picked.map(fmt).join("\n\n"), coverage: used / total, pages: [...new Set(picked.map((c) => c.page))] };
}

/** One chunk as the model sees it, with its page and section. */
export const fmt = (c: Chunk) => `[p.${c.page}${c.section ? ` · ${c.section}` : ""}]\n${c.text}`;

/** Chunks whose page falls in [from, to]. */
export const chunksForPages = (chunks: Chunk[], from: number, to: number) => chunks.filter((c) => c.page >= from && c.page <= to);
