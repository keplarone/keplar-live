/**
 * Verified answers with sources (BETA).
 *
 * For FACTUAL questions on PAID plans, after the answer is written, up to RETRIEVAL.maxClaims of its key checkable claims are each searched on the
 * web (OpenRouter web plugin, engine pinned, see retriever.ts) and judged against the pages that came back. The card then shows the links and a
 * per-claim state. Rules that keep it honest:
 *  - a claim is "supported" or "contradicted" only if at least one page was actually retrieved for it; no page = "no_source", said plainly;
 *  - claims are picked from the written answer by code (no extra model call, nothing invented); a supporting page is evidence, not proof;
 *  - the Free plan never runs it: every search is a paid request, and Free runs on the shared request pool (pool-governor.ts, 20 RPM / daily budget),
 *    so sourcing there would eat the call budget. Free factual answers carry a plain note instead. Nothing is sent, nothing is counted on the pool;
 *  - it is off until KEPLAR_RETRIEVAL_ENABLED=true (the card says "BETA, not switched on"); the Sensitive data tier skips it (plugins aren't covered by ZDR);
 *  - cost is estimated before the run and counted in Keplar Usage; if it would not fit the allowance or the per-request cap, the check is skipped
 *    (the answer is never refused because of it).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { RETRIEVAL } from "./config";
import type { Claim, Classification, KeplarRequest, Retriever, RoutingPlan, SourceClaim, SourceSupport, Sourcing, VerificationCheck } from "./types";

/** Is this a question where "which source says so" is meaningful? */
export function isFactualQuestion(c: Classification, req: Pick<KeplarRequest, "modes">): boolean {
  return c.kind === "factual" || c.kind === "research" || c.errorProne === "fact" || Boolean(req.modes?.web) || Boolean(req.modes?.deepResearch);
}

export const FREE_NOTE = "Source checks run live web searches, so they are on paid plans. This answer was not checked against the web.";
export const OFF_NOTE = "Source checks are in BETA and are not switched on yet. This answer was not checked against the web.";
export const SENSITIVE_NOTE = "Source checks are skipped on the Sensitive data tier, because web search can't keep zero data retention. This answer was not checked against the web.";
export const BUDGET_NOTE = "The source check was skipped to stay inside your allowance. This answer was not checked against the web.";
export const NONE_NOTE = "No source was found for the claims we checked, so none of them is confirmed by a page.";
export const NOTHING_NOTE = "This answer has no specific facts (names, numbers, dates) that a web source could confirm, so nothing was searched.";

export type Gate = { run: true } | { run: false; sourcing?: Sourcing };

/** Decides, before any money is spent, whether a source check may run and otherwise what the card should say. */
export function sourcingGate(i: { plan?: KeplarRequest["plan"]; classification: Classification; req: Pick<KeplarRequest, "modes" | "routing">; hasRetriever: boolean }): Gate {
  if (!isFactualQuestion(i.classification, i.req)) return { run: false };
  const none = (state: Sourcing["state"], note: string): Gate => ({ run: false, sourcing: { state, note, claims: [] } });
  if (!i.plan || i.plan === "free") return none("free_plan", FREE_NOTE);
  if (i.req.routing?.tier === "sensitive") return none("not_enabled", SENSITIVE_NOTE);
  if (!i.hasRetriever) return none("not_enabled", OFF_NOTE);
  return { run: true };
}

export const budgetSkipped = (): Sourcing => ({ state: "budget", note: BUDGET_NOTE, claims: [] });

/* ───────────── claims: picked from the written answer by code ───────────── */

const HEDGE = /^(i |i'm |i’m |let me|here(?:'s| is| are)|note|in summary|overall|to summarize|as an ai|sure|certainly|of course|you |if you|it depends|there are (?:several|many|a few))/i;
const STOP = new Set(["The", "A", "An", "In", "On", "At", "It", "This", "That", "These", "Those", "He", "She", "They", "We", "However", "But", "And", "So", "As", "For", "Of", "To", "If", "When", "While", "Although", "Because", "Since", "Also", "Many", "Some", "Most"]);

function plainSentences(markdown: string): string[] {
  const t = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s?\[\d{1,2}\]/g, "")
    .replace(/^\s{0,3}#{1,6}\s+.*$/gm, " ")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\|/g, " ")
    .replace(/[*_~]+/g, "")
    .replace(/\$\$?[^$]*\$\$?/g, " ");
  return t.split(/\n{2,}|\n/).flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)).map((x) => x.replace(/\s+/g, " ").trim());
}

/** How much a sentence looks like a checkable fact: numbers, years, named things. 0 = skip. */
function factScore(sentence: string): number {
  if (sentence.length < 35 || sentence.length > 260) return 0;
  if (/\?$/.test(sentence) || HEDGE.test(sentence)) return 0;
  const nums = sentence.match(/\b\d[\d,.]*\b/g)?.length ?? 0;
  const years = sentence.match(/\b(1[5-9]\d\d|20\d\d)\b/g)?.length ?? 0;
  const words = sentence.split(" ");
  const proper = words.slice(1).filter((w) => /^[A-Z][a-z]{2,}/.test(w) && !STOP.has(w)).length;
  const verbs = /\b(is|are|was|were|has|have|had|founded|invented|born|died|built|located|contains|measures|equals|costs|won|wrote|discovered|released|launched|became)\b/i.test(sentence) ? 1 : 0;
  if (!verbs) return 0;
  const score = nums + years * 2 + proper;
  return score >= 2 ? score : 0;
}

