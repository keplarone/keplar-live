/**
 * Safety checks every automatic change must pass before it can even be evaluated. A variant can only add short strategy
 * text to one of Core's prompts and set a few bounded knobs; anything else is refused here.
 */
import type { VariantParams, VariantRow, VariantTarget } from "./types";
import { VARIANT_TARGETS } from "./types";

export const MAX_TEXT = 600;
/** Phrases an automatic prompt change may never contain: instruction overrides, safety bypasses, overclaiming, data exfiltration. */
const BANNED: RegExp[] = [
  /ignore (all |any |the )?(previous|prior|above|system)/i,
  /disregard (the )?(rules|instructions|policy|policies|safety)/i,
  /\b(jailbreak|bypass|override)\b/i,
  /without (any )?(safety|restrictions|filters)/i,
  /reveal (the )?(system prompt|instructions|keys?|secrets?)/i,
  /\b(api[_ -]?key|password|secret|token)s?\b/i,
  /https?:\/\//i,
  /superintelligen/i,
  /\b(always|never) (say|claim) (you are|it is) (certain|sure|100%)/i,
  /\bguarantee(d)?\b/i,
  /\bfine[- ]?tun|retrain/i,
];

export type GuardResult = { ok: true } | { ok: false; reasons: string[] };

export function checkParams(p: VariantParams): string[] {
  const out: string[] = [];
  const keys = Object.keys(p);
  const allowed = new Set(["passScore", "searchHints", "eagerMath", "sandboxMs", "maxNext"]);
  for (const k of keys) if (!allowed.has(k)) out.push(`unknown setting ${k}`);
  if (p.passScore !== undefined && !(Number.isInteger(p.passScore) && p.passScore >= 6 && p.passScore <= 10)) out.push("passScore must be 6-10");
  if (p.maxNext !== undefined && !(Number.isInteger(p.maxNext) && p.maxNext >= 0 && p.maxNext <= 3)) out.push("maxNext must be 0-3");
  if (p.sandboxMs !== undefined && !(Number.isInteger(p.sandboxMs) && p.sandboxMs >= 500 && p.sandboxMs <= 4000)) out.push("sandboxMs must be 500-4000");
  if (p.eagerMath !== undefined && typeof p.eagerMath !== "boolean") out.push("eagerMath must be true or false");
  if (p.searchHints !== undefined) {
    if (!Array.isArray(p.searchHints) || p.searchHints.length > 3) out.push("at most 3 search hints");
    else for (const h of p.searchHints) if (typeof h !== "string" || !h.trim() || h.length > 40 || BANNED.some((r) => r.test(h))) out.push("search hint invalid");
  }
  return out;
}

export function checkVariant(v: Pick<VariantRow, "target" | "text" | "params"> & { target: VariantTarget | string }): GuardResult {
  const reasons: string[] = [];
  if (!VARIANT_TARGETS.includes(v.target as VariantTarget)) reasons.push("unknown target");
  const text = v.text ?? "";
  if (typeof text !== "string") reasons.push("text must be a string");
  else {
    if (text.length > MAX_TEXT) reasons.push(`text longer than ${MAX_TEXT} characters`);
    for (const r of BANNED) if (r.test(text)) reasons.push(`banned phrase (${r.source.slice(0, 30)})`);
    if (/```|<\/?(system|instructions?)>/i.test(text)) reasons.push("markup not allowed");
    if ((v.target === "retrieval" || v.target === "tools") && text.trim()) reasons.push(`${v.target} changes are settings only, no prompt text`);
  }
  reasons.push(...checkParams(v.params ?? {}));
  // A target only takes the knobs that belong to it (a critic change can't touch the sandbox, and so on).
  const own: Record<VariantTarget, (keyof VariantParams)[]> = { planner: [], step: ["eagerMath"], critic: ["passScore"], insight: ["maxNext"], retrieval: ["searchHints"], tools: ["sandboxMs", "eagerMath"] };
  const allowed = own[v.target as VariantTarget] ?? [];
  for (const k of Object.keys(v.params ?? {}) as (keyof VariantParams)[]) if (!allowed.includes(k)) reasons.push(`${v.target} cannot set ${k}`);
  return reasons.length ? { ok: false, reasons: [...new Set(reasons)] } : { ok: true };
}

/** Guard metrics a candidate must not regress on, compared with the champion on the same eval items. */
export type ArmMetrics = { score: number; byCategory: Record<string, number>; meanMs: number; meanCalls: number; n: number };
export const GUARDS = { maxLatencyRatio: 1.3, maxCallsRatio: 1.3, maxCategoryDrop: 0.15, minScoreLift: 0 } as const;

export function guardFailures(candidate: ArmMetrics, champion: ArmMetrics): string[] {
  const out: string[] = [];
  if (candidate.score < champion.score + GUARDS.minScoreLift) out.push(`score ${candidate.score.toFixed(2)} below champion ${champion.score.toFixed(2)}`);
  if (champion.meanMs > 0 && candidate.meanMs > champion.meanMs * GUARDS.maxLatencyRatio) out.push(`latency ${Math.round(candidate.meanMs)}ms over ${GUARDS.maxLatencyRatio}x champion`);
  if (champion.meanCalls > 0 && candidate.meanCalls > champion.meanCalls * GUARDS.maxCallsRatio) out.push(`model calls over ${GUARDS.maxCallsRatio}x champion`);
  for (const [cat, s] of Object.entries(champion.byCategory)) {
    const c = candidate.byCategory[cat];
    if (c !== undefined && c < s - GUARDS.maxCategoryDrop) out.push(`${cat} dropped ${(s - c).toFixed(2)}`);
  }
  return out;
}
