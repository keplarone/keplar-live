/**
 * Trend tracker, pure logic (no network, no storage): relevance and safety filters, grounding match, page builder, quality gates.
 *
 * Principles (docs/seo-trends.md):
 *  - A trending query only becomes a page when it matches a term in Keplar's own glossary. The definition on the page is the glossary's
 *    definition (grounded, reviewed text); nothing is invented by a language model.
 *  - Search interest is stated only as Google reported it, dated and attributed ("rising", an approximate-traffic bucket) and never as a
 *    claim about Keplar. No volumes of our own, no accuracy claims, no comparisons.
 *  - Anything that fails a gate is logged with the reason and not published.
 */
import { glossary, type GlossaryTerm } from "@/lib/kb/glossary";
import { wordCount } from "@/lib/kb/md";

export type SiteDoc = { path: string; title: string; description: string; text: string; keywords?: string[] };
export type Candidate = { query: string; source: "trending-rss" | "related-rising" | "related-top"; seed?: string; traffic?: string; growth?: number; news?: { title: string; source: string; url: string }[] };

/* ---------- relevance and safety ---------- */

const AI_WORDS = /\b(ai|a\.i\.|llm|llms|agi|asi|gpt|machine learning|neural|prompt|prompts|chatbot|chatbots|generative|superintelligen\w*|language model|language models|transformer|embedding|embeddings|rag|mcp|model context protocol|agentic|agent|agents|hallucinat\w*|alignment|fine[- ]tun\w*|deep research|reasoning model)\b/i;

/** Topics we do not produce pages for: adult, violence/self-harm, weapons, drugs, hate, politics and elections, legal/medical advice, scams/exploits, leaks. */
const UNSAFE = /\b(porn\w*|nsfw|nude\w*|sex\w*|erotic\w*|fetish|onlyfans|suicid\w*|self[- ]harm|kill\w*|murder\w*|bomb\w*|weapon\w*|gun|guns|terror\w*|drug\w*|cocaine|heroin|meth|overdose|racis\w*|nazi\w*|slur\w*|hate|trump|biden|harris|vance|election\w*|democrat\w*|republican\w*|president\w*|congress|senate|war|iran|israel|gaza|ukraine|russia|china|jailbreak\w*|exploit\w*|hack\w*|crack\w*|leak\w*|leaked|scam\w*|crypto\w*|bitcoin|token sale|ico|stock|stocks|invest\w*|lawsuit|sue|sued|diagnos\w*|cure|cures|dosage|symptom\w*|doomsday|apocalypse|conscious\w*|sentient|sentience|alive|soul|worship|cult)\b/i;

/** Names of AI products and companies. We do not write about brands we have not cleared for comparison, and a trend page is not the place to start. */
const BRANDS = /\b(chatgpt|openai|sam altman|anthropic|claude|gemini|bard|perplexity|grok|xai|deepseek|copilot|microsoft|google|meta|llama|mistral|nvidia|qwen|kimi|manus|cursor|midjourney|stable diffusion|sora|character\.?ai|replika|siri|alexa|apple intelligence|ssi|safe superintelligence|ilya|hugging ?face|openclaw|devin|windsurf|lovable|v0)\b/i;

/** Claims we never make on a generated page; a candidate query that asks for one is not turned into a page either. */
const CLAIM_BAIT = /\b(is (it )?(agi|alive|conscious|sentient|real)|replace[sd]? (all )?(jobs|humans)|will (ai|agi|asi) (kill|destroy|take over)|best ai|better than|vs\b|versus|ranking|top \d+|free unlimited|accuracy|most accurate)\b/i;

export type Verdict = { ok: true } | { ok: false; reason: string };

