/**
 * Server citation check for Deep Research (research.ts). linkCitations already drops an [n] that points at a page nobody read; this
 * checks that each remaining [n] is backed by the page it points at, using only the text the search returned for that page.
 *
 * Per cited sentence, per cited page:
 *   supports   every number in the sentence is on the page, and most of its content words are;
 *   partial    some of it is on the page (or the sentence's numbers are spread over several cited pages);
 *   conflict   the sentence gives "X <unit>" and the page gives a different "Y <unit>" for the same unit, on the same topic;
 *   unrelated  the page has real text and shares (almost) nothing with the sentence: a mismatched citation. Its [n] is removed;
 *   unchecked  the search returned no text for the page, so nothing can be said. The [n] stays and the claim says "not verified".
 *
 * Rules that keep it honest:
 *  - evidence is the page text the search returned, never the reading model's notes (those are a model's words, not the page's);
 *  - the check compares words and numbers, not meaning: a paraphrase can show as "partly supported", and a sentence that reuses a
 *    page's words can show as "supported" without the page saying the same thing. The card says so;
 *  - a citation is removed only when the page clearly doesn't match (real text, no shared number, almost no shared words). The
 *    sentence itself is never changed or removed. Code spans and blocks are left alone. Pure: no network, no model.
 */
import type { CitationCheck, LiveClaim, LiveClaimStatus, ResearchSource } from "@/lib/orchestration/types";

/** Page text shorter than this is too little to call a citation unrelated (it can still support one). */
export const MIN_EVIDENCE_CHARS = 120;
/** How much of a page's returned text is kept for the check (server side only, never sent to the browser). */
export const EVIDENCE_CHARS = 4000;
/** Statements kept with the answer (the most serious first); the summary still counts all of them. */
export const MAX_LISTED = 12;

export type PageVerdict = "supports" | "partial" | "conflict" | "unrelated" | "unchecked";
export type CheckedStatement = {
  text: string;
  citations: number[];
  status: LiveClaimStatus;
  /** Markers removed from this sentence because their page doesn't match it. */
  removed: number[];
  verdicts: Record<number, PageVerdict>;
  conflict?: { n: number; quote: string };
  note?: string;
};
export type CitationCheckResult = { markdown: string; check: CitationCheck; statements: CheckedStatement[] };

const STOP = new Set(
  ("about above after again against also among another around because been before being below between both but came can could did does doing down during each even every from further gets given had has have having here how however into its itself just less like made make many more most much must near never next only other ours over said same says several should since some such than that their theirs them then there these they this those though through thus under until upon very was were what when where which while whom whose why will with within without would year years your also according report reports reported per cent percent")
    .split(" "),
);
const UNITS = new Set(["%", "percent", "per", "million", "billion", "trillion", "thousand", "hundred", "km", "kilometres", "kilometers", "miles", "mi", "kg", "tonnes", "tons", "people", "users", "customers", "employees", "dollars", "usd", "euros", "gb", "tb", "mb", "mph", "kmh", "degrees", "°c", "°f", "meters", "metres", "m", "ft", "feet", "days", "hours", "minutes", "times", "points"]);

