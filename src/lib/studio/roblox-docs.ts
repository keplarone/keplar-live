/**
 * Roblox Creator Docs search for Studio mode's roblox_docs tool (src/lib/studio/roblox-docs-tool.ts).
 *
 * The index is vendor/roblox-docs/chunks.json.gz, built from https://github.com/Roblox/creator-docs by
 * scripts/build-roblox-docs.mjs (docs CC BY 4.0, code samples MIT; licences ship beside it). It is read once per server instance
 * and searched with BM25 in memory: no model, no network, no cost per lookup. API names count fully and split
 * (TweenService → tween, service), and a chunk whose title the query names exactly ranks first.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { ROBLOX_DOCS_MAX_RESULTS } from "./roblox-docs-tool";

export const ROBLOX_DOCS_FILE = () => path.join(process.cwd(), "vendor", "roblox-docs", "chunks.json.gz");

/** Characters returned per lookup, under the tool-result cap the agent keeps in history (STUDIO_LIMITS.maxToolResultChars). */
export const ROBLOX_DOCS_MAX_CHARS = 10_000;

type Chunk = [title: string, url: string, text: string];
type Index = { commit: string; chunks: Chunk[]; postings: Map<string, Map<number, number>>; lengths: Float64Array; avgLength: number; titles: Map<string, number[]> };

export type DocsHit = { title: string; url: string; text: string; score: number };

const STOP = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "i", "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "with", "do", "does", "can", "you", "my", "what", "when", "use"]);

/** Words, plus the parts of API names: "TweenService:Create" → tweenservice, tween, service, create. */
export function tokenize(s: string): string[] {
  const out: string[] = [];
  for (const word of s.split(/[^A-Za-z0-9]+/)) {
    if (!word) continue;
    const lower = word.toLowerCase();
    if (!STOP.has(lower)) out.push(lower);
    const parts = word.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/);
    if (parts.length > 1) for (const p of parts) { const q = p.toLowerCase(); if (q.length > 1 && !STOP.has(q)) out.push(q); }
  }
  return out;
}

const TITLE_WEIGHT = 3;

export function buildIndex(chunks: Chunk[], commit = "unknown"): Index {
  const postings = new Map<string, Map<number, number>>();
  const lengths = new Float64Array(chunks.length);
  const titles = new Map<string, number[]>();
  chunks.forEach(([title, , text], i) => {
    const tf = new Map<string, number>();
    for (const t of tokenize(title)) tf.set(t, (tf.get(t) ?? 0) + TITLE_WEIGHT);
    for (const t of tokenize(text)) tf.set(t, (tf.get(t) ?? 0) + 1);
    let len = 0;
    for (const [t, n] of tf) {
      len += n;
      let p = postings.get(t);
      if (!p) postings.set(t, (p = new Map()));
      p.set(i, n);
    }
    lengths[i] = len;
    const key = title.toLowerCase();
    titles.set(key, [...(titles.get(key) ?? []), i]);
  });
  const avgLength = chunks.length ? lengths.reduce((a, b) => a + b, 0) / chunks.length : 1;
  return { commit, chunks, postings, lengths, avgLength, titles };
}

let cached: Index | null = null;

/** The index, loaded on first use and kept for the life of the server instance. */
export function docsIndex(file = ROBLOX_DOCS_FILE()): Index {
  if (cached) return cached;
  const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8")) as { commit?: string; chunks?: Chunk[] };
  if (!Array.isArray(data.chunks)) throw new Error("The Roblox docs index is malformed.");
  cached = buildIndex(data.chunks, data.commit ?? "unknown");
  return cached;
}

/** API names written in the query ("TweenService:Create", "ScreenGui.ScreenInsets", "Enum.FlipbookLayout"). */
const apiNames = (q: string) => q.match(/\b(?:Enum\.)?[A-Z][A-Za-z0-9]*(?:[.:][A-Za-z0-9]+)*/g) ?? [];

export function searchDocs(index: Index, query: string, limit = 5): DocsHit[] {
  const k = Math.max(1, Math.min(ROBLOX_DOCS_MAX_RESULTS, Math.floor(limit) || 5));
  const terms = [...new Set(tokenize(query))];
  const scores = new Map<number, number>();
  const N = index.chunks.length;
  const k1 = 1.2, b = 0.75;
  for (const t of terms) {
    const p = index.postings.get(t);
    if (!p) continue;
    const idf = Math.log(1 + (N - p.size + 0.5) / (p.size + 0.5));
    for (const [i, tf] of p) {
      const norm = tf * (k1 + 1) / (tf + k1 * (1 - b + b * index.lengths[i]! / index.avgLength));
      scores.set(i, (scores.get(i) ?? 0) + idf * norm);
    }
  }
  // A chunk the query names exactly (a class, member or enum) goes to the top.
  const top = Math.max(0, ...scores.values());
  for (const name of apiNames(query)) {
    for (const i of index.titles.get(name.toLowerCase()) ?? []) scores.set(i, (scores.get(i) ?? 0) + top + 10);
  }
  return [...scores.entries()]
    .sort((x, y) => y[1] - x[1] || x[0] - y[0])
    .slice(0, k)
    .map(([i, score]) => { const [title, url, text] = index.chunks[i]!; return { title, url, text, score: Math.round(score * 100) / 100 }; });
}

/** The tool result the model reads: each hit with its link, within ROBLOX_DOCS_MAX_CHARS. */
export function formatDocsHits(query: string, hits: DocsHit[], commit: string): string {
  if (!hits.length) return `No Roblox docs matched "${query}". Try the exact API name (for example "TweenService:Create") or other words.`;
  let out = `Roblox Creator Docs (docs commit ${commit.slice(0, 12)}), best matches for "${query}":`;
  for (const h of hits) {
    const block = `\n\n## ${h.title}\n${h.url}\n${h.text}`;
    if (out.length + block.length > ROBLOX_DOCS_MAX_CHARS) { out += `\n\n(${hits.length - hits.indexOf(h)} more matches left out for length; narrow the query to see them.)`; break; }
    out += block;
  }
  return out;
}
