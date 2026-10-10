/**
 * Dataset loaders. Each reads a LOCAL export of the dataset (nothing is
 * downloaded here) and normalises it into `Item`s. See bench/README.md for how
 * to obtain each file and its license / no-reveal terms.
 *
 *   hle-diamond        cais/hle-diamond (MIT, gated, do-not-redistribute)  → hle-diamond.jsonl | .json
 *   simpleqa-verified  google/simpleqa-verified (MIT)                      → simpleqa_verified.csv
 *   frames             google/frames-benchmark (Apache-2.0)                → frames.tsv | test.tsv
 *   gpqa-diamond       Idavidrein/gpqa (CC BY 4.0, gated, no-reveal)       → gpqa_diamond.csv
 *   fresh              Keplar Fresh Claims (internal)                      → fresh-claims.jsonl
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { seeded, shuffle } from "./rng";
import type { DatasetId, Item } from "./types";

/* ─────────────────────────── parsing helpers ─────────────────────────── */

/** RFC 4180-style parser (quoted fields, doubled quotes, embedded newlines). */
export function parseDelimited(text: string, delimiter = ","): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((c) => c !== "")) rows.push(row); }
  const [header, ...body] = rows;
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ""])));
}

function readJsonRecords(path: string): Record<string, unknown>[] {
  const text = readFileSync(path, "utf8").trim();
  if (text.startsWith("[")) return JSON.parse(text) as Record<string, unknown>[];
  return text.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
}

const str = (v: unknown) => (v == null ? "" : String(v));
const truthy = (v: unknown) => /^(true|1|yes)$/i.test(str(v));

function firstExisting(dir: string, names: string[]): string | null {
  for (const n of names) {
    const p = join(dir, n);
    if (existsSync(p)) return p;
  }
  return null;
}

/* ─────────────────────────── loaders ─────────────────────────── */

export function loadHleDiamond(path: string): Item[] {
  return readJsonRecords(path).map((r) => {
    const mc = str(r.answer_type) === "multipleChoice";
    return {
      dataset: "hle-diamond",
      id: str(r.id),
      question: str(r.question),
      answer: str(r.answer).trim(),
      answerType: mc ? "mc" : "exact",
      // HF features list a `partition` column (reasoning / knowledge per the announcement) [values unverified].
      stratum: str(r.partition) || str(r.category) || "unknown",
      hasImage: str(r.image).trim() !== "",
      noReveal: true,
      synthetic: truthy(r.synthetic),
      meta: { category: str(r.category), raw_subject: str(r.raw_subject), answer_type: str(r.answer_type), canary: r.canary ? "present" : "absent" },
    } satisfies Item;
  });
}

export function loadSimpleQaVerified(path: string): Item[] {
  return parseDelimited(readFileSync(path, "utf8")).map((r) => ({
    dataset: "simpleqa-verified",
    id: `sqav-${r.original_index}`,
    question: r.problem,
    answer: r.answer,
    answerType: "exact",
    stratum: r.topic || "unknown",
    hasImage: false,
    noReveal: false,
    synthetic: truthy(r.synthetic),
    meta: { answer_type: r.answer_type, multi_step: truthy(r.multi_step), requires_reasoning: truthy(r.requires_reasoning) },
  }));
}

export function loadFrames(path: string): Item[] {
  return parseDelimited(readFileSync(path, "utf8"), "\t").map((r, i) => {
    const idx = r[""] ?? r["Unnamed: 0"] ?? String(i);
    const types = (r.reasoning_types || "unknown").split("|").map((s) => s.trim()).filter(Boolean);
    return {
      dataset: "frames",
      id: `frames-${idx}`,
      question: r.Prompt,
      answer: r.Answer,
      answerType: "exact",
      // Stratify on the first listed reasoning type (the column is multi-label).
      stratum: types[0] ?? "unknown",
      hasImage: false,
      noReveal: false,
      synthetic: truthy(r.synthetic),
      meta: { reasoning_types: types },
    } satisfies Item;
  });
}