const CODE = /(```[\s\S]*?```|`[^`\n]*`)/;
const MARKER = /\[(\d{1,2})\](?!\()/g;
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/** Plain words of a Markdown sentence: links keep their label, emphasis and list/heading marks go, markers go. */
export function plainText(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, "$1")
    .replace(MARKER, " ")
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, "")
    .replace(/[*_~]+/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

const stem = (w: string) => (w.length > 5 ? w.replace(/(?:ing|edly|ed|es|s)$/, "") : w.replace(/s$/, ""));
/** Numbers as written facts: "1,200" = "1200", "3.50" = "3.5". Bare single digits are too common to check ("2 options"). */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?<![\w.])\d[\d,]*(?:\.\d+)?/g)) {
    let n = m[0].replace(/,(?=\d{3}\b)/g, "").replace(/,$/, "");
    if (n.includes(".")) n = n.replace(/\.?0+$/, "");
    if (n.length >= 2 || /%/.test(text.slice(m.index! + m[0].length, m.index! + m[0].length + 2))) out.push(n);
  }
  return [...new Set(out)];
}
export function wordsIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.toLowerCase().matchAll(/[\p{L}][\p{L}'-]{3,}/gu)) {
    const w = m[0].replace(/'s$/, "");
    if (!STOP.has(w)) out.add(stem(w));
  }
  return [...out];
}
/** "X unit" pairs ("42 %", "3.5 million", "120 km"), the unit lower-cased. */
function measures(text: string): { n: string; unit: string; at: number }[] {
  const out: { n: string; unit: string; at: number }[] = [];
  for (const m of text.matchAll(/(?<![\w.])(\d[\d,]*(?:\.\d+)?)\s?(%|[a-zA-Z°]{1,12})/g)) {
    const unit = m[2].toLowerCase();
    if (!UNITS.has(unit)) continue;
    let n = m[1].replace(/,(?=\d{3}\b)/g, "");
    if (n.includes(".")) n = n.replace(/\.?0+$/, "");
    out.push({ n, unit: unit === "percent" ? "%" : unit, at: m.index! });
  }
  return out;
}

type Page = { text: string; words: Set<string>; numbers: Set<string> };
const pageOf = (raw: string): Page => {
  const text = raw.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, EVIDENCE_CHARS);
  return { text, words: new Set(wordsIn(text)), numbers: new Set(numbersIn(text)) };
};

/** How one page bears on one sentence. Pure. */
export function judgePage(sentence: string, raw: string | undefined): { verdict: PageVerdict; quote?: string } {
  if (!raw || !raw.trim()) return { verdict: "unchecked" };
  const page = pageOf(raw);
  const words = wordsIn(sentence);
  const nums = numbersIn(sentence);
  const shared = words.filter((w) => page.words.has(w)).length;
  const overlap = words.length ? shared / words.length : 0;
  const numsFound = nums.filter((n) => page.numbers.has(n)).length;
  // Same unit, different number, on the same topic: the page says something else.
  if (overlap >= 0.25) {
    for (const s of measures(sentence)) {
      if (page.numbers.has(s.n)) continue;
      const other = measures(page.text).find((p) => p.unit === s.unit && p.n !== s.n);
      if (other) {
        const from = Math.max(0, page.text.lastIndexOf(" ", Math.max(0, other.at - 90)));
        return { verdict: "conflict", quote: clip(page.text.slice(from, other.at + 90).trim(), 200) };
      }
    }
  }
  if (numsFound === nums.length && overlap >= 0.5 && (words.length >= 2 || nums.length > 0)) return { verdict: "supports" };
  if (overlap >= 0.2 || numsFound > 0) return { verdict: "partial" };
  if (page.text.length >= MIN_EVIDENCE_CHARS && numsFound === 0 && overlap < 0.12) return { verdict: "unrelated" };
  return { verdict: "partial" };
}

const SERIOUS: Record<LiveClaimStatus, number> = { conflicting: 0, "not-verified": 1, "partially-supported": 2, supported: 3 };

/** Splits prose into sentences, each keeping the [n] markers written right after it. Decimals ("3.5") never split. */
function sentences(prose: string): string[] {
  return prose.split(/(?<=[.!?](?:["”')\]]*)(?:\s*\[\d{1,2}\])*)\s+(?=["“(*_]*[\p{Lu}\d])|\n+/u);
}

/**
 * Checks every cited sentence of a Deep Research answer against the pages it cites, and removes citations whose page clearly
 * doesn't match. `evidence` maps a page number to the text the search returned for it. Pure.
 */
export function checkCitations(markdown: string, sources: ResearchSource[], evidence: ReadonlyMap<number, string>, now = new Date()): CitationCheckResult {
  const read = new Set(sources.map((s) => s.n));
  const statements: CheckedStatement[] = [];
  let uncitedFacts = 0;
  const parts = markdown.split(CODE);
  const out = parts.map((part, i) => {
    if (i % 2 === 1) return part;
    // Rebuild the prose piece by piece so whitespace and line breaks survive untouched.
    return part.replace(/[^\n]+/g, (line) => {
      let rebuilt = line;
      for (const raw of sentences(line)) {
        if (!raw.trim()) continue;
        const cites = [...raw.matchAll(MARKER)].map((m) => Number(m[1])).filter((n) => read.has(n));
        const text = plainText(raw);
        if (!cites.length) {
          if (numbersIn(text).length && wordsIn(text).length >= 2) uncitedFacts++;
          continue;
        }
        if (!text || (wordsIn(text).length < 2 && !numbersIn(text).length)) continue;
        const unique = [...new Set(cites)];
        const verdicts: Record<number, PageVerdict> = {};
        let conflict: CheckedStatement["conflict"];
        for (const n of unique) {
          const j = judgePage(text, evidence.get(n));
          verdicts[n] = j.verdict;
          if (j.verdict === "conflict" && !conflict && j.quote) conflict = { n, quote: j.quote };
        }
        const vs = unique.map((n) => verdicts[n]);
        const removed = unique.filter((n) => verdicts[n] === "unrelated");
        // Numbers spread over several cited pages: together they can back the sentence even if no single page does.
        const together = unique.length > 1 && judgePage(text, unique.map((n) => evidence.get(n) ?? "").join(" ")).verdict === "supports";
        let status: LiveClaimStatus;
        let note: string | undefined;
        if (vs.includes("supports")) status = "supported";
        else if (conflict) status = "conflicting";
        else if (together || vs.includes("partial")) {
          status = "partially-supported";
          note = together ? "The cited pages back this only together, not one page on its own." : "The cited page mentions this only in part.";
        } else {
          status = "not-verified";
          note = vs.every((v) => v === "unchecked")
            ? "The search returned no text for the cited page, so this citation couldn't be checked."
            : "The cited page doesn't mention this, so its citation was removed.";
        }
        if (status !== "supported" && removed.length) {
          const better = sources.find((s) => !unique.includes(s.n) && judgePage(text, evidence.get(s.n)).verdict === "supports");
          if (better) note = `${note ? `${note} ` : ""}Page ${better.n} matches it better; it wasn't cited.`;
        }
        statements.push({ text: clip(text, 300), citations: unique, status, removed, verdicts, ...(conflict && status === "conflicting" ? { conflict } : {}), ...(note ? { note } : {}) });
        if (removed.length) {
          const cleaned = raw.replace(/\s?\[(\d{1,2})\](?!\()/g, (m, d: string) => (removed.includes(Number(d)) ? "" : m));
          rebuilt = rebuilt.replace(raw, cleaned);
        }
      }
      return rebuilt;
    });
  });
  const count = (s: LiveClaimStatus) => statements.filter((x) => x.status === s).length;
  const claims: LiveClaim[] = statements
    .filter((c) => c.status !== "supported")
    .sort((a, b) => SERIOUS[a.status] - SERIOUS[b.status])
    .slice(0, MAX_LISTED)
    .map((c) => ({ text: c.text, citations: c.citations.slice(0, 6), status: c.status, ...(c.conflict ? { conflict: c.conflict } : {}), ...(c.note ? { note: clip(c.note, 200) } : {}) }));
  const check: CitationCheck = {
    at: now.toISOString(),
    by: "server",
    summary: {
      claims: statements.length,
      supported: count("supported"),
      partiallySupported: count("partially-supported"),
      conflicting: count("conflicting"),
      notVerified: count("not-verified"),
      removedCitations: statements.reduce((a, s) => a + s.removed.length, 0),
      removedLinks: 0,
      uncitedFacts,
    },
    claims,
  };
  return { markdown: out.join(""), check, statements };
}

/** Recomputes which pages are still cited after markers were removed (sorted, unique). Pure. */
export function citedPages(markdown: string, sources: ResearchSource[]): number[] {
  const read = new Set(sources.map((s) => s.n));
  const cited = new Set<number>();
  markdown.split(CODE).forEach((part, i) => {
    if (i % 2 === 1) return;
    for (const m of part.matchAll(MARKER)) if (read.has(Number(m[1]))) cited.add(Number(m[1]));
  });
  return [...cited].sort((a, b) => a - b);
}