/** Up to `max` sentences of the answer that state checkable facts, in the order they appear. Pure. */
export function extractCheckableClaims(markdown: string, max: number = RETRIEVAL.maxClaims): Claim[] {
  const scored = plainSentences(markdown).map((text, i) => ({ text, i, score: factScore(text) })).filter((x) => x.score > 0);
  const seen = new Set<string>();
  const top = scored
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .filter((x) => { const k = x.text.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, max)
    .sort((a, b) => a.i - b.i);
  return top.map((x, n) => ({ id: `ans${n + 1}`, text: x.text }));
}

/* ───────────── turning retrieval results into the card's data ───────────── */

const safeUrl = (u: string): string | null => {
  try {
    const x = new URL(u);
    if (x.protocol !== "https:" && x.protocol !== "http:") return null;
    x.username = ""; x.password = ""; x.hash = "";
    return x.toString().slice(0, 500);
  } catch { return null; }
};

export function claimFromCheck(check: VerificationCheck, text?: string): SourceClaim {
  const seen = new Set<string>();
  const sources = (check.sources ?? []).flatMap((s) => {
    const url = safeUrl(s.url);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [{ title: (s.title || new URL(url).hostname).slice(0, 160), url }];
  });
  // No retrieved page = no verdict. Whatever the model said, the claim has no source.
  const support: SourceSupport = !sources.length ? "no_source" : check.outcome === "supported" ? "supported" : check.outcome === "contradicted" ? "contradicted" : "unsettled";
  return { text: (text ?? check.finding).slice(0, 300), support, finding: sources.length ? check.resolution.slice(0, 300) : "", sources };
}

/** Pure: builds the card data from checks that really ran. */
export function sourcingFromChecks(checks: VerificationCheck[], claims: Claim[], opts: { engine: string; at: string }): Sourcing {
  const items = checks.map((c, i) => claimFromCheck(c, claims[i]?.text));
  const any = items.some((c) => c.sources.length > 0);
  const n = items.filter((c) => c.support === "supported").length;
  const note = any
    ? `${n} of ${items.length} checked ${items.length === 1 ? "claim is" : "claims are"} supported by pages found on the web. A supporting page is evidence, not proof.`
    : NONE_NOTE;
  return { state: any ? "checked" : "no_sources", note, engine: opts.engine, checkedAt: opts.at, claims: items };
}

/** Runs the checks (one search per claim, at most RETRIEVAL.maxClaims). Returns the card data and what it cost. */
export async function runSourcing(i: { retriever: Retriever; req: KeplarRequest; plan: RoutingPlan; markdown: string; signal?: AbortSignal; now?: () => Date; engine?: string }): Promise<{ sourcing: Sourcing; costUsd: number }> {
  const claims = extractCheckableClaims(i.markdown);
  if (!claims.length) return { sourcing: { state: "nothing_to_check", note: NOTHING_NOTE, claims: [] }, costUsd: 0 };
  const web = await i.retriever.check({ req: i.req, claims, plan: i.plan, signal: i.signal });
  return { sourcing: sourcingFromChecks(web.checks, claims, { engine: i.engine ?? (i.retriever.name.split(":").pop() || i.retriever.name), at: (i.now?.() ?? new Date()).toISOString() }), costUsd: web.costUsd };
}

/* ───────────── signature: a shared page may show a check only if the server made it ───────────── */

const canonical = (s: Sourcing) => JSON.stringify({ state: s.state, note: s.note, engine: s.engine ?? "", checkedAt: s.checkedAt ?? "", claims: s.claims.map((c) => [c.text, c.support, c.finding, c.sources.map((x) => [x.title, x.url])]) });
const secret = () => process.env.BETTER_AUTH_SECRET || "";
const mac = (answerId: string, s: Sourcing) => createHmac("sha256", secret()).update(`sourcing:${answerId}\n${canonical(s)}`).digest("hex");

/** Adds the signature (only for checks that really ran, and only when the server has a secret). */
export function signSourcing(answerId: string, s: Sourcing): Sourcing {
  if ((s.state !== "checked" && s.state !== "no_sources") || !secret()) return s;
  return { ...s, sig: mac(answerId, s) };
}

export function verifySourcing(answerId: unknown, s: Sourcing | null | undefined): boolean {
  if (!s || typeof answerId !== "string" || !answerId || !s.sig || !secret() || (s.state !== "checked" && s.state !== "no_sources")) return false;
  const want = Buffer.from(mac(answerId, s));
  const got = Buffer.from(s.sig);
  return want.length === got.length && timingSafeEqual(want, got);
}