/** GPQA: options are shuffled with a per-item seed, so the gold letter is reproducible. */
export function loadGpqa(path: string, seed: number): Item[] {
  const L = ["A", "B", "C", "D"];
  return parseDelimited(readFileSync(path, "utf8")).map((r, i) => {
    const id = r["Record ID"] || `gpqa-${i}`;
    const options = shuffle(
      [
        { text: r["Correct Answer"].trim(), gold: true },
        { text: r["Incorrect Answer 1"].trim(), gold: false },
        { text: r["Incorrect Answer 2"].trim(), gold: false },
        { text: r["Incorrect Answer 3"].trim(), gold: false },
      ],
      seeded(seed, "gpqa-options", id),
    );
    const question = `${r.Question.trim()}\n\n${options.map((o, k) => `${L[k]}) ${o.text}`).join("\n")}`;
    return {
      dataset: "gpqa-diamond",
      id,
      question,
      answer: L[options.findIndex((o) => o.gold)],
      answerType: "mc",
      stratum: r["High-level domain"] || "unknown",
      hasImage: false,
      noReveal: true,
      synthetic: truthy(r.synthetic),
      meta: { subdomain: r["Subdomain"] ?? "" },
    } satisfies Item;
  });
}

export type FreshIssue = { id: string; problem: string };

/**
 * Keplar Fresh Claims (internal schema, one JSON object per line):
 * { id, question, answer, answer_type?: "exact"|"mc", topic, event_date, created_at,
 *   sources: string[], verified_by: string[] }
 * An item is only used if written after `cutoff`, about an event after `cutoff`,
 * with ≥ 1 source and ≥ 2 independent human verifiers (plan §1, "double-verified").
 */
export function loadFresh(path: string, cutoff: string, allowUnverified: boolean): { items: Item[]; issues: FreshIssue[] } {
  const issues: FreshIssue[] = [];
  const items: Item[] = [];
  for (const r of readJsonRecords(path)) {
    const id = str(r.id);
    const problems: string[] = [];
    if (!id || !str(r.question) || !str(r.answer)) problems.push("missing id/question/answer");
    if (!(str(r.event_date) > cutoff)) problems.push(`event_date not after ${cutoff}`);
    if (!(str(r.created_at) > cutoff)) problems.push(`created_at not after ${cutoff}`);
    const sources = Array.isArray(r.sources) ? r.sources : [];
    const verifiers = new Set(Array.isArray(r.verified_by) ? r.verified_by.map(String) : []);
    if (!sources.length) problems.push("no sources");
    if (verifiers.size < 2) problems.push("fewer than 2 human verifiers");
    if (problems.length) issues.push({ id, problem: problems.join("; ") });
    if (problems.length && !allowUnverified) continue;
    items.push({
      dataset: "fresh",
      id,
      question: str(r.question),
      answer: str(r.answer),
      answerType: str(r.answer_type) === "mc" ? "mc" : "exact",
      stratum: str(r.topic) || "unknown",
      hasImage: false,
      noReveal: false,
      synthetic: truthy(r.synthetic),
      meta: { event_date: str(r.event_date), sources, verifiers: verifiers.size },
    });
  }
  return { items, issues };
}

const FILES: Record<DatasetId, string[]> = {
  "hle-diamond": ["hle-diamond.jsonl", "hle-diamond.json"],
  "simpleqa-verified": ["simpleqa_verified.csv", "simpleqa-verified.csv"],
  frames: ["frames.tsv", "test.tsv"],
  "gpqa-diamond": ["gpqa_diamond.csv"],
  fresh: ["fresh-claims.jsonl"],
};

export type LoadResult = { items: Item[]; source: string | null; notes: string[] };

export function loadDataset(
  ds: DatasetId,
  dirs: string[],
  opts: { seed: number; freshCutoff: string; allowUnverified: boolean },
): LoadResult {
  for (const dir of dirs) {
    const path = firstExisting(dir, FILES[ds]);
    if (!path) continue;
    const notes: string[] = [];
    let items: Item[];
    switch (ds) {
      case "hle-diamond": items = loadHleDiamond(path); break;
      case "simpleqa-verified": items = loadSimpleQaVerified(path); break;
      case "frames": items = loadFrames(path); break;
      case "gpqa-diamond": items = loadGpqa(path, opts.seed); break;
      case "fresh": {
        const r = loadFresh(path, opts.freshCutoff, opts.allowUnverified);
        items = r.items;
        for (const i of r.issues) notes.push(`fresh ${i.id}: ${i.problem}${opts.allowUnverified ? " (kept: --allow-unverified)" : " (skipped)"}`);
        break;
      }
    }
    const seen = new Set<string>();
    for (const it of items) {
      if (seen.has(it.id)) throw new Error(`${ds}: duplicate id ${it.id} in ${path}`);
      seen.add(it.id);
    }
    return { items, source: path, notes };
  }
  return { items: [], source: null, notes: [`${ds}: no file found in ${dirs.join(", ")} (looked for ${FILES[ds].join(", ")})`] };
}
