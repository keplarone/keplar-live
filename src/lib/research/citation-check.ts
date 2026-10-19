/**
 * Citation check for server Deep Research: does the cited page back the sentence?
 *
 * linkCitations (orchestration/research.ts) already drops any [n] that points at a page that wasn't read. This checks the rest: each
 * cited sentence's numbers and content words are compared with what was read from the pages it cites (the passage the search returned
 * and the reading model's notes tagged with that page). It is lexical, like the desktop's Live Research check: it matches words and
 * numbers, not meaning, so a paraphrase can read as "not verified" and the answer says so. Nothing is removed; statements are labelled.
 *
 * Numbers carry the most weight: a cited sentence whose figures appear in none of its pages is "not verified", whatever its words.
 * Pure and linear in the answer's length.
 */
import type { CitationCheck, LiveClaim, ResearchSource } from "@/lib/orchestration/types";

export type { CitationCheck };

/** Statements kept with the answer (the summary counts all of them). */
export const MAX_LISTED = 12;

const STOP = new Set(
  "about above after again against also among another around because been before being below between both but came come could does doing down during each even every from further have having here into itself just like made make many might more most much must near never only other over same should since some such than that their theirs them then there these they this those though through under until upon very want were what when where which while whom whose will with within without would your yours according reported reports said says".split(" "),
);

/** "1,200" → "1200", "3.50" → "3.5", "45%" → "45": numbers as compared. */
const normNum = (n: string) => {
  const x = n.replace(/,(?=\d{3}\b)/g, "");
  return x.includes(".") ? x.replace(/0+$/, "").replace(/\.$/, "") : x;
};
export const numbersIn = (t: string): string[] => [...new Set((t.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map(normNum).filter((n) => n.length > 0))];

/** Content words, lower-cased, with a light plural/tense trim so "towers" matches "tower". */
const stem = (w: string) => w.replace(/(?:ies)$/, "y").replace(/(?:es|s|ed|ing)$/, "");
export const termsIn = (t: string): string[] => [...new Set((t.toLowerCase().match(/[\p{L}][\p{L}'-]{3,}/gu) ?? []).filter((w) => !STOP.has(w)).map(stem))];

/** Cited sentences outside code: the text without its markers, and the page numbers it cites. */
export function citedSentences(markdown: string): { text: string; cites: number[] }[] {
  const prose = markdown.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ");
  const out: { text: string; cites: number[] }[] = [];
  // A sentence runs to its end punctuation plus any markers right after it ("… in 1889. [1][2]") or to a line break.
  // Punctuation followed by a non-space character (3.5, e.g.x, a URL) is part of the sentence, not its end.
  for (const m of prose.matchAll(/(?:[^\n.!?]|[.!?](?=[^\s[]))+(?:[.!?]+(?:\s*\[\d{1,2}\])*|(?:\s*\[\d{1,2}\])+|$)/g)) {
    const raw = m[0];
    const cites = [...new Set([...raw.matchAll(/\[(\d{1,2})\]/g)].map((x) => Number(x[1])))];
    if (!cites.length) continue;
    const text = raw.replace(/\s*\[\d{1,2}\]/g, "").replace(/[*_#>]+/g, "").replace(/^\s*(?:[-+]|\d+\.)\s+/, "").replace(/\s+/g, " ").trim();
    if (text.length >= 12) out.push({ text: text.slice(0, 300), cites });
  }
  return out;
}

/** What was read from each page: its passage plus every note line that cites it. */
export function evidenceByPage(sources: ResearchSource[], notes: string[]): Map<number, string[]> {
  const ev = new Map<number, string[]>(sources.map((s) => [s.n, s.snippet ? [s.snippet] : []]));
  for (const line of notes.join("\n").split(/\n+/)) {
    for (const m of line.matchAll(/\[(\d{1,2})\]/g)) ev.get(Number(m[1]))?.push(line.replace(/\s*\[\d{1,2}\]/g, "").replace(/^\s*[-*•]\s*/, "").trim());
  }
  return ev;
}

const RANK: Record<LiveClaim["status"], number> = { "not-verified": 0, conflicting: 1, "partially-supported": 2, supported: 3 };

export function checkCitations(markdown: string, sources: ResearchSource[], evidence: Map<number, string[]>): CitationCheck {
  const claims: LiveClaim[] = [];
  for (const { text, cites } of citedSentences(markdown)) {
    const lines = cites.flatMap((n) => evidence.get(n) ?? []);
    const pageNums = new Set(lines.flatMap(numbersIn));
    const pageTerms = new Set(lines.flatMap(termsIn));
    const nums = numbersIn(text);
    const terms = termsIn(text);
    const numHit = nums.filter((n) => pageNums.has(n)).length;
    const termShare = terms.length ? terms.filter((t) => pageTerms.has(t)).length / terms.length : 0;
    let status: LiveClaim["status"];
    let note: string | undefined;
    if (!lines.length) {
      status = "not-verified";
      note = "Nothing was kept from the cited page to compare with.";
    } else if (nums.length) {
      const missing = nums.filter((n) => !pageNums.has(n));
      status = numHit === nums.length ? (termShare >= 0.3 ? "supported" : "partially-supported") : numHit > 0 ? "partially-supported" : "not-verified";
      if (missing.length) note = `${missing.length === 1 ? "The figure" : "The figures"} ${missing.slice(0, 3).join(", ")} ${missing.length === 1 ? "wasn't" : "weren't"} in what was read from the cited ${cites.length === 1 ? "page" : "pages"}.`;
    } else {
      status = termShare >= 0.5 ? "supported" : termShare >= 0.25 ? "partially-supported" : "not-verified";
      if (status !== "supported") note = "Few of this sentence's words appear in what was read from the cited page.";
    }
    const quote = status === "supported" ? undefined : bestLine(lines, terms, nums);
    claims.push({ text, citations: cites, status, ...(quote ? { quote } : {}), ...(note ? { note } : {}) });
  }
  const count = (st: LiveClaim["status"]) => claims.filter((c) => c.status === st).length;
  return {
    summary: { claims: claims.length, supported: count("supported"), partiallySupported: count("partially-supported"), notVerified: count("not-verified") },
    claims: claims.filter((c) => c.status !== "supported").sort((a, b) => RANK[a.status] - RANK[b.status]).slice(0, MAX_LISTED),
  };
}

/** The read line closest to the sentence, so the person can see what the page did say. */
function bestLine(lines: string[], terms: string[], nums: string[]): string | undefined {
  let best: { line: string; score: number } | null = null;
  for (const line of lines) {
    const t = new Set(termsIn(line));
    const n = new Set(numbersIn(line));
    const score = terms.filter((x) => t.has(x)).length + 2 * nums.filter((x) => n.has(x)).length;
    if (score > 0 && (!best || score > best.score)) best = { line, score };
  }
  return best ? best.line.slice(0, 200) : undefined;
}