export function screenQuery(q: string): Verdict {
  const s = q.trim();
  if (s.length < 4 || s.length > 80) return { ok: false, reason: "length" };
  if (!/^[\p{L}\p{N}\s'’.\-&+]+$/u.test(s)) return { ok: false, reason: "characters" };
  if (!AI_WORDS.test(s)) return { ok: false, reason: "not about AI" };
  if (UNSAFE.test(s)) return { ok: false, reason: "sensitive topic" };
  if (BRANDS.test(s)) return { ok: false, reason: "names a brand" };
  if (CLAIM_BAIT.test(s)) return { ok: false, reason: "asks for a claim or comparison we do not make" };
  return { ok: true };
}

/* ---------- grounding: match a query to a glossary term ---------- */

const variantsOf = (t: GlossaryTerm): string[] => {
  const m = t.term.match(/^(.*?)\s*\((.*)\)\s*$/);
  const raw = m ? [m[1], m[2]] : [t.term];
  return [...new Set(raw.flatMap((r) => r.split(/\s+and\s+/i)).map((x) => x.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim()).filter((x) => x.length >= 3))];
};

export function matchTerm(query: string): GlossaryTerm | null {
  const q = ` ${query.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ")} `;
  let best: { t: GlossaryTerm; len: number } | null = null;
  for (const t of glossary) for (const v of variantsOf(t)) if (q.includes(` ${v} `) || q.includes(` ${v}s `)) if (!best || v.length > best.len) best = { t, len: v.length };
  return best?.t ?? null;
}

export const termSlug = (t: GlossaryTerm) => {
  const head = t.term.replace(/\s*\(.*\)\s*$/, "") || t.term;
  const abbr = t.term.match(/\(([^)]*)\)/)?.[1] ?? "";
  const base = abbr && /^[A-Za-z]{2,6}$/.test(abbr) ? `${head} ${abbr}` : head;
  return base.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
};
export const termTitle = (t: GlossaryTerm) => t.term.replace(/\s*\(.*\)\s*$/, "") || t.term;

/** Is this term's intent already owned by an existing page? (Title or keyword-level overlap.) Returns that page. */
export function existingCoverage(t: GlossaryTerm, docs: SiteDoc[]): SiteDoc | null {
  const vs = variantsOf(t);
  const hay = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ")} `;
  for (const d of docs) {
    const title = hay(d.title);
    if (vs.some((v) => title.includes(` ${v} `) || title.includes(` ${v}s `))) return d;
    if ((d.keywords ?? []).some((k) => vs.some((v) => hay(k).trim() === v))) return d;
  }
  return null;
}

/* ---------- page builder ---------- */

export type TrendPage = {
  slug: string;
  term: string;
  title: string;
  description: string;
  intro: string;
  definition: string;
  inKeplar?: string;
  library: { path: string; title: string; description: string }[];
  alsoSearched: string[];
  news: { title: string; source: string; url: string }[];
  howToCheck: string[];
  observed: { date: string; source: string; note: string };
  faq: { q: string; a: string }[];
  text: string;
  words: number;
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export function buildPage(c: Candidate, t: GlossaryTerm, docs: SiteDoc[], alsoSearched: string[], today: string): TrendPage {
  const name = termTitle(t);
  const lower = name.toLowerCase();
  const slug = termSlug(t);
  const words = new Set(variantsOf(t).flatMap((v) => v.split(" ")).filter((w) => w.length > 3));
  const library = docs
    .map((d) => ({ d, score: [...words].reduce((n, w) => n + (` ${d.title} ${d.description} ${(d.keywords ?? []).join(" ")} `.toLowerCase().includes(w) ? 1 : 0), 0) + (d.path.startsWith("/docs/how-it-works") ? 0.1 : 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => ({ path: x.d.path, title: x.d.title, description: x.d.description }));
  const trafficNote = c.traffic ? ` Google listed it with an approximate traffic bucket of ${c.traffic} searches` : "";
  const observed =
    c.source === "trending-rss"
      ? { date: today, source: "Google Trends, Trending now (US, public RSS feed)", note: `A search for "${c.query}" appeared in Google's Trending now list on ${today}.${trafficNote}${trafficNote ? "." : ""} That says people searched; it does not say anything about whether the news behind it is right.` }
      : { date: today, source: "Google Trends, related queries (US, past 3 months)", note: `"${c.query}" appeared among queries related to "${c.seed ?? "this topic"}" on ${today}${c.source === "related-rising" ? ", listed as rising" : ""}. Google reports relative change, not a search count, and Keplar publishes no volume figure.` };
  const howToCheck = [
    `Ask for the source of any claim about ${lower}, then open it. A citation produced by an AI system can be wrong or invented.`,
    `Prefer the people who do the work (the paper, the documentation, the standards body) over a summary of a summary.`,
    `Check the date. Statements about ${lower} age quickly, and models have a knowledge cutoff.`,
    `Ask the same question to more than one model and read where they differ. Agreement is a signal, not proof.`,
  ];
  const faq = [
    { q: `What is ${lower}?`, a: t.def },
    { q: `Is ${lower} related to AGI or superintelligence?`, a: `Not by itself. ${name} is a general concept in AI; neither it nor Keplar is artificial general intelligence or superintelligence. See the glossary for what those terms mean.` },
    { q: `How does Keplar relate to ${lower}?`, a: t.inKeplar ?? `Keplar is a multi-model workspace: it asks several AI models, compares their positions and writes one answer. This page is a short orientation to the term, not a Keplar feature.` },
  ];
  const intro = `People are searching for "${c.query}". This page explains the term "${name}" in plain English, points to the parts of the Keplar library that cover it, and lists a few ways to check what you read about it. It was assembled from Keplar's reviewed glossary and library, not written by a model, and it is dated ${today}.`;
  const description = clean(`${name}: ${t.def}`).slice(0, 158).replace(/\s+\S*$/, "").replace(/[,;:\s]+$/, "") + (`${name}: ${t.def}`.length > 158 ? "…" : "");
  const title = `${name}: what it means and how to check claims`.length <= GATES.maxTitle ? `${name}: what it means and how to check claims` : `${name}: meaning and how to check claims`;
  const text = clean([intro, t.def, t.inKeplar ?? "", ...howToCheck, observed.note, ...library.map((l) => `${l.title}. ${l.description}`), ...alsoSearched, ...faq.map((f) => `${f.q} ${f.a}`)].join(" "));
  return { slug, term: name, title, description, intro, definition: t.def, inKeplar: t.inKeplar, library, alsoSearched, news: (c.news ?? []).slice(0, 3), howToCheck, observed, faq, text, words: wordCount(text) };
}

/* ---------- quality gates ---------- */

export const GATES = { minWords: 260, minOwnWords: 35, minLibraryLinks: 2, maxSimilarity: 0.6, minDescription: 60, maxDescription: 175, maxTitle: 70 } as const;

const BANNED = /\b(agi is here|achieved agi|superintelligen\w* (is|has) (here|arrived|achieved)|keplar is (agi|superintelligen\w*)|\d+(\.\d+)?\s?% (more )?(accurate|accuracy|better|faster)|most accurate|the best (ai|model)|outperform\w*|beats? (chatgpt|claude|gemini)|confidence score)\b/i;

const shingles = (s: string, n = 5): Set<string> => {
  const w = s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
};
/** Share of this page's 5-word shingles that already appear in the other text (0..1). */
export const overlap = (page: string, other: string) => {
  const a = shingles(page);
  if (!a.size) return 0;
  const b = shingles(other);
  let hit = 0;
  for (const x of a) if (b.has(x)) hit++;
  return hit / a.size;
};

export type GateResult = { pass: boolean; reasons: string[]; checks: { name: string; ok: boolean; detail?: string }[] };

export function runGates(p: TrendPage, others: { path: string; text: string }[], taken: { slug: string; path?: string }[]): GateResult {
  const checks: GateResult["checks"] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  add("thin content", p.words >= GATES.minWords, `${p.words} words, need ${GATES.minWords}`);
  // The page-specific part (definition plus the Keplar note) must carry real substance; boilerplate and link lists do not count.
  const own = wordCount(`${p.definition} ${p.inKeplar ?? ""}`);
  add("substantive definition", own >= GATES.minOwnWords, `${own} words, need ${GATES.minOwnWords}`);
  add("grounded definition", p.definition.length >= 40);
  add("internal links", p.library.length >= GATES.minLibraryLinks, `${p.library.length} library links, need ${GATES.minLibraryLinks}`);
  add("title length", p.title.length <= GATES.maxTitle, `${p.title.length}`);
  add("description length", p.description.length >= GATES.minDescription && p.description.length <= GATES.maxDescription, `${p.description.length}`);
  add("slug free", !taken.some((t) => t.slug === p.slug), p.slug);
  const generated = [p.title, p.description, p.intro, p.definition, p.inKeplar ?? "", ...p.howToCheck, p.observed.note, ...p.faq.map((f) => `${f.q} ${f.a}`)].join(" ");
  const bad = BANNED.exec(generated);
  add("no banned claims", !bad, bad?.[0]);
  const worst = others.reduce((m, o) => { const v = overlap(p.text, o.text); return v > m.v ? { v, path: o.path } : m; }, { v: 0, path: "" });
  // The glossary definition legitimately repeats an existing sentence, so the bar is on the page as a whole.
  add("duplicate content", worst.v < GATES.maxSimilarity, `${Math.round(worst.v * 100)}% overlap with ${worst.path || "nothing"}`);
  return { pass: checks.every((c) => c.ok), reasons: checks.filter((c) => !c.ok).map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ""}`), checks };
}
